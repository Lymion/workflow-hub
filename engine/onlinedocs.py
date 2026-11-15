"""Official docs, online: doc sites per module, live search, and docs per part.

Nothing here downloads documentation pages. To search a site the hub fetches
its list of page addresses (the sitemap, or a Sphinx site's search index) and
keeps that list for a week in data/docs-index/. Matching a question against it
is plain code; Haiku only picks the best few pages from the matches.

Docs per part come from the handbook chapters' setup blocks (`docs:`), plus a
PlatformIO registry link for each library a part needs (`lib_dep`).
"""
from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import quote, unquote, urlparse
from xml.etree import ElementTree

import yaml

from .modules import load_modules

INDEX_TTL = 7 * 24 * 3600
MAX_CHILD_SITEMAPS = 25
MAX_URLS = 40_000
STOP = set("a an and are as at be but by can do does for from how i if in into is it its me my of on or so that the this to use using what when where which why with you your doesn't dont don't not no vs get set".split())


@dataclass
class Site:
    id: str
    title: str
    home: str
    module: str
    search: dict = field(default_factory=dict)   # {type: sitemap|sphinx, url, prefix}
    about: str = ""


def sites(root: Path) -> list[Site]:
    out: list[Site] = []
    modules, _ = load_modules(root / "modules")
    for m in modules:
        if not m.enabled:
            continue
        f = root / "modules" / m.folder / "docs.yaml"
        if not f.is_file():
            continue
        data = yaml.safe_load(f.read_text(encoding="utf-8")) or {}
        for s in data.get("sites", []):
            out.append(Site(id=s["id"], title=s["title"], home=s["home"], module=m.id, search=s.get("search") or {}, about=s.get("about", "")))
    return out


# ---------- words ----------

def words(text: str) -> list[str]:
    """Lowercase words, camelCase and snake/kebab split, light stemming, no stop words."""
    text = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text)
    out = []
    for w in re.split(r"[^A-Za-z0-9]+", text.lower()):
        if len(w) < 2 or w in STOP:
            continue
        for suffix in ("ing", "es", "ed", "s"):
            if len(w) > len(suffix) + 3 and w.endswith(suffix):
                w = w[: -len(suffix)]
                break
        out.append(w)
    return out


def title_from_url(url: str, prefix: str = "") -> str:
    """'…/functions/advanced-io/pulseIn/' -> 'pulseIn · advanced io'."""
    path = unquote(urlparse(url).path)
    if prefix:
        p = urlparse(prefix).path
        if path.startswith(p):
            path = path[len(p):]
    parts = [x for x in re.split(r"/+", path) if x and x not in ("en", "latest", "index.html", "docs")]
    parts = [re.sub(r"\.html?$", "", x) for x in parts]
    if not parts:
        return urlparse(url).netloc
    name = parts[-1].replace("-", " ").replace("_", " ")
    if name.islower():
        name = name[:1].upper() + name[1:]
    context = " ".join(x.replace("-", " ") for x in parts[-3:-1])
    return f"{name} · {context}" if context else name


# ---------- site indexes (page lists) ----------

def _cache_file(data_dir: Path, site: Site) -> Path:
    return data_dir / "docs-index" / f"{site.module}-{site.id}.json"


LANGS = set("ar bn cs da de el es fa fi fr he hi hu id it ja ko ms nl no pl pt pt-br ro ru sv th tr uk vi zh zh-cn zh-hans zh-hant zh-tw".split())
VERSION_SEG = re.compile(r"^(v?\d+(\.\d+)*(\.x)?|next|canary|unstable|nightly)$")


def keep(url: str, prefix: str = "") -> bool:
    """Skip translated copies (/de/...) and old or preview versions (/docs/0.77/..., /docs/15/...)."""
    if prefix and not url.startswith(prefix):
        return False
    path = urlparse(url).path
    rest = path[len(urlparse(prefix).path):] if prefix and path.startswith(urlparse(prefix).path) else path
    segs = [x for x in rest.split("/") if x]
    all_segs = [x for x in path.split("/") if x]
    if all_segs and all_segs[0].lower() in LANGS:
        return False
    return not any(VERSION_SEG.match(x) for x in segs[:2])


def parse_sitemap(xml: str) -> tuple[list[str], list[str]]:
    """Returns (page urls, child sitemap urls)."""
    try:
        root = ElementTree.fromstring(xml.encode("utf-8") if isinstance(xml, str) else xml)
    except ElementTree.ParseError:
        return [], []
    locs = [el.text.strip() for el in root.iter() if el.tag.endswith("loc") and el.text]
    if root.tag.endswith("sitemapindex"):
        return [], locs
    return locs, []


def parse_sphinx(js: str, base: str) -> list[dict]:
    """Sphinx searchindex.js -> [{title, url, terms}] (terms help full-word search)."""
    m = re.search(r"Search\.setIndex\((.*)\)\s*;?\s*$", js.strip(), re.S)
    if not m:
        return []
    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError:
        return []
    docnames, titles = data.get("docnames", []), data.get("titles", [])
    terms: dict[int, list[str]] = {}
    for term, docs in (data.get("terms") or {}).items():
        for d in docs if isinstance(docs, list) else [docs]:
            terms.setdefault(d, []).append(term)
    base = base if base.endswith("/") else base + "/"
    pages = []
    for i, name in enumerate(docnames):
        title = titles[i] if i < len(titles) else name
        pages.append({"title": re.sub(r"<[^>]+>", "", str(title)), "url": base + name + ".html", "terms": terms.get(i, [])[:60]})
    return pages


