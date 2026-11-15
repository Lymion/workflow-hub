"""Session 12: automations page, weekly review and hub health."""
from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from .. import automations as au, db, jobs
from .projects import hub_of

router = APIRouter()
SYNC = False  # tests run workflows inline


def trigger_text(t: dict) -> str:
    if "schedule" in t:
        s = str(t["schedule"])
        if m := au.parse_schedule(s):
            if "every" in m:
                return f"Every {s.split(None, 1)[1]}"
            if "daily" in m:
                return f"Every day at {m['daily'][0]:02d}:{m['daily'][1]:02d}"
            d, h, mi = m["weekly"]
            return f"Every {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][d]} at {h:02d}:{mi:02d}"
        return s
    if "file_change" in t:
        return f"When files matching {t['file_change'].get('glob', '**/*')} change"
    return "When you press Run"


def find(hub, wf_id: str) -> au.Workflow:
    wf = next((w for w in au.load(hub.paths.root / "workflows") if w.id == wf_id), None)
    if not wf:
        raise HTTPException(404, f"No workflow '{wf_id}'. Add workflows/{wf_id}.yaml to make one.")
    return wf


def describe(hub, wf: au.Workflow) -> dict:
    last = au.last_run(hub, wf.id)
    nxt = None
    if "schedule" in wf.trigger and not wf.errors:
        sched = hub.query_one("SELECT started_at FROM workflow_runs WHERE workflow = ? AND trigger LIKE 'schedule%' ORDER BY id DESC LIMIT 1", (wf.id,))
        n = au.next_run(str(wf.trigger["schedule"]), au._parse_dt(sched["started_at"]) if sched else None, datetime.now())
        nxt = n.isoformat(timespec="minutes") if n else None
    return {
        "id": wf.id, "name": wf.name, "description": wf.description, "file": wf.file, "trigger": wf.trigger, "trigger_text": trigger_text(wf.trigger),
        "steps": [{"id": s.get("id", s.get("run")), "run": s.get("run"), "kind": s.get("kind"), "about": au.ACTIONS[s["run"]].about if s.get("run") in au.ACTIONS else ""} for s in wf.steps],
        "enabled": au.enabled(hub, wf.id), "next_run": nxt, "last_run": last, "errors": wf.errors,
        "running": jobs.running(f"automation:{wf.id}"),
    }


@router.get("/automations")
def list_workflows(request: Request) -> list[dict]:
    hub = hub_of(request)
    return [describe(hub, wf) for wf in au.load(hub.paths.root / "workflows")]


class EnabledIn(BaseModel):
    enabled: bool


@router.put("/automations/{wf_id}")
def set_enabled(request: Request, wf_id: str, body: EnabledIn) -> dict:
    hub = hub_of(request)
    wf = find(hub, wf_id)
    db.set_setting(hub.conn, f"automation:{wf.id}:enabled", "1" if body.enabled else "0")
    return describe(hub, wf)


@router.post("/automations/{wf_id}/run")
def run_now(request: Request, wf_id: str) -> dict:
    hub = hub_of(request)
    wf = find(hub, wf_id)
    if wf.errors:
        raise HTTPException(422, wf.errors[0])
    jobs.start(f"automation:{wf.id}", lambda log: au.run(hub, wf, "button"), sync=SYNC)
    return describe(hub, wf)


@router.get("/automations/{wf_id}/runs")
def runs(request: Request, wf_id: str, limit: int = 10) -> list[dict]:
    hub = hub_of(request)
    find(hub, wf_id)
    return [au.get_run(hub, r["id"]) for r in hub.query("SELECT id FROM workflow_runs WHERE workflow = ? ORDER BY id DESC LIMIT ?", (wf_id, min(limit, 50)))]


@router.get("/reviews/latest")
def latest_review(request: Request) -> dict | None:
    r = hub_of(request).query_one("SELECT * FROM reviews ORDER BY id DESC LIMIT 1")
    return {**dict(r), "body": json.loads(r["body"])} if r else None


@router.get("/health/hub")
def hub_health(request: Request) -> dict:
    hub = hub_of(request)
    last = au.last_run(hub, "hub-health")
    tests = next((s for s in (last or {}).get("steps", []) if s["run"] == "run_hub_tests"), None)
    return {"last_run": last, "ok": bool(tests and tests["status"] == "ok"), "checked": bool(tests)}
