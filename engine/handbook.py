"""Handbook: markdown chapters with a YAML setup block, loaded from plain files.

Sources (scanned on every read, so a new file shows up with no code changes):
  modules/<module>/handbook/<section>/<chapter>.md   one part per module
  handbook/notes/<chapter>.md                         "My notes" (the only part the hub writes)
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from .modules import load_modules

FRONT = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?", re.S)
SECTION_TITLES = {"parts": "Parts", "boards": "Boards", "stacks": "Stacks", "notes": "Notes"}
NOTES_PART = "notes"


@dataclass
class Chapter:
    path: str            # e.g. "robotics/parts/hc-sr04" or "notes/esp32-boot-loops"
    part: str            # module id or "notes"
    section: str
    title: str
    meta: dict
    body: str
    file: Path
    error: str = ""

    @property
    def key(self) -> str:
        """The id other features use (part, stack or board id from the setup block)."""
        for k in ("part", "stack", "board"):
            if self.meta.get(k):
                return str(self.meta[k])
        return self.file.stem

    def summary(self) -> dict:
        return {
            "path": self.path,
            "key": self.key,
            "title": self.title,
            "section": self.section,
            "category": self.meta.get("category") or self.meta.get("kind") or "",
            "price_rm": self.meta.get("price_rm"),
            "good_for": self.meta.get("good_for", ""),
            "watch_out": self.meta.get("watch_out", "") or self.meta.get("warn", ""),
        }


@dataclass
class Handbook:
    parts: list[dict] = field(default_factory=list)
    chapters: dict[str, Chapter] = field(default_factory=dict)
    errors: list[dict] = field(default_factory=list)

    def by_key(self, key: str) -> Chapter | None:
        return next((c for c in self.chapters.values() if c.key == key), None)

    def items(self, part: str, section: str | None = None) -> list[Chapter]:
        return [c for c in self.chapters.values() if c.part == part and (section is None or c.section == section)]


def parse(text: str) -> tuple[dict, str]:
    m = FRONT.match(text)
    if not m:
        return {}, text
    meta = yaml.safe_load(m.group(1)) or {}
    if not isinstance(meta, dict):
        raise yaml.YAMLError("the setup block must be key: value lines")
    return meta, text[m.end():]


def _title(meta: dict, body: str, stem: str) -> str:
    for line in body.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return str(meta.get("title") or stem.replace("-", " ").title())


def _load_file(file: Path, part: str, section: str, rel: str) -> Chapter:
    path = f"{part}/{section}/{file.stem}" if part != NOTES_PART else f"notes/{file.stem}"
    text = file.read_text(encoding="utf-8")
    try:
        meta, body = parse(text)
    except yaml.YAMLError as exc:
        mark = getattr(exc, "problem_mark", None)
        line = f" line {mark.line + 2}" if mark else ""
        problem = getattr(exc, "problem", None) or str(exc)
        return Chapter(path, part, section, file.stem, {}, text, file, error=f"{rel}{line}: {problem}. Fix the YAML setup block, then reload.")
    return Chapter(path, part, section, _title(meta, body, file.stem), meta, body, file)


def load(root: Path) -> Handbook:
    hb = Handbook()
    modules, _ = load_modules(root / "modules")
    sources: list[tuple[str, str, Path]] = [(m.id, str(m.extra.get("handbook_part") or m.name), root / "modules" / m.folder / "handbook") for m in modules if m.enabled]
    sources.append((NOTES_PART, "My notes", root / "handbook" / "notes"))
    for part_id, part_title, folder in sources:
        if not folder.is_dir():
            continue
        sections: dict[str, list[dict]] = {}
        files = sorted(folder.glob("*.md")) if part_id == NOTES_PART else sorted(folder.glob("*/*.md"))
        for f in files:
            section = NOTES_PART if part_id == NOTES_PART else f.parent.name
            rel = f.relative_to(root).as_posix()
            ch = _load_file(f, part_id, section, rel)
            if ch.error:
                hb.errors.append({"file": rel, "message": ch.error})
                continue
            hb.chapters[ch.path] = ch
            sections.setdefault(section, []).append(ch.summary())
        if sections:
            hb.parts.append({
                "id": part_id,
                "title": part_title,
                "sections": [
                    {"id": s, "title": SECTION_TITLES.get(s, s.replace("-", " ").title()), "chapters": sorted(chs, key=lambda c: c["title"].lower())}
                    for s, chs in sorted(sections.items())
                ],
            })
    return hb


def signature(root: Path) -> tuple:
    files = list((root / "modules").glob("*/handbook/*/*.md")) + list((root / "handbook" / "notes").glob("*.md")) + list((root / "modules").glob("*/module.yaml"))
    return tuple(sorted((str(f), f.stat().st_mtime_ns) for f in files))


def notes_dir(root: Path) -> Path:
    return root / "handbook" / "notes"


def write_note(root: Path, slug: str, title: str, body: str, tags: list[str]) -> Path:
    folder = notes_dir(root)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{slug}.md"
    meta = yaml.safe_dump({"note": slug, "tags": tags}, sort_keys=False).strip()
    path.write_text(f"---\n{meta}\n---\n# {title}\n\n{body.strip()}\n", encoding="utf-8")
    return path
