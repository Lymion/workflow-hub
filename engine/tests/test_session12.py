"""Session 12: wiring view, guide mode, release, automations + weekly review, hub health, VS Code extension."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from engine.routes import cart


@pytest.fixture(autouse=True)
def inline(monkeypatch):
    monkeypatch.setattr(cart, "BACKGROUND_SYNC", True)


def rover(client, parts=(("l298n", 1), ("hc-sr04", 1))):
    p = client.post("/projects", json={"name": "Rover-02", "module": "robotics", "board": "esp32-devkit"}).json()
    client.post(f"/projects/{p['id']}/parts", json={"items": [{"key": k, "qty": q} for k, q in parts]})
    return p


# ---------- wiring view ----------

def test_wiring_has_board_drawing_info_and_wires(client):
    p = rover(client)
    w = client.get(f"/projects/{p['id']}/wiring").json()
    assert w["board"]["wokwi"]["element"] == "wokwi-esp32-devkit-v1"
    assert w["board"]["header"]["left"][0] == "36"
    sigs = {x["signalName"]: x for x in w["wiring"]["wires"]}
    assert "SONAR_TRIG" in w["pins_h"] or any("sonar" in s.lower() for s in sigs)


def test_moving_a_wire_rewrites_pins_h(client):
    p = rover(client)
    w = client.get(f"/projects/{p['id']}/wiring").json()["wiring"]
    wires = w["wires"]
    trig = next(x for x in wires if x["partPin"] == "TRIG")
    trig["boardPin"] = "4"
    trig["signalName"] = "frontTrig"
    r = client.put(f"/projects/{p['id']}/wiring", json={"wires": wires})
    assert r.status_code == 200, r.text
    pins_h = (Path(p["path"]) / "include" / "pins.h").read_text()
    assert pins_h.startswith("// AUTO-GENERATED")
    assert any(l.split()[1:3] == ["FRONT_TRIG", "4"] for l in pins_h.splitlines() if l.startswith("#define")), pins_h
    saved = json.loads((Path(p["path"]) / "wiring.json").read_text())
    assert next(x for x in saved["wires"] if x["partPin"] == "TRIG")["boardPin"] == "4"


def test_bad_wire_edits_are_refused_with_fix(client):
    p = rover(client)
    wires = client.get(f"/projects/{p['id']}/wiring").json()["wiring"]["wires"]
    bad_pin = [dict(x) for x in wires]
    bad_pin[0]["boardPin"] = "99"
    r = client.put(f"/projects/{p['id']}/wiring", json={"wires": bad_pin})
    assert r.status_code == 422 and "pin picker" in r.json()["detail"]
    bad_name = [dict(x) for x in wires]
    bad_name[0]["signalName"] = "left motor"
    r = client.put(f"/projects/{p['id']}/wiring", json={"wires": bad_name})
    assert r.status_code == 422 and "leftMotorPWM" in r.json()["detail"]
    dup = [dict(x) for x in wires]
    dup[1]["signalName"] = dup[0]["signalName"]
    assert client.put(f"/projects/{p['id']}/wiring", json={"wires": dup}).status_code == 422


def test_pin_options_rate_every_pin(client):
    p = rover(client)
    wires = client.get(f"/projects/{p['id']}/wiring").json()["wiring"]["wires"]
    ena = next(x for x in wires if x["partPin"] == "ENA")
    r = client.get(f"/projects/{p['id']}/wiring/options", params={"signal": ena["signalName"]}).json()
    opts = {o["id"]: o for o in r["options"]}
    assert opts[str(ena["boardPin"])]["current"]
    assert opts["34"]["level"] == "bad" and "input-only" in opts["34"]["note"]
    assert opts["12"]["level"] == "bad"
    other = next(x for x in wires if x["signalName"] != ena["signalName"] and x.get("boardPin"))
    assert opts[str(other["boardPin"])]["used_by"] == other["signalName"]
    assert any(o["level"] == "ok" for o in r["options"])
