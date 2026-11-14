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


# ---------- guide mode ----------

def test_guides_listed_per_module(client):
    gs = {g["module"]: g for g in client.get("/handbook/guide").json()}
    assert {"robotics", "app-dev"} <= set(gs)
    q = gs["robotics"]["questions"][0]
    assert q["id"] == "motion" and "Drive on wheels" in q["options"]


def test_robot_answers_rank_the_right_chapters(client):
    r = client.post("/handbook/guide/robotics", json={"answers": {
        "motion": ["Drive on wheels"], "sense": ["Obstacles ahead", "A line on the floor"],
        "power": ["Batteries, it roams free"], "wireless": ["Yes, control it from a phone"]}}).json()
    keys = [x["key"] for x in r["results"]]
    assert {"tt-motor", "l298n", "hc-sr04", "ir-tcrt5000", "esp32-devkit", "18650-2s-bms"} <= set(keys)
    top = r["results"][0]
    assert top["path"].startswith("robotics/") and top["why"]
    assert "sg90" not in keys


def test_app_answers_pick_expo_supabase(client):
    r = client.post("/handbook/guide/app-dev", json={"answers": {"platform": ["On their phone"], "accounts": ["Yes, with accounts and sync"], "ship": ["An APK for Android friends"]}}).json()
    keys = [x["key"] for x in r["results"]]
    assert keys[0] == "expo" and "supabase" in keys[:3] and "eas" in keys


def test_unknown_guide_says_how_to_add_one(client):
    r = client.post("/handbook/guide/business", json={"answers": {}})
    assert r.status_code == 404 and "guide.yaml" in r.json()["detail"]


def test_every_guide_boost_points_at_a_real_chapter(client, hub):
    from engine.routes.guidemode import guides
    from engine.routes.handbook import current
    hb = current(hub)
    for g in guides(hub.paths.root).values():
        for q in g["questions"]:
            for o in q["options"]:
                assert isinstance(o["label"], str) and set(o) <= {"label", "boost"}, f"{g['module']}/{q['id']}: quote labels that contain commas"
                for key in (o.get("boost") or {}):
                    assert hb.by_key(key), f"{g['module']}/{q['id']}: no chapter '{key}'"
