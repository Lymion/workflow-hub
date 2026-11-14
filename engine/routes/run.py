"""Session 10: run panel. Start/stop builds, uploads, dev servers and the serial monitor, with logs.

Targets come from modules/<type>/run.py (no module ids here). Logs are polled: /log?after=<seq>.
"""
from __future__ import annotations

import re
import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .. import runner
from ..boards import load_module_file
from ..hub import Hub
from .cart import context
from .errors import matches
from .projects import get_project, hub_of

router = APIRouter()
LIKELY = ("cp210", "ch340", "ch910", "ftdi", "usb serial", "usb-serial", "usb jtag", "esp32", "arduino", "wch", "silicon labs")
NO_PORT = "No board found on USB. Plug it in with a data cable (not a charge-only one), then press Start."
NO_PYSERIAL = "The serial monitor needs pyserial. Run: pip install pyserial, then restart the engine."


# ---------- serial ports ----------

def list_ports(hub: Hub) -> list[dict]:
    lister = getattr(hub, "serial_ports", None)
    if lister:
        return lister()
    try:
        from serial.tools import list_ports as lp
    except ImportError:
        return []
    out = []
    for p in lp.comports():
        if (p.hwid or "n/a") == "n/a":
            continue  # legacy/virtual ports (ttyS0…), never a USB board
        desc = f"{p.description or ''} {p.manufacturer or ''}".strip()
        out.append({"device": p.device, "description": desc or p.device, "likely": any(k in desc.lower() for k in LIKELY)})
    return sorted(out, key=lambda p: (not p["likely"], p["device"]))


def open_serial(hub: Hub, device: str, baud: int):
    factory = getattr(hub, "serial_factory", None)
    if factory:
        return factory(device, baud)
    try:
        import serial
    except ImportError as exc:
        raise HTTPException(424, NO_PYSERIAL) from exc
    try:
        return serial.serial_for_url(device, baudrate=baud, timeout=0.2)
    except Exception as exc:  # busy port, unplugged, no permission
        raise HTTPException(409, f"Couldn't open {device} ({type(exc).__name__}). Close other serial monitors (Arduino IDE, VS Code) and try again.") from exc


@router.get("/serial/ports")
def ports(request: Request) -> list[dict]:
    return list_ports(hub_of(request))


# ---------- targets ----------

def targets_for(hub: Hub, project: dict, **opts) -> tuple[list[dict], dict]:
    ctx = context(hub, project, **opts) or {}
    if not ctx:
        # no wizard context (e.g. robotics without a board): still offer the module's targets
        ctx = {"project": project, "path": Path(project["path"]), "board": None, "stack": [], "which": shutil.which, **opts}
    mod = load_module_file(hub.paths.root, project["module"], "run.py")
    if not mod:
        return [], ctx
    wanted = project_run_ids(hub, project)
    ts = mod.targets(ctx)
    if wanted:
        ts = sorted([t for t in ts if t["id"] in wanted], key=lambda t: wanted.index(t["id"]))
    return ts, ctx


def project_run_ids(hub: Hub, project: dict) -> list[str]:
    from ..modules import load_modules

    mods, _ = load_modules(hub.paths.modules)
    m = next((m for m in mods if m.id == project["module"]), None)
    return list(m.run) if m else []


def key(project_id: int, target: str) -> str:
    return f"{project_id}:{target}"


def describe(t: dict, project_id: int) -> dict:
    p = runner.get(key(project_id, t["id"]))
    out = {k: t.get(k) for k in ("id", "label", "kind", "hint", "fix", "baud")}
    out["available"] = not t.get("fix")
    out["proc"] = p.info() if p else None
    return out


@router.get("/projects/{project_id}/run")
def list_targets(request: Request, project_id: int) -> dict:
    hub = hub_of(request)
    project = get_project(hub, project_id)
    ts, _ = targets_for(hub, project)
    return {"targets": [describe(t, project_id) for t in ts]}


class StartIn(BaseModel):
    port: str | None = None
    baud: int | None = Field(default=None, ge=300, le=4_000_000)


