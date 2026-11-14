"""Session 2: projects, tasks, journal."""
from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from ..hub import Hub
from ..modules import load_modules

router = APIRouter()

# Called after a project is created: (hub, project) -> None. Wizards register here.
AFTER_CREATE: list = []
# Hooks run after a project is edited: fn(hub, project, changed_fields). Later sessions add to it.
AFTER_UPDATE: list = []


def hub_of(request: Request) -> Hub:
    return request.app.state.hub


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-") or "untitled"


def today() -> str:
    return date.today().isoformat()


PROJECT_SQL = """
SELECT p.*,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS tasks_total,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS tasks_done,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status != 'done' AND t.due IS NOT NULL AND t.due <= :today) AS open_today,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status != 'done' AND t.due IS NOT NULL AND t.due < :today) AS overdue
FROM projects p
"""


def _row(p: dict) -> dict:
    p = dict(p)
    p["stack"] = json.loads(p.get("stack") or "[]")
    p["archived"] = bool(p["archived"])
    return p


def get_project(hub: Hub, project_id: int) -> dict:
    p = hub.query_one(PROJECT_SQL + " WHERE p.id = :id", {"id": project_id, "today": today()})
    if not p:
        raise HTTPException(404, f"Project {project_id} not found. It may have been removed from the hub.")
    return _row(p)


# ---------- projects ----------

class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    module: str
    path: str | None = None
    board: str | None = None
    stack: list[str] = []


class ProjectPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    board: str | None = None
    stack: list[str] | None = None
    archived: bool | None = None
    path: str | None = None


@router.get("/projects")
def list_projects(request: Request, module: str | None = None, archived: bool = False) -> list[dict]:
    hub = hub_of(request)
    where, params = ["p.archived = :archived"], {"today": today(), "archived": int(archived)}
    if module:
        where.append("p.module = :module")
        params["module"] = module
    sql = PROJECT_SQL + " WHERE " + " AND ".join(where) + " ORDER BY COALESCE(p.last_opened_at, p.updated_at) DESC, p.id DESC"
    return [_row(p) for p in hub.query(sql, params)]


@router.post("/projects", status_code=201)
def create_project(request: Request, body: ProjectIn) -> dict:
    hub = hub_of(request)
    name = body.name.strip()
    modules, _ = load_modules(hub.paths.modules)
    if body.module not in {m.id for m in modules if m.enabled}:
        raise HTTPException(400, f"Project type '{body.module}' isn't available. Pick a type from the list, or check modules/{body.module}/module.yaml.")
    slug = slugify(name)
    if hub.query_one("SELECT id FROM projects WHERE slug = ?", (slug,)):
        raise HTTPException(409, f"A project called '{name}' already exists. Pick another name.")
    path = Path(body.path).expanduser() if body.path else hub.paths.projects_home / slug
    try:
        path.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise HTTPException(400, f"Can't create {path} ({exc.strerror}). Pick a folder you can write to.") from exc
    with hub.tx() as c:
        cur = c.execute(
            "INSERT INTO projects(name, slug, module, path, board, stack, last_opened_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))",
            (name, slug, body.module, str(path), body.board, json.dumps(body.stack)),
        )
        pid = cur.lastrowid
    project = get_project(hub, pid)
    for hook in AFTER_CREATE:
        hook(hub, project)
    return get_project(hub, pid)


@router.get("/projects/{project_id}")
def read_project(request: Request, project_id: int) -> dict:
    return get_project(hub_of(request), project_id)


@router.patch("/projects/{project_id}")
def update_project(request: Request, project_id: int, body: ProjectPatch) -> dict:
    hub = hub_of(request)
    get_project(hub, project_id)
    fields, params = [], []
    for key, value in body.model_dump(exclude_unset=True).items():
        if key == "stack":
            value = json.dumps(value)
        if key == "archived":
            value = int(value)
        if key == "name":
            value = value.strip()
        fields.append(f"{key} = ?")
        params.append(value)
    if fields:
        with hub.tx() as c:
            c.execute(f"UPDATE projects SET {', '.join(fields)}, updated_at = datetime('now') WHERE id = ?", (*params, project_id))
    project = get_project(hub, project_id)
    changed = set(body.model_dump(exclude_unset=True))
    for hook in AFTER_UPDATE:
        hook(hub, project, changed)
    return project


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(request: Request, project_id: int) -> Response:
    """Removes the project from the hub only. Files on disk are never touched."""
    hub = hub_of(request)
    get_project(hub, project_id)
    with hub.tx() as c:
        c.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    return Response(status_code=204)


def touch(hub: Hub, project_id: int) -> None:
    with hub.tx() as c:
        c.execute("UPDATE projects SET updated_at = datetime('now') WHERE id = ?", (project_id,))


