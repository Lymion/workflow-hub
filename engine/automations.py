"""Workflow runner. Workflows are YAML files in workflows/; each step is tagged by who does the work:

  code       plain Python in this file, free
  small-llm  one Haiku call through llm.Haiku (cap, cache and log apply), with a free fallback
  big-llm    opens Claude Code on the user's machine with a prompt; the hub never calls a big model

Triggers: schedule ("daily 20:30", "weekly sun 20:00", "every 30m"), file_change (glob in project
folders, polled), button (POST /automations/<id>/run). Every run and step is logged in workflow_runs.
"""
from __future__ import annotations

import fnmatch
import json
import os
import re
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable

import yaml

from . import launchers, llm
from .bundle import frozen
from .hub import Hub

KINDS = ("code", "small-llm", "big-llm")
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


@dataclass
class Workflow:
    id: str
    name: str
    description: str
    trigger: dict
    steps: list[dict]
    file: str
    errors: list[str] = field(default_factory=list)


def load(folder: Path) -> list[Workflow]:
    out = []
    for f in sorted(folder.glob("*.yaml")) if folder.is_dir() else []:
        try:
            d = yaml.safe_load(f.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError as exc:
            out.append(Workflow(f.stem, f.stem, "", {}, [], f.name, [f"{f.name}: YAML error on line {getattr(getattr(exc, 'problem_mark', None), 'line', 0) + 1}. Fix the indentation."]))
            continue
        errs = []
        steps = d.get("steps") or []
        for i, s in enumerate(steps):
            if s.get("kind") not in KINDS:
                errs.append(f"{f.name}: step {i + 1} has kind '{s.get('kind')}'. Use code, small-llm or big-llm.")
            if s.get("run") not in ACTIONS:
                errs.append(f"{f.name}: step {i + 1} runs '{s.get('run')}', which the hub doesn't have. Use one of: {', '.join(sorted(ACTIONS))}.")
            elif s.get("kind") in KINDS and ACTIONS[s["run"]].kind != s["kind"]:
                errs.append(f"{f.name}: '{s['run']}' is a {ACTIONS[s['run']].kind} step, not {s['kind']}. Fix its kind.")
        trig = d.get("trigger") or {"button": True}
        if "schedule" in trig and parse_schedule(str(trig["schedule"])) is None:
            errs.append(f"{f.name}: can't read schedule '{trig['schedule']}'. Use 'daily 20:30', 'weekly sun 20:00' or 'every 30m'.")
        out.append(Workflow(str(d.get("id") or f.stem), str(d.get("name") or f.stem), str(d.get("description", "")), trig, steps, f.name, errs))
    return out


# ---------- schedules ----------

def parse_schedule(text: str) -> dict | None:
    t = text.strip().lower()
    if m := re.fullmatch(r"every\s+(\d+)\s*(m|min|minutes?|h|hours?)", t):
        n = int(m.group(1))
        return {"every": timedelta(minutes=n) if m.group(2).startswith("m") else timedelta(hours=n)}
    if m := re.fullmatch(r"daily\s+(\d{1,2}):(\d{2})", t):
        return {"daily": (int(m.group(1)), int(m.group(2)))}
    if m := re.fullmatch(r"weekly\s+(mon|tue|wed|thu|fri|sat|sun)\s+(\d{1,2}):(\d{2})", t):
        return {"weekly": (DAYS.index(m.group(1)), int(m.group(2)), int(m.group(3)))}
    return None


def next_run(schedule: str, last: datetime | None, now: datetime) -> datetime | None:
    s = parse_schedule(schedule)
    if not s:
        return None
    if "every" in s:
        return (last + s["every"]) if last else now
    if "daily" in s:
        h, m = s["daily"]
        cand = now.replace(hour=h, minute=m, second=0, microsecond=0)
        if last and last >= cand:
            cand += timedelta(days=1)
        return cand if not last or cand > last else cand + timedelta(days=1)
    dow, h, m = s["weekly"]
    cand = (now - timedelta(days=(now.weekday() - dow) % 7)).replace(hour=h, minute=m, second=0, microsecond=0)
    if last and last >= cand:
        cand += timedelta(days=7)
    return cand


def is_due(schedule: str, last: datetime | None, now: datetime) -> bool:
    nxt = next_run(schedule, last, now)
    return nxt is not None and nxt <= now


# ---------- actions ----------

@dataclass
class Action:
    kind: str
    fn: Callable[[Hub, dict, dict], dict]
    about: str


ACTIONS: dict[str, Action] = {}


def action(name: str, kind: str, about: str):
    def deco(fn):
        ACTIONS[name] = Action(kind, fn, about)
        return fn
    return deco


def week_label(now: datetime) -> str:
    y, w, _ = now.isocalendar()
    return f"{y}-W{w:02d}"


@action("collect_week", "code", "Collects the last 7 days of journal entries, errors and finished tasks.")
def collect_week(hub: Hub, state: dict, args: dict) -> dict:
    days = int(args.get("days", 7))
    since = f"-{days} days"
    journal = [dict(r) for r in hub.query("SELECT j.body, j.created_at, p.name AS project FROM journal j LEFT JOIN projects p ON p.id = j.project_id WHERE j.created_at >= datetime('now', ?) ORDER BY j.created_at", (since,))]
    errors = [dict(r) for r in hub.query("SELECT error_text, cause, fix, seen_count FROM errors WHERE created_at >= datetime('now', ?) ORDER BY created_at", (since,))]
    done = [dict(r) for r in hub.query("SELECT t.title, p.name AS project FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.status = 'done' AND t.done_at >= datetime('now', ?)", (since,))]
    state["week"] = {"journal": journal, "errors": errors, "done": done}
    n = lambda k, word: f"{k} {word}{'' if k == 1 else 's'}"  # noqa: E731
    return {"summary": f"{n(len(journal), 'journal note')}, {n(len(errors), 'error')}, {n(len(done), 'task')} done"}


REVIEW_SYSTEM = """You write a short, warm weekly review for a maker who builds robots (ESP32/Arduino) and apps (Expo/Next.js/Tauri).
Use only the notes, errors and finished tasks given. Be concrete and brief; no filler.
Return: summary (2-3 sentences), wins (up to 3), stuck (up to 3, each with a one-line next step), next (up to 3 suggestions for next week)."""

REVIEW_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "wins": {"type": "array", "items": {"type": "string"}},
        "stuck": {"type": "array", "items": {"type": "string"}},
        "next": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "wins", "stuck", "next"],
    "additionalProperties": False,
}


