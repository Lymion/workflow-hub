"""Docs library: download the pages each module lists in docs.yaml, split them into chunks.

A chunk is (title, heading, url#anchor, body) of about 300-700 words, stored in doc_chunks
and indexed for search. Only the listed pages are fetched: no crawling.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path

import yaml

from .modules import load_modules

MAX_WORDS = 450
SKIP_TAGS = {"script", "style", "nav", "header", "footer", "aside", "noscript", "svg", "form", "button"}
HEADINGS = {"h1", "h2", "h3"}
BLOCKS = {"p", "li", "pre", "code", "td", "th", "dd", "dt", "blockquote", "h4"}


@dataclass
class Source:
    id: str
    title: str
    url: str
    module: str
    kind: str = "html"


def sources(root: Path) -> list[Source]:
    out: list[Source] = []
    modules, _ = load_modules(root / "modules")
    for m in modules:
        if not m.enabled:
            continue
        f = root / "modules" / m.folder / "docs.yaml"
        if not f.is_file():
            continue
        data = yaml.safe_load(f.read_text(encoding="utf-8")) or {}
        for s in data.get("docs", []):
            out.append(Source(id=s["id"], title=s["title"], url=s["url"], module=m.id, kind=s.get("type", "html")))
    return out


class _Text(HTMLParser):
    """HTML -> list of (heading, anchor, text) sections. Good enough for docs pages."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.sections: list[list] = [["", "", []]]
        self.skip = 0
        self.cur: list[str] | None = None
        self.cur_tag = ""
        self.anchor = ""
        self.title = ""
        self.in_title = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in SKIP_TAGS:
            self.skip += 1
        if tag == "title":
            self.in_title = True
        if self.skip:
            return
        if a.get("id") and tag in HEADINGS | {"section", "div", "a"}:
            self.anchor = a["id"]
        if tag in HEADINGS:
            self.cur, self.cur_tag = [], tag
        elif tag in BLOCKS and self.cur is None:
            self.cur, self.cur_tag = [], tag

    def handle_endtag(self, tag):
        if tag in SKIP_TAGS and self.skip:
            self.skip -= 1
            return
        if tag == "title":
            self.in_title = False
        if self.cur is not None and tag == self.cur_tag:
            text = re.sub(r"\s+", " ", "".join(self.cur)).strip() if tag != "pre" else "".join(self.cur).strip()
            if text:
                if tag in HEADINGS:
                    self.sections.append([text, self.anchor, []])
                else:
                    self.sections[-1][2].append(text)
            self.cur = None

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        if not self.skip and self.cur is not None:
            self.cur.append(data)


def html_sections(html: str) -> tuple[str, list[tuple[str, str, str]]]:
    p = _Text()
    p.feed(html)
    secs = [(h, a, "\n".join(t)) for h, a, t in p.sections if t]
    return p.title.strip(), secs


def md_sections(text: str) -> list[tuple[str, str, str]]:
    secs: list[list] = [["", "", []]]
    for line in text.splitlines():
        m = re.match(r"^(#{1,3}|={2,4})\s+(.+?)\s*=*$", line)
        if m:
            head = m.group(2).strip()
            secs.append([head, re.sub(r"[^a-z0-9]+", "-", head.lower()).strip("-"), []])
        else:
            secs[-1][2].append(line)
    return [(h, a, "\n".join(t).strip()) for h, a, t in secs if "".join(t).strip()]


def chunk(sections: list[tuple[str, str, str]]) -> list[tuple[str, str, str]]:
    """Split long sections into ~MAX_WORDS pieces; merge tiny neighbours."""
    out: list[tuple[str, str, str]] = []
    for head, anchor, body in sections:
        words = body.split()
        if len(words) <= MAX_WORDS:
            if out and len(out[-1][2].split()) + len(words) < 120 and out[-1][0] == head:
                out[-1] = (head, anchor, out[-1][2] + "\n" + body)
            else:
                out.append((head, anchor, body))
            continue
        paras, buf = body.split("\n"), []
        for para in paras:
            if len(" ".join(buf + [para]).split()) > MAX_WORDS and buf:
                out.append((head, anchor, "\n".join(buf)))
                buf = []
            buf.append(para)
        if buf:
            out.append((head, anchor, "\n".join(buf)))
    return out


def parse(source: Source, text: str) -> list[dict]:
    if source.kind in ("markdown", "text", "adoc"):
        secs = md_sections(text)
    else:
        _, secs = html_sections(text)
    return [
        {"source": source.id, "title": source.title, "heading": h, "url": source.url + (f"#{a}" if a else ""), "body": b}
        for h, a, b in chunk(secs)
        if len(b.split()) >= 8
    ]
