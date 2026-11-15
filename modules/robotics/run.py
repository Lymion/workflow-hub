"""Run panel targets for robotics: PlatformIO build and upload, serial monitor + plotter.

targets(ctx) -> [{id, label, kind, cmd, fix, hint, pauses_serial, baud}]. kind is task | server | serial.
The engine runs them; this file only says what to run.
"""
from __future__ import annotations

import re

PIO_FIX = "PlatformIO isn't installed. Run: pip install platformio (or install the PlatformIO VS Code extension), then press Start again."


def baud(ctx: dict) -> int:
    ini = ctx["path"] / "platformio.ini"
    if ini.is_file():
        m = re.search(r"^\s*monitor_speed\s*=\s*(\d+)", ini.read_text(encoding="utf-8", errors="replace"), re.M)
        if m:
            return int(m.group(1))
    return int((ctx.get("board") or {}).get("monitor_speed", 115200))


def targets(ctx: dict) -> list[dict]:
    pio = ctx["which"]("pio") or ctx["which"]("platformio")
    has_ini = (ctx["path"] / "platformio.ini").is_file()
    fix = "" if pio else PIO_FIX
    if pio and not has_ini:
        fix = "platformio.ini is missing. Pick a board in the Parts tab, then run setup."
    port = ctx.get("port")
    upload = [pio or "pio", "run", "-t", "upload"] + (["--upload-port", port] if port else [])
    return [
        {"id": "build", "label": "Build", "kind": "task", "cmd": [pio or "pio", "run"], "fix": fix,
         "hint": "Compiles the firmware. The first build downloads the board's toolchain and takes a few minutes."},
        {"id": "upload", "label": "Upload", "kind": "task", "cmd": upload, "fix": fix, "pauses_serial": True,
         "hint": "Builds and flashes the board over USB. The serial monitor pauses while it uploads."},
        {"id": "serial", "label": "Serial monitor", "kind": "serial", "cmd": None, "baud": baud(ctx), "fix": "",
         "hint": "Prints what the board sends. Lines like 'left:120 right:98' draw on the plotter."},
    ]
