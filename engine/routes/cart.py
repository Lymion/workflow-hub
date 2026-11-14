"""Session 7: project cart (parts + costs), presets, checks per project, wizard setup, wiring."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import yaml
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .. import generated, jobs
from ..boards import load_boards, load_module_file
from ..hub import Hub
from ..modules import load_modules
from .handbook import current
from .projects import get_project, hub_of

router = APIRouter()
STATUSES = ("need", "ordered", "have")


def run_cmd(cmd: list[str], cwd: Path | None = None, timeout: int = 60) -> str | None:
    """Run a tool; return stdout, or None if it is missing or fails."""
    try:
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return r.stdout if r.returncode == 0 else None


# ---------- parts ----------

def project_parts(hub: Hub, project_id: int) -> list[dict]:
    hb = current(hub)
    out = []
    for r in hub.query("SELECT * FROM project_parts WHERE project_id = ? ORDER BY id", (project_id,)):
        ch = hb.by_key(r["part_key"])
        meta = ch.meta if ch else {}
        price = (meta.get("price_rm") or [0])[0]
        out.append({
            "id": r["id"], "key": r["part_key"], "qty": r["qty"], "status": r["status"],
            "title": ch.title if ch else r["part_key"], "path": ch.path if ch else None,
            "section": ch.section if ch else "", "meta": meta, "unit_rm": price, "cost_rm": price * r["qty"],
        })
    return out


def totals(parts: list[dict]) -> dict:
    t = {s: sum(p["cost_rm"] for p in parts if p["status"] == s) for s in STATUSES}
    return {"total": sum(t.values()), **t}


@router.get("/projects/{project_id}/parts")
def list_parts(request: Request, project_id: int) -> dict:
    hub = hub_of(request)
    get_project(hub, project_id)
    parts = project_parts(hub, project_id)
    return {"parts": parts, "totals": totals(parts)}


class PartAdd(BaseModel):
    key: str
    qty: int = Field(default=1, ge=1, le=999)


class PartsIn(BaseModel):
    items: list[PartAdd]


def add_parts(hub: Hub, project_id: int, items: list[PartAdd], status: str = "need") -> None:
    hb = current(hub)
    missing = [i.key for i in items if not hb.by_key(i.key)]
    if missing:
        raise HTTPException(400, f"No handbook chapter for: {', '.join(missing)}. Add it to the handbook first.")
    with hub.tx() as c:
        for i in items:
            c.execute(
                "INSERT INTO project_parts(project_id, part_key, qty, status) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(project_id, part_key) DO UPDATE SET qty = qty + excluded.qty",
                (project_id, i.key, i.qty, status),
            )
        c.execute("UPDATE projects SET updated_at = datetime('now') WHERE id = ?", (project_id,))


@router.post("/projects/{project_id}/parts", status_code=201)
def post_parts(request: Request, project_id: int, body: PartsIn) -> dict:
    hub = hub_of(request)
    project = get_project(hub, project_id)
    add_parts(hub, project_id, body.items)
    refresh_files(hub, project)
    return list_parts(request, project_id)


class PartPatch(BaseModel):
    qty: int | None = Field(default=None, ge=1, le=999)
    status: str | None = None


@router.patch("/project-parts/{row_id}")
def patch_part(request: Request, row_id: int, body: PartPatch) -> dict:
    hub = hub_of(request)
    row = hub.query_one("SELECT * FROM project_parts WHERE id = ?", (row_id,))
    if not row:
        raise HTTPException(404, "Part not found in this project. It may have been removed.")
    if body.status is not None and body.status not in STATUSES:
        raise HTTPException(400, f"Status '{body.status}' isn't valid. Use need, ordered or have.")
    data = body.model_dump(exclude_unset=True, exclude_none=True)
    if data:
        with hub.tx() as c:
            c.execute(f"UPDATE project_parts SET {', '.join(f'{k} = ?' for k in data)} WHERE id = ?", (*data.values(), row_id))
    if "qty" in data:
        refresh_files(hub, get_project(hub, row["project_id"]))
    return list_parts(request, row["project_id"])


@router.delete("/project-parts/{row_id}", status_code=204)
def delete_part(request: Request, row_id: int) -> Response:
    hub = hub_of(request)
    row = hub.query_one("SELECT * FROM project_parts WHERE id = ?", (row_id,))
    if row:
        with hub.tx() as c:
            c.execute("DELETE FROM project_parts WHERE id = ?", (row_id,))
        refresh_files(hub, get_project(hub, row["project_id"]))
    return Response(status_code=204)


# ---------- presets ----------

def load_presets(root: Path) -> list[dict]:
    out = []
    modules, _ = load_modules(root / "modules")
    for m in modules:
        for f in sorted((root / "modules" / m.folder / "presets").glob("*.yaml")):
            data = yaml.safe_load(f.read_text(encoding="utf-8")) or {}
            if data.get("preset"):
                out.append({**data, "module": m.id})
    return out


@router.get("/presets")
def presets(request: Request, module: str | None = None) -> list[dict]:
    return [p for p in load_presets(hub_of(request).paths.root) if not module or p["module"] == module]


@router.post("/projects/{project_id}/presets/{preset_id}")
def apply_preset(request: Request, project_id: int, preset_id: str) -> dict:
    hub = hub_of(request)
    project = get_project(hub, project_id)
    preset = next((p for p in load_presets(hub.paths.root) if p["preset"] == preset_id and p["module"] == project["module"]), None)
    if not preset:
        raise HTTPException(404, f"Preset '{preset_id}' not found for this project type.")
    add_parts(hub, project_id, [PartAdd(**i) for i in preset.get("parts", [])])
    refresh_files(hub, project)
    return list_parts(request, project_id)


# ---------- wizard context ----------

def board_for(hub: Hub, project: dict) -> dict | None:
    return load_boards(hub.paths.root).get(project.get("board") or "")


def read_wiring(project: dict) -> dict:
    f = Path(project["path"]) / "wiring.json"
    try:
        return json.loads(f.read_text(encoding="utf-8")) if f.is_file() else {}
    except json.JSONDecodeError:
        return {}


def context(hub: Hub, project: dict, **flags) -> dict | None:
    board = board_for(hub, project)
    wizard = load_module_file(hub.paths.root, project["module"], "wizard.py")
    checks = load_module_file(hub.paths.root, project["module"], "checks.py")
    if not wizard or (getattr(wizard, "NEEDS_BOARD", False) and not board):
        return None
    parts = [p for p in project_parts(hub, project["id"]) if p["section"] != "boards"]
    hb = current(hub)
    stack = [{"key": k, "title": hb.by_key(k).title, "meta": hb.by_key(k).meta} for k in project.get("stack", []) if hb.by_key(k)]
    return {
        "wizard": wizard, "checks": checks, "project": project, "board": board, "parts": parts,
        "wiring": read_wiring(project), "root": hub.paths.root, "path": Path(project["path"]), "stack": stack,
        "suggest": getattr(checks, "suggest", None) or (lambda b, m, u: None),
        "write_owned": generated.write_owned, "write_once": generated.write_once,
        "which": shutil.which, "run": run_cmd, **flags,
    }


def refresh_files(hub: Hub, project: dict) -> dict | None:
    """Regenerate the hub-owned files after the cart changes (never touches user code)."""
    if not Path(project["path"]).is_dir():
        return None
    ctx = context(hub, project)
    return ctx["wizard"].setup(ctx) if ctx else None


def findings_for(hub: Hub, ctx: dict) -> list[dict]:
    if not ctx["checks"]:
        return []
    if hasattr(ctx["wizard"], "findings"):
        return ctx["wizard"].findings(ctx)
    hb = current(hub)
    wiring = ctx["wizard"].sync_wiring(ctx["board"], ctx["parts"], ctx["wiring"], ctx["suggest"])
    assignments = []
    for w in wiring["wires"]:
        ch = hb.by_key(w["part"])
        pin = next((x for x in (ch.meta.get("pins", []) if ch else []) if x["name"] == w["partPin"]), {})
        assignments.append({"signal": w["signalName"], "part": w["part"], "part_title": ch.title if ch else w["part"], "part_pin": w["partPin"],
                            "gpio": w.get("boardPin"), "mode": w.get("mode") or pin.get("mode", "OUTPUT"), "voltage": pin.get("voltage", ""), "divider": w.get("divider", False)})
    return ctx["checks"].run(ctx["board"], assignments, ctx["parts"])


# Tests set this to run background steps inline (and to skip slow tools).
BACKGROUND_SYNC = False


def after_create(hub: Hub, project: dict) -> None:
    """New project: board into the cart, starter files now, slow steps (scaffold, installs) in the background."""
    board = board_for(hub, project)
    if board and current(hub).by_key(board["board"]):
        add_parts(hub, project["id"], [PartAdd(key=board["board"], qty=1)])
    ctx = context(hub, project, run_git=True)
    if not ctx:
        return
    ctx["wizard"].setup(ctx)
    add_checklist(hub, ctx)
    start_background(hub, project, ctx)


def start_background(hub: Hub, project: dict, ctx: dict, **flags) -> dict | None:
    if not hasattr(ctx["wizard"], "background"):
        return None
    bg = context(hub, project, **{"run_git": True, **flags})
    return jobs.start(f"setup:{project['id']}", lambda log: bg["wizard"].background({**bg, "log": log}), sync=BACKGROUND_SYNC)


def add_checklist(hub: Hub, ctx: dict) -> list[str]:
    items = ctx["wizard"].setup_check(ctx)
    titles = ctx["wizard"].checklist(ctx, findings_for(hub, ctx), items)
    existing = {r["title"] for r in hub.query("SELECT title FROM tasks WHERE project_id = ?", (ctx["project"]["id"],))}
    added = [t for t in titles if t not in existing]
    with hub.tx() as c:
        for i, t in enumerate(added):
            c.execute("INSERT INTO tasks(project_id, title, source, position) VALUES (?, ?, 'setup', ?)", (ctx["project"]["id"], t, i))
    return added


# ---------- routes ----------

@router.get("/projects/{project_id}/checks")
def project_checks(request: Request, project_id: int) -> dict:
    hub = hub_of(request)
    ctx = context(hub, get_project(hub, project_id))
    if not ctx:
        return {"findings": [], "summary": {"bad": 0, "warn": 0, "ok": 0}}
    f = findings_for(hub, ctx)
    return {"findings": f, "summary": {lvl: sum(1 for x in f if x["level"] == lvl) for lvl in ("bad", "warn", "ok")}}


@router.get("/projects/{project_id}/setup")
def setup_status(request: Request, project_id: int) -> dict:
    hub = hub_of(request)
    project = get_project(hub, project_id)
    ctx = context(hub, project)
    if not ctx:
        return {"available": False, "items": [], "files": []}
    path = Path(project["path"])
    w = ctx["wizard"]
    names = w.status_files(ctx) if hasattr(w, "status_files") else getattr(w, "STATUS_FILES", [])
    files = [{"file": n, "exists": (path / n).is_file(), "owned": (path / n).is_file() and generated.is_owned(path / n)} for n in names]
    return {"available": True, "items": ctx["wizard"].setup_check(ctx), "files": files, "job": jobs.get(f"setup:{project_id}")}


class SetupIn(BaseModel):
    run_pio: bool = True
    run_git: bool = True
    add_tasks: bool = True
    run_scaffold: bool = False
    run_install: bool = False
    run_github: bool = False


@router.post("/projects/{project_id}/setup")
def run_setup(request: Request, project_id: int, body: SetupIn) -> dict:
    hub = hub_of(request)
    project = get_project(hub, project_id)
    if not Path(project["path"]).is_dir():
        raise HTTPException(409, f"Folder {project['path']} not found. It was moved or renamed.")
    ctx = context(hub, project, run_pio=body.run_pio, run_git=body.run_git)
    if not ctx:
        raise HTTPException(400, "This project has no board yet, or its type has no setup wizard. Pick a board first.")
    result = ctx["wizard"].setup(ctx)
    added = add_checklist(hub, context(hub, project)) if body.add_tasks else []
    job = start_background(hub, project, ctx, run_git=body.run_git, run_scaffold=body.run_scaffold, run_install=body.run_install, run_github=body.run_github) if (body.run_scaffold or body.run_install or body.run_github) else None
    return {"files": result["files"], "steps": result["steps"], "tasks_added": added, "job": job}


@router.get("/projects/{project_id}/wiring")
def get_wiring(request: Request, project_id: int) -> dict:
    hub = hub_of(request)
    project = get_project(hub, project_id)
    path = Path(project["path"])
    pins_h = (path / "include" / "pins.h").read_text(encoding="utf-8") if (path / "include" / "pins.h").is_file() else ""
    return {"wiring": read_wiring(project), "pins_h": pins_h, "board": board_for(hub, project)}


class Wire(BaseModel):
    part: str
    instance: int = 1
    partPin: str
    boardPin: str | None = None
    signalName: str
    mode: str = "OUTPUT"
    divider: bool = False


class WiringIn(BaseModel):
    wires: list[Wire]


@router.put("/projects/{project_id}/wiring")
def put_wiring(request: Request, project_id: int, body: WiringIn) -> dict:
    """Save edited wires to wiring.json and regenerate pins.h (and the rest of the owned files)."""
    hub = hub_of(request)
    project = get_project(hub, project_id)
    ctx = context(hub, project)
    if not ctx:
        raise HTTPException(400, "Pick a board for this project first.")
    wiring = {"board": ctx["board"]["board"], "wires": [w.model_dump() for w in body.wires]}
    status = generated.write_owned(Path(project["path"]) / "wiring.json", json.dumps({"_comment": "AUTO-GENERATED by Workflow Hub. Edit wires in the hub's Wiring tab.", **wiring}, indent=2) + "\n")
    if status == "skipped":
        raise HTTPException(409, "wiring.json in the project folder isn't the hub's file (no AUTO-GENERATED marker). Rename it to let the hub manage wiring.")
    refresh_files(hub, project)
    return {**get_wiring(request, project_id), **project_checks(request, project_id)}
