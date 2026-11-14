"""Session 4: error log + the shared search endpoint."""
from __future__ import annotations

import json
import re

from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

from ..hub import Hub
from ..search import KINDS, Index
from .projects import get_project, hub_of

router = APIRouter()


def index_of(request_or_hub) -> Index:
    hub: Hub = request_or_hub if isinstance(request_or_hub, Hub) else hub_of(request_or_hub)
    if not hasattr(hub, "search_index"):
        hub.search_index = Index(hub.conn, hub._lock)  # type: ignore[attr-defined]
    return hub.search_index  # type: ignore[attr-defined]


# ---------- error text normalisation ----------
_NOISE = [
    (re.compile(r"0x[0-9a-f]+", re.I), "0x#"),            # addresses
    (re.compile(r"([a-z]:)?[\\/][\w .\-\\/]+\.\w+", re.I), "<path>"),  # file paths
    (re.compile(r":\d+(:\d+)?"), ":#"),                   # line:col
    (re.compile(r"\d+"), "#"),                             # other numbers (also 120ms, gpio34)
    (re.compile(r"\s+"), " "),
]


def normalise(text: str) -> str:
    t = text.strip().lower()
    for rx, rep in _NOISE:
        t = rx.sub(rep, t)
    return t.strip()


def tokens(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z_][a-z0-9_]{2,}", normalise(text))}


def similarity(a: str, b: str) -> float:
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def index_error(hub: Hub, e: dict) -> None:
    index_of(hub).upsert("error", str(e["id"]), e["error_text"][:200], f"{e['error_text']}\n{e['cause']}\n{e['fix']}")


def reindex_errors(hub: Hub) -> None:
    rows = hub.query("SELECT * FROM errors")
    index_of(hub).replace_kind("error", [(str(e["id"]), e["error_text"][:200], f"{e['error_text']}\n{e['cause']}\n{e['fix']}") for e in rows])


def index_snippets(hub: Hub) -> None:
    rows = hub.query("SELECT slug, title, tags, readme, code FROM snippets")
    index_of(hub).replace_kind("snippet", [(r["slug"], r["title"], f"{' '.join(json.loads(r['tags']))}\n{r['readme']}\n{r['code']}") for r in rows])


ERROR_SQL = "SELECT e.*, p.name AS project_name FROM errors e LEFT JOIN projects p ON p.id = e.project_id"


def matches(hub: Hub, text: str, limit: int = 3) -> list[dict]:
    """Previous errors that look like `text`, best first (exact-ish repeats get similarity 1)."""
    norm = normalise(text)
    seen: dict[int, float] = {}
    for e in hub.query("SELECT id, error_text FROM errors"):
        s = 1.0 if normalise(e["error_text"]) == norm else similarity(text, e["error_text"])
        if s >= 0.35:
            seen[e["id"]] = s
    for hit in index_of(hub).search(text, kinds=["error"], limit=5):
        eid = int(hit["ref"])
        seen.setdefault(eid, 0.36)
    out = []
    for eid, s in sorted(seen.items(), key=lambda x: -x[1])[:limit]:
        row = hub.query_one(ERROR_SQL + " WHERE e.id = ?", (eid,))
        if row:
            out.append({**row, "similarity": round(s, 2)})
    return out


# ---------- routes ----------

class ErrorIn(BaseModel):
    error_text: str = Field(min_length=3, max_length=20000)
    cause: str = ""
    fix: str = ""
    project_id: int | None = None


class ErrorPatch(BaseModel):
    error_text: str | None = Field(default=None, min_length=3, max_length=20000)
    cause: str | None = None
    fix: str | None = None
    project_id: int | None = None


class MatchIn(BaseModel):
    error_text: str = Field(min_length=3, max_length=20000)


@router.get("/errors")
def list_errors(request: Request, q: str = "") -> list[dict]:
    hub = hub_of(request)
    if not q.strip():
        return hub.query(ERROR_SQL + " ORDER BY e.created_at DESC, e.id DESC")
    ids = [int(h["ref"]) for h in index_of(hub).search(q, kinds=["error"], limit=50)]
    rows = {r["id"]: r for r in hub.query(ERROR_SQL)}
    return [rows[i] for i in ids if i in rows]


@router.post("/errors/match")
def match(request: Request, body: MatchIn) -> list[dict]:
    """Paste an error: get your old fixes for it, best first."""
    return matches(hub_of(request), body.error_text)


@router.post("/errors", status_code=201)
def save_error(request: Request, body: ErrorIn) -> dict:
    hub = hub_of(request)
    if body.project_id is not None:
        get_project(hub, body.project_id)
    norm = normalise(body.error_text)
    repeat = next((e for e in hub.query("SELECT * FROM errors") if normalise(e["error_text"]) == norm), None)
    with hub.tx() as c:
        if repeat:
            c.execute(
                "UPDATE errors SET seen_count = seen_count + 1, cause = CASE WHEN ? != '' THEN ? ELSE cause END, fix = CASE WHEN ? != '' THEN ? ELSE fix END WHERE id = ?",
                (body.cause, body.cause, body.fix, body.fix, repeat["id"]),
            )
            eid = repeat["id"]
        else:
            eid = c.execute(
                "INSERT INTO errors(project_id, error_text, cause, fix) VALUES (?, ?, ?, ?)",
                (body.project_id, body.error_text.strip(), body.cause.strip(), body.fix.strip()),
            ).lastrowid
    row = hub.query_one(ERROR_SQL + " WHERE e.id = ?", (eid,))
    index_error(hub, row)
    return {**row, "repeat": bool(repeat)}


@router.patch("/errors/{error_id}")
def update_error(request: Request, error_id: int, body: ErrorPatch) -> dict:
    hub = hub_of(request)
    if not hub.query_one("SELECT id FROM errors WHERE id = ?", (error_id,)):
        raise HTTPException(404, f"Error log entry {error_id} not found.")
    data = body.model_dump(exclude_unset=True)
    if data:
        with hub.tx() as c:
            c.execute(f"UPDATE errors SET {', '.join(f'{k} = ?' for k in data)} WHERE id = ?", (*data.values(), error_id))
    row = hub.query_one(ERROR_SQL + " WHERE e.id = ?", (error_id,))
    index_error(hub, row)
    return row


@router.delete("/errors/{error_id}", status_code=204)
def delete_error(request: Request, error_id: int) -> Response:
    hub = hub_of(request)
    with hub.tx() as c:
        c.execute("DELETE FROM errors WHERE id = ?", (error_id,))
    index_of(hub).delete("error", str(error_id))
    return Response(status_code=204)


@router.get("/search")
def search(request: Request, q: str = "", kind: list[str] | None = Query(default=None), limit: int = 10) -> dict:
    """One search box for snippets, errors, docs and handbook chapters."""
    kinds = [k for k in (kind or KINDS) if k in KINDS]
    idx = index_of(request)
    results = idx.search(q, kinds, limit=min(max(limit, 1), 50)) if q.strip() else []
    return {"mode": idx.mode, "results": results}
