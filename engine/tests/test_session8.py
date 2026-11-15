"""Session 8: docs downloader + chunker, Haiku guide with cards, hint ladder, cache, cost, cap."""
from __future__ import annotations

import json
import time
from types import SimpleNamespace

import httpx
import pytest

from engine import llm
from engine.config import HAIKU_MODEL

PULSEIN_HTML = """<html><head><title>pulseIn() - Arduino Reference</title></head><body>
<nav>Home Docs Store</nav>
<h1 id="pulsein">pulseIn()</h1><p>Reads a pulse (either HIGH or LOW) on a pin. For example, if value is HIGH, pulseIn() waits for the pin to go from LOW to HIGH, starts timing, then waits for the pin to go LOW and stops timing. Returns the length of the pulse in microseconds or gives up and returns 0 if no complete pulse was received within the timeout.</p>
<h2 id="syntax">Syntax</h2><pre>pulseIn(pin, value)
pulseIn(pin, value, timeout)</pre><p>timeout (optional): the number of microseconds to wait for the pulse to start; default is one second.</p>
<script>track()</script><footer>© Arduino</footer></body></html>"""


class FakeClient:
    """Stands in for anthropic.Anthropic: records calls, returns a canned structured answer."""

    def __init__(self, answer: dict | None = None, stop="end_turn", in_tokens=900, out_tokens=220):
        self.calls, self.answer, self.stop = [], answer, stop
        self.in_tokens, self.out_tokens = in_tokens, out_tokens
        self.messages = SimpleNamespace(create=self._create, count_tokens=self._count)

    def _count(self, **kw):
        return SimpleNamespace(input_tokens=self.in_tokens)

    def _create(self, **kw):
        self.calls.append(kw)
        content = [SimpleNamespace(type="thinking", thinking="", signature="x")]
        if self.answer is not None:
            content.append(SimpleNamespace(type="text", text=json.dumps(self.answer)))
        usage = SimpleNamespace(input_tokens=self.in_tokens, output_tokens=self.out_tokens, cache_read_input_tokens=0, cache_creation_input_tokens=0)
        return SimpleNamespace(content=content, usage=usage, stop_reason=self.stop)


def answer_for(source_id, url, snippet=""):
    return {"cards": [{"source_id": source_id, "title": "x", "url": url, "why": "pulseIn times the ECHO pulse.", "apply_it": "Use pulseIn on SONAR_ECHO with a 25 ms timeout.", "snippet": snippet}], "note": ""}


@pytest.fixture()
def docs_loaded(client, hub):
    hub.http_factory = lambda: httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(200, text=PULSEIN_HTML) if "pulseIn" in str(req.url) else httpx.Response(404)))
    r = client.post("/docs/download", json={"source": "arduino-pulsein"}).json()
    assert r["downloaded"] == [{"id": "arduino-pulsein", "chunks": 2}]
    return hub


@pytest.fixture()
def keyed(monkeypatch):
    monkeypatch.setattr(llm, "get_api_key", lambda: "sk-ant-test")


def install(hub, fake):
    hub.llm_factory = lambda key: fake
    return fake


# ---------- docs library ----------

def test_docs_sources_listed(client):
    ids = {d["id"]: d for d in client.get("/docs").json()}
    assert "arduino-pulsein" in ids and "expo-env" in ids and ids["esp32-ledc"]["module"] == "robotics"


def test_chunker_keeps_headings_and_urls(client, docs_loaded):
    rows = docs_loaded.query("SELECT * FROM doc_chunks ORDER BY id")
    assert [r["heading"] for r in rows] == ["pulseIn()", "Syntax"]
    assert rows[1]["url"].endswith("#syntax") and "Home Docs Store" not in rows[0]["body"] and "track()" not in rows[1]["body"]
    assert rows[0]["module"] == "robotics"
    hits = client.get("/search", params={"q": "pulse microseconds timeout", "kind": "doc"}).json()["results"]
    assert hits and hits[0]["kind"] == "doc"


def test_failed_download_reports_fix(client, hub):
    hub.http_factory = lambda: httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(500)))
    r = client.post("/docs/download", json={"source": "esp32-gpio"}).json()
    assert r["downloaded"] == [] and "docs.yaml" in r["failed"][0]["message"]


