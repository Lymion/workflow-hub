"""The installed app: where the hub lives and how its bundled files reach it.

When the engine runs from the installer (a frozen engine.exe), the program
folder is read-only. The hub folder is a writable folder in the user's local
app data instead, and on every start the engine copies its bundled files there:

- modules/ and workflows/ belong to the hub, so the bundled copy always wins
  (that is how an update reaches you). Extra folders you added are kept.
- snippets/ and handbook/notes/ are yours, so only files you don't have yet
  are copied. Your edits are never overwritten.
"""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

HUB_OWNED = ("modules", "workflows")
USER_OWNED = ("snippets", "handbook/notes")
SKIP = {"__pycache__"}


def frozen() -> bool:
    """True when running as the installed engine.exe (PyInstaller)."""
    return bool(getattr(sys, "frozen", False))


def bundle_dir() -> Path | None:
    """The hub files packed inside the installed engine, if any."""
    base = getattr(sys, "_MEIPASS", None)
    if not base:
        return None
    path = Path(base) / "hub"
    return path if path.is_dir() else None


def user_hub_dir() -> Path:
    """Writable hub folder for the installed app (matches the desktop shell)."""
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share")
    return base / "Workflow Hub"


def _files(src: Path):
    for path in sorted(src.rglob("*")):
        rel = path.relative_to(src)
        if path.is_file() and not SKIP.intersection(rel.parts) and path.suffix != ".pyc":
            yield path, rel


def sync(bundle: Path, root: Path) -> dict[str, int]:
    """Copy bundled hub files into the writable hub folder. Returns counts per folder."""
    counts: dict[str, int] = {}
    for name in HUB_OWNED + USER_OWNED:
        src = bundle / name
        if not src.is_dir():
            continue
        copied = 0
        for path, rel in _files(src):
            dest = root / name / rel
            if name in USER_OWNED and dest.exists():
                continue
            if name in HUB_OWNED and dest.is_file() and dest.read_bytes() == path.read_bytes():
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, dest)
            copied += 1
        counts[name] = copied
    return counts
