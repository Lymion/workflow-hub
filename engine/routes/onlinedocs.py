"""Docs page: official doc sites read online, an online Ask, and docs per part.

The online Ask: the hub matches your question against each site's page list
(plain code, free), then one small Haiku call picks the best 3-5 pages and
says why. Haiku only sees page titles and links, so the prompt stays small.
"""
from __future__ import annotations

import hashlib
import json
import re

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .. import db, llm, onlinedocs as od
from ..hub import Hub
from .cart import project_parts
from .guide import USER_SOURCES, haiku, http_client, library_sources, store_chunks
from .handbook import current
from .projects import get_project, hub_of

router = APIRouter()

MAX_CANDIDATES = 30

SYSTEM = """You help a maker find the right page in official documentation (Arduino, ESP32, PlatformIO, Expo, React Native, Supabase, Next.js, Tauri).

You get a question and a numbered list of documentation pages (title and link only). Pick the 3 to 5 pages most likely to answer the question, best first. Use only numbers from the list.
For each pick, write "why": one short line on what the page will tell them for this question.
If no page fits, return an empty picks list and say in note what to search for instead. Otherwise note is ""."""

SCHEMA = {
    "type": "object",
    "properties": {
        "picks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"n": {"type": "integer"}, "why": {"type": "string"}},
                "required": ["n", "why"],
                "additionalProperties": False,
            },
        },
        "note": {"type": "string"},
    },
    "required": ["picks", "note"],
    "additionalProperties": False,
}


def site_info(s: od.Site) -> dict:
    return {"id": s.id, "title": s.title, "about": s.about, "home": s.home, "module": s.module, "searchable": bool(s.search.get("url"))}


@router.get("/docs/sites")
def list_sites(request: Request, module: str | None = None) -> list[dict]:
    return [site_info(s) for s in od.sites(hub_of(request).paths.root) if module in (None, s.module)]


def project_keys(hub: Hub, project: dict) -> list[str]:
    keys = [project.get("board") or ""] + list(project.get("stack") or [])
    return keys + [p["key"] for p in project_parts(hub, project["id"])]


def docs_for(hub: Hub, module: str, keys: list[str]) -> dict:
    return {
        "items": od.item_docs(current(hub), keys),
        "sites": [site_info(s) for s in od.sites(hub.paths.root) if s.module == module],
    }


@router.get("/projects/{project_id}/docs")
def project_docs(request: Request, project_id: int) -> dict:
    hub = hub_of(request)
    p = get_project(hub, project_id)
    return docs_for(hub, p["module"], project_keys(hub, p))


class ForIn(BaseModel):
    module: str
    board: str | None = None
    stack: list[str] = []
    parts: list[str] = []


@router.post("/docs/for")
def docs_for_picks(request: Request, body: ForIn) -> dict:
    """Docs for a project that doesn't exist yet (the New project screen)."""
    return docs_for(hub_of(request), body.module, [body.board or "", *body.stack, *body.parts])


class AskIn(BaseModel):
    question: str = Field(min_length=3, max_length=500)
    project_id: int | None = None
    module: str | None = None
    site: str | None = None


