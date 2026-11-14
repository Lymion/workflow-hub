"""Board files (modules/<module>/boards/*.yaml) and module checks (modules/<module>/checks.py)."""
from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import yaml

from .modules import load_modules


def load_boards(root: Path) -> dict[str, dict]:
    boards: dict[str, dict] = {}
    modules, _ = load_modules(root / "modules")
    for m in modules:
        if not m.enabled:
            continue
        for f in sorted((root / "modules" / m.folder / "boards").glob("*.yaml")):
            data = yaml.safe_load(f.read_text(encoding="utf-8")) or {}
            if data.get("board"):
                data["module"] = m.id
                boards[data["board"]] = data
    return dict(sorted(boards.items(), key=lambda kv: (kv[1].get('order', 99), kv[1].get('name', ''))))


def load_checks(root: Path, module_id: str) -> ModuleType | None:
    """Import modules/<folder>/checks.py for the module, fresh each time (edits apply without restart)."""
    modules, _ = load_modules(root / "modules")
    mod = next((m for m in modules if m.id == module_id), None)
    if not mod:
        return None
    path = root / "modules" / mod.folder / "checks.py"
    if not path.is_file():
        return None
    spec = importlib.util.spec_from_file_location(f"hub_checks_{mod.folder.replace('-', '_')}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module
