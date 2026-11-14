"""Session 8: docs library, Haiku docs guide (cards, hint ladder, cache, cost), spend, settings."""
from __future__ import annotations

import re

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .. import db, docs as docsmod, llm
from ..config import HAIKU_MODEL, MONTHLY_CAP_RM
from ..hub import Hub
from .errors import index_of, matches
from .handbook import current
from .projects import get_project, hub_of

router = APIRouter()
USER_AGENT = "WorkflowHub/0.1 (local docs cache)"


def http_client(hub: Hub) -> httpx.Client:
    factory = getattr(hub, "http_factory", None)
    return factory() if factory else httpx.Client(follow_redirects=True, timeout=20.0, headers={"User-Agent": USER_AGENT})


def haiku(hub: Hub) -> llm.Haiku:
    factory = getattr(hub, "llm_factory", None)
    return llm.Haiku(hub, factory)


# ---------- docs library ----------

@router.get("/docs")
def list_docs(request: Request) -> list[dict]:
    hub = hub_of(request)
    counts = {r["source"]: r["n"] for r in hub.query("SELECT source, COUNT(*) AS n FROM doc_chunks GROUP BY source")}
    stamps = {r["key"][5:]: r["value"] for r in hub.query("SELECT key, value FROM settings WHERE key LIKE 'docs:%'")}
    return [{"id": s.id, "title": s.title, "url": s.url, "module": s.module, "chunks": counts.get(s.id, 0), "downloaded_at": stamps.get(s.id)} for s in docsmod.sources(hub.paths.root)]


class DownloadIn(BaseModel):
    source: str | None = None


def store_chunks(hub: Hub, source: docsmod.Source, chunks: list[dict]) -> int:
    idx = index_of(hub)
    old = hub.query("SELECT id FROM doc_chunks WHERE source = ?", (source.id,))
    for r in old:
        idx.delete("doc", str(r["id"]))
    with hub.tx() as c:
        c.execute("DELETE FROM doc_chunks WHERE source = ?", (source.id,))
        ids = []
        for ch in chunks:
            ids.append(c.execute("INSERT INTO doc_chunks(source, title, heading, url, body, module) VALUES (?, ?, ?, ?, ?, ?)",
                                 (ch["source"], ch["title"], ch["heading"], ch["url"], ch["body"], source.module)).lastrowid)
    for cid, ch in zip(ids, chunks):
        idx.upsert("doc", str(cid), f"{ch['title']} · {ch['heading']}" if ch["heading"] else ch["title"], ch["body"])
    db.set_setting(hub.conn, f"docs:{source.id}", __import__("datetime").datetime.now().isoformat(timespec="minutes"))
    return len(chunks)


@router.post("/docs/download")
def download(request: Request, body: DownloadIn) -> dict:
    """Fetch the listed pages and re-chunk them. Plain code, no tokens."""
    hub = hub_of(request)
    srcs = [s for s in docsmod.sources(hub.paths.root) if body.source in (None, s.id)]
    if body.source and not srcs:
        raise HTTPException(404, f"Docs source '{body.source}' isn't listed in any module's docs.yaml.")
    done, failed = [], []
    with http_client(hub) as client:
        for s in srcs:
            try:
                r = client.get(s.url)
                r.raise_for_status()
                n = store_chunks(hub, s, docsmod.parse(s, r.text))
                done.append({"id": s.id, "chunks": n})
            except Exception as exc:
                failed.append({"id": s.id, "message": f"{s.title}: couldn't download ({type(exc).__name__}). Check the URL in docs.yaml or your connection."})
    return {"downloaded": done, "failed": failed}


# ---------- guide ----------

SYSTEM = """You are the docs guide inside Workflow Hub, a maker's project workshop (ESP32/Arduino robots built with PlatformIO, Expo/Next.js/Tauri apps).

Answer only from the numbered sources in the user message. Never invent a URL: copy source_id, title and url exactly from one source.

Return 1-3 cards, best first. Each card:
- source_id, title, url: the single source that answers best.
- why: 1-2 short lines on why this source answers the question.
- apply_it: what to do in the user's own code or wiring.
- snippet: follow the hint level.

Hint levels:
- Level 1: point to the docs. apply_it names the function/setting to look at. snippet is "".
- Level 2: a bigger hint. apply_it gives concrete steps, still no code. snippet is "".
- Level 3: a tiny snippet of at most 8 lines in the user's language, using names from their project if given.

If the sources don't answer the question, return an empty cards list and say what's missing in note. Otherwise note is ""."""

SCHEMA = {
    "type": "object",
    "properties": {
        "cards": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "source_id": {"type": "string"},
                    "title": {"type": "string"},
                    "url": {"type": "string"},
                    "why": {"type": "string"},
                    "apply_it": {"type": "string"},
                    "snippet": {"type": "string"},
                },
                "required": ["source_id", "title", "url", "why", "apply_it", "snippet"],
                "additionalProperties": False,
            },
        },
        "note": {"type": "string"},
    },
    "required": ["cards", "note"],
    "additionalProperties": False,
}

MAX_SOURCES = 6
MAX_WORDS_PER_SOURCE = 320


