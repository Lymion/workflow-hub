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
    for folder in ("snippets", "handbook", "workflows"):
        if (REPO / folder).is_dir():
            shutil.copytree(REPO / folder, root / folder)
    return root


@pytest.fixture()
def paths(hub_root: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> HubPaths:
    monkeypatch.setenv("WORKFLOW_HUB_PROJECTS", str(tmp_path / "projects"))
    monkeypatch.setenv("WORKFLOW_HUB_EMBED", "0")
    monkeypatch.setenv("WORKFLOW_HUB_SCHEDULER", "0")  # tests call automations.tick() themselves  # keyword search in tests; hybrid is tested with a fake embedder
    return HubPaths(root=hub_root, data=tmp_path / "data")


@pytest.fixture()
def client(paths: HubPaths):
    app = create_app(paths)
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def hub(client):
    return client.app.state.hub


def make_fake_tool(folder: Path, name: str, source: str = "") -> Path:
    """Write a fake command-line tool that runs the given Python source.

    Linux/macOS get an executable script with a shebang; Windows gets a
    name.cmd wrapper (which shutil.which finds through PATHEXT).
    """
    import stat
    import sys

    script = folder / f"{name}_fake.py"
    script.write_text(source or "pass\n", encoding="utf-8")
    if sys.platform == "win32":
        tool = folder / f"{name}.cmd"
        tool.write_text(f'@"{sys.executable}" -u "{script}" %*\r\n', encoding="utf-8")
    else:
        tool = folder / name
        tool.write_text(f"#!{sys.executable} -u\n" + script.read_text(encoding="utf-8"), encoding="utf-8")
        tool.chmod(tool.stat().st_mode | stat.S_IEXEC)
    return tool
