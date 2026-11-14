"""Open a project folder in outside tools (VS Code, Arduino IDE, a terminal, Claude Code).

Each launcher resolves to a command for the current OS, or to a one-line fix when
the tool isn't installed.
"""
from __future__ import annotations

import os
import platform
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

LABELS = {
    "vscode": "VS Code",
    "arduino-ide": "Arduino IDE",
    "terminal": "Terminal",
    "claude": "Claude Code",
}

FIXES = {
    "vscode": "VS Code's 'code' command isn't on PATH. Install VS Code, or in VS Code run 'Shell Command: Install code command in PATH'.",
    "arduino-ide": "Arduino IDE isn't installed. Get Arduino IDE 2 from arduino.cc/en/software, then try again.",
    "terminal": "No terminal app found. Install Windows Terminal from the Microsoft Store, then try again.",
    "claude": "Claude Code isn't installed. Run: npm install -g @anthropic-ai/claude-code, then try again.",
}


@dataclass
class Launch:
    ok: bool
    command: list[str] | None = None
    fix: str = ""


def _system() -> str:
    return platform.system()  # 'Windows', 'Darwin', 'Linux'


def _arduino_exe() -> str | None:
    found = shutil.which("arduino-ide")
    if found:
        return found
    if _system() == "Windows":
        local = os.environ.get("LOCALAPPDATA", "")
        for p in (Path(local) / "Programs" / "Arduino IDE" / "Arduino IDE.exe", Path("C:/Program Files/Arduino IDE/Arduino IDE.exe")):
            if p.is_file():
                return str(p)
    return None


def _terminal(path: str, run: list[str] | None = None) -> list[str] | None:
    system = _system()
    run = run or []
    if system == "Windows":
        if shutil.which("wt"):
            return ["wt", "-d", path, *run]
        cmd = " ".join(run) if run else ""
        return ["cmd", "/c", "start", "cmd", "/K", f'cd /d "{path}"' + (f" && {cmd}" if cmd else "")]
    if system == "Darwin":
        if run:
            script = f'tell application "Terminal" to do script "cd {path} && {" ".join(run)}"'
            return ["osascript", "-e", script]
        return ["open", "-a", "Terminal", path]
    for term in ("x-terminal-emulator", "gnome-terminal", "konsole", "xterm"):
        if shutil.which(term):
            if run:
                return [term, "-e", "sh", "-c", f'cd "{path}" && {" ".join(run)}; exec sh']
            return [term, "--working-directory", path] if term == "gnome-terminal" else [term]
    return None


def resolve(target: str, path: str) -> Launch:
    if target == "vscode":
        code = shutil.which("code")
        return Launch(True, [code, path]) if code else Launch(False, fix=FIXES[target])
    if target == "arduino-ide":
        if _system() == "Darwin" and Path("/Applications/Arduino IDE.app").exists():
            return Launch(True, ["open", "-a", "Arduino IDE", path])
        exe = _arduino_exe()
        return Launch(True, [exe, path]) if exe else Launch(False, fix=FIXES[target])
    if target == "terminal":
        cmd = _terminal(path)
        return Launch(True, cmd) if cmd else Launch(False, fix=FIXES[target])
    if target == "claude":
        if not shutil.which("claude"):
            return Launch(False, fix=FIXES[target])
        cmd = _terminal(path, ["claude"])
        return Launch(True, cmd) if cmd else Launch(False, fix=FIXES["terminal"])
    return Launch(False, fix=f"Unknown launcher '{target}'. Use one of: {', '.join(LABELS)}.")


def start(command: list[str], cwd: str) -> None:
    kwargs: dict = {"cwd": cwd, "stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
    if _system() == "Windows":
        kwargs["creationflags"] = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        # 'code' is a .cmd shim on Windows and needs the shell to run.
        kwargs["shell"] = command[0].lower().endswith((".cmd", ".bat"))
    else:
        kwargs["start_new_session"] = True
    subprocess.Popen(command, **kwargs)
