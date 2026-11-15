"""Docs page: doc sites, live page-list search, Haiku picks (guarded), docs per part, saving pages."""
from __future__ import annotations

import json

import httpx
import pytest

from engine import llm, onlinedocs as od

from .test_session8 import FakeClient, install

SITEMAP_INDEX = """<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<sitemap><loc>https://docs.arduino.cc/sitemap-0.xml</loc></sitemap></sitemapindex>"""
SITEMAP = """<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://docs.arduino.cc/language-reference/en/functions/advanced-io/pulseIn/</loc></url>
<url><loc>https://docs.arduino.cc/language-reference/en/functions/time/millis/</loc></url>
<url><loc>https://docs.arduino.cc/libraries/servo/</loc></url>
<url><loc>https://docs.arduino.cc/tutorials/generic/basic-servo-control/</loc></url>
<url><loc>https://other.example.com/servo/</loc></url>
</urlset>"""
SPHINX = 'Search.setIndex({"docnames": ["api/ledc", "api/gpio"], "titles": ["LED Control (LEDC)", "GPIO"], "terms": {"pwm": [0], "servo": 0, "pin": [0, 1]}})'
PAGE = "<html><body><h1>Servo library</h1><p>Allows Arduino boards to control servo motors. Use attach() then write(angle).</p></body></html>"


