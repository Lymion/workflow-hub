"""The Hub object: paths + one database connection, shared by every route."""
from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from typing import Iterator

from . import db
from .config import HubPaths


class Hub:
    def __init__(self, paths: HubPaths):
        self.paths = paths
        self._lock = threading.RLock()
        self.conn: sqlite3.Connection = db.connect(paths.db)
        db.init_db(self.conn)

    @contextmanager
    def tx(self) -> Iterator[sqlite3.Connection]:
        """Serialize writes; commit on success, roll back on error."""
        with self._lock:
            try:
                yield self.conn
                self.conn.commit()
            except Exception:
                self.conn.rollback()
                raise

    def query(self, sql: str, params: tuple | dict = ()) -> list[dict]:
        with self._lock:
            return [dict(r) for r in self.conn.execute(sql, params).fetchall()]

    def query_one(self, sql: str, params: tuple | dict = ()) -> dict | None:
        with self._lock:
            row = self.conn.execute(sql, params).fetchone()
            return dict(row) if row else None

    def close(self) -> None:
        with self._lock:
            self.conn.close()