@router.post("/docs/online/ask")
def online_ask(request: Request, body: AskIn) -> dict:
    hub = hub_of(request)
    project = get_project(hub, body.project_id) if body.project_id else None
    module = project["module"] if project else body.module
    sites = [s for s in od.sites(hub.paths.root) if s.search.get("url") and module in (None, s.module) and body.site in (None, s.id)]
    if not sites:
        raise HTTPException(404, "No searchable doc sites for this. Add a sites: entry with search.url to the module's docs.yaml.")
    boost = []
    if project:
        boost = [it["title"] for it in od.item_docs(current(hub), project_keys(hub, project))]
    pages, errors = [], []
    with http_client(hub) as client:
        for s in sites:
            got, err = od.load_index(s, hub.paths.data, client)
            if err:
                errors.append(err)
            pages += [{**p, "site": s.id} for p in got]
    site_titles = {s.id: s.title for s in sites}
    ranked = od.rank(body.question, pages, MAX_CANDIDATES, boost)
    site_of = {p["url"]: p["site"] for p in pages}
    candidates = [{**c, "site": site_of.get(c["url"], ""), "site_title": site_titles.get(site_of.get(c["url"], ""), "")} for c in ranked]
    base = {"candidates": candidates[:10], "errors": errors, "sites": [site_info(s) for s in sites]}
    if not candidates:
        msg = errors[0] if errors and not pages else "No page names match those words. Try the function or part name (for example pulseIn, Servo, LEDC), or search on the site itself."
        return {**base, "status": "no_matches", "picks": [], "message": msg}
    listing = "\n".join(f"{i + 1}. [{c['site_title']}] {c['title']} - {c['url']}" for i, c in enumerate(candidates))
    context = f"\nProject: {project['name']} ({', '.join(boost[:12])})" if project and boost else ""
    user = f"Question: {body.question.strip()}{context}\n\nPages:\n{listing}"
    q = re.sub(r"\s+", " ", body.question.lower().strip())
    key = llm.cache_key("docs_online", q, hashlib.sha1("\n".join(c["url"] for c in candidates).encode()).hexdigest())
    result = haiku(hub).ask("docs_online", SYSTEM, user, max_tokens=1000, schema=SCHEMA, effort="low", key=key)
    picks = []
    if result.status in ("sent", "cached") and isinstance(result.data, dict):
        seen = set()
        for p in result.data.get("picks", [])[:5]:
            n = p.get("n")
            if isinstance(n, int) and 1 <= n <= len(candidates) and n not in seen:
                seen.add(n)  # only pages we gave it; never an invented link
                picks.append({**candidates[n - 1], "why": str(p.get("why", ""))[:300]})
    note = result.data.get("note", "") if isinstance(result.data, dict) else ""
    return {**base, "status": result.status, "picks": picks, "message": result.message or note, "cost_rm": round(result.cost_rm, 5),
            "spend": {k: v for k, v in llm.spend_report(hub).items() if k in ("spent_rm", "cap_rm", "level")}}


class SaveIn(BaseModel):
    url: str = Field(min_length=8, max_length=500)
    title: str = Field(min_length=1, max_length=200)
    module: str = ""


@router.post("/docs/library", status_code=201)
def save_page(request: Request, body: SaveIn) -> dict:
    """Keep one page on your laptop so Ask docs can search and quote it."""
    hub = hub_of(request)
    if not re.match(r"https?://", body.url):
        raise HTTPException(400, "Only web pages (http or https links) can be saved. Open the page and copy its address.")
    saved = json.loads(db.get_setting(hub.conn, USER_SOURCES) or "[]")
    existing = next((s for s in library_sources(hub) if s.url == body.url), None)
    if existing:
        src = existing
    else:
        sid = "saved-" + hashlib.sha1(body.url.encode()).hexdigest()[:10]
        saved.append({"id": sid, "title": body.title, "url": body.url, "module": body.module})
        db.set_setting(hub.conn, USER_SOURCES, json.dumps(saved))
        src = library_sources(hub)[-1]
    from .. import docs as docsmod

    try:
        with http_client(hub) as client:
            r = client.get(src.url)
            r.raise_for_status()
            n = store_chunks(hub, src, docsmod.parse(src, r.text))
    except Exception as exc:
        return {"id": src.id, "saved": True, "chunks": 0, "message": f"Saved, but couldn't download it now ({type(exc).__name__}). Press Download in Settings → Docs library later."}
    return {"id": src.id, "saved": True, "chunks": n, "message": f"Saved. Ask docs can now answer from {src.title}."}


@router.delete("/docs/library/{source_id}", status_code=204)
def remove_page(request: Request, source_id: str) -> None:
    hub = hub_of(request)
    saved = json.loads(db.get_setting(hub.conn, USER_SOURCES) or "[]")
    if not any(s["id"] == source_id for s in saved):
        raise HTTPException(404, "Only pages you saved yourself can be removed here; the module's own pages live in its docs.yaml.")
    db.set_setting(hub.conn, USER_SOURCES, json.dumps([s for s in saved if s["id"] != source_id]))
    from .errors import index_of

    idx = index_of(hub)
    for r in hub.query("SELECT id FROM doc_chunks WHERE source = ?", (source_id,)):
        idx.delete("doc", str(r["id"]))
    with hub.tx() as c:
        c.execute("DELETE FROM doc_chunks WHERE source = ?", (source_id,))
