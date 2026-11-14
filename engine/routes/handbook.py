"""Session 5: handbook read mode, search index, My notes."""
from __future__ import annotations

import json
import re

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .. import handbook as hbmod
from ..hub import Hub
from .errors import index_of
from .projects import hub_of

router = APIRouter()


def current(hub: Hub) -> hbmod.Handbook:
    """Load the handbook; re-index search only when a chapter file changed."""
    sig = hbmod.signature(hub.paths.root)
    cached = getattr(hub, "_handbook", None)
    if cached and cached[0] == sig:
        return cached[1]
    hb = hbmod.load(hub.paths.root)
    index_of(hub).replace_kind(
        "handbook",
        [(c.path, c.title, f"{c.body}\n{_words(c.meta)}") for c in hb.chapters.values()],
    )
    hub._handbook = (sig, hb)  # type: ignore[attr-defined]
    return hb


def _words(value) -> str:
    """Setup block as plain words for the keyword index (no JSON punctuation in excerpts)."""
    if isinstance(value, dict):
        return " ".join(f"{k} {_words(v)}" for k, v in value.items())
    if isinstance(value, list):
        return " ".join(_words(v) for v in value)
    return str(value)


@router.get("/handbook")
def toc(request: Request) -> dict:
    hb = current(hub_of(request))
    return {"parts": hb.parts, "errors": hb.errors, "count": len(hb.chapters)}


@router.get("/handbook/chapter/{path:path}")
def chapter(request: Request, path: str) -> dict:
    hub = hub_of(request)
    hb = current(hub)
    ch = hb.chapters.get(path.strip("/"))
    if not ch:
        raise HTTPException(404, f"Chapter '{path}' not found. It may have been renamed; pick it from the contents.")
    used = [
        {"id": p["id"], "name": p["name"]}
        for p in hub.query("SELECT id, name, stack, board FROM projects WHERE archived = 0")
        if ch.key in json.loads(p["stack"] or "[]") or ch.key == (p["board"] or "")
    ]
    related = [hb.chapters[p].summary() for p in hb.chapters if p != ch.path and hb.chapters[p].section == ch.section and hb.chapters[p].part == ch.part][:4]
    return {
        **ch.summary(),
        "part": ch.part,
        "meta": ch.meta,
        "body": ch.body,
        "file": ch.file.relative_to(hub.paths.root).as_posix(),
        "editable": ch.part == hbmod.NOTES_PART,
        "used_in": used,
        "related": related,
    }


@router.get("/handbook/items")
def items(request: Request, part: str, section: str | None = None) -> list[dict]:
    """Chapters with their setup blocks: what pickers (cart, stack tiles) are built from."""
    hb = current(hub_of(request))
    return [{**c.summary(), "meta": c.meta} for c in sorted(hb.items(part, section), key=lambda c: c.title.lower())]


class NoteIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(default="", max_length=100_000)
    tags: list[str] = []


def _slug(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "note"


@router.post("/handbook/notes", status_code=201)
def add_note(request: Request, body: NoteIn) -> dict:
    hub = hub_of(request)
    slug = _slug(body.title)
    if (hbmod.notes_dir(hub.paths.root) / f"{slug}.md").exists():
        raise HTTPException(409, f"A note called '{body.title}' already exists. Pick another title or edit that note.")
    hbmod.write_note(hub.paths.root, slug, body.title, body.body, body.tags)
    return chapter(request, f"notes/{slug}")


@router.put("/handbook/notes/{slug}")
def edit_note(request: Request, slug: str, body: NoteIn) -> dict:
    hub = hub_of(request)
    if not re.fullmatch(r"[a-z0-9-]+", slug) or not (hbmod.notes_dir(hub.paths.root) / f"{slug}.md").is_file():
        raise HTTPException(404, f"Note '{slug}' not found.")
    hbmod.write_note(hub.paths.root, slug, body.title, body.body, body.tags)
    return chapter(request, f"notes/{slug}")


@router.delete("/handbook/notes/{slug}", status_code=204)
def delete_note(request: Request, slug: str) -> Response:
    hub = hub_of(request)
    f = hbmod.notes_dir(hub.paths.root) / f"{slug}.md"
    if not re.fullmatch(r"[a-z0-9-]+", slug) or not f.is_file():
        raise HTTPException(404, f"Note '{slug}' not found.")
    f.unlink()
    return Response(status_code=204)
