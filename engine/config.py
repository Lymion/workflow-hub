"""Paths and fixed settings for the Workflow Hub engine.

Everything the hub builds from lives in plain files under the hub root, and its
state lives in one SQLite file under the data folder. Both can be moved with
environment variables (tests point them at temporary folders).
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

HOST = "127.0.0.1"
PORT = 8765
VERSION = "0.1.0"

# The hub only ever calls this model. It is fixed here, in one line, on purpose:
# there is no setting to pick another model.
HAIKU_MODEL = "claude-haiku-5-5"

# Hard monthly cap for Haiku spend, in ringgit.
MONTHLY_CAP_RM = 10.0
DEFAULT_RM_PER_USD = 4.4


def _default_root() -> Path:
    return Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class HubPaths:
    root: Path
    data: Path

    @property
    def modules(self) -> Path:
        return self.root / "modules"

    @property
    def snippets(self) -> Path:
        return self.root / "snippets"

    @property
    def docs(self) -> Path:
        return self.data / "docs"

    @property
    def db(self) -> Path:
        return self.data / "hub.db"

    @property
    def projects_home(self) -> Path:
        """Where new projects are created unless the user picks another folder."""
        return Path(os.environ.get("WORKFLOW_HUB_PROJECTS", Path.home() / "projects"))

    @classmethod
    def from_env(cls) -> "HubPaths":
        root = Path(os.environ.get("WORKFLOW_HUB_ROOT", _default_root()))
        data = Path(os.environ.get("WORKFLOW_HUB_DATA", root / "data"))
        return cls(root=root, data=data)


def load_dotenv(path: Path) -> None:
    """Read KEY=VALUE lines from a .env file into os.environ (existing values win)."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
