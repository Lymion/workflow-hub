"""Session 9: app wizard (Expo-first), stack checks, design tokens editor, screen generator."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from engine.routes import cart


@pytest.fixture(autouse=True)
def inline_jobs(monkeypatch):
    """Background steps run inline, and no real tools (npx, npm, git, gh) are found."""
    monkeypatch.setattr(cart, "BACKGROUND_SYNC", True)
    monkeypatch.setattr(cart.shutil, "which", lambda name: None)


def app(client, stack=("expo", "supabase", "expo-router"), name="Budget Buddy"):
    r = client.post("/projects", json={"name": name, "module": "app-dev", "stack": list(stack)})
    assert r.status_code == 201, r.text
    return r.json()


def checks(client, *stack):
    r = client.post("/modules/app-dev/checks/stack", json={"stack": list(stack)})
    assert r.status_code == 200, r.text
    return r.json()["findings"]


# ---------- stack checks ----------

def test_good_expo_stack_fits(client):
    f = checks(client, "expo", "supabase", "expo-router", "nativewind")
    assert f[0]["level"] == "ok" and f[0]["part"] == "Stack"
    assert not any(x["level"] in ("bad", "warn") for x in f)


def test_two_frameworks_and_expo_only_extras_are_flagged(client):
    f = checks(client, "nextjs", "expo")
    assert any(x["level"] == "bad" and "both frameworks" in x["problem"] for x in f)
    assert any(x["level"] == "bad" and "don't work together" in x["problem"] for x in f)
    f = checks(client, "nextjs", "nativewind")
    bad = [x for x in f if x["level"] == "bad"]
    assert bad and "Expo only" in bad[0]["problem"] and bad[0]["fix"]
    assert any(x["level"] == "bad" and x["part"] == "Framework" for x in checks(client, "supabase"))


def test_next_with_sqlite_warns_and_findings_have_one_line_fix(client):
    f = checks(client, "nextjs", "sqlite")
    w = [x for x in f if x["level"] == "warn"]
    assert w and "server" in w[0]["problem"]
    for x in f:
        assert x["message"].count("\n") == 0 and x["fix"]


def test_robotics_has_no_stack_checks(client):
    r = client.post("/modules/robotics/checks/stack", json={"stack": ["expo"]})
    assert r.json() == {"findings": []}


# ---------- wizard ----------

def test_new_expo_app_gets_owned_files_and_checklist(client):
    p = app(client)
    root = Path(p["path"])
    tokens = json.loads((root / "design-tokens.json").read_text())
    assert tokens["colors"]["light"]["primary"] == "#0071E3" and "AUTO-GENERATED" in tokens["_comment"]
    theme = (root / "src/theme/tokens.ts").read_text()
    assert theme.startswith("// AUTO-GENERATED") and "export const colors" in theme and "#0A84FF" in theme
    env = (root / ".env.example").read_text()
    assert env.startswith("# AUTO-GENERATED") and "EXPO_PUBLIC_SUPABASE_URL=" in env
    assert (root / "CLAUDE.md").is_file() and (root / ".prettierrc").is_file()
    tasks = [t["title"] for t in client.get(f"/projects/{p['id']}/tasks").json()]
    assert "Run npx expo start and scan the QR code with Expo Go" in tasks
    assert "Copy .env.example to .env and fill in the keys" in tasks
    assert "Install: Node.js" in tasks


def test_next_app_gets_css_theme(client):
    p = app(client, stack=("nextjs", "supabase"), name="Shop Admin")
    root = Path(p["path"])
    css = (root / "src/styles/tokens.css").read_text()
    assert css.startswith("/* AUTO-GENERATED") and "--color-primary: #0071E3;" in css and "prefers-color-scheme: dark" in css
    assert not (root / "src/theme/tokens.ts").exists()
    status = client.get(f"/projects/{p['id']}/setup").json()
    names = [f["file"] for f in status["files"]]
    assert "src/styles/tokens.css" in names
    assert next(f for f in status["files"] if f["file"] == "src/styles/tokens.css")["owned"]


def test_user_owned_theme_file_is_left_alone(client):
    p = app(client)
    root = Path(p["path"])
    (root / "src/theme/tokens.ts").write_text("export const mine = 1;\n")
    r = client.put(f"/projects/{p['id']}/tokens", json=client.get(f"/projects/{p['id']}/tokens").json()["tokens"])
    assert r.status_code == 409 and "AUTO-GENERATED" in r.json()["detail"]
    assert (root / "src/theme/tokens.ts").read_text() == "export const mine = 1;\n"


def test_setup_background_without_tools_reports_fix(client):
    p = app(client)
    r = client.post(f"/projects/{p['id']}/setup", json={"run_scaffold": True, "run_install": True, "run_git": True, "add_tasks": False})
    assert r.status_code == 200, r.text
    job = r.json()["job"]
    assert job["state"] == "done"
    steps = job["result"]["steps"]
    scaffold = next(s for s in steps if s["step"] == "scaffold")
    assert not scaffold["ok"] and "create-expo-app" in scaffold["note"]
    assert any("create-expo-app" in line for line in job["log"])
    assert client.get(f"/projects/{p['id']}/setup").json()["job"]["state"] == "done"


def test_scaffold_and_install_use_stack_commands(client, monkeypatch):
    calls = []

    def fake_run(cmd, cwd=None, timeout=60):
        calls.append(cmd)
        if "create-expo-app@latest" in cmd:
            made = Path(cwd) / cmd[2]
            made.mkdir()
            (made / "package.json").write_text('{"name": "budget-buddy"}')
            (made / "CLAUDE.md").write_text("theirs")
        return "ok"

    monkeypatch.setattr(cart, "run_cmd", fake_run)
    monkeypatch.setattr(cart.shutil, "which", lambda name: f"/usr/bin/{name}")
    p = app(client)
    r = client.post(f"/projects/{p['id']}/setup", json={"run_scaffold": True, "run_install": True, "run_git": False, "add_tasks": False})
    steps = r.json()["job"]["result"]["steps"]
    assert [s["step"] for s in steps][:2] == ["scaffold", "npm install"] and all(s["ok"] for s in steps)
    scaffold = next(c for c in calls if "create-expo-app@latest" in c)
    assert scaffold[:3] == ["/usr/bin/npx", "create-expo-app@latest", "budget-buddy"]
    root = Path(p["path"])
    assert (root / "package.json").is_file() and not (root / ".hub-scaffold").exists()
    assert (root / "CLAUDE.md").read_text() != "theirs"  # existing files are kept
    install = next(c for c in calls if c[:2] == ["/usr/bin/npm", "install"])
    assert "@supabase/supabase-js" in install and "expo" not in install[2:]


# ---------- design tokens ----------

def test_edit_tokens_regenerates_theme(client):
    p = app(client)
    t = client.get(f"/projects/{p['id']}/tokens").json()
    assert t["theme_file"] == "src/theme/tokens.ts" and "export const colors" in t["theme"]
    tokens = t["tokens"]
    tokens["colors"]["light"]["primary"] = "#FF2D55"
    tokens["radius"]["md"] = 14
    r = client.put(f"/projects/{p['id']}/tokens", json=tokens)
    assert r.status_code == 200, r.text
    root = Path(p["path"])
    assert "#FF2D55" in (root / "src/theme/tokens.ts").read_text()
    assert json.loads((root / "design-tokens.json").read_text())["radius"]["md"] == 14
    assert client.get(f"/projects/{p['id']}/tokens").json()["tokens"]["colors"]["light"]["primary"] == "#FF2D55"


def test_bad_colour_is_rejected_with_fix(client):
    p = app(client)
    tokens = client.get(f"/projects/{p['id']}/tokens").json()["tokens"]
    tokens["colors"]["dark"]["primary"] = "blue"
    r = client.put(f"/projects/{p['id']}/tokens", json=tokens)
    assert r.status_code == 422 and "#0071E3" in r.json()["detail"]


def test_robotics_project_has_no_tokens(client):
    r = client.post("/projects", json={"name": "Rover", "module": "robotics", "board": "esp32-devkit"})
    assert client.get(f"/projects/{r.json()['id']}/tokens").status_code == 404


# ---------- screens ----------

def test_screen_generator_writes_once(client):
    p = app(client)
    r = client.post(f"/projects/{p['id']}/screens", json={"name": "Expense Detail"})
    assert r.status_code == 200 and r.json()["file"] == "app/expense-detail.tsx"
    text = (Path(p["path"]) / "app/expense-detail.tsx").read_text()
    assert "ExpenseDetailScreen" in text and "../src/theme/tokens" in text
    again = client.post(f"/projects/{p['id']}/screens", json={"name": "expense detail"})
    assert again.status_code == 409 and "already exists" in again.json()["detail"]


def test_next_screen_is_a_route_folder(client):
    p = app(client, stack=("nextjs",), name="Shop Admin")
    r = client.post(f"/projects/{p['id']}/screens", json={"name": "Orders"})
    assert r.json()["file"] == "src/app/orders/page.tsx"


def test_stack_edit_regenerates_env_example(client):
    p = app(client, stack=("expo",))
    env = Path(p["path"]) / ".env.example"
    assert "SUPABASE" not in env.read_text()
    client.patch(f"/projects/{p['id']}", json={"stack": ["expo", "supabase"]})
    assert "EXPO_PUBLIC_SUPABASE_URL=" in env.read_text()


def test_app_presets_are_listed(client):
    names = {p["preset"]: p for p in client.get("/presets?module=app-dev").json()}
    assert names["expo-supabase"]["stack"][0] == "expo" and "tauri" in names["desktop-tool"]["stack"]


def test_claude_md_mentioning_the_marker_is_still_the_users(client):
    p = app(client)
    files = {f["file"]: f for f in client.get(f"/projects/{p['id']}/setup").json()["files"]}
    assert files["CLAUDE.md"]["exists"] and not files["CLAUDE.md"]["owned"]
    assert files["src/theme/tokens.ts"]["owned"]
