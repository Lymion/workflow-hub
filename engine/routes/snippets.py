"""Session 3: snippet library (tags, search, quick capture, save to library)."""
from __future__ import annotations

import json
import shutil

from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

from .. import snippets as lib
from ..hub import Hub
from .projects import get_project, hub_of

router = APIRouter()


def reindex(hub: Hub) -> int:
    items = lib.scan(hub.paths.snippets)
    with hub.tx() as c:
        c.execute("DELETE FROM snippets")
        c.executemany(
            "INSERT INTO snippets(slug, title, path, language, tags, readme, code, inbox) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [(s["slug"], s["title"], s["slug"], s["language"], json.dumps(s["tags"]), s["readme"], s["code"], int(s["inbox"])) for s in items],
        )
    for hook in AFTER_REINDEX:
        hook(hub)
    return len(items)


# Search indexes (session 4) register here to refresh after the library changes.
AFTER_REINDEX: list = []


def _row(r: dict, full: bool = False) -> dict:
    out = {
        "slug": r["slug"],
        "title": r["title"],
        "category": r["slug"].split("/")[0],
        "language": r["language"],
        "tags": json.loads(r["tags"]),
        "inbox": bool(r["inbox"]),
        "preview": "\n".join(r["code"].splitlines()[:6]),
    }
    return out


def word_score(r: dict, words: list[str]) -> int:
    title, tags, readme, code = r["title"].lower(), " ".join(json.loads(r["tags"])), r["readme"].lower(), r["code"].lower()
    score = 0
    for w in words:
        hit = 0
        if w in title:
            hit += 5
        if w in tags:
            hit += 4
        if w in readme:
            hit += 2
        if w in code:
            hit += 1
        if not hit:
            return 0  # every word must match somewhere
        score += hit
    return score


@router.get("/snippets")
def list_snippets(request: Request, q: str = "", tag: list[str] | None = Query(default=None), inbox: bool | None = None) -> list[dict]:
    hub = hub_of(request)
    rows = hub.query("SELECT * FROM snippets ORDER BY inbox DESC, slug")
    tags = [t.lower() for t in (tag or [])]
    words = [w for w in q.lower().split() if w]
    out = []
    for r in rows:
        if inbox is not None and bool(r["inbox"]) != inbox:
            continue
        rtags = json.loads(r["tags"])
        if tags and not all(t in rtags for t in tags):
            continue
        score = word_score(r, words) if words else 1
        if score:
            out.append((score, _row(r)))
    out.sort(key=lambda x: -x[0])
    return [o for _, o in out]


@router.get("/snippets/tags")
def tag_counts(request: Request) -> list[dict]:
    counts: dict[str, int] = {}
    for r in hub_of(request).query("SELECT tags FROM snippets WHERE inbox = 0"):
        for t in json.loads(r["tags"]):
            counts[t] = counts.get(t, 0) + 1
    return [{"tag": t, "count": n} for t, n in sorted(counts.items(), key=lambda x: (-x[1], x[0]))]


@router.post("/snippets/reindex")
def reindex_route(request: Request) -> dict:
    return {"count": reindex(hub_of(request))}


class SnippetIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    category: str = Field(min_length=1, max_length=40)
    code: str = Field(min_length=1, max_length=200_000)
    language: str = "text"
    tags: list[str] = []
    readme: str = ""


@router.post("/snippets", status_code=201)
def save_snippet(request: Request, body: SnippetIn) -> dict:
    hub = hub_of(request)
    folder = lib.unique_folder(hub.paths.snippets / lib.slug_part(body.category) / lib.slug_part(body.title))
    lib.write_snippet(folder, body.title.strip(), body.code, body.language, body.tags, body.readme)
    reindex(hub)
    return lib.read_snippet(hub.paths.snippets, folder)


class CaptureIn(BaseModel):
    code: str = Field(min_length=1, max_length=200_000)
    note: str = ""
    source: str = ""


@router.post("/snippets/capture", status_code=201)
def capture(request: Request, body: CaptureIn) -> dict:
    hub = hub_of(request)
    folder = lib.capture(hub.paths.snippets, body.code, body.note, body.source)
    reindex(hub)
    return lib.read_snippet(hub.paths.snippets, folder)


def _folder(hub: Hub, slug: str):
    folder = lib.safe_folder(hub.paths.snippets, slug)
    if not folder:
        raise HTTPException(404, f"Snippet '{slug}' not found. It may have been moved; press Reindex.")
    return folder


class FileIn(BaseModel):
    category: str = Field(min_length=1, max_length=40)
    title: str | None = None
    tags: list[str] | None = None


@router.post("/snippets/{category}/{name}/file")
def file_snippet(request: Request, category: str, name: str, body: FileIn) -> dict:
    """Move an inbox capture (or any snippet) into a category."""
    hub = hub_of(request)
    _folder(hub, f"{category}/{name}")
    dest = lib.move(hub.paths.snippets, f"{category}/{name}", body.category, body.title, body.tags)
    reindex(hub)
    return lib.read_snippet(hub.paths.snippets, dest)


@router.get("/snippets/{category}/{name}")
def read_one(request: Request, category: str, name: str) -> dict:
    hub = hub_of(request)
    return lib.read_snippet(hub.paths.snippets, _folder(hub, f"{category}/{name}"))


@router.delete("/snippets/{category}/{name}", status_code=204)
def delete_snippet(request: Request, category: str, name: str) -> Response:
    hub = hub_of(request)
    shutil.rmtree(_folder(hub, f"{category}/{name}"))
    reindex(hub)
    return Response(status_code=204)


class UseIn(BaseModel):
    slug: str


@router.post("/projects/{project_id}/snippets", status_code=201)
def mark_used(request: Request, project_id: int, body: UseIn) -> dict:
    hub = hub_of(request)
    get_project(hub, project_id)
    _folder(hub, body.slug)
    with hub.tx() as c:
        c.execute("INSERT INTO snippet_uses(project_id, slug) VALUES (?, ?) ON CONFLICT(project_id, slug) DO UPDATE SET used_at = datetime('now')", (project_id, body.slug))
    return {"ok": True}


@router.get("/projects/{project_id}/snippets")
def used_by(request: Request, project_id: int) -> list[dict]:
    hub = hub_of(request)
    get_project(hub, project_id)
    return hub.query(
        "SELECT u.slug, u.used_at, s.title, s.language FROM snippet_uses u LEFT JOIN snippets s ON s.slug = u.slug WHERE u.project_id = ? ORDER BY u.used_at DESC",
        (project_id,),
    )
