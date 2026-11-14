"""Session 7: project cart, presets and the robotics wizard."""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest


def rover(client, board="esp32-devkit", name="Rover-02"):
    r = client.post("/projects", json={"name": name, "module": "robotics", "board": board})
    assert r.status_code == 201, r.text
    return r.json()


def add(client, pid, *items):
    r = client.post(f"/projects/{pid}/parts", json={"items": [{"key": k, "qty": q} for k, q in items]})
    assert r.status_code == 201, r.text
    return r.json()


# ---------- cart ----------

def test_new_project_has_board_in_cart_and_starter_files(client):
    p = rover(client)
    parts = client.get(f"/projects/{p['id']}/parts").json()
    assert [x["key"] for x in parts["parts"]] == ["esp32-devkit"] and parts["totals"]["need"] == 25
    root = Path(p["path"])
    for f in ("platformio.ini", "include/pins.h", "src/main.cpp", "wiring.json", "PARTS.md", "CLAUDE.md", ".gitignore"):
        assert (root / f).is_file(), f
    tasks = [t["title"] for t in client.get(f"/projects/{p['id']}/tasks").json()]
    assert "Open in VS Code and build (PlatformIO: Build)" in tasks


def test_parts_costs_and_status(client):
    p = rover(client)
    body = add(client, p["id"], ("l298n", 1), ("tt-motor", 2), ("hc-sr04", 1))
    t = body["totals"]
    assert t["total"] == 25 + 8 + 10 + 5 and t["need"] == t["total"]
    row = next(x for x in body["parts"] if x["key"] == "tt-motor")
    body = client.patch(f"/project-parts/{row['id']}", json={"status": "have"}).json()
    assert body["totals"]["have"] == 10 and body["totals"]["need"] == 38
    body = add(client, p["id"], ("tt-motor", 1))
    assert next(x for x in body["parts"] if x["key"] == "tt-motor")["qty"] == 3
    assert client.patch(f"/project-parts/{row['id']}", json={"status": "lost"}).status_code == 400
    assert client.delete(f"/project-parts/{row['id']}").status_code == 204
    assert "tt-motor" not in [x["key"] for x in client.get(f"/projects/{p['id']}/parts").json()["parts"]]


def test_unknown_part_rejected(client):
    p = rover(client)
    r = client.post(f"/projects/{p['id']}/parts", json={"items": [{"key": "warp-core"}]})
    assert r.status_code == 400 and "handbook" in r.json()["detail"]


def test_presets(client):
    names = {x["preset"]: x for x in client.get("/presets", params={"module": "robotics"}).json()}
    assert {"2wd-obstacle-robot", "line-follower"} <= set(names)
    p = rover(client)
    body = client.post(f"/projects/{p['id']}/presets/2wd-obstacle-robot").json()
    keys = {x["key"]: x["qty"] for x in body["parts"]}
    assert keys["tt-motor"] == 2 and keys["l298n"] == 1 and "hc-sr04" in keys


# ---------- wizard output ----------

def test_generated_files_follow_the_cart(client):
    p = rover(client)
    client.post(f"/projects/{p['id']}/presets/2wd-obstacle-robot")
    root = Path(p["path"])
    ini = (root / "platformio.ini").read_text()
    assert ini.startswith("; AUTO-GENERATED") and "board = esp32dev" in ini and "monitor_speed = 115200" in ini
    assert "madhephaestus/ESP32Servo" in ini  # SG90 on ESP32
    pins = (root / "include" / "pins.h").read_text()
    assert pins.startswith("// AUTO-GENERATED") and "#pragma once" in pins
    defines = dict(re.findall(r"#define (\w+)\s+(\S+)", pins))
    assert {"LEFT_MOTOR_PWM", "SONAR_TRIG", "SONAR_ECHO", "SERVO_SIGNAL"} <= set(defines)
    assert len(set(defines.values())) == len(defines)  # no pin used twice
    assert not {"0", "1", "3", "12", "34", "35", "36", "39"} & set(defines.values())  # no strapping/serial/input-only for outputs
    assert "via 1k/2k divider" in pins  # resistor kit in the preset
    wiring = json.loads((root / "wiring.json").read_text())
    assert wiring["board"] == "esp32-devkit" and {"part", "partPin", "boardPin", "signalName"} <= set(wiring["wires"][0])
    assert "| **Total** |" in (root / "PARTS.md").read_text()


def test_clean_preset_has_no_bad_checks(client):
    p = rover(client)
    client.post(f"/projects/{p['id']}/presets/2wd-obstacle-robot")
    s = client.get(f"/projects/{p['id']}/checks").json()["summary"]
    assert s["bad"] == 0