def review_prompt(week: dict) -> str:
    lines = ["Finished tasks:"] + [f"- [{d['project']}] {d['title']}" for d in week["done"][:60]]
    lines += ["", "Journal:"] + [f"- [{j.get('project') or 'hub'}] {j['body'][:400]}" for j in week["journal"][:60]]
    lines += ["", "Errors:"] + [f"- {e['error_text'][:200]}" + (f" (fix: {e['fix'][:160]})" if e.get("fix") else " (not fixed yet)") for e in week["errors"][:30]]
    return "\n".join(lines)


def template_review(week: dict) -> dict:
    done, notes, errs = week["done"], week["journal"], week["errors"]
    projects = sorted({d["project"] for d in done} | {j["project"] for j in notes if j.get("project")})
    open_errs = [e for e in errs if not e.get("fix")]
    return {
        "summary": f"You finished {len(done)} task{'s' if len(done) != 1 else ''}, wrote {len(notes)} journal note{'s' if len(notes) != 1 else ''} and logged {len(errs)} error{'s' if len(errs) != 1 else ''}" + (f" across {', '.join(projects)}." if projects else "."),
        "wins": [f"{d['title']} ({d['project']})" for d in done[:3]],
        "stuck": [f"{e['error_text'][:80]}: add the fix to the error log once it's solved" for e in open_errs[:3]],
        "next": ["Pick one open task per project for Monday."] if done or notes else ["Start small: one task in one project."],
    }


