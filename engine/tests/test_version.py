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
