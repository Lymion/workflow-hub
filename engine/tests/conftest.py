from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from engine.app import create_app
from engine.config import HubPaths

REPO = Path(__file__).resolve().parents[2]


@pytest.fixture()
def hub_root(tmp_path: Path) -> Path:
    """A throwaway hub root with a copy of the real modules/ folder."""
    root = tmp_path / "hub"
    root.mkdir()
    shutil.copytree(REPO / "modules", root / "modules")
    if (REPO / "snippets").is_dir():
        shutil.copytree(REPO / "snippets", root / "snippets")
    return root


@pytest.fixture()
def paths(hub_root: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> HubPaths:
    monkeypatch.setenv("WORKFLOW_HUB_PROJECTS", str(tmp_path / "projects"))
    return HubPaths(root=hub_root, data=tmp_path / "data")


@pytest.fixture()
def client(paths: HubPaths):
    app = create_app(paths)
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def hub(client):
    return client.app.state.hub
