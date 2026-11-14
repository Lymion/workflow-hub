"""Session 4: error log + hybrid search (FTS5 + optional embeddings)."""
from __future__ import annotations

import hashlib
import sqlite3
import threading

from engine.routes.errors import normalise, similarity
from engine.search import Index

ESP_ERR = "E (312) gpio: gpio_set_level(226): GPIO output gpio_num error\nRebooting... at /home/me/rover/src/main.cpp:48"


# ---------- error log ----------

def test_save_and_list_error(client):
    r = client.post("/errors", json={"error_text": ESP_ERR, "cause": "GPIO 34 is input-only", "fix": "Move TRIG to GPIO 19"})
    assert r.status_code == 201 and r.json()["repeat"] is False
    rows = client.get("/errors").json()
    assert rows[0]["fix"] == "Move TRIG to GPIO 19"


def test_repeated_error_shows_old_fix(client):
    """Spec 'done when': pasting a repeated error shows your old fix."""
    client.post("/errors", json={"error_text": ESP_ERR, "cause": "Input-only pin", "fix": "Move TRIG to GPIO 19"})
    again = "E (877) gpio: gpio_set_level(226): GPIO output gpio_num error\nRebooting... at C:\\Users\\me\\rover2\\src\\main.cpp:51"
    hits = client.post("/errors/match", json={"error_text": again}).json()
    assert hits and hits[0]["fix"] == "Move TRIG to GPIO 19" and hits[0]["similarity"] == 1.0


def test_saving_a_repeat_counts_it(client):
    client.post("/errors", json={"error_text": ESP_ERR, "fix": "Move TRIG"})
    r = client.post("/errors", json={"error_text": ESP_ERR.replace("312", "999")}).json()
    assert r["repeat"] is True and r["seen_count"] == 2 and r["fix"] == "Move TRIG"
    assert len(client.get("/errors").json()) == 1


def test_similar_error_matches(client):
    client.post("/errors", json={"error_text": "fatal error: Adafruit_SSD1306.h: No such file or directory", "fix": "Add adafruit/Adafruit SSD1306 to lib_deps"})
    hits = client.post("/errors/match", json={"error_text": "src/display.cpp:3:10: fatal error: Adafruit_SSD1306.h: No such file or directory"}).json()
    assert hits[0]["fix"].startswith("Add adafruit")


def test_unrelated_error_has_no_match(client):
    client.post("/errors", json={"error_text": ESP_ERR, "fix": "x"})
    assert client.post("/errors/match", json={"error_text": "Metro bundler: Unable to resolve module expo-router"}).json() == []


def test_patch_delete_and_project_link(client):
    p = client.post("/projects", json={"name": "Rover-01", "module": "robotics"}).json()
    e = client.post("/errors", json={"error_text": "Brownout detector was triggered", "project_id": p["id"]}).json()
    assert e["project_name"] == "Rover-01"
    e = client.patch(f"/errors/{e['id']}", json={"cause": "Motors on the same 5V rail", "fix": "Power motors from the 18650 pack"}).json()
    assert client.get("/errors", params={"q": "brownout"}).json()[0]["fix"].startswith("Power motors")
    assert client.delete(f"/errors/{e['id']}").status_code == 204
    assert client.get("/errors").json() == []


def test_normalise_strips_noise():
    assert normalise("at /a/b/main.cpp:48 0x3ffb1f20 took 120ms") == normalise("at C:\\x\\main.cpp:9 0xdeadbeef took 7ms")
    assert similarity("No such file Adafruit_SSD1306.h", "Adafruit_SSD1306.h: No such file or directory") > 0.5


# ---------- shared search ----------

def test_search_spans_kinds(client):
    client.post("/errors", json={"error_text": "pulseIn timeout on ultrasonic ECHO pin", "fix": "Add the 1k/2k divider"})
    body = client.get("/search", params={"q": "ultrasonic"}).json()
    kinds = {r["kind"] for r in body["results"]}
    assert {"snippet", "error"} <= kinds and body["mode"] == "keyword"
    only = client.get("/search", params={"q": "ultrasonic", "kind": "error"}).json()["results"]
    assert {r["kind"] for r in only} == {"error"}


def test_search_falls_back_to_any_word(client):
    res = client.get("/search", params={"q": "supabase zzzzunknown"}).json()["results"]
    assert res and res[0]["ref"] == "data/supabase-client"


def test_new_snippet_is_searchable(client):
    client.post("/snippets", json={"title": "Debounce button", "category": "input", "code": "bool pressed(){}", "tags": ["button"]})
    res = client.get("/search", params={"q": "debounce"}).json()["results"]
    assert res[0]["ref"] == "input/debounce-button"


class FakeEmbedder:
    """Deterministic 'meaning' vectors: shared concept words map to the same dimensions."""

    CONCEPTS = {"distance": 0, "ultrasonic": 0, "sonar": 0, "range": 0, "motor": 1, "wheel": 1, "drive": 1, "login": 2, "auth": 2}

    def embed(self, texts):
        out = []
        for t in texts:
            v = [0.0] * 8
            for w in t.lower().split():
                w = w.strip(".,:")
                if w in self.CONCEPTS:
                    v[self.CONCEPTS[w]] += 1
                else:
                    v[3 + int(hashlib.md5(w.encode()).hexdigest(), 16) % 5] += 0.1
            out.append(v)
        return out


def test_hybrid_finds_meaning_without_shared_words():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    idx = Index(conn, threading.RLock(), embedder_factory=lambda: FakeEmbedder())
    idx.replace_kind("snippet", [("a", "HC-SR04 read", "ultrasonic distance in cm"), ("b", "L298N drive", "motor speed per wheel")])
    res = idx.search("sonar range", ["snippet"])
    assert res and res[0]["ref"] == "a" and res[0]["via"] == ["meaning"]
    both = idx.search("motor wheel", ["snippet"])
    assert both[0]["ref"] == "b" and set(both[0]["via"]) == {"keyword", "meaning"}
    assert idx.mode == "hybrid"
