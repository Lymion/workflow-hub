"""Session 11: git helper with Haiku commit messages (template fallback), commit and push."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

from engine import gitops, llm
from engine.routes import cart

pytestmark = pytest.mark.skipif(not shutil.which("git"), reason="git not installed")


@pytest.fixture(autouse=True)
def git_env(tmp_path, monkeypatch):
    cfg = tmp_path / "gitconfig"
    cfg.write_text("[init]\n\tdefaultBranch = main\n")
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(cfg))
    monkeypatch.setenv("GIT_CONFIG_NOSYSTEM", "1")
    for k in ("GIT_AUTHOR_NAME", "GIT_COMMITTER_NAME"):
        monkeypatch.setenv(k, "Maker")
    for k in ("GIT_AUTHOR_EMAIL", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(k, "maker@example.com")
    monkeypatch.setattr(cart, "BACKGROUND_SYNC", True)
    return cfg


class FakeClient:
    def __init__(self, answer):
        self.calls, self.answer = [], answer
        self.messages = SimpleNamespace(create=self._create, count_tokens=lambda **kw: SimpleNamespace(input_tokens=1200))

    def _create(self, **kw):
        self.calls.append(kw)
        usage = SimpleNamespace(input_tokens=1200, output_tokens=80, cache_read_input_tokens=0, cache_creation_input_tokens=0)
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=json.dumps(self.answer))], usage=usage, stop_reason="end_turn")


@pytest.fixture()
def repo(client):
    p = client.post("/projects", json={"name": "Budget Buddy", "module": "app-dev", "stack": ["expo", "supabase"]}).json()
    root = Path(p["path"])
    assert (root / ".git").exists(), "setup should git init"
    return p, root


def test_status_after_setup_is_clean_with_first_commit(client, repo):
    p, root = repo
    st = client.get(f"/projects/{p['id']}/git").json()
    assert st["repo"] and st["branch"] == "main" and st["files"] == []
    assert st["log"][0]["subject"] == "Set up with Workflow Hub"
    assert st["remote"] is None


def test_changes_show_with_status_and_secrets_flagged(client, repo):
    p, root = repo
    (root / "app").mkdir(exist_ok=True)
    (root / "app" / "index.tsx").write_text("export default function Home() { return null; }\n")
    (root / "CLAUDE.md").write_text((root / "CLAUDE.md").read_text() + "\nMore notes.\n")
    (root / "upload.keystore").write_text("EXPO_PUBLIC_SUPABASE_ANON_KEY=secret-value\n")
    st = client.get(f"/projects/{p['id']}/git").json()
    files = {f["path"]: f for f in st["files"]}
    assert files["app/index.tsx"]["status"] == "new" and files["CLAUDE.md"]["status"] == "modified"
    assert files["upload.keystore"]["secret"] and "upload.keystore looks like a secret" in st["warnings"][0]
    d = client.get(f"/projects/{p['id']}/git/diff", params={"file": "upload.keystore"}).json()
    assert "secret-value" not in d["diff"]


def test_message_without_key_uses_template(client, repo, monkeypatch):
    monkeypatch.setattr(llm, "get_api_key", lambda: None)
    p, root = repo
    (root / "app").mkdir(exist_ok=True)
    (root / "app" / "index.tsx").write_text("x\n")
    (root / "app" / "settings.tsx").write_text("y\n")
    r = client.post(f"/projects/{p['id']}/git/message", json={}).json()
    assert r["source"] == "template" and r["message"] == "Add index.tsx, settings.tsx"
    assert "API key" in r["note"] and r["cost_rm"] == 0


def test_message_from_haiku_never_sees_secrets_and_is_cached(client, hub, repo, monkeypatch):
    monkeypatch.setattr(llm, "get_api_key", lambda: "sk-ant-test")
    fake = FakeClient({"subject": "Add home screen with budget summary.", "body": "- New app/index.tsx"})
    hub.llm_factory = lambda key: fake
    p, root = repo
    (root / "app").mkdir(exist_ok=True)
    (root / "app" / "index.tsx").write_text("export default function Home() { return <Budget />; }\n")
    (root / "upload.keystore").write_text("EXPO_PUBLIC_SUPABASE_ANON_KEY=super-secret\n")
    r = client.post(f"/projects/{p['id']}/git/message", json={}).json()
    assert r["source"] == "sent" and r["message"] == "Add home screen with budget summary\n\n- New app/index.tsx"
    assert r["skipped_secrets"] == ["upload.keystore"]
    call = fake.calls[0]
    assert call["model"] == "claude-haiku-5-5"
    sent = call["messages"][0]["content"]
    assert "super-secret" not in sent and "upload.keystore" not in sent
    assert "app/index.tsx" in sent
    again = client.post(f"/projects/{p['id']}/git/message", json={}).json()
    assert again["source"] == "cached" and len(fake.calls) == 1
    row = hub.query_one("SELECT feature, status FROM llm_calls ORDER BY id DESC LIMIT 1")
    assert dict(row) == {"feature": "commit_message", "status": "cached"}


def test_diff_is_capped_for_the_prompt(repo):
    p, root = repo
    (root / "big.txt").write_text("\n".join(f"line {i} " + "x" * 80 for i in range(2000)))
    subprocess.run(["git", "add", "big.txt"], cwd=root, check=True)
    subprocess.run(["git", "commit", "-qm", "big"], cwd=root, check=True)
    (root / "big.txt").write_text("\n".join(f"changed {i} " + "y" * 80 for i in range(2000)))
    d = gitops.diff(root)
    assert d["truncated"] and len(d["text"]) < gitops.DIFF_CHAR_CAP + 100
    assert d["files"][0]["added"] == 2000


def test_cap_reached_falls_back_to_template(client, hub, repo, monkeypatch):
    monkeypatch.setattr(llm, "get_api_key", lambda: "sk-ant-test")
    hub.llm_factory = lambda key: FakeClient({"subject": "never", "body": ""})
    llm.log_call(hub, "docs_guide", "sent", 1, 1, 10.0 / llm.rm_per_usd(hub))  # RM10 spent
    p, root = repo
    (root / "notes.md").write_text("hi\n")
    r = client.post(f"/projects/{p['id']}/git/message", json={}).json()
    assert r["source"] == "template" and r["message"] == "Add notes.md" and "cap" in r["note"].lower()


def test_commit_selected_files_and_refuse_secrets(client, repo):
    p, root = repo
    (root / "a.txt").write_text("a\n")
    (root / "b.txt").write_text("b\n")
    (root / "upload.keystore").write_text("KEY=1\n")
    bad = client.post(f"/projects/{p['id']}/git/commit", json={"message": "Add env", "files": ["upload.keystore"]})
    assert bad.status_code == 409 and ".gitignore" in bad.json()["detail"]
    r = client.post(f"/projects/{p['id']}/git/commit", json={"message": "Add a", "files": ["a.txt"]}).json()
    assert r["commit"] and r["log"][0]["subject"] == "Add a"
    assert {f["path"] for f in r["files"]} == {"b.txt", "upload.keystore"}
    assert not r["pushed"] and r["push_error"] == ""


def test_commit_and_push_to_remote(client, repo, tmp_path):
    p, root = repo
    remote = tmp_path / "remote.git"
    subprocess.run(["git", "init", "-q", "--bare", str(remote)], check=True)
    subprocess.run(["git", "remote", "add", "origin", str(remote)], cwd=root, check=True)
    (root / "a.txt").write_text("a\n")
    r = client.post(f"/projects/{p['id']}/git/commit", json={"message": "Add a", "push": True}).json()
    assert r["pushed"] and r["upstream"] == "origin/main" and r["ahead"] == 0
    log = subprocess.run(["git", "log", "--oneline", "main"], cwd=remote, capture_output=True, text=True).stdout
    assert "Add a" in log


def test_push_without_remote_says_how(client, repo):
    p, root = repo
    (root / "a.txt").write_text("a\n")
    r = client.post(f"/projects/{p['id']}/git/commit", json={"message": "Add a", "push": True}).json()
    assert r["commit"] and not r["pushed"] and "gh repo create" in r["push_error"]


def test_missing_identity_has_one_line_fix(client, repo, git_env, monkeypatch):
    p, root = repo
    for k in ("GIT_AUTHOR_NAME", "GIT_COMMITTER_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_EMAIL"):
        monkeypatch.delenv(k)
    git_env.write_text("[user]\n\tuseConfigOnly = true\n")
    (root / "a.txt").write_text("a\n")
    r = client.post(f"/projects/{p['id']}/git/commit", json={"message": "Add a"})
    assert r.status_code == 409 and "git config --global user.name" in r.json()["detail"]


def test_not_a_repo_and_init(client, monkeypatch):
    real = shutil.which
    monkeypatch.setattr(cart.shutil, "which", lambda n, *a, **k: None if n == "git" else real(n, *a, **k))
    p = client.post("/projects", json={"name": "Rover", "module": "robotics", "board": "esp32-devkit"}).json()
    monkeypatch.undo()
    assert not (Path(p["path"]) / ".git").exists()
    st = client.get(f"/projects/{p['id']}/git").json()
    assert st["repo"] is False
    st = client.post(f"/projects/{p['id']}/git/init").json()
    assert st["repo"] and st["branch"] == "main" and any(f["path"] == "include/pins.h" for f in st["files"])


def test_template_messages():
    assert gitops.template_message([{"path": "src/main.cpp", "status": "modified"}]) == "Update main.cpp"
    files = [{"path": f"f{i}.txt", "status": "deleted"} for i in range(5)]
    assert gitops.template_message(files) == "Remove f0.txt, f1.txt, f2.txt and 2 more"


def test_app_gitignore_keeps_env_out(repo):
    p, root = repo
    assert ".env\n" in (root / ".gitignore").read_text()
    (root / ".env").write_text("KEY=1\n")
    assert all(f["path"] != ".env" for f in gitops.status(root)["files"])
