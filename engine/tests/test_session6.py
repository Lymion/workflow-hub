"""Session 6: board files and the pin checker."""
from __future__ import annotations


def check(client, assignments=(), parts=(), board="esp32-devkit"):
    r = client.post("/checks", json={"board": board, "assignments": list(assignments), "parts": [{"key": k, "qty": q} for k, q in parts]})
    assert r.status_code == 200, r.text
    return r.json()["findings"]


def A(signal, part, pin, gpio, **kw):
    return {"signal": signal, "part": part, "part_pin": pin, "gpio": gpio, **kw}


def levels(findings):
    return [(f["level"], f["problem"]) for f in findings]


def test_boards_listed(client):
    ids = {b["board"]: b for b in client.get("/boards").json()}
    assert set(ids) == {"esp32-devkit", "arduino-uno", "arduino-nano", "esp32-c3-mini"}
    assert ids["esp32-devkit"]["pio_board"] == "esp32dev" and ids["esp32-devkit"]["monitor_speed"] == 115200
    b = client.get("/boards/esp32-devkit").json()
    p34 = next(p for p in b["pins"] if p["id"] == "34")
    assert p34["input_only"] and "pwm" not in p34["caps"]
    assert next(p for p in b["pins"] if p["id"] == "12")["strapping"] == "bad"


def test_board_chapters_in_handbook(client):
    toc = client.get("/handbook").json()
    rob = next(p for p in toc["parts"] if p["id"] == "robotics")
    assert "Boards" in [s["title"] for s in rob["sections"]]


def test_clean_wiring_has_no_problems(client):
    f = check(client, [A("leftMotorPWM", "l298n", "ENA", "25"), A("sonarTrig", "hc-sr04", "TRIG", "19"), A("sonarEcho", "hc-sr04", "ECHO", "18", divider=True)])
    assert [x for x in f if x["level"] != "ok"] == []


def test_pin_conflict(client):
    f = check(client, [A("leftMotorPWM", "l298n", "ENA", "25"), A("servoSignal", "sg90", "SIGNAL", "25")])
    bad = [x for x in f if x["level"] == "bad"]
    assert bad and "share GPIO 25" in bad[0]["problem"] and "Move one" in bad[0]["fix"]


def test_input_only_pin(client):
    (f,) = [x for x in check(client, [A("sonarTrig", "hc-sr04", "TRIG", "34")]) if x["level"] == "bad"]
    assert "input-only" in f["problem"] and f["fix"].startswith("Move it to GPIO")
    assert f["part"] == "HC-SR04 ultrasonic sensor TRIG"


def test_strapping_pins(client):
    f = check(client, [A("servoSignal", "sg90", "SIGNAL", "12")])
    assert ("bad", "is on GPIO 12, a strapping pin that can stop boot") in levels(f)
    f = check(client, [A("led", "buzzer", "SIG", "2")])
    assert any(x["level"] == "warn" and "blips at boot" in x["problem"] for x in f)


def test_voltage_mismatch(client):
    f = check(client, [A("sonarEcho", "hc-sr04", "ECHO", "18")])
    w = next(x for x in f if "5V" in x["problem"])
    assert w["level"] == "warn" and "divider" in w["fix"] and w["part"].startswith("HC-SR04")
    # 5V board: no warning
    assert not [x for x in check(client, [A("sonarEcho", "hc-sr04", "ECHO", "2")], board="arduino-uno") if "5V" in x["problem"]]


def test_pwm_capability_on_uno(client):
    f = check(client, [A("leftMotorPWM", "l298n", "ENA", "4")], board="arduino-uno")
    assert any("can't do PWM" in x["problem"] for x in f)


def test_usb_serial_pins_reserved(client):
    f = check(client, [A("leftMotorIN1", "l298n", "IN1", "1")])
    assert any("USB serial" in x["problem"] for x in f)


def test_unknown_pin(client):
    f = check(client, [A("x", "buzzer", "SIG", "40")])
    assert f[0]["level"] == "bad" and "doesn't have" in f[0]["problem"]


def test_driver_current_and_power(client):
    f = check(client, parts=[("tt-motor", 2), ("l298n", 1), ("18650-2s-bms", 1)])
    assert ("ok", "2.0 A per channel covers TT gear motor stall 1.5 A") in levels(f)
    f = check(client, parts=[("tt-motor", 2)])
    assert any(x["level"] == "bad" and "GPIO pin" in x["problem"] for x in f)
    assert any(x["level"] == "warn" and "own power" in x["problem"] for x in f)
    f = check(client, parts=[("mg996r", 1), ("18650-2s-bms", 1)])
    assert any("buck converter" in x["fix"] for x in f)


def test_five_volt_parts_need_divider_kit(client):
    f = check(client, parts=[("hc-sr04", 1)])
    assert any("resistor kit" in x["fix"] for x in f)
    assert not any("resistor kit" in x["fix"] for x in check(client, parts=[("hc-sr04", 1), ("resistor-kit", 1)]))


def test_i2c_sharing(client):
    f = check(client, parts=[("mpu6050", 1), ("ssd1306", 1)])
    assert any(x["level"] == "ok" and "share SDA" in x["problem"] for x in f)
    f = check(client, [A("imuSda", "mpu6050", "SDA", "21"), A("oledSda", "ssd1306", "SDA", "21")])
    assert not any(x["level"] == "bad" for x in f)  # I2C pins may be shared


def test_every_finding_names_part_problem_fix(client):
    """Spec 'done when': every warning names the part, the problem and the fix."""
    f = check(client, [A("a", "sg90", "SIGNAL", "12"), A("b", "hc-sr04", "TRIG", "34"), A("c", "hc-sr04", "ECHO", "18"), A("d", "l298n", "ENA", "25"), A("e", "l298n", "IN1", "25")], parts=[("tt-motor", 2), ("mg996r", 1)])
    assert len(f) >= 6
    for x in f:
        assert x["part"] and x["problem"] and x["fix"] and x["message"] == f"{x['part']}: {x['problem']}. {x['fix']}"


def test_suggest_pin(client):
    assert client.get("/boards/esp32-devkit/suggest", params={"mode": "PWM", "used": "4,13"}).json()["pin"] == "14"


def test_unknown_part_and_board(client):
    assert client.post("/checks", json={"board": "esp32-devkit", "parts": [{"key": "flux-capacitor"}]}).status_code == 400
    assert client.post("/checks", json={"board": "pi-pico"}).status_code == 404
