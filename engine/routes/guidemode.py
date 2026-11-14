"""Session 12: handbook guide mode. A short question flow per project type ranks the chapters to read.

Questions live in modules/<type>/guide.yaml (plain data). Scoring is plain code, no tokens.
"""
from __future__ import annotations

import yaml
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..modules import load_modules
from .handbook import current
from .projects import hub_of

router = APIRouter()


def guides(root) -> dict[str, dict]:
    mods, _ = load_modules(root / "modules")
    out = {}
    for m in mods:
        f = root / "modules" / m.folder / "guide.yaml"
        if m.enabled and f.is_file():
            data = yaml.safe_load(f.read_text(encoding="utf-8")) or {}
            out[m.id] = {"module": m.id, "name": m.name, "title": data.get("title", m.name), "questions": data.get("questions", [])}
    return out


@router.get("/handbook/guide")
def list_guides(request: Request) -> list[dict]:
    hub = hub_of(request)
    return [{**g, "questions": [{k: q.get(k) for k in ("id", "q", "multi")} | {"options": [o["label"] for o in q.get("options", [])]} for q in g["questions"]]}
            for g in guides(hub.paths.root).values()]


class AnswersIn(BaseModel):
    answers: dict[str, list[str]]


@router.post("/handbook/guide/{module_id}")
def rank(request: Request, module_id: str, body: AnswersIn) -> dict:
    hub = hub_of(request)
    g = guides(hub.paths.root).get(module_id)
    if not g:
        raise HTTPException(404, f"No guide for '{module_id}'. Add modules/{module_id}/guide.yaml to make one.")
    score: dict[str, float] = {}
    why: dict[str, list[str]] = {}
    for q in g["questions"]:
        picked = set(body.answers.get(q["id"], []))
        for o in q.get("options", []):
            if o["label"] not in picked:
                continue
            for key, pts in (o.get("boost") or {}).items():
                score[key] = score.get(key, 0) + float(pts)
                why.setdefault(key, []).append(o["label"])
    hb = current(hub)
    results = []
    for key, pts in sorted(score.items(), key=lambda kv: -kv[1]):
        ch = hb.by_key(key)
        if not ch or pts <= 0:
            continue
        results.append({"key": key, "title": ch.title, "path": ch.path, "section": ch.section, "score": pts, "why": why[key],
                        "good_for": ch.meta.get("good_for", ""), "glyph": ch.meta.get("glyph", ""), "color": ch.meta.get("color", "")})
    return {"module": module_id, "results": results[:10], "answered": sum(1 for q in g["questions"] if body.answers.get(q["id"]))}
