"""Background jobs for slow setup steps (npm installs, scaffolds). In memory; the UI polls."""
from __future__ import annotations

import threading
import time
from typing import Callable

_JOBS: dict[str, dict] = {}
_LOCK = threading.Lock()


def get(key: str) -> dict | None:
    with _LOCK:
        job = _JOBS.get(key)
        return {**job, "log": job["log"][-40:]} if job else None


def running(key: str) -> bool:
    job = get(key)
    return bool(job and job["state"] == "running")


def start(key: str, fn: Callable[[Callable[[str], None]], dict | None], sync: bool = False) -> dict:
    """Run fn(log) in a thread. fn returns a summary dict. sync=True runs inline (tests)."""
    if running(key):
        return get(key)  # type: ignore[return-value]
    job = {"state": "running", "started": time.time(), "log": [], "result": None, "error": ""}
    with _LOCK:
        _JOBS[key] = job

    def log(line: str) -> None:
        with _LOCK:
            job["log"].append(line.rstrip()[:400])

    def run() -> None:
        try:
            job["result"] = fn(log)
            job["state"] = "done"
        except Exception as exc:  # report, never crash the engine
            job["error"] = f"{type(exc).__name__}: {exc}"
            job["state"] = "failed"

    if sync:
        run()
    else:
        threading.Thread(target=run, daemon=True).start()
    return get(key)  # type: ignore[return-value]
