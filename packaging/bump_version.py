"""Bump the hub's version everywhere at once, so each installer is a normal upgrade.

    python packaging/bump_version.py minor     # 0.2.0 -> 0.3.0 (new features)
    python packaging/bump_version.py patch     # 0.2.0 -> 0.2.1 (fixes)
    python packaging/bump_version.py 1.0.0     # an exact version

The VS Code extension keeps its own version (vscode-extension/package.json).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# file -> pattern whose group 2 is the version
FILES = {
    "engine/config.py": r'^(VERSION = ")([^"]+)(")',
    "app/package.json": r'^(  "version": ")([^"]+)(")',
    "app/src-tauri/tauri.conf.json": r'^(  "version": ")([^"]+)(")',
    "app/src-tauri/Cargo.toml": r'^(version = ")([^"]+)(")',
    "app/src-tauri/Cargo.lock": r'(name = "workflow-hub"\nversion = ")([^"]+)(")',
}


def current() -> dict[str, str]:
    out = {}
    for rel, pat in FILES.items():
        m = re.search(pat, (ROOT / rel).read_text(encoding="utf-8"), re.M)
        out[rel] = m.group(2) if m else ""
    return out


def next_version(now: str, how: str) -> str:
    if re.fullmatch(r"\d+\.\d+\.\d+", how):
        return how
    major, minor, patch = (int(x) for x in now.split("."))
    if how == "major":
        return f"{major + 1}.0.0"
    if how == "minor":
        return f"{major}.{minor + 1}.0"
    if how == "patch":
        return f"{major}.{minor}.{patch + 1}"
    raise SystemExit("Say how to bump: major, minor, patch, or an exact version like 1.2.3.")


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print(__doc__)
        return 2
    versions = current()
    now = versions["engine/config.py"]
    new = next_version(now, argv[0])
    for rel, pat in FILES.items():
        f = ROOT / rel
        f.write_text(re.sub(pat, lambda m: m.group(1) + new + m.group(3), f.read_text(encoding="utf-8"), count=1, flags=re.M), encoding="utf-8")
    print(f"Version {now} -> {new}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