def test_redownload_replaces_chunks(client, docs_loaded):
    client.post("/docs/download", json={"source": "arduino-pulsein"})
    assert docs_loaded.query_one("SELECT COUNT(*) AS n FROM doc_chunks")["n"] == 2


# ---------- guide ----------

def test_guide_returns_card_and_logs_cost(client, docs_loaded, keyed):
    """Spec 'done when': a question returns a correct link card in under 3 s and logs its cost."""
    src = next(s for s in client.post("/guide/ask", json={"question": "zz"}).json().get("sources", []) or [{"id": None}])
    chunk = docs_loaded.query_one("SELECT id, url FROM doc_chunks ORDER BY id")
    fake = install(docs_loaded, FakeClient(answer_for(f"doc{chunk['id']}", "https://evil.example/")))
    t0 = time.time()
    r = client.post("/guide/ask", json={"question": "How do I time the HC-SR04 echo pulse?", "level": 1}).json()
    assert time.time() - t0 < 3
    assert r["status"] == "sent" and len(r["cards"]) == 1
    card = r["cards"][0]
    assert card["url"] == chunk["url"]  # the hub's URL, never the model's
    assert card["snippet"] == ""  # level 1: no code
    call = fake.calls[0]
    assert call["model"] == HAIKU_MODEL and call["output_config"]["effort"] == "low"
    assert call["output_config"]["format"]["type"] == "json_schema" and "temperature" not in call
    log = docs_loaded.query("SELECT * FROM llm_calls")
    assert log[-1]["status"] == "sent" and log[-1]["tokens_in"] == 900 and log[-1]["tokens_out"] == 220
    assert abs(log[-1]["cost_usd"] - (900 * 0.10 + 220 * 0.50) / 1e6) < 1e-12
    assert abs(log[-1]["cost_rm"] - log[-1]["cost_usd"] * 4.4) < 1e-12


def test_cache_hit_makes_no_call(client, docs_loaded, keyed):
    chunk = docs_loaded.query_one("SELECT id, url FROM doc_chunks ORDER BY id")
    fake = install(docs_loaded, FakeClient(answer_for(f"doc{chunk['id']}", chunk["url"])))
    q = {"question": "How do I time the echo pulse?", "level": 1}
    client.post("/guide/ask", json=q)
    r = client.post("/guide/ask", json=q).json()
    assert r["status"] == "cached" and len(fake.calls) == 1
    assert [x["status"] for x in docs_loaded.query("SELECT status FROM llm_calls")] == ["sent", "cached"]


def test_hint_ladder_level3_keeps_snippet(client, docs_loaded, keyed):
    chunk = docs_loaded.query_one("SELECT id, url FROM doc_chunks ORDER BY id")
    install(docs_loaded, FakeClient(answer_for(f"doc{chunk['id']}", chunk["url"], "unsigned long us = pulseIn(SONAR_ECHO, HIGH, 25000);")))
    r = client.post("/guide/ask", json={"question": "How do I time the echo pulse?", "level": 3}).json()
    assert "pulseIn(SONAR_ECHO" in r["cards"][0]["snippet"]


def test_cards_citing_unknown_sources_are_dropped(client, docs_loaded, keyed):
    install(docs_loaded, FakeClient(answer_for("doc9999", "https://made-up.example/")))
    r = client.post("/guide/ask", json={"question": "How do I time the echo pulse?"}).json()
    assert r["cards"] == []


def test_hard_cap_blocks_call(client, docs_loaded, keyed):
    llm.log_call(docs_loaded, "seed", "sent", cost_usd=9.999 / 4.4)  # RM9.999 spent
    fake = install(docs_loaded, FakeClient(answer_for("doc1", "x")))
    r = client.post("/guide/ask", json={"question": "How do I time the echo pulse?"}).json()
    assert r["status"] == "blocked" and fake.calls == [] and "cap" in r["message"]
    assert r["sources"]  # free search results still shown
    assert docs_loaded.query("SELECT status FROM llm_calls")[-1]["status"] == "blocked"


