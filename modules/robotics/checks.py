"""Robotics checks: pins, voltage, current and power. Plain code, no tokens.

run(board, assignments, parts) -> list of findings. Every finding names the part,
the problem and the fix, so the UI can show it in one line.

board        a board file (modules/robotics/boards/*.yaml) as a dict
assignments  [{signal, part, part_title, part_pin, mode, voltage, gpio, divider}]
parts        [{key, title, qty, meta}]  meta = the part's handbook setup block
"""
from __future__ import annotations

OUTPUT_MODES = {"OUTPUT", "PWM"}
ANALOG_MODES = {"ANALOG"}


def _finding(level: str, part: str, problem: str, fix: str, **extra) -> dict:
    return {"level": level, "part": part, "problem": problem, "fix": fix, "message": f"{part}: {problem}. {fix}", **extra}


def _pin(board: dict, pin_id: str) -> dict | None:
    return next((p for p in board.get("pins", []) if p["id"] == str(pin_id)), None)


def suitable(board: dict, mode: str, pin: dict) -> bool:
    caps = set(pin.get("caps", []))
    if mode in OUTPUT_MODES and (pin.get("input_only") or "output" not in caps):
        return False
    if mode == "PWM" and "pwm" not in caps:
        return False
    if mode in ANALOG_MODES and not caps & {"adc1", "adc2"}:
        return False
    return not pin.get("reserved") and pin.get("strapping") is None


def suggest(board: dict, mode: str, used: set[str]) -> str | None:
    """First free pin that suits the mode and has no boot or serial catches.
    Signals that aren't I2C keep off the board's SDA/SCL pins (I2C parts share those) unless nothing else is left."""
    bus = set() if (mode or "").upper() == "I2C" else {str(v) for v in board.get("i2c", {}).values()}
    for avoid_bus in (True, False):
        for p in board.get("pins", []):
            if p["id"] not in used and suitable(board, mode, p) and not (avoid_bus and p["id"] in bus):
                return p["id"]
    return None


def _label(board: dict, pin_id: str) -> str:
    p = _pin(board, pin_id)
    return p["label"] if p else f"pin {pin_id}"


def pin_checks(board: dict, assignments: list[dict]) -> list[dict]:
    out: list[dict] = []
    used = {str(a["gpio"]) for a in assignments if a.get("gpio") not in (None, "")}
    by_pin: dict[str, list[dict]] = {}
    logic = float(board.get("logic_voltage", 3.3))
    i2c_pins = set(board.get("i2c", {}).values())
    for a in assignments:
        gpio = a.get("gpio")
        name = f"{a.get('part_title') or a['part']} {a['part_pin']}"
        if gpio in (None, ""):
            free = suggest(board, a.get("mode", "OUTPUT"), used)
            out.append(_finding("warn", name, "isn't connected to a pin yet", f"Pick a pin{f', like {_label(board, free)}' if free else ''}.", signal=a["signal"]))
            continue
        gpio = str(gpio)
        by_pin.setdefault(gpio, []).append(a)
        pin = _pin(board, gpio)
        mode = (a.get("mode") or "OUTPUT").upper()
        if not pin:
            out.append(_finding("bad", name, f"uses pin {gpio}, which {board['name']} doesn't have on its headers", "Pick a pin from the board's list.", signal=a["signal"], gpio=gpio))
            continue
        alt = suggest(board, mode, used)
        alt_txt = f"Move it to {_label(board, alt)}." if alt else "Move it to another pin."
        caps = set(pin.get("caps", []))
        if mode in OUTPUT_MODES and (pin.get("input_only") or "output" not in caps):
            out.append(_finding("bad", name, f"needs an output but {pin['label']} is input-only", alt_txt, signal=a["signal"], gpio=gpio))
            continue
        if mode == "PWM" and "pwm" not in caps:
            out.append(_finding("bad", name, f"needs PWM but {pin['label']} can't do PWM", alt_txt, signal=a["signal"], gpio=gpio))
        if mode in ANALOG_MODES and not caps & {"adc1", "adc2"}:
            out.append(_finding("bad", name, f"needs an analog input but {pin['label']} has no ADC", alt_txt, signal=a["signal"], gpio=gpio))
        if mode in ANALOG_MODES and "adc2" in caps and "adc1" not in caps and board.get("wireless"):
            out.append(_finding("warn", name, f"reads analog on {pin['label']} (ADC2), which stops working while Wi-Fi is on", "Use an ADC1 pin (32–39) if the robot uses Wi-Fi.", signal=a["signal"], gpio=gpio))
        if mode == "I2C" and i2c_pins and gpio not in i2c_pins:
            out.append(_finding("warn", name, f"is on {pin['label']} but the board's I2C pins are SDA {board['i2c']['sda']} / SCL {board['i2c']['scl']}", "Use the default I2C pins, or call Wire.begin(sda, scl) in code.", signal=a["signal"], gpio=gpio))
        if pin.get("reserved"):
            out.append(_finding("bad", name, f"uses {pin['label']}, which the {pin['reserved']} needs", alt_txt, signal=a["signal"], gpio=gpio))
        if pin.get("strapping") == "bad":
            out.append(_finding("bad", name, f"is on {pin['label']}, a strapping pin that can stop boot", alt_txt, signal=a["signal"], gpio=gpio))
        elif pin.get("strapping") == "warn":
            out.append(_finding("warn", name, f"is on {pin['label']}, a strapping pin that blips at boot", f"Fine for most outputs; {alt_txt.lower()} if it must stay still at power-up.", signal=a["signal"], gpio=gpio))
        volt = str(a.get("voltage") or "")
        if mode.startswith("INPUT") and volt.startswith("5") and logic < 4.5 and not a.get("divider"):
            out.append(_finding("warn", name, f"outputs 5V into {pin['label']} ({logic:g}V)", "Add a 1k/2k voltage divider.", signal=a["signal"], gpio=gpio))
    role = {str(v): k.upper() for k, v in board.get("i2c", {}).items()}
    for gpio, users in by_pin.items():
        if len(users) < 2:
            continue
        on_bus = [u for u in users if (u.get("mode") or "").upper() == "I2C"]
        others = [u for u in users if (u.get("mode") or "").upper() != "I2C"]
        if not others:
            continue  # I2C parts sharing SDA/SCL is how the bus works
        if on_bus:
            # a plain signal sitting on the shared I2C pin: only that signal has to move
            bus = ", ".join(dict.fromkeys(u.get("part_title") or u["part"] for u in on_bus))
            for u in others:
                free = suggest(board, (u.get("mode") or "OUTPUT").upper(), used)
                what = f"the I2C {role[gpio]} pin" if gpio in role else "an I2C pin"
                out.append(_finding("bad", f"{u.get('part_title') or u['part']} {u['part_pin']}", f"is on {_label(board, gpio)}, {what} that {bus} share{'s' if len(on_bus) == 1 else ''}",
                                    f"Move it{f' to {_label(board, free)}' if free else ' to a free pin'}; the I2C parts stay.", signal=u["signal"], gpio=gpio))
            continue
        names = " and ".join(f"{u.get('part_title') or u['part']} {u['part_pin']}" for u in others)
        free = suggest(board, others[-1].get("mode", "OUTPUT"), used)
        out.append(_finding("bad", names, f"share {_label(board, gpio)}", f"Move one of them{f' to {_label(board, free)}' if free else ''}.", gpio=gpio))
    return out