def transport(counter: dict | None = None):
    def handle(req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        if counter is not None:
            counter[url] = counter.get(url, 0) + 1
        if url.endswith("sitemap-index.xml"):
            return httpx.Response(200, text=SITEMAP_INDEX)
        if url.endswith("sitemap-0.xml"):
            return httpx.Response(200, text=SITEMAP)
        if url.endswith("searchindex.js") and "espressif" in url:
            return httpx.Response(200, text=SPHINX)
        if url == "https://docs.arduino.cc/libraries/servo/":
            return httpx.Response(200, text=PAGE)
        return httpx.Response(404)
    return httpx.MockTransport(handle)


@pytest.fixture()
def online(hub):
    calls: dict = {}
    hub.http_factory = lambda: httpx.Client(transport=transport(calls))
    return calls


def test_words_split_camel_case_and_stem():
    assert od.words("Why does pulseIn return 0 on servos?") == ["pulse", "return", "servo"]
    assert od.title_from_url("https://docs.arduino.cc/language-reference/en/functions/advanced-io/pulseIn/") == "pulseIn · functions advanced io"
    assert od.title_from_url("https://docs.arduino.cc/libraries/servo/") == "Servo · libraries"


def test_sitemap_index_and_sphinx_are_parsed(hub, online):
    sites = {s.id: s for s in od.sites(hub.paths.root)}
    with httpx.Client(transport=transport()) as c:
        pages, err = od.load_index(sites["arduino"], hub.paths.data, c)
        assert not err and len(pages) == 4  # other.example.com is outside the prefix
        esp, _ = od.load_index(sites["esp32"], hub.paths.data, c)
    assert esp[0] == {"title": "LED Control (LEDC)", "url": "https://docs.espressif.com/projects/arduino-esp32/en/latest/api/ledc.html", "terms": ["pwm", "servo", "pin"]}
    top = od.rank("servo jitter", pages + esp)
    assert top[0]["url"] == "https://docs.arduino.cc/libraries/servo/"
    assert any("ledc" in p["url"] for p in top)  # found through the index's words, not the title


def test_page_lists_are_cached_for_a_week(client, online):
    client.post("/docs/online/ask", json={"question": "servo", "module": "robotics"})
    client.post("/docs/online/ask", json={"question": "millis", "module": "robotics"})
    assert online["https://docs.arduino.cc/sitemap-index.xml"] == 1


def test_online_ask_without_key_still_lists_matches_for_free(client, online, monkeypatch):
    monkeypatch.setattr(llm, "get_api_key", lambda: None)
    r = client.post("/docs/online/ask", json={"question": "how do I control a servo", "module": "robotics"}).json()
    assert r["status"] == "no_key" and r["picks"] == []
    urls = [c["url"] for c in r["candidates"]]
    assert "https://docs.arduino.cc/libraries/servo/" in urls[:3] and r["candidates"][0]["site_title"] == "Arduino docs"


def test_haiku_picks_only_listed_pages(client, hub, online, monkeypatch):
    monkeypatch.setattr(llm, "get_api_key", lambda: "sk-ant-test")
    fake = FakeClient({"picks": [{"n": 1, "why": "attach() and write() set the angle."}, {"n": 99, "why": "invented"}, {"n": 1, "why": "dup"}], "note": ""}, in_tokens=700, out_tokens=150)
    install(hub, fake)
    r = client.post("/docs/online/ask", json={"question": "how do I control a servo", "module": "robotics"}).json()
    assert r["status"] == "sent" and [p["url"] for p in r["picks"]] == [r["candidates"][0]["url"]]
    assert r["picks"][0]["why"].startswith("attach()")
    sent = fake.calls[0]
    assert sent["model"] == "claude-haiku-5-5" and sent["max_tokens"] == 1000
    assert "Pages:" in sent["messages"][0]["content"] and "<html" not in sent["messages"][0]["content"]  # titles and links only
    again = client.post("/docs/online/ask", json={"question": "How do I control a  servo", "module": "robotics"}).json()
    assert again["status"] == "cached" and len(fake.calls) == 1
    row = hub.query_one("SELECT feature, tokens_in FROM llm_calls WHERE status = 'sent'")
    assert row["feature"] == "docs_online" and row["tokens_in"] == 700


def test_cap_blocks_the_call_but_keeps_free_results(client, hub, online, monkeypatch):
    monkeypatch.setattr(llm, "get_api_key", lambda: "sk-ant-test")
    monkeypatch.setattr(llm, "month_spend_rm", lambda h: 9.9999)
    fake = FakeClient({"picks": [], "note": ""})
    install(hub, fake)
    r = client.post("/docs/online/ask", json={"question": "servo", "module": "robotics"}).json()
    assert r["status"] == "blocked" and not fake.calls and r["candidates"]


def test_no_matches_and_offline(client, hub, online):
    r = client.post("/docs/online/ask", json={"question": "zzzz qqqq", "module": "robotics"}).json()
    assert r["status"] == "no_matches" and "function or part name" in r["message"]
    hub.http_factory = lambda: httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(503)))
    r = client.post("/docs/online/ask", json={"question": "tauri window", "module": "app-dev"}).json()
    assert r["status"] == "no_matches" and "couldn't load its page list" in r["message"]
    again = client.post("/docs/online/ask", json={"question": "tauri window", "module": "app-dev"}).json()
    assert "a moment ago" in again["message"] and again["unreachable"] == ["Expo", "React Native", "Supabase", "Next.js", "Tauri"]  # offline: don't wait on every site again for a few minutes


def test_sites_listed_per_module(client):
    sites = client.get("/docs/sites", params={"module": "robotics"}).json()
    assert [s["id"] for s in sites] == ["arduino", "esp32", "platformio"] and all(s["home"].startswith("https://") for s in sites)
    assert {s["module"] for s in client.get("/docs/sites").json()} == {"robotics", "app-dev"}


def test_project_docs_follow_its_board_and_parts(client):
    p = client.post("/projects", json={"name": "Rover", "module": "robotics", "board": "esp32-devkit"}).json()
    first = client.get(f"/projects/{p['id']}/docs").json()
    assert [i["key"] for i in first["items"]] == ["esp32-devkit"]
    client.post(f"/projects/{p['id']}/parts", json={"items": [{"key": "sg90", "qty": 1}, {"key": "hc-sr04", "qty": 1}, {"key": "sg90", "qty": 1}]})
    items = {i["key"]: i for i in client.get(f"/projects/{p['id']}/docs").json()["items"]}
    assert list(items) == ["esp32-devkit", "sg90", "hc-sr04"]
    urls = [d["url"] for d in items["sg90"]["docs"]]
    assert urls[0] == "#handbook/robotics/parts/sg90"
    assert "https://docs.arduino.cc/libraries/servo/" in urls
    assert "https://registry.platformio.org/libraries/madhephaestus/ESP32Servo" in urls
    assert any("pulseIn" in d["url"] for d in items["hc-sr04"]["docs"])