@action("weekly_summary", "small-llm", "One Haiku call writes the review from what collect_week found. Free template if Haiku is off or capped.")
def weekly_summary(hub: Hub, state: dict, args: dict) -> dict:
    week = state.get("week") or {"journal": [], "errors": [], "done": []}
    if not (week["journal"] or week["errors"] or week["done"]):
        state["review"], state["review_source"] = template_review(week), "template"
        return {"summary": "Quiet week: nothing to send, used the template", "source": "template"}
    factory = getattr(hub, "llm_factory", None)
    prompt = review_prompt(week)
    res = llm.Haiku(hub, factory).ask("weekly_review", REVIEW_SYSTEM, prompt, max_tokens=900, schema=REVIEW_SCHEMA, effort="low", key=llm.cache_key("review", prompt))
    if res.status in ("sent", "cached") and isinstance(res.data, dict):
        state["review"], state["review_source"] = res.data, res.status
        return {"summary": f"Haiku wrote the review (RM{res.cost_rm:.4f})" if res.status == "sent" else "Review from cache", "source": res.status}
    state["review"], state["review_source"] = template_review(week), "template"
    return {"summary": f"{res.message} Used the template.", "source": "template"}


@action("save_review", "code", "Saves the review so Home shows it.")
def save_review(hub: Hub, state: dict, args: dict) -> dict:
    review = state.get("review")
    if not review:
        return {"summary": "No review to save", "skip": True}
    week = week_label(datetime.now())
    with hub.tx() as c:
        c.execute("INSERT INTO reviews(week, body, source) VALUES (?, ?, ?)", (week, json.dumps(review), state.get("review_source", "template")))
    return {"summary": f"Saved the review for {week}"}


@action("run_hub_tests", "code", "Runs the hub's own tests (python -m pytest).")
def run_hub_tests(hub: Hub, state: dict, args: dict) -> dict:
    runner = getattr(hub, "test_runner", None)
    if not runner and frozen():
        return {"summary": "The installed app doesn't ship the hub's tests; run python -m pytest in the source folder instead", "skip": True}
    if runner:
        code, out = runner()
    else:
        try:
            r = subprocess.run([sys.executable, "-m", "pytest", "-q", "-x", "--no-header", "-p", "no:cacheprovider"], cwd=hub.paths.root,
                               capture_output=True, text=True, timeout=int(args.get("timeout", 900)), env={**os.environ, "WORKFLOW_HUB_EMBED": "0"})
            code, out = r.returncode, (r.stdout + r.stderr)
        except subprocess.TimeoutExpired:
            code, out = 1, "The hub tests took longer than the timeout."
    tail = "\n".join(out.strip().splitlines()[-60:])
    state["tests"] = {"code": code, "output": tail}
    last = next((l for l in reversed(out.strip().splitlines()) if l.strip()), "")
    return {"summary": ("All hub tests pass" if code == 0 else "Hub tests failed") + (f": {last[:160]}" if last else ""), "alert": code != 0}


HEALTH_PROMPT = "The Workflow Hub tests failed. Read data/health/last-failure.md for the output, find the cause, fix it, and run python -m pytest until it passes."


