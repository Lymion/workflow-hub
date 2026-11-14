"""Project-type modules: one folder per type under modules/, each with a module.yaml.

Adding a project type means adding a folder. Nothing here knows about Robotics or
App development by name.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path

import yaml

REQUIRED_KEYS = ("id", "name", "icon", "color", "cart_slots", "project_tabs", "launch", "run")
LIST_KEYS = ("cart_slots", "project_tabs", "launch", "run")


@dataclass
class Module:
    id: str
    name: str
    icon: str
    color: str
    cart_slots: list[str]
    project_tabs: list[str]
    launch: list[str]
    run: list[str]
    tagline: str = ""
    enabled: bool = True
    folder: str = ""
    extra: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        d = asdict(self)
        d.pop("extra")
        d.update(self.extra)
        return d


@dataclass
class ModuleError:
    folder: str
    file: str
    message: str

    def to_dict(self) -> dict:
        return asdict(self)


def _load_one(folder: Path, root: Path) -> Module | ModuleError:
    rel = folder.relative_to(root.parent).as_posix() + "/module.yaml"
    path = folder / "module.yaml"
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.MarkedYAMLError as exc:
        line = exc.problem_mark.line + 1 if exc.problem_mark else "?"
        return ModuleError(folder.name, rel, f"{rel} line {line}: {exc.problem}. Fix the YAML, then reload.")
    except OSError as exc:
        return ModuleError(folder.name, rel, f"{rel} can't be read ({exc.strerror}). Check the file, then reload.")

    if not isinstance(data, dict):
        return ModuleError(folder.name, rel, f"{rel} is empty or not a mapping. Add the module keys, then reload.")

    missing = [k for k in REQUIRED_KEYS if k not in data or data[k] in (None, "")]
    if missing:
        names = ", ".join(missing)
        verb = "is" if len(missing) == 1 else "are"
        return ModuleError(folder.name, rel, f"{rel}: {names} {verb} missing. Add {'it' if len(missing) == 1 else 'them'}, then reload.")

    for key in LIST_KEYS:
        if not isinstance(data[key], list):
            return ModuleError(folder.name, rel, f"{rel}: {key} must be a list, like [a, b]. Fix it, then reload.")

    known = {f for f in Module.__dataclass_fields__ if f not in ("folder", "extra")}
    extra = {k: v for k, v in data.items() if k not in known}
    return Module(
        id=str(data["id"]),
        name=str(data["name"]),
        icon=str(data["icon"]),
        color=str(data["color"]),
        cart_slots=[str(x) for x in data["cart_slots"]],
        project_tabs=[str(x) for x in data["project_tabs"]],
        launch=[str(x) for x in data["launch"]],
        run=[str(x) for x in data["run"]],
        tagline=str(data.get("tagline", "")),
        enabled=bool(data.get("enabled", True)),
        folder=folder.name,
        extra=extra,
    )


def load_modules(modules_dir: Path) -> tuple[list[Module], list[ModuleError]]:
    """Scan modules_dir. Returns (modules, errors); a broken module never hides the others."""
    modules: list[Module] = []
    errors: list[ModuleError] = []
    if not modules_dir.is_dir():
        return modules, errors
    seen: dict[str, str] = {}
    for folder in sorted(p for p in modules_dir.iterdir() if p.is_dir() and not p.name.startswith((".", "_"))):
        if not (folder / "module.yaml").is_file():
            continue
        result = _load_one(folder, modules_dir)
        if isinstance(result, ModuleError):
            errors.append(result)
            continue
        if result.id in seen:
            rel = f"modules/{folder.name}/module.yaml"
            errors.append(ModuleError(folder.name, rel, f"{rel}: id '{result.id}' is already used by modules/{seen[result.id]}. Give it a new id, then reload."))
            continue
        seen[result.id] = folder.name
        modules.append(result)
    return modules, errors


def module_dir(modules_dir: Path, module_id: str) -> Path | None:
    modules, _ = load_modules(modules_dir)
    for m in modules:
        if m.id == module_id:
            return modules_dir / m.folder
    return None