def test_prompt_over_20k_tokens_is_blocked(client, docs_loaded, keyed):
    fake = install(docs_loaded, FakeClient(answer_for("doc1", "x"), in_tokens=25_000))
    r = client.post("/guide/ask", json={"question": "How do I time the echo pulse?"}).json()
    assert r["status"] == "blocked" and "20,000" in r["message"] and fake.calls == []


def test_no_key_still_shows_free_results(client, docs_loaded, monkeypatch):
    monkeypatch.setattr(llm, "get_api_key", lambda: None)
    r = client.post("/guide/ask", json={"question": "How do I time the echo pulse?"}).json()
    assert r["status"] == "no_key" and r["sources"] and "Settings" in r["message"]


def test_refusal_is_reported(client, docs_loaded, keyed):
    install(docs_loaded, FakeClient(None, stop="refusal"))
    r = client.post("/guide/ask", json={"question": "How do I time the echo pulse?"}).json()
    assert r["status"] == "refused" and r["cards"] == []


def test_past_error_fix_comes_with_the_answer(client, docs_loaded, keyed):
    client.post("/errors", json={"error_text": "pulseIn returns 0 every time on GPIO 18", "fix": "Add the 1k/2k divider and share ground"})
    chunk = docs_loaded.query_one("SELECT id, url FROM doc_chunks ORDER BY id")
    install(docs_loaded, FakeClient(answer_for(f"doc{chunk['id']}", chunk["url"])))
    r = client.post("/guide/ask", json={"question": "Why does pulseIn return 0?", "error_text": "pulseIn returns 0 every time on GPIO 19"}).json()
    assert r["past_errors"] and r["past_errors"][0]["fix"].startswith("Add the 1k/2k")


def test_project_filter(client, docs_loaded, keyed):
    app = client.post("/projects", json={"name": "Kedai", "module": "app-dev"}).json()
    r = client.post("/guide/ask", json={"question": "pulse microseconds timeout", "project_id": app["id"]}).json()
    assert all(s["kind"] != "doc" for s in r["sources"])  # robotics docs hidden for an app project


# ---------- spend + settings ----------

def test_spend_report_and_warnings(client, hub):
    llm.log_call(hub, "docs_guide", "sent", 3000, 400, 0.0005)
    llm.log_call(hub, "commit_message", "sent", 2500, 100, 0.0003)
    llm.log_call(hub, "docs_guide", "cached")
    r = client.get("/llm/spend").json()
    assert r["model"] == HAIKU_MODEL and r["cap_rm"] == 10.0 and r["level"] == "ok" and r["cache_hits"] == 1
    assert {f["feature"]: f["calls"] for f in r["features"]} == {"docs_guide": 1, "commit_message": 1}
    llm.log_call(hub, "seed", "sent", cost_usd=7.5 / 4.4)
    assert client.get("/llm/spend").json()["level"] == "warn"
    llm.log_call(hub, "seed", "sent", cost_usd=2.0 / 4.4)
    assert client.get("/llm/spend").json()["level"] == "high"


def test_exchange_rate_setting(client):
    assert client.get("/settings").json()["rm_per_usd"] == 4.4
    assert client.put("/settings", json={"rm_per_usd": 4.6}).json()["rm_per_usd"] == 4.6
    assert client.put("/settings", json={"rm_per_usd": 0}).status_code == 422


def test_api_key_never_stored_in_db(client, hub, monkeypatch):
    saved = {}
    monkeypatch.setattr(llm, "set_api_key", lambda k: saved.update(k=k))
    assert client.post("/settings/api-key", json={"key": "not-a-key-but-long-enough"}).status_code == 400
    assert client.post("/settings/api-key", json={"key": "sk-ant-api03-" + "x" * 30}).status_code == 200
    assert saved["k"].startswith("sk-ant-")
    dump = "\n".join(hub.conn.iterdump())
    assert "sk-ant-api03" not in dump


def test_model_cannot_be_changed(client):
    assert client.put("/settings", json={"rm_per_usd": 4.4, "model": "claude-opus-5-5"}).json()["model"] == HAIKU_MODEL
