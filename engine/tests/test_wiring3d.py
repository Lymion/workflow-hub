"""3D wiring view: every board and part carries a drawable model, served with the wiring data."""
from __future__ import annotations

import pytest

from engine.boards import load_boards
from engine.routes.handbook import current

WIREABLE = {"OUTPUT", "INPUT", "INPUT_PULLUP", "PWM", "ANALOG", "I2C"}
NUM = (int, float)


def _shape_ok(sh: dict) -> bool:
    if sh.get("kind") == "cyl":
        return isinstance(sh.get("r"), NUM) and isinstance(sh.get("h"), NUM)
    return all(isinstance(sh.get(k), NUM) for k in ("w", "d", "h"))


def test_every_board_has_a_model_covering_its_header(hub):
    for bid, b in load_boards(hub.paths.root).items():
        m = b.get("model")
        assert m, f"{bid} has no model"
        assert len(m["size"]) == 3 and all(isinstance(v, NUM) for v in m["size"])
        drawn = {str(p) for row in m["rows"] for p in row["pins"]}
        header = {str(p) for side in ("left", "right") for p in (b.get("header") or {}).get(side, [])}
        assert header <= drawn, f"{bid}: header pins missing from the model: {sorted(header - drawn)}"
        assert all(_shape_ok(sh) for sh in m.get("shapes", [])), bid
        for h in m.get("hotspots", []):
            assert h.get("title") and h.get("body") and ("row" in h or all(k in h for k in ("x", "y"))), (bid, h)


def test_every_part_model_anchors_its_wireable_pins(hub):
    hb = current(hub)
    models = 0
    for ch in hb.chapters.values():
        m = ch.meta.get("model")
        if not m:
            continue
        models += 1
        assert m["shapes"] and all(_shape_ok(sh) for sh in m["shapes"]), ch.path
        for p in ch.meta.get("pins") or []:
            if (p.get("mode") or "").upper() in WIREABLE:
                anchor = m["pins"].get(p["name"])
                assert anchor and len(anchor) == 3, f"{ch.path}: no 3D anchor for pin {p['name']}"
    assert models >= 15


def test_models_reach_the_wiring_tab(client):
    p = client.post("/projects", json={"name": "Rover", "module": "robotics", "board": "esp32-devkit"}).json()
    client.post(f"/projects/{p['id']}/parts", json={"items": [{"key": "sg90", "qty": 1}]})
    w = client.get(f"/projects/{p['id']}/wiring").json()
    assert w["board"]["model"]["rows"][1]["pins"][6] == "18"
    parts = client.get(f"/projects/{p['id']}/parts").json()["parts"]
    servo = next(x for x in parts if x["key"] == "sg90")
    assert servo["meta"]["model"]["pins"]["SIGNAL"] == [11.5, 3, 5]