# ---------- tasks ----------

STATUSES = ("todo", "doing", "done")
DATE_RE = r"^\d{4}-\d{2}-\d{2}$"


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    status: str = "todo"
    due: str | None = Field(default=None, pattern=DATE_RE)
    source: str | None = None


class TaskPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    status: str | None = None
    due: str | None = Field(default=None, pattern=DATE_RE)
    position: int | None = None


def _check_status(status: str | None) -> None:
    if status is not None and status not in STATUSES:
        raise HTTPException(400, f"Status '{status}' isn't valid. Use todo, doing or done.")


@router.get("/projects/{project_id}/tasks")
def list_tasks(request: Request, project_id: int) -> list[dict]:
    hub = hub_of(request)
    get_project(hub, project_id)
    return hub.query("SELECT * FROM tasks WHERE project_id = ? ORDER BY status = 'done', position, COALESCE(due, '9999'), id", (project_id,))


@router.post("/projects/{project_id}/tasks", status_code=201)
def create_task(request: Request, project_id: int, body: TaskIn) -> dict:
    hub = hub_of(request)
    get_project(hub, project_id)
    _check_status(body.status)
    with hub.tx() as c:
        pos = c.execute("SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?", (project_id,)).fetchone()[0]
        cur = c.execute(
            "INSERT INTO tasks(project_id, title, status, due, source, position, done_at) VALUES (?, ?, ?, ?, ?, ?, CASE WHEN ? = 'done' THEN datetime('now') END)",
            (project_id, body.title.strip(), body.status, body.due, body.source, pos, body.status),
        )
        tid = cur.lastrowid
    touch(hub, project_id)
    return hub.query_one("SELECT * FROM tasks WHERE id = ?", (tid,))


@router.patch("/tasks/{task_id}")
def update_task(request: Request, task_id: int, body: TaskPatch) -> dict:
    hub = hub_of(request)
    task = hub.query_one("SELECT * FROM tasks WHERE id = ?", (task_id,))
    if not task:
        raise HTTPException(404, f"Task {task_id} not found. It may have been deleted.")
    data = body.model_dump(exclude_unset=True)
    _check_status(data.get("status"))
    sets, params = [], []
    for key, value in data.items():
        sets.append(f"{key} = ?")
        params.append(value.strip() if key == "title" else value)
    if "status" in data:
        sets.append("done_at = CASE WHEN ? = 'done' THEN COALESCE(done_at, datetime('now')) ELSE NULL END")
        params.append(data["status"])
    if sets:
        with hub.tx() as c:
            c.execute(f"UPDATE tasks SET {', '.join(sets)} WHERE id = ?", (*params, task_id))
        touch(hub, task["project_id"])
    return hub.query_one("SELECT * FROM tasks WHERE id = ?", (task_id,))


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(request: Request, task_id: int) -> Response:
    hub = hub_of(request)
    with hub.tx() as c:
        c.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    return Response(status_code=204)


@router.get("/tasks/today")
def tasks_today(request: Request) -> list[dict]:
    """Open tasks due today or earlier, plus tasks finished today, across all projects."""
    hub = hub_of(request)
    return hub.query(
        """SELECT t.*, p.name AS project_name, p.module AS project_module
           FROM tasks t JOIN projects p ON p.id = t.project_id
           WHERE p.archived = 0 AND (
             (t.status != 'done' AND t.due IS NOT NULL AND t.due <= :today)
             OR (t.status = 'done' AND date(t.done_at, 'localtime') = :today))
           ORDER BY t.status = 'done', t.due, t.id""",
        {"today": today()},
    )


# ---------- journal ----------

class JournalIn(BaseModel):
    body: str = Field(min_length=1, max_length=20000)


@router.get("/projects/{project_id}/journal")
def list_journal(request: Request, project_id: int) -> list[dict]:
    hub = hub_of(request)
    get_project(hub, project_id)
    return hub.query("SELECT * FROM journal WHERE project_id = ? ORDER BY created_at DESC, id DESC", (project_id,))


@router.post("/projects/{project_id}/journal", status_code=201)
def add_journal(request: Request, project_id: int, body: JournalIn) -> dict:
    hub = hub_of(request)
    get_project(hub, project_id)
    with hub.tx() as c:
        jid = c.execute("INSERT INTO journal(project_id, body) VALUES (?, ?)", (project_id, body.body.strip())).lastrowid
    touch(hub, project_id)
    return hub.query_one("SELECT * FROM journal WHERE id = ?", (jid,))


@router.delete("/journal/{entry_id}", status_code=204)
def delete_journal(request: Request, entry_id: int) -> Response:
    hub = hub_of(request)
    with hub.tx() as c:
        c.execute("DELETE FROM journal WHERE id = ?", (entry_id,))
    return Response(status_code=204)
