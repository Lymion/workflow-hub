"""Hybrid search shared by snippets, errors, docs and the handbook.

Keyword search: SQLite FTS5 (bm25). Meaning search: local `bge-small` embeddings via
sentence-transformers, only if it is installed (pip install -r engine/requirements-search.txt).
Results from both are merged with reciprocal rank fusion. With no embedder, search is
keyword-only and still works offline and for free.
"""
from __future__ import annotations

import math
import os
import re
import sqlite3
import struct
from typing import Callable, Iterable, Protocol

SCHEMA = """
CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
    kind UNINDEXED, ref UNINDEXED, title, body, tokenize = 'porter unicode61'
);
CREATE TABLE IF NOT EXISTS search_vec (
    kind TEXT NOT NULL, ref TEXT NOT NULL, vec BLOB NOT NULL, PRIMARY KEY (kind, ref)
);
"""

KINDS = ("snippet", "error", "doc", "handbook")
RRF_K = 60
MODEL_NAME = "BAAI/bge-small-en-v1.5"


class Embedder(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...


class BgeSmall:
    """sentence-transformers bge-small, loaded on first use."""

    def __init__(self) -> None:
        from sentence_transformers import SentenceTransformer  # noqa: WPS433 (optional dependency)

        self.model = SentenceTransformer(MODEL_NAME)

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [list(map(float, v)) for v in self.model.encode(texts, normalize_embeddings=True)]


_default: Embedder | None = None
_tried = False


def default_embedder() -> Embedder | None:
    """bge-small if available and not disabled (WORKFLOW_HUB_EMBED=0), else None."""
    global _default, _tried
    if _tried:
        return _default
    _tried = True
    if os.environ.get("WORKFLOW_HUB_EMBED", "1") == "0":
        return None
    try:
        _default = BgeSmall()
    except Exception:  # not installed, or the model can't be fetched offline
        _default = None
    return _default


def init(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()


def _pack(vec: list[float]) -> bytes:
    return struct.pack(f"{len(vec)}f", *vec)


def _unpack(blob: bytes) -> list[float]:
    return list(struct.unpack(f"{len(blob) // 4}f", blob))


def _cos(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


class Index:
    def __init__(self, conn: sqlite3.Connection, lock, embedder_factory: Callable[[], Embedder | None] = default_embedder):
        self.conn = conn
        self.lock = lock
        self._factory = embedder_factory
        init(conn)

    @property
    def embedder(self) -> Embedder | None:
        return self._factory()

    # ---------- writing ----------
    def replace_kind(self, kind: str, items: Iterable[tuple[str, str, str]]) -> None:
        items = list(items)
        vecs = self._embed([f"{t}\n{b}" for _, t, b in items])
        with self.lock:
            self.conn.execute("DELETE FROM search_fts WHERE kind = ?", (kind,))
            self.conn.execute("DELETE FROM search_vec WHERE kind = ?", (kind,))
            self.conn.executemany("INSERT INTO search_fts(kind, ref, title, body) VALUES (?, ?, ?, ?)", [(kind, r, t, b) for r, t, b in items])
            if vecs:
                self.conn.executemany("INSERT INTO search_vec(kind, ref, vec) VALUES (?, ?, ?)", [(kind, r, _pack(v)) for (r, _, _), v in zip(items, vecs)])
            self.conn.commit()

    def upsert(self, kind: str, ref: str, title: str, body: str) -> None:
        vecs = self._embed([f"{title}\n{body}"])
        with self.lock:
            self.conn.execute("DELETE FROM search_fts WHERE kind = ? AND ref = ?", (kind, ref))
            self.conn.execute("INSERT INTO search_fts(kind, ref, title, body) VALUES (?, ?, ?, ?)", (kind, ref, title, body))
            if vecs:
                self.conn.execute("INSERT OR REPLACE INTO search_vec(kind, ref, vec) VALUES (?, ?, ?)", (kind, ref, _pack(vecs[0])))
            self.conn.commit()

    def delete(self, kind: str, ref: str) -> None:
        with self.lock:
            self.conn.execute("DELETE FROM search_fts WHERE kind = ? AND ref = ?", (kind, ref))
            self.conn.execute("DELETE FROM search_vec WHERE kind = ? AND ref = ?", (kind, ref))
            self.conn.commit()

    def _embed(self, texts: list[str]) -> list[list[float]]:
        emb = self.embedder
        if not emb or not texts:
            return []
        try:
            return emb.embed(texts)
        except Exception:
            return []

    # ---------- reading ----------
    @staticmethod
    def fts_query(q: str, any_word: bool = False) -> str:
        words = re.findall(r"[\w]+", q.lower())
        words = [w for w in words if len(w) > 1][:12]
        if not words:
            return ""
        return (" OR " if any_word else " ").join(f'"{w}"*' for w in words)

    def keyword(self, q: str, kinds: Iterable[str] | None = None, limit: int = 30) -> list[dict]:
        kinds = list(kinds or KINDS)
        marks = ",".join("?" * len(kinds))
        out: list[dict] = []
        for any_word in (False, True):  # all words first; fall back to any word
            fq = self.fts_query(q, any_word)
            if not fq:
                return []
            with self.lock:
                rows = self.conn.execute(
                    f"""SELECT kind, ref, title, snippet(search_fts, 3, '[', ']', '…', 14) AS excerpt, bm25(search_fts, 0, 0, 4.0, 1.0) AS rank
                        FROM search_fts WHERE search_fts MATCH ? AND kind IN ({marks}) ORDER BY rank LIMIT ?""",
                    (fq, *kinds, limit),
                ).fetchall()
            out = [dict(r) for r in rows]
            if out:
                break
        return out

    def semantic(self, q: str, kinds: Iterable[str] | None = None, limit: int = 30) -> list[dict]:
        emb = self.embedder
        if not emb:
            return []
        kinds = list(kinds or KINDS)
        marks = ",".join("?" * len(kinds))
        try:
            qv = emb.embed([q])[0]
        except Exception:
            return []
        with self.lock:
            rows = self.conn.execute(f"SELECT kind, ref, vec FROM search_vec WHERE kind IN ({marks})", kinds).fetchall()
        scored = sorted(((_cos(qv, _unpack(r["vec"])), r["kind"], r["ref"]) for r in rows), reverse=True)[:limit]
        return [{"kind": k, "ref": ref, "sim": s} for s, k, ref in scored if s > 0.25]

    def search(self, q: str, kinds: Iterable[str] | None = None, limit: int = 10) -> list[dict]:
        kinds = list(kinds or KINDS)
        kw = self.keyword(q, kinds)
        sem = self.semantic(q, kinds)
        fused: dict[tuple[str, str], dict] = {}
        for rank, r in enumerate(kw):
            key = (r["kind"], r["ref"])
            fused[key] = {"kind": r["kind"], "ref": r["ref"], "title": r["title"], "excerpt": r["excerpt"], "score": 1 / (RRF_K + rank + 1), "via": ["keyword"]}
        for rank, r in enumerate(sem):
            key = (r["kind"], r["ref"])
            item = fused.get(key)
            if not item:
                with self.lock:
                    row = self.conn.execute("SELECT title, substr(body, 1, 160) AS excerpt FROM search_fts WHERE kind = ? AND ref = ?", key).fetchone()
                if not row:
                    continue
                item = fused[key] = {"kind": key[0], "ref": key[1], "title": row["title"], "excerpt": row["excerpt"], "score": 0.0, "via": []}
            item["score"] += 1 / (RRF_K + rank + 1)
            item["via"].append("meaning")
        return sorted(fused.values(), key=lambda x: -x["score"])[:limit]

    @property
    def mode(self) -> str:
        return "hybrid" if self.embedder else "keyword"
