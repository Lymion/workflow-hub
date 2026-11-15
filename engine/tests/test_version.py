"""The version is the same everywhere (installer, app, engine), so updates install as upgrades."""
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _bump():
    spec = importlib.util.spec_from_file_location("bump_version", ROOT / "packaging" / "bump_version.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_one_version_everywhere():
    versions = _bump().current()
    assert len(set(versions.values())) == 1 and all(versions.values()), versions


def test_next_version():
    nv = _bump().next_version
    assert (nv("0.2.0", "minor"), nv("0.2.0", "patch"), nv("0.2.3", "major"), nv("0.2.0", "1.0.0")) == ("0.3.0", "0.2.1", "1.0.0", "1.0.0")


def _release():
    spec = importlib.util.spec_from_file_location("make_release", ROOT / "packaging" / "make_release.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_release_notes_come_from_the_changelog():
    rel = _release()
    text = "# Changelog\n\n## 0.3.0\n\n- Updates install in one click.\n\n## 0.2.0\n\n- Docs page.\n"
    assert rel.changelog_notes("0.3.0", text) == "- Updates install in one click."
    import pytest

    with pytest.raises(SystemExit):
        rel.changelog_notes("0.4.0", text)


def test_current_version_has_changelog_notes():
    from engine.config import VERSION

    assert _release().changelog_notes(VERSION)


def test_latest_json_shape():
    from datetime import datetime, timezone

    j = _release().latest_json("0.3.0", "sig\n", "Workflow-Hub_0.3.0_x64-setup.exe", "notes", datetime(2026, 11, 15, tzinfo=timezone.utc))
    assert j["platforms"]["windows-x86_64"] == {"signature": "sig", "url": "https://github.com/Lymion/workflow-hub/releases/download/v0.3.0/Workflow-Hub_0.3.0_x64-setup.exe"}
    assert j["version"] == "0.3.0" and j["pub_date"] == "2026-11-15T00:00:00Z"