def retrieve(hub: Hub, question: str, module: str | None, k: int = MAX_SOURCES) -> list[dict]:
    """Top chunks from downloaded docs + the handbook, filtered by project type."""
    hb = current(hub)
    out = []
    for hit in index_of(hub).search(question, ["doc", "handbook"], limit=k * 3):
        if hit["kind"] == "doc":
            row = hub.query_one("SELECT * FROM doc_chunks WHERE id = ?", (int(hit["ref"]),))
            if not row or (module and row["module"] not in (module, "")):
                continue
            out.append({"id": f"doc{row['id']}", "kind": "doc", "title": row["title"] + (f" · {row['heading']}" if row["heading"] else ""), "url": row["url"], "body": row["body"]})
        else:
            ch = hb.chapters.get(hit["ref"])
            if not ch or (module and ch.part not in (module, "notes")):
                continue
            out.append({"id": f"hb:{ch.path}", "kind": "handbook", "title": f"Handbook · {ch.title}", "url": f"#handbook/{ch.path}", "body": ch.body})
        if len(out) >= k:
            break
    return out


def build_prompt(question: str, level: int, sources: list[dict], project: dict | None, file_text: str, error_text: str) -> str:
    parts = [f"Question: {question.strip()}", f"Hint level: {level}"]
    if project:
        parts.append(f"Project: {project['name']} ({project['module']}{', board ' + project['board'] if project.get('board') else ''})")
    if error_text.strip():
        parts.append("Error text:\n" + error_text.strip()[:3000])
    if file_text.strip():
        parts.append("Current file (excerpt):\n" + file_text.strip()[:6000])
    lines = ["Sources:"]
    for s in sources:
        words = s["body"].split()
        body = " ".join(words[:MAX_WORDS_PER_SOURCE]) + (" …" if len(words) > MAX_WORDS_PER_SOURCE else "")
        lines.append(f"[{s['id']}] {s['title']} ({s['url']})\n{body}")
    return "\n\n".join(parts + ["\n\n".join(lines)])


class AskIn(BaseModel):
    question: str = Field(min_length=3, max_length=2000)
    level: int = Field(default=1, ge=1, le=3)
    project_id: int | None = None
    file_text: str = Field(default="", max_length=60_000)
    error_text: str = Field(default="", max_length=20_000)


@router.post("/guide/ask")
def ask(request: Request, body: AskIn) -> dict:
    hub = hub_of(request)
    project = get_project(hub, body.project_id) if body.project_id else None
    module = project["module"] if project else None
    sources = retrieve(hub, f"{body.question} {body.error_text[:300]}", module)
    past = matches(hub, body.error_text or body.question) if (body.error_text or len(body.question) > 20) else []
    base = {
        "sources": [{k: s[k] for k in ("id", "kind", "title", "url")} for s in sources],
        "past_errors": [{"id": e["id"], "error_text": e["error_text"][:200], "cause": e["cause"], "fix": e["fix"], "similarity": e["similarity"]} for e in past],
        "level": body.level,
    }
    if not sources:
        return {**base, "status": "no_sources", "cards": [], "message": "No downloaded docs or handbook chapters match. Download the docs library in Settings, or try other words."}
    key = llm.cache_key("guide", re.sub(r"\s+", " ", body.question.lower().strip()), body.level, sorted(s["id"] for s in sources), body.file_text[:2000], body.error_text[:2000])
    result = haiku(hub).ask("docs_guide", SYSTEM, build_prompt(body.question, body.level, sources, project, body.file_text, body.error_text), max_tokens=1800, schema=SCHEMA, effort="low", key=key)
    cards = []
    if result.status in ("sent", "cached"):
        by_id = {s["id"]: s for s in sources}
        for c in (result.data or {}).get("cards", [])[:3]:
            src = by_id.get(c.get("source_id"))
            if not src:
                continue  # drop cards that cite something we didn't give it
            cards.append({**c, "title": src["title"], "url": src["url"], "kind": src["kind"], "snippet": c.get("snippet", "") if body.level == 3 else ""})
    message = result.message or ((result.data or {}).get("note", "") if isinstance(result.data, dict) else "")
    return {**base, "status": result.status, "cards": cards, "message": message, "cost_rm": round(result.cost_rm, 5), "spend": {k: v for k, v in llm.spend_report(hub).items() if k in ("spent_rm", "cap_rm", "level")}}


# ---------- spend + settings ----------

@router.get("/llm/spend")
def spend(request: Request) -> dict:
    return llm.spend_report(hub_of(request))


@router.get("/settings")
def get_settings(request: Request) -> dict:
    hub = hub_of(request)
    return {"rm_per_usd": llm.rm_per_usd(hub), "api_key": llm.key_source(), "model": HAIKU_MODEL, "cap_rm": MONTHLY_CAP_RM}


class SettingsIn(BaseModel):
    rm_per_usd: float = Field(gt=1, lt=20)


@router.put("/settings")
def put_settings(request: Request, body: SettingsIn) -> dict:
    hub = hub_of(request)
    db.set_setting(hub.conn, "rm_per_usd", str(body.rm_per_usd))
    return get_settings(request)


class KeyIn(BaseModel):
    key: str = Field(min_length=20, max_length=300)


@router.post("/settings/api-key")
def save_key(request: Request, body: KeyIn) -> dict:
    if not body.key.startswith("sk-ant-"):
        raise HTTPException(400, "That doesn't look like an Anthropic API key (it starts with sk-ant-). Copy it again from the Claude Console.")
    try:
        llm.set_api_key(body.key.strip())
    except Exception as exc:
        raise HTTPException(424, "No OS keychain is available on this machine. Put ANTHROPIC_API_KEY in the .env file next to the engine instead.") from exc
    return get_settings(request)


@router.delete("/settings/api-key")
def delete_key(request: Request) -> dict:
    llm.set_api_key(None)
    return get_settings(request)