@action("open_claude_code", "big-llm", "If the hub tests failed, opens Claude Code in the hub folder with the error. Never calls a model itself.")
def open_claude_code(hub: Hub, state: dict, args: dict) -> dict:
    tests = state.get("tests")
    if args.get("only_if_failed", True) and (not tests or tests["code"] == 0):
        return {"summary": "Tests pass, so Claude Code isn't needed", "skip": True}
    folder = hub.paths.data / "health"
    folder.mkdir(parents=True, exist_ok=True)
    report = folder / "last-failure.md"
    report.write_text(f"# Hub tests failed ({datetime.now():%Y-%m-%d %H:%M})\n\n```\n{(tests or {}).get('output', '')}\n```\n", encoding="utf-8")
    prompt = str(args.get("prompt") or HEALTH_PROMPT)
    opener = getattr(hub, "claude_opener", None)
    if opener:
        ok, msg = opener(str(hub.paths.root), prompt)
    else:
        target = launchers.resolve("claude", str(hub.paths.root))
        if not target.ok:
            return {"summary": f"Couldn't open Claude Code. {target.fix} The error is saved in data/health/last-failure.md.", "failed": True}
        cmd = launchers._terminal(str(hub.paths.root), ["claude", json.dumps(prompt)])
        if not cmd:
            return {"summary": launchers.FIXES["terminal"], "failed": True}
        launchers.start(cmd, str(hub.paths.root))
        ok, msg = True, "Opened Claude Code in the hub folder with the error"
    return {"summary": msg + ". Log: data/health/last-failure.md", "failed": not ok}


@action("journal_note", "code", "Adds a line to the project journal (args: project_id, text).")
def journal_note(hub: Hub, state: dict, args: dict) -> dict:
    pid, text = args.get("project_id") or state.get("project_id"), str(args.get("text", "")).strip()
    if not pid or not text:
        return {"summary": "No project or text given", "skip": True}
    with hub.tx() as c:
        c.execute("INSERT INTO journal(project_id, body) VALUES (?, ?)", (pid, text.format(**{k: v for k, v in state.items() if isinstance(v, str)})))
    return {"summary": f"Journal note added to project {pid}"}


# ---------- running ----------

_RUN_LOCK = threading.Lock()


def run(hub: Hub, wf: Workflow, trigger: str, state: dict | None = None, at: datetime | None = None) -> dict:
    """Run every step in order, logging each. A failed step stops the run."""
    if wf.errors:
        raise ValueError(wf.errors[0])
    state = dict(state or {})
    with hub.tx() as c:
        run_id = c.execute("INSERT INTO workflow_runs(workflow, trigger, started_at) VALUES (?, ?, ?)",
                           (wf.id, trigger, (at or datetime.now()).isoformat(sep=" ", timespec="seconds"))).lastrowid
    steps_log: list[dict] = []
    status = "ok"

    def save(final: bool = False):
        with hub.tx() as c:
            c.execute("UPDATE workflow_runs SET steps = ?, status = ?, ended_at = CASE WHEN ? THEN datetime('now') ELSE ended_at END WHERE id = ?",
                      (json.dumps(steps_log), status if final else "running", final, run_id))

    for s in wf.steps:
        act = ACTIONS[s["run"]]
        t0 = time.time()
        entry = {"id": s.get("id", s["run"]), "run": s["run"], "kind": s["kind"], "status": "running"}
        steps_log.append(entry)
        save()
        try:
            out = act.fn(hub, state, s.get("args") or {})
            # ok | skipped | alert (finished, found a problem: later steps still run) | failed (stops the run)
            entry.update(status="failed" if out.get("failed") else "alert" if out.get("alert") else "skipped" if out.get("skip") else "ok", summary=out.get("summary", ""))
        except Exception as exc:  # a step error ends the run but never the engine
            entry.update(status="failed", summary=f"{type(exc).__name__}: {exc}")
        entry["ms"] = int((time.time() - t0) * 1000)
        if entry["status"] == "failed":
            status = "failed"
        elif entry["status"] == "alert" and status == "ok":
            status = "alert"
        save()
        if entry["status"] == "failed":
            break
    save(final=True)
    return get_run(hub, run_id)


def get_run(hub: Hub, run_id: int) -> dict:
    r = hub.query_one("SELECT * FROM workflow_runs WHERE id = ?", (run_id,))
    if not r:
        return {}
    d = dict(r)
    d["steps"] = json.loads(d["steps"])
    return d


