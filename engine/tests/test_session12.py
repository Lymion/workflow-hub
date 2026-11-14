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


# ---------- release ----------

import base64
import io
import shutil
import stat
import subprocess
import time

from engine import runner


@pytest.fixture()
def gitenv(tmp_path, monkeypatch):
    cfg = tmp_path / "gitconfig"
    cfg.write_text("")
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(cfg))
    monkeypatch.setenv("GIT_CONFIG_NOSYSTEM", "1")
    for k, v in (("GIT_AUTHOR_NAME", "Maker"), ("GIT_COMMITTER_NAME", "Maker"), ("GIT_AUTHOR_EMAIL", "m@example.com"), ("GIT_COMMITTER_EMAIL", "m@example.com")):
        monkeypatch.setenv(k, v)


def expo_app(client, stack=("expo", "eas")):
    p = client.post("/projects", json={"name": "Budget Buddy", "module": "app-dev", "stack": list(stack)}).json()
    root = Path(p["path"])
    (root / "package.json").write_text('{"name": "budget-buddy", "version": "1.2.3"}\n')
    commit(root, "Add package.json")
    return p, root


def commit(root, msg, file=None):
    if file:
        (root / file).write_text(msg + "\n")
    subprocess.run(["git", "add", "-A"], cwd=root, check=True)
    subprocess.run(["git", "commit", "-qm", msg], cwd=root, check=True)


pytestmark_git = pytest.mark.skipif(not shutil.which("git"), reason="git not installed")


@pytestmark_git
def test_release_plan_reads_version_and_drafts_changelog(client, gitenv):
    p, root = expo_app(client)
    commit(root, "Add budget screen", "a.txt")
    commit(root, "Fix crash on empty list", "b.txt")
    commit(root, "Tweak colours", "c.txt")
    plan = client.get(f"/projects/{p['id']}/release").json()
    assert plan["version"] == "1.2.3" and plan["next"] == {"patch": "1.2.4", "minor": "1.3.0", "major": "2.0.0"}
    assert "### Added\n- Add budget screen" in plan["changelog"] and "### Fixed\n- Fix crash on empty list" in plan["changelog"]
    assert "### Changed\n- Tweak colours" in plan["changelog"]
    assert any("app.config.js" in c["problem"] for c in plan["checks"])
    assert plan["build"]["id"] == "build" and plan["build"]["label"] == "Build APK"


@pytestmark_git
def test_release_writes_hub_files_commits_and_tags(client, gitenv):
    p, root = expo_app(client)
    commit(root, "Add budget screen", "a.txt")
    r = client.post(f"/projects/{p['id']}/release", json={"bump": "minor", "notes": "### Added\n- Budget screen"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["version"] == "1.3.0" and body["versionCode"] == 1 and body["tag"] == "v1.3.0"
    rel = json.loads((root / "release.json").read_text())
    assert rel["version"] == "1.3.0" and "AUTO-GENERATED" in rel["_comment"]
    log = (root / "CHANGELOG.md").read_text()
    assert log.startswith("<!-- AUTO-GENERATED") and "## 1.3.0" in log and "- Budget screen" in log
    cfg = (root / "app.config.js").read_text()
    assert "release.json" in cfg and "assets/hub" in cfg
    assert json.loads((root / "package.json").read_text())["version"] == "1.2.3"  # the user's file is untouched
    tags = subprocess.run(["git", "tag"], cwd=root, capture_output=True, text=True).stdout.split()
    assert tags == ["v1.3.0"]
    last = subprocess.run(["git", "log", "-1", "--pretty=%s"], cwd=root, capture_output=True, text=True).stdout.strip()
    assert last == "Release v1.3.0"
    # second release: versionCode goes up, changelog keeps history, app.config.js stays the user's
    (root / "app.config.js").write_text("// mine now\nmodule.exports = ({ config }) => config;\n")
    commit(root, "Customise app config")
    r2 = client.post(f"/projects/{p['id']}/release", json={"bump": "patch", "notes": ""}).json()
    assert r2["version"] == "1.3.1" and r2["versionCode"] == 2
    log = (root / "CHANGELOG.md").read_text()
    assert log.index("## 1.3.1") < log.index("## 1.3.0")
    assert (root / "app.config.js").read_text().startswith("// mine now")


@pytestmark_git
def test_release_refuses_uncommitted_changes(client, gitenv):
    p, root = expo_app(client)
    (root / "app.tsx").write_text("changed\n")
    r = client.post(f"/projects/{p['id']}/release", json={"bump": "patch"})
    assert r.status_code == 409 and "Git tab" in r.json()["detail"]
    assert not (root / "release.json").exists()


def _png(w=800, h=600):
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (w, h), "#FF2D55").save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


@pytestmark_git
def test_icons_from_one_image(client, gitenv):
    from PIL import Image
    p, root = expo_app(client)
    r = client.post(f"/projects/{p['id']}/release/icons", json={"image_base64": _png(), "background": "#101010"})
    assert r.status_code == 200, r.text
    assert {f["status"] for f in r.json()["files"]} == {"wrote"}
    with Image.open(root / "assets/hub/icon.png") as im:
        assert im.size == (1024, 1024) and "AUTO-GENERATED" in im.info["Comment"]
    with Image.open(root / "assets/hub/favicon.png") as im:
        assert im.size == (48, 48)
    assert json.loads((root / "release.json").read_text())["background"] == "#101010"
    # a user's own icon in that folder is left alone
    Image.new("RGB", (10, 10)).save(root / "assets/hub/favicon.png")
    again = {f["file"]: f["status"] for f in client.post(f"/projects/{p['id']}/release/icons", json={"image_base64": _png()}).json()["files"]}
    assert again["assets/hub/favicon.png"] == "skipped" and again["assets/hub/icon.png"] == "wrote"
    bad = client.post(f"/projects/{p['id']}/release/icons", json={"image_base64": base64.b64encode(b"not an image").decode()})
    assert bad.status_code == 422 and "PNG or JPG" in bad.json()["detail"]


@pytestmark_git
def test_release_starts_the_eas_build(client, gitenv, tmp_path, monkeypatch):
    d = tmp_path / "bin"
    d.mkdir()
    for name, script in (("npm", "#!/bin/sh\n"), ("npx", "#!/bin/sh\necho \"eas build $*\"\necho 'Build queued'\n"), ("git", None)):
        if script is None:
            continue
        f = d / name
        f.write_text(script)
        f.chmod(f.stat().st_mode | stat.S_IEXEC)
    real = shutil.which
    monkeypatch.setattr(shutil, "which", lambda n, *a, **k: real(n, path=str(d)) or (real(n, *a, **k) if n == "git" else None))
    p, root = expo_app(client)
    r = client.post(f"/projects/{p['id']}/release", json={"bump": "patch", "build": True}).json()
    assert r["build"]["label"] == "Build APK"
    end = time.time() + 10
    while time.time() < end and runner.get(f"{p['id']}:build").running:
        time.sleep(0.05)
    log = client.get(f"/projects/{p['id']}/run/build/log").json()
    assert any("eas-cli build -p android --profile preview" in l["text"] for l in log["lines"])


def test_robotics_has_no_release(client):
    p = client.post("/projects", json={"name": "Rover", "module": "robotics", "board": "esp32-devkit"}).json()
    assert client.get(f"/projects/{p['id']}/release").status_code == 404
