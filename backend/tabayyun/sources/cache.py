"""Disk cache for responses from approved sources.

Privacy: only *source* responses are stored. Keys are SHA-256 digests, so no user-supplied text is
ever written to disk in readable form.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import time
from functools import lru_cache

from ..config import settings


class DiskCache:
    def __init__(self) -> None:
        path = settings.data_dir / "cache"
        path.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path / "sources.sqlite", check_same_thread=False)
        self._db.execute("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, t REAL NOT NULL)")
        self._lock = threading.Lock()

    @staticmethod
    def key(namespace: str, *parts: str) -> str:
        return namespace + ":" + hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()

    def get(self, key: str, max_age: float | None = None):
        with self._lock:
            row = self._db.execute("SELECT v, t FROM kv WHERE k = ?", (key,)).fetchone()
        if not row or (max_age is not None and time.time() - row[1] > max_age):
            return None
        return json.loads(row[0])

    def set(self, key: str, value) -> None:
        with self._lock:
            self._db.execute("INSERT OR REPLACE INTO kv (k, v, t) VALUES (?,?,?)", (key, json.dumps(value, ensure_ascii=False), time.time()))
            self._db.commit()


@lru_cache(maxsize=1)
def get_cache() -> DiskCache:
    return DiskCache()