def last_run(hub: Hub, wf_id: str) -> dict | None:
    r = hub.query_one("SELECT id FROM workflow_runs WHERE workflow = ? ORDER BY id DESC LIMIT 1", (wf_id,))
    return get_run(hub, r["id"]) if r else None


def enabled(hub: Hub, wf_id: str) -> bool:
    r = hub.query_one("SELECT value FROM settings WHERE key = ?", (f"automation:{wf_id}:enabled",))
    return (r["value"] if r else "1") == "1"


# ---------- scheduler ----------

def _parse_dt(s: str | None) -> datetime | None:
    return datetime.fromisoformat(s.replace(" ", "T")) if s else None


def tick(hub: Hub, now: datetime | None = None) -> list[dict]:
    """One scheduler pass: run every enabled workflow whose schedule is due or whose files changed."""
    now = now or datetime.now()
    ran = []
    for wf in load(hub.paths.root / "workflows"):
        if wf.errors or not enabled(hub, wf.id):
            continue
        trig = wf.trigger
        if "schedule" in trig:
            last = hub.query_one("SELECT started_at FROM workflow_runs WHERE workflow = ? AND trigger LIKE 'schedule%' ORDER BY id DESC LIMIT 1", (wf.id,))
            last_dt = _parse_dt(last["started_at"]) if last else first_seen(hub, wf.id, now)
            if is_due(str(trig["schedule"]), last_dt, now):
                ran.append(run(hub, wf, f"schedule {trig['schedule']}", at=now))
        if "file_change" in trig:
            changed = changed_files(hub, wf.id, trig["file_change"])
            if changed:
                ran.append(run(hub, wf, f"file change: {changed[0]}", {"changed": changed[0]}))
    return ran


def first_seen(hub: Hub, wf_id: str, now: datetime) -> datetime:
    """A schedule that never ran counts from when the hub first saw it, so it waits for its next slot."""
    key = f"automation:{wf_id}:since"
    r = hub.query_one("SELECT value FROM settings WHERE key = ?", (key,))
    if r:
        return datetime.fromisoformat(r["value"])
    with hub.tx() as c:
        c.execute("INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)", (key, now.isoformat(timespec="seconds")))
    return now


def changed_files(hub: Hub, wf_id: str, spec: dict) -> list[str]:
    pattern = str(spec.get("glob", "**/*"))
    newest, newest_file = 0.0, ""
    for p in hub.query("SELECT path FROM projects WHERE archived = 0"):
        root = Path(p["path"])
        if not root.is_dir():
            continue
        for f in root.rglob("*"):
            rel = f.relative_to(root).as_posix()
            if any(part in (".git", "node_modules", ".pio", ".expo", "dist") for part in f.parts) or not f.is_file() or not fnmatch.fnmatch(rel, pattern):
                continue
            m = f.stat().st_mtime
            if m > newest:
                newest, newest_file = m, f"{root.name}/{rel}"
    key = f"automation:{wf_id}:mtime"
    seen = hub.query_one("SELECT value FROM settings WHERE key = ?", (key,))
    with hub.tx() as c:
        c.execute("INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)", (key, str(newest)))
    if seen is None:
        return []  # first look: remember, don't fire
    return [newest_file] if newest > float(seen["value"]) + 0.001 else []


class Scheduler:
    def __init__(self, hub: Hub, interval: float = 30.0):
        self.hub, self.interval = hub, interval
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if os.environ.get("WORKFLOW_HUB_SCHEDULER", "1") == "0":
            return
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def _loop(self) -> None:
        while not self._stop.wait(self.interval):
            try:
                with _RUN_LOCK:
                    tick(self.hub)
            except Exception:
                pass  # the next tick tries again; runs log their own errors

    def stop(self) -> None:
        self._stop.set()
