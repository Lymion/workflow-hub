"""Session 2: projects, tasks, journal, launch buttons."""
from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import pytest

from engine import launchers


def make(client, name="Rover-01", module="robotics", **kw):
    r = client.post("/projects", json={"name": name, "module": module, **kw})
    assert r.status_code == 201, r.text
    return r.json()


# ---------- projects ----------

def test_create_project_makes_folder(client, tmp_path):
    p = make(client)
    assert p["slug"] == "rover-01" and p["module"] == "robotics"
    assert Path(p["path"]).is_dir()
    assert Path(p["path"]).parent == tmp_path / "projects"


def test_create_with_existing_folder(client, tmp_path):
    folder = tmp_path / "elsewhere" / "kedai"
    p = make(client, "Kedai", "app-dev", path=str(folder))
    assert p["path"] == str(folder) and folder.is_dir()


def test_duplicate_name_is_rejected(client):
    make(client)
    r = client.post("/projects", json={"name": "rover 01", "module": "robotics"})
    assert r.status_code == 409 and "already exists" in r.json()["detail"]


def test_unknown_module_is_rejected(client):
    r = client.post("/projects", json={"name": "X", "module": "baking"})
    assert r.status_code == 400 and "isn't available" in r.json()["detail"]


def test_list_filter_and_counts(client):
    a = make(client)
    make(client, "Kedai", "app-dev")
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    client.post(f"/projects/{a['id']}/tasks", json={"title": "Late", "due": yesterday})
    client.post(f"/projects/{a['id']}/tasks", json={"title": "Done", "status": "done"})
    rows = client.get("/projects", params={"module": "robotics"}).json()
    assert [r["name"] for r in rows] == ["Rover-01"]
    r = rows[0]
    assert (r["tasks_total"], r["tasks_done"], r["open_today"], r["overdue"]) == (2, 1, 1, 1)


def test_patch_and_archive(client):
    p = make(client)
    r = client.patch(f"/projects/{p['id']}", json={"board": "esp32dev", "stack": ["l298n"], "archived": True})
    assert r.json()["board"] == "esp32dev" and r.json()["stack"] == ["l298n"] and r.json()["archived"] is True
    assert client.get("/projects").json() == []
    assert len(client.get("/projects", params={"archived": True}).json()) == 1


def test_delete_keeps_files(client):
    p = make(client)
    (Path(p["path"]) / "main.cpp").write_text("// mine")
    assert client.delete(f"/projects/{p['id']}").status_code == 204
    assert (Path(p["path"]) / "main.cpp").read_text() == "// mine"
    assert client.get(f"/projects/{p['id']}").status_code == 404


# ---------- tasks ----------

def test_task_lifecycle(client):
    p = make(client)
    t = client.post(f"/projects/{p['id']}/tasks", json={"title": "Solder L298N header"}).json()
    assert t["status"] == "todo" and t["done_at"] is None
    t = client.patch(f"/tasks/{t['id']}", json={"status": "done"}).json()
    assert t["status"] == "done" and t["done_at"]
    t = client.patch(f"/tasks/{t['id']}", json={"status": "doing"}).json()
    assert t["done_at"] is None
    assert client.delete(f"/tasks/{t['id']}").status_code == 204
    assert client.get(f"/projects/{p['id']}/tasks").json() == []


def test_bad_status_and_date(client):
    p = make(client)
    assert client.post(f"/projects/{p['id']}/tasks", json={"title": "x", "status": "later"}).status_code == 400
    assert client.post(f"/projects/{p['id']}/tasks", json={"title": "x", "due": "tomorrow"}).status_code == 422


def test_today_across_projects(client):
    a, b = make(client), make(client, "Kedai", "app-dev")
    t0 = date.today().isoformat()
    future = (date.today() + timedelta(days=3)).isoformat()
    client.post(f"/projects/{a['id']}/tasks", json={"title": "Divider on ECHO", "due": t0})
    client.post(f"/projects/{b['id']}/tasks", json={"title": "Auth screen", "due": t0})
    client.post(f"/projects/{b['id']}/tasks", json={"title": "Later", "due": future})
    done = client.post(f"/projects/{a['id']}/tasks", json={"title": "Blink test", "due": t0}).json()
    client.patch(f"/tasks/{done['id']}", json={"status": "done"})
    rows = client.get("/tasks/today").json()
    titles = [r["title"] for r in rows]
    assert "Later" not in titles and titles[-1] == "Blink test"  # done ones last
    assert {r["project_name"] for r in rows} == {"Rover-01", "Kedai"}


# ---------- journal ----------

def test_journal(client):
    p = make(client)
    e = client.post(f"/projects/{p['id']}/journal", json={"body": "Motors spin. Left one is slower."}).json()
    assert client.get(f"/projects/{p['id']}/journal").json()[0]["body"].startswith("Motors spin")
    assert client.delete(f"/journal/{e['id']}").status_code == 204
    assert client.post(f"/projects/{p['id']}/journal", json={"body": ""}).status_code == 422


# ---------- launch ----------

@pytest.fixture()
def fake_tools(monkeypatch):
    started = []
    monkeypatch.setattr(launchers.shutil, "which", lambda name: f"/usr/bin/{name}" if name in ("code", "claude", "x-terminal-emulator", "wt") else None)
    monkeypatch.setattr(launchers, "start", lambda cmd, cwd: started.append((cmd, cwd)))
    return started


def test_launchers_follow_module(client, fake_tools):
    p = make(client)
    ids = [l["id"] for l in client.get(f"/projects/{p['id']}/launchers").json()]
    assert ids == ["vscode", "arduino-ide", "terminal", "claude"]
    q = make(client, "Kedai", "app-dev")
    ids = [l["id"] for l in client.get(f"/projects/{q['id']}/launchers").json()]
    assert ids == ["vscode", "terminal", "claude"]


def test_launch_vscode_in_one_click(client, fake_tools):
    p = make(client)
    r = client.post(f"/projects/{p['id']}/launch", json={"target": "vscode"})
    assert r.status_code == 200 and "VS Code" in r.json()["message"]
    (cmd, cwd), = fake_tools
    assert cmd == ["/usr/bin/code", p["path"]] and cwd == p["path"]
    assert client.get(f"/projects/{p['id']}").json()["last_opened_at"]


def test_missing_tool_gives_fix(client, monkeypatch):
    monkeypatch.setattr(launchers.shutil, "which", lambda name: None)
    monkeypatch.setattr(launchers, "_arduino_exe", lambda: None)
    p = make(client)
    r = client.post(f"/projects/{p['id']}/launch", json={"target": "vscode"})
    assert r.status_code == 424 and "PATH" in r.json()["detail"]
    lst = {l["id"]: l for l in client.get(f"/projects/{p['id']}/launchers").json()}
    assert lst["arduino-ide"]["available"] is False and "arduino.cc" in lst["arduino-ide"]["fix"]


def test_missing_folder_gives_fix(client, fake_tools):
    p = make(client)
    Path(p["path"]).rmdir()
    r = client.post(f"/projects/{p['id']}/launch", json={"target": "vscode"})
    assert r.status_code == 409 and "moved or renamed" in r.json()["detail"]