def test_new_project_screen_gets_docs_before_the_project_exists(client):
    r = client.post("/docs/for", json={"module": "app-dev", "stack": ["expo", "supabase"]}).json()
    assert [i["key"] for i in r["items"]] == ["expo", "supabase"]
    assert "https://www.npmjs.com/package/@supabase/supabase-js" in [d["url"] for d in r["items"][1]["docs"]]
    assert [s["id"] for s in r["sites"]][:2] == ["expo", "react-native"]


def test_library_names_with_spaces_get_a_registry_link():
    assert od.registry_url("adafruit/DHT sensor library") == "https://registry.platformio.org/libraries/adafruit/DHT%20sensor%20library"
    assert od.registry_url("Servo") is None


def test_save_a_page_for_ask_docs_and_remove_it(client, hub, online):
    r = client.post("/docs/library", json={"url": "https://docs.arduino.cc/libraries/servo/", "title": "Arduino · Servo library", "module": "robotics"})
    assert r.status_code == 201 and r.json()["chunks"] >= 1
    sid = r.json()["id"]
    listed = {d["id"]: d for d in client.get("/docs").json()}
    assert listed[sid]["chunks"] >= 1
    assert client.post("/docs/library", json={"url": "https://docs.arduino.cc/libraries/servo/", "title": "again"}).json()["id"] == sid  # no duplicate
    assert client.delete(f"/docs/library/{sid}").status_code == 204
    assert sid not in {d["id"] for d in client.get("/docs").json()}
    assert client.delete("/docs/library/arduino-pulsein").status_code == 404
    assert client.post("/docs/library", json={"url": "file:///etc/passwd", "title": "x"}).status_code == 400


def test_every_part_doc_link_is_well_formed(hub):
    from engine.routes.handbook import current

    hb = current(hub)
    for ch in hb.chapters.values():
        for d in ch.meta.get("docs") or []:
            assert d["url"].startswith("https://") and d.get("title"), ch.path


def test_open_in_browser_only_takes_web_links(client, hub):
    opened = []
    hub.browser_opener = lambda url: opened.append(url) or True
    assert client.post("/open-url", json={"url": "https://docs.arduino.cc/libraries/servo/"}).json() == {"opened": True}
    assert client.post("/open-url", json={"url": "file:///C:/Windows/system32/calc.exe"}).status_code == 400
    assert opened == ["https://docs.arduino.cc/libraries/servo/"]


def test_translations_and_old_versions_are_skipped():
    assert od.keep("https://docs.arduino.cc/learn/electronics/servo-motors/", "https://docs.arduino.cc/")
    assert not od.keep("https://docs.arduino.cc/de/learn/electronics/servo-motors/", "https://docs.arduino.cc/")
    assert not od.keep("https://v2.tauri.app/zh-cn/start/", "https://v2.tauri.app/")
    assert not od.keep("https://reactnative.dev/docs/0.77/pressable", "https://reactnative.dev/docs/")
    assert not od.keep("https://reactnative.dev/docs/next/pressable", "https://reactnative.dev/docs/")
    assert not od.keep("https://nextjs.org/docs/15/app/guides/migrating/app-router-migration", "https://nextjs.org/docs")
    assert od.keep("https://nextjs.org/docs/app/guides/migrating/app-router-migration", "https://nextjs.org/docs")
    assert od.keep("https://docs.platformio.org/en/latest/boards/espressif32/esp32dev.html")


def test_exact_page_name_ranks_first():
    pages = [{"title": "Servo motors · learn electronics", "url": "https://docs.arduino.cc/learn/electronics/servo-motors/"},
             {"title": "Servo · libraries", "url": "https://docs.arduino.cc/libraries/servo/"}]
    assert od.rank("servo", pages)[0]["url"] == "https://docs.arduino.cc/libraries/servo/"
