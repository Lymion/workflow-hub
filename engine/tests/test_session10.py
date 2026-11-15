"""Session 10: run panel (builds, uploads, dev servers) and the serial monitor."""
from __future__ import annotations

import os
import queue
import shutil
import stat
import sys
import time
from pathlib import Path

import pytest

from engine import runner
from engine.routes import cart

from .conftest import make_fake_tool

FAKE_PIO = """import os, sys
print("Processing esp32dev (platform: espressif32)")
if os.environ.get("FAIL") == "1":
    print("src/main.cpp:12:3: error: 'motorSpeed' was not declared in this scope")
    sys.exit(1)
if len(sys.argv) > 2 and sys.argv[2] == "-t":
    print("Writing at 0x00010000... (100 %)")
print("========== [SUCCESS] Took 3.21 seconds ==========")
"""

FAKE_NPX = """import sys
print("Starting Metro Bundler")
print("Metro waiting on exp://192.168.1.20:8081")
print("Web is waiting on http://localhost:8081")
for line in sys.stdin:
    print("got: " + line.rstrip())
"""


@pytest.fixture()
def fakebin(tmp_path, monkeypatch):
    """A bin folder with fake pio/npx/npm; which() looks there only (real tools are ignored)."""
    d = tmp_path / "bin"
    d.mkdir()
    real_which = shutil.which

    def add(name: str, script: str = ""):
        make_fake_tool(d, name, script)

    monkeypatch.setattr(cart, "BACKGROUND_SYNC", True)
    monkeypatch.setattr(shutil, "which", lambda name, *a, **k: real_which(name, path=str(d)))
    return add


def wait(fn, timeout=10.0):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v:
            return v
        time.sleep(0.05)
    raise AssertionError("timed out")


def rover(client):
    return client.post("/projects", json={"name": "Rover-02", "module": "robotics", "board": "esp32-devkit"}).json()


def finished(client, pid, target):
    return wait(lambda: (r := client.get(f"/projects/{pid}/run/{target}/log").json())["state"] not in ("starting", "running") and r)


# ---------- targets ----------

def test_robotics_targets_without_pio_show_fix(client, fakebin):
    p = rover(client)
    ts = client.get(f"/projects/{p['id']}/run").json()["targets"]
    assert [t["id"] for t in ts] == ["build", "upload", "serial"]
    build = ts[0]
    assert not build["available"] and "pip install platformio" in build["fix"]
    assert ts[2]["available"] and ts[2]["baud"] == 115200
    r = client.post(f"/projects/{p['id']}/run/build")
    assert r.status_code == 424 and "platformio" in r.json()["detail"]


def test_unknown_target_lists_the_real_ones(client, fakebin):
    p = rover(client)
    r = client.post(f"/projects/{p['id']}/run/deploy")
    assert r.status_code == 404 and "build, upload, serial" in r.json()["detail"]


def test_app_targets_need_setup_first(client, fakebin):
    fakebin("npm")
    fakebin("npx", FAKE_NPX)
    p = client.post("/projects", json={"name": "Budget Buddy", "module": "app-dev", "stack": ["expo"]}).json()
    ts = client.get(f"/projects/{p['id']}/run").json()["targets"]
    assert [t["id"] for t in ts] == ["dev", "emulator", "build"]
    assert all("Set up app" in t["fix"] for t in ts)


# ---------- processes ----------

def test_build_runs_and_logs(client, fakebin):
    fakebin("pio", FAKE_PIO)
    p = rover(client)
    r = client.post(f"/projects/{p['id']}/run/build")
    assert r.status_code == 200, r.text
    done = finished(client, p["id"], "build")
    assert done["state"] == "exited" and done["code"] == 0
    texts = [l["text"] for l in done["lines"]]
    assert texts[0].endswith(" run") and any("[SUCCESS]" in t for t in texts)
    later = client.get(f"/projects/{p['id']}/run/build/log?after={done['lines'][-2]['seq']}").json()["lines"]
    assert len(later) == 1


def test_failed_build_shows_past_fix(client, fakebin, monkeypatch):
    fakebin("pio", FAKE_PIO)
    monkeypatch.setenv("FAIL", "1")
    p = rover(client)
    client.post("/errors", json={"error_text": "src/main.cpp:40:3: error: 'motorSpeed' was not declared in this scope",
                                 "cause": "Variable declared inside setup()", "fix": "Move it above setup()."})
    client.post(f"/projects/{p['id']}/run/build")
    done = finished(client, p["id"], "build")
    assert done["state"] == "failed" and done["code"] == 1
    assert done["past_errors"] and done["past_errors"][0]["fix"] == "Move it above setup()."
    assert "motorSpeed" in done["error_text"]


