"""Session 2: launch buttons (open in VS Code, Arduino IDE, terminal, Claude Code)."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from .. import launchers
from ..modules import load_modules
from .projects import get_project, hub_of

router = APIRouter()

ALWAYS = ["terminal", "claude"]


def project_launchers(request: Request, project: dict) -> list[str]:
    modules, _ = load_modules(hub_of(request).paths.modules)
    mod = next((m for m in modules if m.id == project["module"]), None)
    order = (mod.launch if mod else ["vscode"]) + ALWAYS
    return [t for i, t in enumerate(order) if t in launchers.LABELS and t not in order[:i]]


@router.get("/projects/{project_id}/launchers")
def list_launchers(request: Request, project_id: int) -> list[dict]:
    project = get_project(hub_of(request), project_id)
    out = []
    for t in project_launchers(request, project):
        res = launchers.resolve(t, project["path"])
        out.append({"id": t, "label": launchers.LABELS[t], "available": res.ok, "fix": res.fix})
    return out


class LaunchIn(BaseModel):
    target: str


@router.post("/projects/{project_id}/launch")
def launch(request: Request, project_id: int, body: LaunchIn) -> dict:
    hub = hub_of(request)
    project = get_project(hub, project_id)
    if body.target not in launchers.LABELS:
        raise HTTPException(400, f"Unknown launcher '{body.target}'. Use one of: {', '.join(launchers.LABELS)}.")
    if not Path(project["path"]).is_dir():
        raise HTTPException(409, f"Folder {project['path']} not found. It was moved or renamed. Point the hub to its new place in project settings.")
    res = launchers.resolve(body.target, project["path"])
    if not res.ok:
        raise HTTPException(424, res.fix)
    try:
        launchers.start(res.command, project["path"])
    except OSError as exc:
        raise HTTPException(424, f"Couldn't start {launchers.LABELS[body.target]} ({exc.strerror}). {launchers.FIXES[body.target]}") from exc
    with hub.tx() as c:
        c.execute("UPDATE projects SET last_opened_at = datetime('now') WHERE id = ?", (project_id,))
    return {"ok": True, "message": f"Opening {project['name']} in {launchers.LABELS[body.target]}…"}
