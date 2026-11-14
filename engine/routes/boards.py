"""Session 6: board files and the pin checker."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..boards import load_boards, load_checks
from .handbook import current
from .projects import hub_of

router = APIRouter()


def board_or_404(request: Request, board_id: str) -> dict:
    board = load_boards(hub_of(request).paths.root).get(board_id)
    if not board:
        raise HTTPException(404, f"Board '{board_id}' not found. Add modules/robotics/boards/{board_id}.yaml or pick another board.")
    return board


@router.get("/boards")
def list_boards(request: Request) -> list[dict]:
    return [{k: v for k, v in b.items() if k not in ("pins",)} | {"pin_count": len(b.get("pins", []))} for b in load_boards(hub_of(request).paths.root).values()]


@router.get("/boards/{board_id}")
def read_board(request: Request, board_id: str) -> dict:
    return board_or_404(request, board_id)


class Assignment(BaseModel):
    signal: str
    part: str
    part_pin: str
    gpio: str | None = None
    mode: str | None = None
    voltage: str | None = None
    divider: bool = False


class PartIn(BaseModel):
    key: str
    qty: int = 1


class CheckIn(BaseModel):
    board: str
    assignments: list[Assignment] = []
    parts: list[PartIn] = []


def expand(request: Request, body: CheckIn) -> tuple[dict, list[dict], list[dict]]:
    """Fill each assignment's mode/voltage and each part's setup block from the handbook."""
    hub = hub_of(request)
    board = board_or_404(request, body.board)
    hb = current(hub)
    parts, missing = [], []
    for p in body.parts:
        ch = hb.by_key(p.key)
        if not ch:
            missing.append(p.key)
            continue
        parts.append({"key": p.key, "title": ch.title, "qty": p.qty, "meta": ch.meta})
    if missing:
        raise HTTPException(400, f"No handbook chapter for: {', '.join(missing)}. Add it under modules/robotics/handbook/parts/.")
    assignments = []
    for a in body.assignments:
        ch = hb.by_key(a.part)
        pin = next((x for x in (ch.meta.get("pins", []) if ch else []) if x.get("name") == a.part_pin), {})
        assignments.append({
            **a.model_dump(),
            "gpio": None if a.gpio in (None, "") else str(a.gpio),
            "part_title": ch.title if ch else a.part,
            "mode": (a.mode or pin.get("mode") or "OUTPUT").upper(),
            "voltage": a.voltage or pin.get("voltage", ""),
        })
    return board, assignments, parts


@router.post("/checks")
def run_checks(request: Request, body: CheckIn) -> dict:
    board, assignments, parts = expand(request, body)
    checks = load_checks(hub_of(request).paths.root, board["module"])
    if not checks:
        return {"findings": [], "summary": {"bad": 0, "warn": 0, "ok": 0}}
    findings = checks.run(board, assignments, parts)
    summary = {lvl: sum(1 for f in findings if f["level"] == lvl) for lvl in ("bad", "warn", "ok")}
    return {"findings": findings, "summary": summary}


@router.get("/boards/{board_id}/suggest")
def suggest_pin(request: Request, board_id: str, mode: str = "OUTPUT", used: str = "") -> dict:
    board = board_or_404(request, board_id)
    checks = load_checks(hub_of(request).paths.root, board["module"])
    pin = checks.suggest(board, mode.upper(), {u for u in used.split(",") if u}) if checks else None
    return {"pin": pin}
