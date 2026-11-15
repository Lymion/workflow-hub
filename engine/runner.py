"""Run panel processes: dev servers, builds, uploads and serial ports, each with a scrolling log.

One registry keyed "<project_id>:<target>". The UI polls /log?after=<seq>. Plain code, no tokens.
"""
from __future__ import annotations

import collections
import os
import platform
import re
import signal
import subprocess
import threading
import time
from typing import Any, Callable

MAX_LINES = 3000
ANSI = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07")
_REG: dict[str, "Proc"] = {}
_LOCK = threading.Lock()


class Proc:
    """A child process (or a serial port) with a numbered line log."""

    def __init__(self, key: str, label: str, kind: str):
        self.key, self.label, self.kind = key, label, kind
        self.lines: collections.deque[tuple[int, float, str]] = collections.deque(maxlen=MAX_LINES)
        self.seq = 0
        self.state = "starting"  # starting | running | exited | failed | stopped
        self.code: int | None = None
        self.started = time.time()
        self.ended: float | None = None
        self.on_exit: list[Callable[["Proc"], None]] = []
        self._lock = threading.Lock()
        self._popen: subprocess.Popen | None = None
        self._serial: Any = None
        self._stop = threading.Event()

    # ---- log ----
    def add(self, text: str) -> None:
        for line in ANSI.sub("", text).replace("\r\n", "\n").replace("\r", "\n").split("\n"):
            with self._lock:
                self.seq += 1
                self.lines.append((self.seq, time.time(), line.rstrip()[:2000]))

    def log(self, after: int = 0, limit: int = 500) -> list[dict]:
        with self._lock:
            out = [{"seq": s, "t": round(t, 3), "text": x} for s, t, x in self.lines if s > after]
        return out[-limit:]

    def tail(self, n: int = 40) -> str:
        with self._lock:
            return "\n".join(x for _, _, x in list(self.lines)[-n:])

    def info(self) -> dict:
        return {"key": self.key, "label": self.label, "kind": self.kind, "state": self.state, "code": self.code,
                "started": self.started, "ended": self.ended, "seq": self.seq, "running": self.running}

    @property
    def running(self) -> bool:
        return self.state in ("starting", "running")

    def _finish(self, state: str, code: int | None) -> None:
        if self.state == "stopped":
            state = "stopped"
        self.state, self.code, self.ended = state, code, time.time()
        for fn in self.on_exit:
            try:
                fn(self)
            except Exception as exc:  # a hook must never kill the reader
                self.add(f"[hub] after-exit step failed: {exc}")

    # ---- process ----
    def spawn(self, cmd: list[str], cwd: str, env: dict | None = None) -> None:
        self.add("$ " + " ".join([os.path.basename(cmd[0]), *cmd[1:]]))
        kwargs: dict = {"cwd": cwd, "stdout": subprocess.PIPE, "stderr": subprocess.STDOUT, "stdin": subprocess.PIPE,
                        "env": {**os.environ, "PYTHONUNBUFFERED": "1", "FORCE_COLOR": "0", "NO_COLOR": "1", **(env or {})}}
        if platform.system() == "Windows":
            kwargs["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) | getattr(subprocess, "CREATE_NO_WINDOW", 0)
            kwargs["shell"] = cmd[0].lower().endswith((".cmd", ".bat"))  # npm/npx are .cmd shims
        else:
            kwargs["start_new_session"] = True
        try:
            self._popen = subprocess.Popen(cmd, **kwargs)
        except OSError as exc:
            self.add(f"[hub] couldn't start: {exc}")
            self._finish("failed", None)
            return
        self.state = "running"
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self) -> None:
        p = self._popen
        assert p and p.stdout
        buf = b""
        while True:
            chunk = p.stdout.read1(4096) if hasattr(p.stdout, "read1") else p.stdout.read(1)
            if not chunk:
                break
            buf += chunk
            *done, buf = re.split(rb"\r\n|\n|\r", buf)
            for line in done:
                self.add(line.decode("utf-8", errors="replace"))
        if buf:
            self.add(buf.decode("utf-8", errors="replace"))
        code = p.wait()
        self.add(f"[hub] exited with code {code}" if self.state != "stopped" else "[hub] stopped")
        self._finish("exited" if code == 0 else "failed", code)

    # ---- serial ----
    def attach_serial(self, port: Any, name: str, baud: int) -> None:
        self._serial = port
        self.state = "running"
        self.add(f"[hub] serial {name} at {baud} baud")
        threading.Thread(target=self._read_serial, daemon=True).start()

    def _read_serial(self) -> None:
        buf = b""
        while not self._stop.is_set():
            try:
                chunk = self._serial.read(self._serial.in_waiting or 1)
            except Exception as exc:
                self.add(f"[hub] serial port closed: {type(exc).__name__}. Is the board unplugged? Plug it in and press Start.")
                self._finish("failed", None)
                return
            if not chunk:
                continue
            buf += chunk
            *done, buf = re.split(rb"\r\n|\n", buf)
            for line in done:
                self.add(line.decode("utf-8", errors="replace"))
        self._finish("stopped", None)

    # ---- control ----
    def send(self, text: str) -> None:
        data = (text + "\n").encode()
        if self._serial is not None:
            self._serial.write(data)
        elif self._popen and self._popen.stdin:
            self._popen.stdin.write(data)
            self._popen.stdin.flush()
        else:
            raise RuntimeError("not running")
        self.add(f"> {text}")

    def stop(self, wait: float = 3.0) -> None:
        if not self.running:
            return
        self.state = "stopped"
        self._stop.set()
        if self._serial is not None:
            try:
                self._serial.close()
            except Exception:
                pass
            self.ended = time.time()
            return
        p = self._popen
        if not p or p.poll() is not None:
            return
        try:
            if platform.system() == "Windows":
                subprocess.run(["taskkill", "/PID", str(p.pid), "/T", "/F"], capture_output=True)
            else:
                os.killpg(p.pid, signal.SIGTERM)
            p.wait(timeout=wait)
        except (subprocess.TimeoutExpired, ProcessLookupError, PermissionError, OSError):
            try:
                if platform.system() != "Windows":
                    os.killpg(p.pid, signal.SIGKILL)
                else:
                    p.kill()
            except OSError:
                pass


def get(key: str) -> Proc | None:
    with _LOCK:
        return _REG.get(key)


def put(proc: Proc) -> Proc:
    with _LOCK:
        old = _REG.get(proc.key)
        if old and old.running:
            raise RuntimeError(f"{old.label} is already running. Stop it first.")
        _REG[proc.key] = proc
    return proc


def for_project(project_id: int) -> dict[str, Proc]:
    prefix = f"{project_id}:"
    with _LOCK:
        return {k[len(prefix):]: p for k, p in _REG.items() if k.startswith(prefix)}


def stop_all() -> None:
    with _LOCK:
        procs = list(_REG.values())
    for p in procs:
        p.stop(wait=1.0)