def test_main_cpp_is_written_once_and_never_changed(client):
    p = rover(client)
    main = Path(p["path"]) / "src" / "main.cpp"
    main.write_text("// my own code\n")
    add(client, p["id"], ("buzzer", 1))
    r = client.post(f"/projects/{p['id']}/setup", json={"run_pio": False, "run_git": False}).json()
    assert main.read_text() == "// my own code\n"
    assert {"file": "src/main.cpp", "status": "kept"} in r["files"]


def test_user_owned_file_is_never_overwritten(client):
    p = rover(client)
    ini = Path(p["path"]) / "platformio.ini"
    ini.write_text("[env:custom]\nboard = esp32dev\n")  # no AUTO-GENERATED marker: the user's file
    r = client.post(f"/projects/{p['id']}/setup", json={"run_pio": False, "run_git": False}).json()
    assert {"file": "platformio.ini", "status": "skipped"} in r["files"]
    assert ini.read_text().startswith("[env:custom]")


def test_main_cpp_compiles_structure(client):
    p = rover(client)
    client.post(f"/projects/{p['id']}/presets/2wd-obstacle-robot")
    shutil.rmtree(Path(p["path"]) / "src")
    client.post(f"/projects/{p['id']}/setup", json={"run_pio": False, "run_git": False})
    main = (Path(p["path"]) / "src" / "main.cpp").read_text()
    assert '#include "pins.h"' in main and "void setupPins()" in main and "Serial.begin(115200)" in main
    assert "millis()" in main and "delay(" not in main.replace("never use delay()", "")
    assert "pinMode(LEFT_MOTOR_PWM, OUTPUT);" in main and "pinMode(SONAR_ECHO, INPUT);" in main


def test_board_change_rewires(client):
    p = rover(client)
    add(client, p["id"], ("l298n", 1))
    client.patch(f"/projects/{p['id']}", json={"board": "arduino-uno"})
    client.post(f"/projects/{p['id']}/setup", json={"run_pio": False, "run_git": False})
    pins = (Path(p["path"]) / "include" / "pins.h").read_text()
    defines = dict(re.findall(r"#define (\w+)\s+(\S+)", pins))
    assert defines["LEFT_MOTOR_PWM"] in {"3", "5", "6", "9", "10", "11"}  # Uno PWM pins only
    assert "board = uno" in (Path(p["path"]) / "platformio.ini").read_text()


def test_wiring_edit_regenerates_pins_h(client):
    """Spec 'done when' for the wiring view: changing a wire updates pins.h."""
    p = rover(client)
    add(client, p["id"], ("sg90", 1), ("18650-2s-bms", 1))
    w = client.get(f"/projects/{p['id']}/wiring").json()["wiring"]["wires"]
    servo = next(x for x in w if x["signalName"] == "servoSignal")
    servo["boardPin"] = "12"
    r = client.put(f"/projects/{p['id']}/wiring", json={"wires": w}).json()
    assert re.search(r"#define SERVO_SIGNAL\s+12", r["pins_h"])
    assert any("strapping" in f["problem"] for f in r["findings"] if f["level"] == "bad")
    servo["boardPin"] = "13"
    r = client.put(f"/projects/{p['id']}/wiring", json={"wires": w}).json()
    assert re.search(r"#define SERVO_SIGNAL\s+13", r["pins_h"]) and r["summary"]["bad"] == 0


def test_setup_status_lists_tools(client):
    p = rover(client)
    s = client.get(f"/projects/{p['id']}/setup").json()
    ids = [i["id"] for i in s["items"]]
    assert s["available"] and {"vscode", "platformio-ext", "pio", "git", "driver"} <= set(ids)
    assert all(i["fix"] for i in s["items"] if i["ok"] is False)


def test_git_initialised(client):
    if not shutil.which("git"):
        pytest.skip("git not installed")
    p = rover(client)
    assert (Path(p["path"]) / ".git").is_dir()


def test_app_project_has_no_robotics_files(client):
    p = client.post("/projects", json={"name": "Kedai", "module": "app-dev"}).json()
    assert not (Path(p["path"]) / "platformio.ini").exists()
    files = [f["file"] for f in client.get(f"/projects/{p['id']}/setup").json()["files"]]
    assert "platformio.ini" not in files and "include/pins.h" not in files


@pytest.mark.skipif(not shutil.which("pio"), reason="PlatformIO not installed")
def test_fresh_esp32_project_builds(client):
    """Spec 'done when': a fresh ESP32 project builds with zero manual edits."""
    p = rover(client)
    client.post(f"/projects/{p['id']}/presets/2wd-obstacle-robot")
    r = subprocess.run(["pio", "run"], cwd=p["path"], capture_output=True, text=True, timeout=900)
    assert r.returncode == 0, r.stdout[-2000:] + r.stderr[-2000:]
