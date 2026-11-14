"""Writing files the hub owns. The hub never edits the user's own code.

Owned files carry an AUTO-GENERATED marker in their first lines. A file that exists
without the marker belongs to the user and is left alone.
"""
from __future__ import annotations

from pathlib import Path

MARKER = "AUTO-GENERATED"


def is_owned(path: Path) -> bool:
    if not path.exists():
        return True
    try:
        head = path.read_text(encoding="utf-8", errors="replace")[:400]
    except OSError:
        return False
    return MARKER in head


def write_owned(path: Path, content: str) -> str:
    """Returns 'wrote', 'unchanged' or 'skipped' (exists and is the user's file)."""
    if MARKER not in content[:400]:
        raise ValueError(f"{path.name}: owned files must start with an {MARKER} header")
    if path.exists():
        if not is_owned(path):
            return "skipped"
        if path.read_text(encoding="utf-8", errors="replace") == content:
            return "unchanged"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")
    return "wrote"


def write_once(path: Path, content: str) -> str:
    """Starter files (main.cpp, CLAUDE.md): written only if missing, then they are the user's."""
    if path.exists():
        return "kept"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")
    return "wrote"
