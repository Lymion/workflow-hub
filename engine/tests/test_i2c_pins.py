"""I2C pins: plain signals stay off SDA/SCL, and only a plain signal on the bus pin is told to move."""
from __future__ import annotations

from engine.boards import load_boards, load_checks

BUSY = [{"key": k, "qty": q} for k, q in [("l298n", 1), ("hc-sr04", 1), ("sg90", 2), ("dht22", 1), ("mpu6050", 1), ("ssd1306", 1),
                                           ("buzzer", 1), ("buttons", 3), ("vl53l0x", 1), ("ir-tcrt5000", 1)]]


def test_busy_project_keeps_the_i2c_pins_for_i2c_parts(client):
    p = client.post("/projects", json={"name": "Busy Bot", "module": "robotics", "board": "esp32-devkit"}).json()
    client.post(f"/projects/{p['id']}/parts", json={"items": BUSY})
    wires = client.get(f"/projects/{p['id']}/wiring").json()["wiring"]["wires"]
    on_bus = [w for w in wires if str(w["boardPin"]) in {"21", "22"}]
    assert on_bus and all(w["mode"] == "I2C" for w in on_bus), [(w["part"], w["partPin"], w["boardPin"]) for w in on_bus]
    findings = client.get(f"/projects/{p['id']}/checks").json()["findings"]
    assert not any("share GPIO 21" in f["problem"] or "share GPIO 22" in f["problem"] for f in findings)


def _a(part, pin, gpio, mode, title=None):
    return {"part": part, "part_title": title or part, "part_pin": pin, "gpio": gpio, "mode": mode, "signal": f"{part}{pin}"}


def test_i2c_parts_share_the_bus_without_a_warning(hub):
    board = load_boards(hub.paths.root)["esp32-devkit"]
    checks = load_checks(hub.paths.root, "robotics")
    f = checks.pin_checks(board, [_a("mpu6050", "SDA", "21", "I2C"), _a("ssd1306", "SDA", "21", "I2C"), _a("mpu6050", "SCL", "22", "I2C"), _a("ssd1306", "SCL", "22", "I2C")])
    assert not [x for x in f if x["level"] == "bad"]


def test_plain_signal_on_the_bus_pin_is_the_only_one_told_to_move(hub):
    board = load_boards(hub.paths.root)["esp32-devkit"]
    checks = load_checks(hub.paths.root, "robotics")
    f = checks.pin_checks(board, [_a("mpu6050", "SDA", "21", "I2C", "MPU6050"), _a("ssd1306", "SDA", "21", "I2C", "OLED"), _a("hc-sr04", "ECHO", "21", "INPUT", "HC-SR04")])
    bad = [x for x in f if x["level"] == "bad"]
    assert len(bad) == 1 and bad[0]["part"] == "HC-SR04 ECHO"
    assert "the I2C SDA pin that MPU6050, OLED share" in bad[0]["problem"] and bad[0]["fix"].startswith("Move it to ")
    assert "21" not in bad[0]["fix"] and "22" not in bad[0]["fix"]  # never suggests the other bus pin


def test_suggest_falls_back_to_bus_pins_only_when_nothing_else_is_left(hub):
    board = load_boards(hub.paths.root)["esp32-devkit"]
    checks = load_checks(hub.paths.root, "robotics")
    others = {p["id"] for p in board["pins"] if p["id"] not in {"21", "22"}}
    assert checks.suggest(board, "OUTPUT", set()) not in {"21", "22"}
    assert checks.suggest(board, "OUTPUT", others) in {"21", "22"}
    assert checks.suggest(board, "I2C", set()) is not None
