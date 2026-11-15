"""Session 9: app stack checks, design tokens editor, screen generator.

Generic: each call goes to the project's module wizard/checks (no module ids here).
"""
from __future__ import annotations

import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..boards import load_module_file
from .cart import context
from .handbook import current
from .projects import get_project, hub_of

router = APIRouter()
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


class StackIn(BaseModel):
    stack: list[str]


@router.post("/modules/{module_id}/checks/stack")
def check_stack(request: Request, module_id: str, body: StackIn) -> dict:
    """Checks for a stack picked in New project, before the project exists."""
    hub = hub_of(request)
    checks = load_module_file(hub.paths.root, module_id, "checks.py")
    if not checks or not hasattr(checks, "run_stack"):
        return {"findings": []}
    hb = current(hub)
    stack = [{"key": k, "title": hb.by_key(k).title, "meta": hb.by_key(k).meta} for k in body.stack if hb.by_key(k)]
    return {"findings": checks.run_stack(stack)}


def _ctx(request: Request, project_id: int, need: str) -> dict:
    hub = hub_of(request)
    project = get_project(hub, project_id)
    if not Path(project["path"]).is_dir():
        raise HTTPException(409, f"Folder {project['path']} not found. It was moved or renamed.")
    ctx = context(hub, project)
    if not ctx or not hasattr(ctx["wizard"], need):
        raise HTTPException(404, "This project type has no design tokens or screens. Use an app project.")
    return ctx


@router.get("/projects/{project_id}/tokens")
def get_tokens(request: Request, project_id: int) -> dict:
    ctx = _ctx(request, project_id, "save_tokens")
    w = ctx["wizard"]
    theme_rel, _ = w.theme_target(ctx)
    f = ctx["path"] / theme_rel
    return {"tokens": w.read_tokens(ctx["path"]), "defaults": w.DEFAULT_TOKENS, "theme_file": theme_rel, "theme": f.read_text(encoding="utf-8") if f.is_file() else ""}


class TokensIn(BaseModel):
    colors: dict[str, dict[str, str]]
    fonts: dict[str, str]
    spacing: list[int] = Field(min_length=1, max_length=16)
    radius: dict[str, int]


@router.put("/projects/{project_id}/tokens")
def put_tokens(request: Request, project_id: int, body: TokensIn) -> dict:
    ctx = _ctx(request, project_id, "save_tokens")
    for mode in ("light", "dark"):
        if mode not in body.colors:
            raise HTTPException(422, f"Colours for {mode} mode are missing. Send both light and dark.")
        for name, value in body.colors[mode].items():
            if not HEX.match(value):
                raise HTTPException(422, f"{mode} {name} is '{value}', not a colour. Use a hex value like #0071E3.")
    if any(v < 0 or v > 256 for v in body.spacing) or any(v < 0 or v > 64 for v in body.radius.values()):
        raise HTTPException(422, "Spacing must be 0-256 px and radius 0-64 px.")
    result = ctx["wizard"].save_tokens(ctx, body.model_dump())
    if any(f["status"] == "skipped" for f in result["files"]):
        names = ", ".join(f["file"] for f in result["files"] if f["status"] == "skipped")
        raise HTTPException(409, f"{names} in the project isn't the hub's file (no AUTO-GENERATED marker). Rename it to let the hub manage tokens.")
    return result


class ScreenIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)


@router.post("/projects/{project_id}/screens")
def new_screen(request: Request, project_id: int, body: ScreenIn) -> dict:
    """A new screen file, written once. Never overwrites an existing file."""
    ctx = _ctx(request, project_id, "screen_file")
    rel, content = ctx["wizard"].screen_file(ctx, body.name.strip())
    status = ctx["write_once"](ctx["path"] / rel, content)
    if status == "kept":
        raise HTTPException(409, f"{rel} already exists. Pick another screen name.")
    return {"file": rel, "status": status}
