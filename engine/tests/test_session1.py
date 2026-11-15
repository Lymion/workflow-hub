"""Session 1: health, module loading, database setup."""
from __future__ import annotations

import shutil

from engine import db
from engine.config import HAIKU_MODEL
from engine.modules import load_modules


# ---------- health ----------

def test_health_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["db"] == "ok"
    assert body["modules"] == 2
    assert body["module_errors"] == 0


def test_health_allows_tauri_origin(client):
    r = client.get("/health", headers={"Origin": "tauri://localhost"})
    assert r.headers.get("access-control-allow-origin") == "tauri://localhost"


# ---------- modules ----------

def test_modules_one_card_per_module(client):
    body = client.get("/modules").json()
    ids = [m["id"] for m in body["modules"]]
    assert ids == ["app-dev", "robotics"]
    robotics = next(m for m in body["modules"] if m["id"] == "robotics")
    assert robotics["cart_slots"] == ["board", "parts"]
    assert robotics["project_tabs"] == ["wiring", "parts"]
    assert body["errors"] == []


def test_copying_a_module_folder_adds_a_card(client, hub_root):
    """Spec 'done when': copy robotics, rename it, edit module.yaml -> new card, no code changes."""
    new = hub_root / "modules" / "printing"
    shutil.copytree(hub_root / "modules" / "robotics", new)
    yaml_path = new / "module.yaml"
    yaml_path.write_text(yaml_path.read_text().replace("id: robotics", "id: printing").replace("name: Robotics", "name: 3D printing"))
    names = [m["name"] for m in client.get("/modules").json()["modules"]]
    assert "3D printing" in names and len(names) == 3


def test_disabled_module_is_hidden_but_listed(client, hub_root):
    p = hub_root / "modules" / "app-dev" / "module.yaml"
    p.write_text(p.read_text() + "enabled: false\n")
    body = client.get("/modules").json()
    assert [m["id"] for m in body["modules"]] == ["robotics"]
    assert body["disabled"] == ["app-dev"]


def test_missing_key_reports_one_line_fix(client, hub_root):
    p = hub_root / "modules" / "app-dev" / "module.yaml"
    p.write_text("\n".join(l for l in p.read_text().splitlines() if not l.startswith("color:")))
    body = client.get("/modules").json()
    assert [m["id"] for m in body["modules"]] == ["robotics"]  # the good module still loads
    (err,) = body["errors"]
    assert err["folder"] == "app-dev"
    assert "color is missing" in err["message"] and "then reload" in err["message"]


def test_broken_yaml_reports_line(hub_root):
    (hub_root / "modules" / "app-dev" / "module.yaml").write_text("id: app-dev\nname: [unclosed\n")
    mods, errors = load_modules(hub_root / "modules")
    assert [m.id for m in mods] == ["robotics"]
    assert "line" in errors[0].message and "module.yaml" in errors[0].message


def test_duplicate_id_is_an_error(hub_root):
    shutil.copytree(hub_root / "modules" / "robotics", hub_root / "modules" / "robotics-copy")
    mods, errors = load_modules(hub_root / "modules")
    assert len([m for m in mods if m.id == "robotics"]) == 1
    assert "already used" in errors[0].message


def test_list_keys_must_be_lists(hub_root):
    p = hub_root / "modules" / "robotics" / "module.yaml"
    p.write_text(p.read_text().replace("run: [build, upload, serial]", "run: build"))
    _, errors = load_modules(hub_root / "modules")
    assert "run must be a list" in errors[0].message


# ---------- database ----------

def test_database_has_spec_tables(hub):
    tables = db.table_names(hub.conn)
    for t in ("projects", "tasks", "journal", "errors", "snippets", "doc_chunks", "llm_calls", "cache"):
        assert t in tables


def test_database_file_created_in_data_dir(paths, client):
    assert paths.db.is_file()


def test_init_db_is_idempotent(hub):
    db.init_db(hub.conn)
    db.init_db(hub.conn)
    assert db.get_setting(hub.conn, "schema_version") == str(db.SCHEMA_VERSION)


def test_foreign_keys_cascade(hub):
    with hub.tx() as c:
        c.execute("INSERT INTO projects(name, slug, module, path) VALUES ('Rover-01', 'rover-01', 'robotics', '/tmp/r')")
        pid = c.execute("SELECT id FROM projects").fetchone()["id"]
        c.execute("INSERT INTO tasks(project_id, title) VALUES (?, 'Solder header')", (pid,))
        c.execute("DELETE FROM projects WHERE id = ?", (pid,))
    assert hub.query("SELECT * FROM tasks") == []


def test_task_status_is_constrained(hub):
    import sqlite3

    import pytest

    with hub.tx() as c:
        c.execute("INSERT INTO projects(name, slug, module, path) VALUES ('A', 'a', 'robotics', '/tmp/a')")
    with pytest.raises(sqlite3.IntegrityError):
        with hub.tx() as c:
            c.execute("INSERT INTO tasks(project_id, title, status) VALUES (1, 'x', 'later')")


def test_model_is_fixed_to_haiku():
    assert HAIKU_MODEL == "claude-haiku-5-5"
