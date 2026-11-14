"""Run panel targets for apps: dev server, emulator, build. Picked from the project's framework."""
from __future__ import annotations

import json

SETUP_FIX = "There's no package.json yet. Open the Stack tab and press Set up app first."
NODE_FIX = "Node.js isn't installed. Run: winget install OpenJS.NodeJS.LTS, then reopen the hub."


def _scripts(path) -> dict:
    try:
        return json.loads((path / "package.json").read_text(encoding="utf-8")).get("scripts", {}) or {}
    except (OSError, json.JSONDecodeError):
        return {}


def targets(ctx: dict) -> list[dict]:
    which, path = ctx["which"], ctx["path"]
    npm, npx = which("npm") or "npm", which("npx") or "npx"
    fw = next((s["key"] for s in ctx["stack"] if s["meta"].get("kind") == "framework"), "expo")
    fix = NODE_FIX if not which("npm") else SETUP_FIX if not (path / "package.json").is_file() else ""
    scripts = _scripts(path)
    keys = {s["key"] for s in ctx["stack"]}
    if fw == "expo":
        build = [npx, "eas-cli", "build", "-p", "android", "--profile", "preview", "--non-interactive"] if "eas" in keys else [npx, "expo", "export"]
        return [
            {"id": "dev", "label": "Dev server", "kind": "server", "cmd": [npx, "expo", "start"], "fix": fix,
             "hint": "Scan the QR code with Expo Go. Send r to reload, a to open Android."},
            {"id": "emulator", "label": "Android emulator", "kind": "server", "cmd": [npx, "expo", "start", "--android"], "fix": fix,
             "hint": "Opens the app in the Android emulator. Needs Android Studio with an emulator set up."},
            {"id": "build", "label": "Build APK" if "eas" in keys else "Export", "kind": "task", "cmd": build, "fix": fix,
             "hint": "Cloud APK build on EAS (needs: npx eas-cli login)." if "eas" in keys else "Bundles the app into dist/. Tick EAS Build in the stack for APKs."},
        ]
    if fw == "tauri":
        return [
            {"id": "dev", "label": "Dev app", "kind": "server", "cmd": [npm, "run", "tauri", "dev"], "fix": fix or ("" if "tauri" in scripts else "package.json has no 'tauri' script. Run setup again."),
             "hint": "Opens the desktop app with hot reload. The first run compiles Rust and takes a while."},
            {"id": "build", "label": "Build installer", "kind": "task", "cmd": [npm, "run", "tauri", "build"], "fix": fix, "hint": "Makes the installer in src-tauri/target/release/bundle."},
        ]
    return [
        {"id": "dev", "label": "Dev server", "kind": "server", "cmd": [npm, "run", "dev"], "fix": fix or ("" if "dev" in scripts else "package.json has no 'dev' script."),
         "hint": "Starts the site with hot reload. The link appears in the log."},
        {"id": "build", "label": "Build", "kind": "task", "cmd": [npm, "run", "build"], "fix": fix, "hint": "Production build. Errors show here and can go to the error log."},
    ]
