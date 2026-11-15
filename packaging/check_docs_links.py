"""Check every official doc link and doc-site search source, online.

    python packaging/check_docs_links.py

Runs in CI (the sandbox that builds the hub has no internet). It uses the same
HTTP client settings as the engine, so a site that blocks the hub shows up here.
Exit code 1 when a link or a site's page list is broken.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import httpx  # noqa: E402

from engine import docs as docsmod, handbook, onlinedocs as od  # noqa: E402
from engine.routes.guide import USER_AGENT  # noqa: E402

# Sites that refuse automated requests but open fine in a browser: listed, not failed.
BLOCKS_BOTS = ("www.npmjs.com",)

SAMPLE = {"arduino": "servo", "esp32": "ledc pwm", "platformio": "lib_deps", "expo": "environment variables", "react-native": "pressable",
          "supabase": "sign in password", "nextjs": "app router", "tauri": "window"}


def main() -> int:
    bad = 0
    client = httpx.Client(follow_redirects=True, timeout=30.0, headers={"User-Agent": USER_AGENT})
    tmp = ROOT / "build" / "docs-check"
    print("== Doc sites (page lists for the online Ask)")
    for s in od.sites(ROOT):
        pages, err = od.load_index(s, tmp, client, refresh=True)
        top = od.rank(SAMPLE.get(s.id, s.id), pages, 3)
        ok = bool(pages) and not err
        bad += not ok
        print(f"{'OK ' if ok else 'BAD'} {s.module}/{s.id}: {len(pages)} pages{(' - ' + err) if err else ''}")
        for t in top:
            print(f"      '{SAMPLE.get(s.id)}' -> {t['title']}  {t['url']}")
        home = check(client, s.home)
        bad += not home[0]
        print(f"    home {home[1]}")
    print("\n== Links (docs per part / board / stack, docs.yaml pages, library pages)")
    urls: dict[str, str] = {}
    hb = handbook.load(ROOT)
    for ch in hb.chapters.values():
        for d in od.item_docs(hb, [ch.key])[0]["docs"] if ch.meta.get("docs") or ch.meta.get("lib_dep") or ch.meta.get("packages") else []:
            if d["url"].startswith("http"):
                urls.setdefault(d["url"], ch.path)
    for src in docsmod.sources(ROOT):
        urls.setdefault(src.url, f"docs.yaml:{src.id}")
    for url, where in sorted(urls.items()):
        if any(f"//{h}/" in url for h in BLOCKS_BOTS):
            print(f"SKIP {url}  ({where}) site blocks automated checks; opens in a browser")
            continue
        ok, note = check(client, url)
        bad += not ok
        print(f"{'OK ' if ok else 'BAD'} {url}  ({where}) {note}")
    print(f"\n{bad} problem(s)")
    return 1 if bad else 0


def check(client: httpx.Client, url: str) -> tuple[bool, str]:
    try:
        r = client.get(url)
    except Exception as exc:
        return False, f"{type(exc).__name__}"
    final = str(r.url)
    note = f"{r.status_code}" + (f" -> {final}" if final.rstrip("/") != url.rstrip("/") else "")
    return r.status_code < 400, note


if __name__ == "__main__":
    raise SystemExit(main())