def test_dev_server_send_stop_and_no_double_start(client, fakebin):
    fakebin("npm")
    fakebin("npx", FAKE_NPX)
    p = client.post("/projects", json={"name": "Budget Buddy", "module": "app-dev", "stack": ["expo"]}).json()
    (Path(p["path"]) / "package.json").write_text('{"scripts": {}}')
    assert client.post(f"/projects/{p['id']}/run/dev").status_code == 200
    wait(lambda: any("localhost:8081" in l["text"] for l in client.get(f"/projects/{p['id']}/run/dev/log").json()["lines"]))
    again = client.post(f"/projects/{p['id']}/run/dev")
    assert again.status_code == 409 and "already running" in again.json()["detail"]
    assert client.post(f"/projects/{p['id']}/run/dev/send", json={"text": "r"}).status_code == 200
    wait(lambda: any(l["text"] == "got: r" for l in client.get(f"/projects/{p['id']}/run/dev/log").json()["lines"]))
    client.post(f"/projects/{p['id']}/run/dev/stop")
    done = finished(client, p["id"], "dev")
    assert done["state"] == "stopped"
    t = next(t for t in client.get(f"/projects/{p['id']}/run").json()["targets"] if t["id"] == "dev")
    assert t["proc"]["state"] == "stopped"


def test_ansi_and_carriage_returns_are_cleaned():
    p = runner.Proc("x:y", "t", "task")
    p.add("\x1b[32mgreen\x1b[0m\rprogress 50%\rprogress 100%")
    assert [l["text"] for l in p.log()] == ["green", "progress 50%", "progress 100%"]


# ---------- serial ----------

class FakeSerial:
    def __init__(self, lines: list[bytes]):
        self.q: queue.Queue[bytes] = queue.Queue()
        for l in lines:
            self.q.put(l)
        self.written = b""
        self.closed = False

    @property
    def in_waiting(self):
        return self.q.qsize()

    def read(self, n=1):
        if self.closed:
            raise OSError("closed")
        try:
            return self.q.get(timeout=0.05)
        except queue.Empty:
            return b""

    def write(self, data):
        self.written += data
        self.q.put(b"echo " + data)

    def close(self):
        self.closed = True


@pytest.fixture()
def serial_hub(hub):
    opened = []

    def factory(device, baud):
        s = FakeSerial([b"boot ok\r\n", b"left:120 right:98\n"])
        opened.append((device, baud, s))
        return s

    hub.serial_factory = factory
    hub.serial_ports = lambda: [{"device": "/dev/ttyUSB0", "description": "CP2102 USB to UART", "likely": True}]
    return opened


def test_serial_monitor_reads_and_sends(client, fakebin, serial_hub):
    p = rover(client)
    r = client.post(f"/projects/{p['id']}/run/serial", json={})
    assert r.status_code == 200, r.text
    assert serial_hub[0][:2] == ("/dev/ttyUSB0", 115200)
    wait(lambda: any(l["text"] == "left:120 right:98" for l in client.get(f"/projects/{p['id']}/run/serial/log").json()["lines"]))
    client.post(f"/projects/{p['id']}/run/serial/send", json={"text": "speed 200"})
    assert serial_hub[0][2].written == b"speed 200\n"
    wait(lambda: any(l["text"] == "echo speed 200" for l in client.get(f"/projects/{p['id']}/run/serial/log").json()["lines"]))
    client.post(f"/projects/{p['id']}/run/serial/stop")
    assert serial_hub[0][2].closed


def test_upload_pauses_and_resumes_serial(client, fakebin, serial_hub):
    fakebin("pio", FAKE_PIO)
    p = rover(client)
    client.post(f"/projects/{p['id']}/run/serial", json={"port": "/dev/ttyUSB0", "baud": 9600})
    client.post(f"/projects/{p['id']}/run/upload", json={"port": "/dev/ttyUSB0"})
    assert serial_hub[0][2].closed  # port freed for the upload
    done = finished(client, p["id"], "upload")
    assert any("--upload-port /dev/ttyUSB0" in l["text"] for l in done["lines"])
    wait(lambda: len(serial_hub) == 2)
    assert serial_hub[1][:2] == ("/dev/ttyUSB0", 9600)
    assert client.get(f"/projects/{p['id']}/run/serial/log").json()["state"] == "running"


def test_no_board_plugged_in(client, fakebin, hub):
    hub.serial_ports = lambda: []
    p = rover(client)
    r = client.post(f"/projects/{p['id']}/run/serial", json={})
    assert r.status_code == 409 and "data cable" in r.json()["detail"]


def test_ports_endpoint(client, serial_hub):
    assert client.get("/serial/ports").json()[0]["device"] == "/dev/ttyUSB0"
