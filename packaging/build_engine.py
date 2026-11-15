"""Build the engine into a folder with engine(.exe) for the desktop installer.

    python packaging/build_engine.py

Output: app/src-tauri/engine-dist/ (engine.exe plus its _internal folder). The
Tauri build bundles that folder, so the installed app needs no Python.
The hub's own files (modules, workflows, starter snippets, handbook notes) are
packed inside; engine/bundle.py copies them to the user's hub folder on start.
"""
from __future__ import annotations

import ast
import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "app" / "src-tauri" / "engine-dist"
WORK = ROOT / "build" / "pyinstaller"
DATA = ["modules", "workflows", "snippets", "handbook/notes"]


def module_imports() -> list[str]:
    """Libraries the module plug-in files (checks.py, wizard.py, ...) import; they load at run time."""
    names: set[str] = set()
    for f in sorted((ROOT / "modules").glob("*/*.py")):
        for node in ast.walk(ast.parse(f.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Import):
                names.update(a.name for a in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module and not node.level:
                names.add(node.module)
                names.update(f"{node.module}.{a.name}" for a in node.names if a.name[:1].isupper())
    return sorted(n for n in names if n != "__future__")


def main() -> int:
    import PyInstaller.__main__

    shutil.rmtree(OUT, ignore_errors=True)
    args = [
        str(ROOT / "packaging" / "engine_entry.py"),
        "--name", "engine",
        "--onedir", "--console", "--noconfirm", "--clean",
        "--distpath", str(OUT.parent / "engine-build"),
        "--workpath", str(WORK),
        "--specpath", str(WORK),
        "--paths", str(ROOT),
        "--collect-submodules", "engine",
        "--collect-submodules", "uvicorn",
        "--collect-submodules", "keyring",
        "--copy-metadata", "keyring",
        "--exclude-module", "pytest",
        "--exclude-module", "engine.tests",
    ]
    if sys.platform == "win32":  # keyring's Windows Credential Manager backend
        args += ["--collect-submodules", "win32ctypes"]
    for name in module_imports():
        args += ["--hidden-import", name]
    for d in DATA:
        args += ["--add-data", f"{ROOT / d}{os.pathsep}hub/{d}"]
    PyInstaller.__main__.run(args)
    # PyInstaller writes engine-build/engine/; move it to engine-dist/ so the Tauri resource path stays fixed.
    shutil.move(str(OUT.parent / "engine-build" / "engine"), str(OUT))
    shutil.rmtree(OUT.parent / "engine-build", ignore_errors=True)
    exe = OUT / ("engine.exe" if sys.platform == "win32" else "engine")
    if not exe.is_file():
        print(f"Build failed: {exe} is missing.", file=sys.stderr)
        return 1
    print(f"Engine built: {exe}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
