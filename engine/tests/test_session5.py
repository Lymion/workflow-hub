"""Session 5: handbook loader (markdown + YAML setup blocks), read mode, search."""
from __future__ import annotations


def test_toc_has_three_parts(client):
    body = client.get("/handbook").json()
    titles = [p["title"] for p in body["parts"]]
    assert titles == ["App stacks", "Electronics parts", "My notes"]
    assert body["errors"] == [] and body["count"] >= 30


def test_chapter_read_mode(client):
    ch = client.get("/handbook/chapter/robotics/parts/hc-sr04").json()
    assert ch["title"] == "HC-SR04 ultrasonic sensor" and ch["key"] == "hc-sr04"
    assert ch["meta"]["pins"][1] == {"name": "ECHO", "mode": "INPUT", "voltage": "5V"}
    assert ch["meta"]["price_rm"] == [5, 10] and "voltage divider" in ch["meta"]["warn"]
    assert ch["body"].startswith("# HC-SR04") and "---" not in ch["body"][:5]
    assert ch["editable"] is False and len(ch["related"]) > 0


def test_new_chapter_appears_with_no_code_changes(client, hub_root):
    """Spec 'done when': a new chapter file appears in read mode, search and the picker."""
    f = hub_root / "modules" / "robotics" / "handbook" / "parts" / "pir-sensor.md"
    f.write_text("---\npart: hc-sr501\ncategory: sensor\nprice_rm: [4, 6]\npins:\n  - { name: OUT, mode: INPUT }\n---\n# HC-SR501 motion sensor\n\nDetects people moving up to 7 m away.\n")
    toc = client.get("/handbook").json()
    parts = next(p for p in toc["parts"] if p["id"] == "robotics")
    assert "HC-SR501 motion sensor" in [c["title"] for s in parts["sections"] for c in s["chapters"]]
    assert client.get("/handbook/chapter/robotics/parts/pir-sensor").json()["key"] == "hc-sr501"
    hits = client.get("/search", params={"q": "motion people", "kind": "handbook"}).json()["results"]
    assert hits[0]["ref"] == "robotics/parts/pir-sensor"
    picker = client.get("/handbook/items", params={"part": "robotics", "section": "parts"}).json()
    assert "hc-sr501" in [i["key"] for i in picker]


def test_bad_yaml_reports_one_line_fix(client, hub_root):
    f = hub_root / "modules" / "robotics" / "handbook" / "parts" / "broken.md"
    f.write_text("---\npart: broken\npins: [unclosed\n---\n# Broken\n")
    body = client.get("/handbook").json()
    (err,) = body["errors"]
    assert "broken.md" in err["message"] and "Fix the YAML" in err["message"]
    assert body["count"] >= 30  # the good chapters still load


def test_items_feed_pickers(client):
    stacks = client.get("/handbook/items", params={"part": "app-dev", "section": "stacks"}).json()
    by_key = {s["key"]: s for s in stacks}
    assert by_key["expo"]["meta"]["kind"] == "framework" and "tauri" in by_key["expo"]["meta"]["conflicts"]
    assert by_key["expo-router"]["meta"]["only"] == "expo"


def test_handbook_search(client):
    hits = client.get("/search", params={"q": "strapping boot", "kind": "handbook"}).json()["results"]
    assert hits[0]["ref"] == "notes/esp32-boot-loops"


def test_notes_crud(client, hub_root):
    r = client.post("/handbook/notes", json={"title": "Servo jitter", "body": "Add a 470 µF cap across 5V.", "tags": ["servo"]})
    assert r.status_code == 201 and r.json()["editable"] is True
    assert (hub_root / "handbook" / "notes" / "servo-jitter.md").is_file()
    assert client.post("/handbook/notes", json={"title": "Servo jitter"}).status_code == 409
    r = client.put("/handbook/notes/servo-jitter", json={"title": "Servo jitter", "body": "Use a separate 5V supply."})
    assert "separate 5V" in r.json()["body"]
    assert client.get("/search", params={"q": "jitter", "kind": "handbook"}).json()["results"][0]["ref"] == "notes/servo-jitter"
    assert client.delete("/handbook/notes/servo-jitter").status_code == 204
    assert client.delete("/handbook/notes/..%2Fx").status_code == 404


def test_used_in_projects(client):
    p = client.post("/projects", json={"name": "Rover-01", "module": "robotics", "stack": ["hc-sr04", "l298n"]}).json()
    ch = client.get("/handbook/chapter/robotics/parts/hc-sr04").json()
    assert ch["used_in"] == [{"id": p["id"], "name": "Rover-01"}]


def test_disabled_module_hides_its_handbook(client, hub_root):
    p = hub_root / "modules" / "app-dev" / "module.yaml"
    p.write_text(p.read_text() + "enabled: false\n")
    assert "App stacks" not in [x["title"] for x in client.get("/handbook").json()["parts"]]