def start_serial(hub: Hub, project_id: int, t: dict, port: str | None, baud: int | None) -> runner.Proc:
    device = port
    if not device:
        found = list_ports(hub)
        if not found:
            raise HTTPException(409, NO_PORT)
        device = found[0]["device"]
    rate = baud or t.get("baud") or 115200
    conn = open_serial(hub, device, rate)
    proc = runner.Proc(key(project_id, t["id"]), t["label"], "serial")
    proc.port, proc.baud = device, rate  # type: ignore[attr-defined]
    try:
        runner.put(proc)
    except RuntimeError as exc:
        conn.close()
        raise HTTPException(409, str(exc)) from exc
    proc.attach_serial(conn, device, rate)
    return proc


@router.post("/projects/{project_id}/run/{target}")
def start(request: Request, project_id: int, target: str, body: StartIn | None = None) -> dict:
    hub = hub_of(request)
    body = body or StartIn()
    project = get_project(hub, project_id)
    if not Path(project["path"]).is_dir():
        raise HTTPException(409, f"Folder {project['path']} not found. It was moved or renamed.")
    ts, _ = targets_for(hub, project, port=body.port)
    t = next((x for x in ts if x["id"] == target), None)
    if not t:
        raise HTTPException(404, f"'{target}' isn't a run target for this project. Use one of: {', '.join(x['id'] for x in ts) or 'none'}.")
    if t.get("fix"):
        raise HTTPException(424, t["fix"])
    if t["kind"] == "serial":
        return start_serial(hub, project_id, t, body.port, body.baud).info()

    resume = None
    if t.get("pauses_serial"):
        serial = runner.get(key(project_id, "serial"))
        if serial and serial.running:
            resume = (getattr(serial, "port", None), getattr(serial, "baud", None))
            serial.add("[hub] paused for upload")
            serial.stop()
    proc = runner.Proc(key(project_id, target), t["label"], t["kind"])
    try:
        runner.put(proc)
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc
    if resume:
        st = next((x for x in ts if x["id"] == "serial"), None)

        def resume_serial(p: runner.Proc) -> None:
            if st and p.state == "exited":
                try:
                    start_serial(hub, project_id, st, resume[0], resume[1])
                except HTTPException as exc:
                    p.add(f"[hub] serial didn't resume: {exc.detail}")

        proc.on_exit.append(resume_serial)
    proc.spawn(t["cmd"], cwd=project["path"], env=t.get("env"))
    return proc.info()


def _proc(project_id: int, target: str) -> runner.Proc:
    p = runner.get(key(project_id, target))
    if not p:
        raise HTTPException(404, f"{target} hasn't been started for this project. Press Start first.")
    return p


@router.post("/projects/{project_id}/run/{target}/stop")
def stop(request: Request, project_id: int, target: str) -> dict:
    p = _proc(project_id, target)
    p.stop()
    return p.info()


ERRORISH = re.compile(r"error|exception|traceback|fatal|failed|cannot|not found|undefined reference", re.I)


def error_text(tail: str) -> str:
    """The lines that look like the error, without the hub's own lines. Falls back to the last lines."""
    lines = [l for l in tail.splitlines() if l.strip() and not l.startswith(("[hub]", "$ "))]
    hits = [l for l in lines if ERRORISH.search(l) and "[SUCCESS]" not in l]
    return "\n".join((hits or lines[-10:])[:8])


@router.get("/projects/{project_id}/run/{target}/log")
def log(request: Request, project_id: int, target: str, after: int = 0) -> dict:
    p = _proc(project_id, target)
    out = {**p.info(), "lines": p.log(after)}
    if p.state == "failed":
        err = error_text(p.tail(60))
        out["past_errors"] = [{"id": e["id"], "error_text": e["error_text"][:200], "cause": e["cause"], "fix": e["fix"], "similarity": e["similarity"]}
                              for e in matches(hub_of(request), err) if e["similarity"] >= 0.5] if err else []
        out["error_text"] = err
    return out


class SendIn(BaseModel):
    text: str = Field(max_length=1000)


@router.post("/projects/{project_id}/run/{target}/send")
def send(request: Request, project_id: int, target: str, body: SendIn) -> dict:
    p = _proc(project_id, target)
    if not p.running:
        raise HTTPException(409, f"{p.label} isn't running. Press Start first.")
    try:
        p.send(body.text)
    except Exception as exc:
        raise HTTPException(409, f"Couldn't send to {p.label} ({type(exc).__name__}). Restart it and try again.") from exc
    return {"ok": True}
