"""Snippet library: one folder per snippet under snippets/<category>/<name>/.

A snippet folder holds its code file(s), a README.md (what it does, dependencies,
`CHANGE:` points) and tags.json ({"title", "tags", "language"}). Quick captures land
in snippets/_inbox/ until they are filed.
"""
from __future__ import annotations

import json
import re
import shutil
from datetime import datetime
from pathlib import Path

INBOX = "_inbox"
META_FILES = {"README.md", "tags.json", "preview.png", "preview.html"}
LANG_BY_EXT = {
    ".cpp": "cpp", ".ino": "cpp", ".h": "cpp", ".c": "c", ".py": "python", ".ts": "ts", ".tsx": "tsx",
    ".js": "js", ".jsx": "jsx", ".rs": "rust", ".sql": "sql", ".sh": "bash", ".css": "css", ".yaml": "yaml", ".json": "json",
}
EXT_BY_LANG = {"cpp": ".cpp", "c": ".c", "python": ".py", "ts": ".ts", "tsx": ".tsx", "js": ".js", "jsx": ".jsx", "rust": ".rs", "sql": ".sql", "bash": ".sh", "css": ".css", "yaml": ".yaml", "json": ".json", "text": ".txt"}
SLUG_PART = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def slug_part(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.strip().lower()).strip("-") or "snippet"


def _code_files(folder: Path) -> list[Path]:
    return sorted(p for p in folder.iterdir() if p.is_file() and p.name not in META_FILES and not p.name.startswith("."))


def read_snippet(root: Path, folder: Path) -> dict:
    slug = folder.relative_to(root).as_posix()
    meta: dict = {}
    if (folder / "tags.json").is_file():
        try:
            meta = json.loads((folder / "tags.json").read_text(encoding="utf-8")) or {}
        except json.JSONDecodeError:
            meta = {}
    readme = (folder / "README.md").read_text(encoding="utf-8") if (folder / "README.md").is_file() else ""
    files = _code_files(folder)
    code = files[0].read_text(encoding="utf-8", errors="replace") if files else ""
    title = meta.get("title") or next((l.lstrip("# ").strip() for l in readme.splitlines() if l.startswith("# ")), "") or folder.name.replace("-", " ").title()
    language = meta.get("language") or (LANG_BY_EXT.get(files[0].suffix.lower(), "text") if files else "text")
    change_points = [
        {"line": i + 1, "text": line.split("CHANGE:", 1)[1].strip()}
        for i, line in enumerate(code.splitlines())
        if "CHANGE:" in line
    ]
    return {
        "slug": slug,
        "title": title,
        "category": slug.split("/")[0],
        "tags": [str(t).lower() for t in meta.get("tags", [])],
        "language": language,
        "readme": readme,
        "code": code,
        "files": [f.name for f in files],
        "change_points": change_points,
        "inbox": slug.startswith(INBOX + "/"),
        "source": meta.get("source", ""),
    }


def scan(root: Path) -> list[dict]:
    if not root.is_dir():
        return []
    out = []
    for category in sorted(p for p in root.iterdir() if p.is_dir() and not p.name.startswith(".")):
        for folder in sorted(p for p in category.iterdir() if p.is_dir() and not p.name.startswith(".")):
            if _code_files(folder) or (folder / "README.md").is_file():
                out.append(read_snippet(root, folder))
    return out


def write_snippet(folder: Path, title: str, code: str, language: str, tags: list[str], readme: str = "", source: str = "") -> None:
    folder.mkdir(parents=True, exist_ok=False)
    ext = EXT_BY_LANG.get(language, ".txt")
    (folder / f"snippet{ext}").write_text(code.rstrip() + "\n", encoding="utf-8")
    meta = {"title": title, "tags": sorted({t.strip().lower() for t in tags if t.strip()}), "language": language}
    if source:
        meta["source"] = source
    (folder / "tags.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    body = readme.strip() or "What it does: \n\nDependencies: none\n\nChange points: lines marked `CHANGE:` in the code."
    (folder / "README.md").write_text(f"# {title}\n\n{body}\n", encoding="utf-8")


def unique_folder(base: Path) -> Path:
    if not base.exists():
        return base
    i = 2
    while (base.parent / f"{base.name}-{i}").exists():
        i += 1
    return base.parent / f"{base.name}-{i}"


def capture(root: Path, code: str, note: str = "", source: str = "") -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    title = note.strip().splitlines()[0][:60] if note.strip() else f"Captured {datetime.now():%d %b %H:%M}"
    folder = unique_folder(root / INBOX / f"{stamp}-{slug_part(title)[:40]}")
    lang = guess_language(code)
    write_snippet(folder, title, code, lang, ["inbox"], readme=note.strip(), source=source)
    return folder


def guess_language(code: str) -> str:
    c = code
    if re.search(r"#include\s*[<\"]|void\s+setup\s*\(|digitalWrite|pinMode", c):
        return "cpp"
    if re.search(r"import .* from ['\"]react|<View|useState\(|export default function", c):
        return "tsx"
    if re.search(r"^\s*(def |import |from \w+ import)", c, re.M):
        return "python"
    if re.search(r"\b(const|let|function)\b|=>", c):
        return "ts"
    return "text"


def move(root: Path, slug: str, category: str, title: str | None, tags: list[str] | None) -> Path:
    src = root / slug
    dest = unique_folder(root / slug_part(category) / slug_part(title or src.name))
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dest))
    meta_path = dest / "tags.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.is_file() else {}
    if title:
        meta["title"] = title
    if tags is not None:
        meta["tags"] = sorted({t.strip().lower() for t in tags if t.strip()})
    else:
        meta["tags"] = [t for t in meta.get("tags", []) if t != "inbox"]
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return dest


def safe_folder(root: Path, slug: str) -> Path | None:
    parts = slug.split("/")
    if len(parts) != 2 or not all(p and ".." not in p and "\\" not in p for p in parts):
        return None
    folder = (root / slug).resolve()
    if root.resolve() not in folder.parents or not folder.is_dir():
        return None
    return folder
