"""Session 3: snippet library with tags, search and quick capture."""
from __future__ import annotations

import json


def test_seed_library_is_indexed(client):
    rows = client.get("/snippets").json()
    slugs = {r["slug"] for r in rows}
    assert {"sensors/hc-sr04-read", "motors/differential-drive", "timing/non-blocking-every", "ui/pressable-scale", "data/supabase-client"} <= slugs


def test_search_by_tag(client):
    rows = client.get("/snippets", params={"tag": "l298n"}).json()
    assert [r["slug"] for r in rows] == ["motors/differential-drive"]
    rows = client.get("/snippets", params=[("tag", "esp32"), ("tag", "sensor")]).json()
    assert [r["slug"] for r in rows] == ["sensors/hc-sr04-read"]


def test_search_by_words_ranks_title_first(client):
    rows = client.get("/snippets", params={"q": "ultrasonic distance"}).json()
    assert rows[0]["slug"] == "sensors/hc-sr04-read"
    assert client.get("/snippets", params={"q": "zzz-not-here"}).json() == []


def test_read_snippet_has_change_points(client):
    s = client.get("/snippets/sensors/hc-sr04-read").json()
    assert s["language"] == "cpp" and "pulseIn" in s["code"]
    assert [c["line"] for c in s["change_points"]] and "PING_EVERY_MS" in s["code"]
    assert "CHANGE:" not in s["change_points"][0]["text"]


def test_tag_counts(client):
    counts = {t["tag"]: t["count"] for t in client.get("/snippets/tags").json()}
    assert counts["esp32"] >= 3 and counts["expo"] == 2


def test_save_to_library_writes_folder(client, hub_root):
    r = client.post("/snippets", json={"title": "Median of three", "category": "Filters", "code": "int median3(int a,int b,int c){return max(min(a,b),min(max(a,b),c));}", "language": "cpp", "tags": ["Filter", "sensor"]})
    assert r.status_code == 201
    folder = hub_root / "snippets" / "filters" / "median-of-three"
    assert (folder / "snippet.cpp").is_file() and (folder / "README.md").is_file()
    assert json.loads((folder / "tags.json").read_text())["tags"] == ["filter", "sensor"]
    assert client.get("/snippets", params={"q": "median"}).json()[0]["slug"] == "filters/median-of-three"


def test_quick_capture_goes_to_inbox_then_files(client, hub_root):
    r = client.post("/snippets/capture", json={"code": "#include <Wire.h>\nvoid scan(){ Wire.begin(); }", "note": "I2C scanner from forum"})
    cap = r.json()
    assert cap["inbox"] and cap["language"] == "cpp" and cap["slug"].startswith("_inbox/")
    inbox = client.get("/snippets", params={"inbox": True}).json()
    assert [s["slug"] for s in inbox] == [cap["slug"]]
    cat, name = cap["slug"].split("/")
    filed = client.post(f"/snippets/{cat}/{name}/file", json={"category": "sensors", "title": "I2C scanner", "tags": ["i2c", "debug"]}).json()
    assert filed["slug"] == "sensors/i2c-scanner" and filed["tags"] == ["debug", "i2c"] and not filed["inbox"]
    assert client.get("/snippets", params={"inbox": True}).json() == []
    assert not (hub_root / "snippets" / cat / name).exists()


def test_found_and_inserted_in_two_clicks(client):
    """Spec 'done when': search finds a snippet by tag or words; one more call gets its code."""
    hit = client.get("/snippets", params={"q": "supabase"}).json()[0]
    code = client.get(f"/snippets/{hit['slug']}").json()["code"]
    assert "createClient" in code


def test_snippets_used_by_project(client):
    p = client.post("/projects", json={"name": "Rover-01", "module": "robotics"}).json()
    assert client.post(f"/projects/{p['id']}/snippets", json={"slug": "sensors/hc-sr04-read"}).status_code == 201
    used = client.get(f"/projects/{p['id']}/snippets").json()
    assert used[0]["slug"] == "sensors/hc-sr04-read" and used[0]["title"] == "HC-SR04 non-blocking read"


def test_path_traversal_is_refused(client):
    assert client.get("/snippets/..%2F..%2Fengine/app.py").status_code == 404
    assert client.delete("/snippets/../engine").status_code in (404, 405)


def test_delete_snippet(client, hub_root):
    client.post("/snippets", json={"title": "Temp", "category": "misc", "code": "x"})
    assert client.delete("/snippets/misc/temp").status_code == 204
    assert not (hub_root / "snippets" / "misc" / "temp").exists()