def part_checks(board: dict, parts: list[dict]) -> list[dict]:
    out: list[dict] = []
    keys = {p["key"] for p in parts}
    motors = [p for p in parts if p["meta"].get("stall_ma") and p["meta"].get("category") == "actuator" and "MOTOR" in {x.get("mode") for x in p["meta"].get("pins", [])}]
    drivers = [p for p in parts if p["meta"].get("max_current_ma")]
    servos = [p for p in parts if p["key"] in {"sg90", "mg996r"} or "servo" in p["title"].lower()]
    supplies = [p for p in parts if p["meta"].get("category") == "power"]
    if motors and not drivers:
        names = ", ".join(m["title"] for m in motors)
        out.append(_finding("bad", names, "can't run from a GPIO pin", "Add a motor driver such as the L298N."))
    for d in drivers:
        limit = int(d["meta"]["max_current_ma"])
        for m in motors:
            stall = int(m["meta"]["stall_ma"])
            if stall > limit:
                out.append(_finding("bad", m["title"], f"can pull {stall / 1000:.1f} A at stall, more than {d['title']}'s {limit / 1000:.1f} A per channel", "Use a bigger driver or smaller motors."))
            else:
                out.append(_finding("ok", d["title"], f"{limit / 1000:.1f} A per channel covers {m['title']} stall {stall / 1000:.1f} A", "Nothing to do."))
    if (motors or servos) and not supplies:
        out.append(_finding("warn", (motors or servos)[0]["title"], "needs its own power, or the board will brown out when it starts", "Add a battery pack such as the 18650 2S."))
    if "mg996r" in keys and "lm2596" not in keys:
        out.append(_finding("warn", "MG996R servo", "wants a steady 5–6V at up to 2.5 A", "Add a buck converter (LM2596) set to 5V."))
    addrs: dict[str, list[str]] = {}
    for p in parts:
        a = p["meta"].get("i2c_address")
        if a:
            addrs.setdefault(str(a), []).append(p["title"])
    for a, names in addrs.items():
        if len(names) > 1:
            out.append(_finding("bad", " and ".join(names), f"both use I2C address {a}", "Change one module's address jumper, or use an I2C multiplexer."))
    if len([1 for v in addrs.values()]) > 1 and not any(len(v) > 1 for v in addrs.values()):
        out.append(_finding("ok", "I2C parts", f"share SDA {board.get('i2c', {}).get('sda')} / SCL {board.get('i2c', {}).get('scl')} with different addresses", "No extra pins needed."))
    five_v_inputs = [p for p in parts if any(str(x.get("voltage", "")).startswith("5") and str(x.get("mode", "")).startswith("INPUT") for x in p["meta"].get("pins", []))]
    if five_v_inputs and float(board.get("logic_voltage", 3.3)) < 4.5 and "resistor-kit" not in keys:
        out.append(_finding("warn", five_v_inputs[0]["title"], f"sends 5V into a {board.get('logic_voltage', 3.3):g}V board", "Add the resistor kit for a 1k/2k divider."))
    return out


def run(board: dict, assignments: list[dict], parts: list[dict]) -> list[dict]:
    findings = pin_checks(board, assignments) + part_checks(board, parts)
    order = {"bad": 0, "warn": 1, "ok": 2}
    return sorted(findings, key=lambda f: order[f["level"]])
