"""Installed app: bundled hub files reach the writable hub folder without touching the user's own files."""
from __future__ import annotations

import sys
from pathlib import Path

from engine import bundle


def _make_bundle(tmp: Path) -> Path:
    b = tmp / "bundle"
    (b / "modules" / "robotics" / "__pycache__").mkdir(parents=True)
    (b / "modules" / "robotics" / "module.yaml").write_text("id: robotics\nversion: 2\n")
    (b / "modules" / "robotics" / "__pycache__" / "x.pyc").write_bytes(b"junk")
    (b / "workflows").mkdir()
    (b / "workflows" / "weekly-review.yaml").write_text("id: weekly-review\n")
    (b / "snippets" / "motors" / "pwm").mkdir(parents=True)
    (b / "snippets" / "motors" / "pwm" / "snippet.md").write_text("starter\n")
    (b / "handbook" / "notes").mkdir(parents=True)
    (b / "handbook" / "notes" / "esp32.md").write_text("starter note\n")
    return b


def test_first_start_copies_everything_but_caches(tmp_path):
    b, root = _make_bundle(tmp_path), tmp_path / "hub"
    counts = bundle.sync(b, root)
    assert counts == {"modules": 1, "workflows": 1, "snippets": 1, "handbook/notes": 1}
    assert (root / "modules" / "robotics" / "module.yaml").read_text().endswith("version: 2\n")
    assert not (root / "modules" / "robotics" / "__pycache__").exists()


def test_update_overwrites_hub_files_but_keeps_user_files(tmp_path):
    b, root = _make_bundle(tmp_path), tmp_path / "hub"
    bundle.sync(b, root)
    # The user edits a starter snippet and a note, adds their own module, and a stale module file is on disk.
    (root / "snippets" / "motors" / "pwm" / "snippet.md").write_text("my version\n")
    (root / "handbook" / "notes" / "esp32.md").write_text("my note\n")
    (root / "modules" / "my-type").mkdir()
    (root / "modules" / "my-type" / "module.yaml").write_text("id: my-type\n")
    (root / "modules" / "robotics" / "module.yaml").write_text("id: robotics\nversion: 1\n")
    counts = bundle.sync(b, root)
    assert counts["modules"] == 1 and counts["snippets"] == 0
    assert (root / "modules" / "robotics" / "module.yaml").read_text().endswith("version: 2\n")
    assert (root / "snippets" / "motors" / "pwm" / "snippet.md").read_text() == "my version\n"
    assert (root / "handbook" / "notes" / "esp32.md").read_text() == "my note\n"
    assert (root / "modules" / "my-type" / "module.yaml").exists()
    assert bundle.sync(b, root)["modules"] == 0  # nothing changed, nothing copied


def test_frozen_engine_uses_local_app_data(monkeypatch, tmp_path):
    from engine.config import _default_root

    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path))
    if sys.platform == "darwin":
        monkeypatch.setattr(Path, "home", lambda: tmp_path)
    root = _default_root()
    assert root.name == "Workflow Hub" and tmp_path in root.parents


def test_source_checkout_uses_repository(monkeypatch):
    from engine.config import _default_root

    monkeypatch.delattr(sys, "frozen", raising=False)
    assert (_default_root() / "engine" / "__main__.py").is_file()
    assert bundle.bundle_dir() is None




def test_installed_app_skips_hub_tests(hub, monkeypatch):
    from engine import automations

    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.delattr(hub, "test_runner", raising=False)
    state: dict = {}
    out = automations.run_hub_tests(hub, state, {})
    assert out["skip"] and "source folder" in out["summary"] and "tests" not in state