def fetch_pages(site: Site, url: str, client) -> list[dict]:
    """One page list, live: a Sphinx search index or a sitemap (following sitemap indexes)."""
    prefix = site.search.get("prefix", "")
    if site.search.get("type") == "sphinx":
        r = client.get(url)
        r.raise_for_status()
        return parse_sphinx(r.text, url.rsplit("/", 1)[0])
    pages, queue, seen = [], [url], 0
    while queue and seen < MAX_CHILD_SITEMAPS and len(pages) < MAX_URLS:
        r = client.get(queue.pop(0))
        r.raise_for_status()
        seen += 1
        locs, children = parse_sitemap(r.text)
        queue += [c for c in children if not prefix or _same_site(c, prefix)]
        pages += [{"title": title_from_url(u, prefix), "url": u} for u in locs if keep(u, prefix)]
    return pages


def _same_site(url: str, prefix: str) -> bool:
    return urlparse(url).netloc == urlparse(prefix).netloc


_FAILED: dict[str, float] = {}   # site file -> when its page list last failed (skip retries for a few minutes)
RETRY_AFTER = 300


def load_index(site: Site, data_dir: Path, client, refresh: bool = False) -> tuple[list[dict], str]:
    """The site's page list, from the week-old cache or live. Returns (pages, error)."""
    f = _cache_file(data_dir, site)
    if f.is_file() and not refresh:
        try:
            cached = json.loads(f.read_text(encoding="utf-8"))
            if time.time() - cached.get("at", 0) < INDEX_TTL:
                return cached["pages"], ""
        except (json.JSONDecodeError, KeyError):
            pass
    urls = site.search.get("url") or []
    urls = [urls] if isinstance(urls, str) else list(urls)
    if not urls:
        return [], ""
    if not refresh and time.time() - _FAILED.get(str(f), 0) < RETRY_AFTER:
        return [], f"{site.title}: its page list didn't load a moment ago. Check your connection; the site itself still opens."
    pages, error = [], ""
    for url in urls:  # first one that works wins (sites move their sitemaps now and then)
        try:
            pages = fetch_pages(site, url, client)
        except Exception as exc:
            error = type(exc).__name__
            continue
        if pages:
            break
    if not pages:
        _FAILED[str(f)] = time.time()
        if f.is_file():  # stale is better than nothing
            return json.loads(f.read_text(encoding="utf-8")).get("pages", []), ""
        return [], f"{site.title}: couldn't load its page list ({error or 'empty'}). Check your connection; the site itself still opens."
    _FAILED.pop(str(f), None)
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps({"at": time.time(), "pages": pages}), encoding="utf-8")
    return pages, ""


def rank(question: str, pages: list[dict], limit: int = 30, boost: list[str] | None = None) -> list[dict]:
    """Score pages by word overlap with the question; the page's own name counts most."""
    q = set(words(question))
    b = set(words(" ".join(boost or []))) - q
    if not q:
        return []
    scored = []
    for p in pages:
        name, _, context = p["title"].partition(" · ")
        nw, cw, tw = set(words(name)), set(words(context)) | set(words(urlparse(p["url"]).path)), set(p.get("terms", []))
        hits = q & (nw | cw | tw)
        if not hits:
            continue
        exact = 2 if nw and nw <= q else 0  # the page is named exactly after words you asked about
        score = 3 * len(q & nw) + exact + 1.5 * len(q & cw) + len(q & tw) + 0.5 * len(b & (nw | cw)) - 0.002 * len(p["url"])
        scored.append((score, p))
    scored.sort(key=lambda x: -x[0])
    out, seen = [], set()
    for _, p in scored:
        u = p["url"].split("#")[0]
        if u in seen:
            continue
        seen.add(u)
        out.append({"title": p["title"], "url": p["url"]})
        if len(out) >= limit:
            break
    return out


# ---------- docs per part / board / stack ----------

def registry_url(lib: str) -> str | None:
    """'madhephaestus/ESP32Servo' -> PlatformIO registry page. Plain names have no owner, so no link."""
    lib = re.sub(r"@.*$", "", lib.strip())
    if re.fullmatch(r"[\w.-]+/[\w. -]+", lib):
        owner, name = lib.split("/", 1)
        return f"https://registry.platformio.org/libraries/{owner}/{quote(name.strip())}"
    return None


def npm_url(package: str) -> str | None:
    """'@supabase/supabase-js' -> npm page."""
    package = package.strip()
    return f"https://www.npmjs.com/package/{package}" if re.fullmatch(r"(@[\w.-]+/)?[\w.-]+", package) else None


def item_docs(hb, keys: list[str]) -> list[dict]:
    """[{key, title, docs: [{title, url, kind}]}] for each board/part/stack key, in order, no repeats."""
    out, seen_keys = [], set()
    for key in keys:
        if not key or key in seen_keys:
            continue
        seen_keys.add(key)
        ch = hb.by_key(key)
        if not ch:
            continue
        docs = [{"title": f"Hub handbook · {ch.title}", "url": f"#handbook/{ch.path}", "kind": "handbook"}]
        for d in ch.meta.get("docs") or []:
            if isinstance(d, dict) and d.get("url"):
                docs.append({"title": str(d.get("title") or title_from_url(d["url"])), "url": d["url"], "kind": "official"})
        libs = ch.meta.get("lib_dep") or {}
        for lib in dict.fromkeys(libs.values() if isinstance(libs, dict) else libs):
            url = registry_url(str(lib))
            if url and url not in {d["url"] for d in docs}:
                docs.append({"title": f"Library · {str(lib).split('/')[-1]}", "url": url, "kind": "library"})
        for pkg in ch.meta.get("packages") or []:
            url = npm_url(str(pkg))
            if url:
                docs.append({"title": f"Package · {pkg}", "url": url, "kind": "library"})
        out.append({"key": key, "title": ch.title, "section": ch.section, "docs": docs})
    return out
