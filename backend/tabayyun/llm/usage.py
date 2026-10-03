"""Usage and cost log (SQLite) and the daily spend guard.

One row per model call: task, model, token counts, cost, latency, outcome. Never any prompt,
response or other user content.
"""
from __future__ import annotations

import sqlite3
import threading
import time
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from ..config import settings


class UsageLog:
    def __init__(self, path: Path | None = None) -> None:
        if path is None:
            path = settings.data_dir / "cache" / "usage.sqlite"
        path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS usage (ts REAL NOT NULL, day TEXT NOT NULL, task TEXT NOT NULL, model TEXT NOT NULL, "
            "prompt_tokens INTEGER, completion_tokens INTEGER, cached_tokens INTEGER, cost_usd REAL, latency_ms INTEGER, "
            "ok INTEGER NOT NULL, fallback INTEGER NOT NULL, error TEXT)"
        )
        self._db.execute("CREATE INDEX IF NOT EXISTS usage_day ON usage(day)")
        self._lock = threading.Lock()

    @staticmethod
    def today() -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def record(self, *, task: str, model: str, prompt_tokens: int = 0, completion_tokens: int = 0, cached_tokens: int = 0,
               cost_usd: float = 0.0, latency_ms: int = 0, ok: bool = True, fallback: bool = False, error: str | None = None) -> None:  # fmt: skip
        with self._lock:
            self._db.execute(
                "INSERT INTO usage VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (time.time(), self.today(), task, model, prompt_tokens, completion_tokens, cached_tokens, cost_usd, latency_ms, int(ok), int(fallback), error),
            )
            self._db.commit()

    def spent_today(self) -> float:
        with self._lock:
            row = self._db.execute("SELECT COALESCE(SUM(cost_usd), 0) FROM usage WHERE day = ?", (self.today(),)).fetchone()
        return float(row[0])

    def summary(self, days: int = 7) -> dict:
        with self._lock:
            rows = self._db.execute(
                "SELECT day, task, model, COUNT(*), SUM(ok), SUM(fallback), SUM(prompt_tokens), SUM(completion_tokens), SUM(cached_tokens), "
                "ROUND(SUM(cost_usd), 6), CAST(AVG(latency_ms) AS INTEGER) FROM usage GROUP BY day, task, model ORDER BY day DESC, task, model"
            ).fetchall()
        keys = ("day", "task", "model", "calls", "ok", "fallback_calls", "prompt_tokens", "completion_tokens", "cached_tokens", "cost_usd", "avg_latency_ms")
        recent = sorted({r[0] for r in rows}, reverse=True)[:days]
        return {
            "today": self.today(),
            "spent_today_usd": round(self.spent_today(), 6),
            "daily_limit_usd": settings.daily_spend_limit_usd,
            "spend_guard_active": self.spent_today() >= settings.daily_spend_limit_usd > 0,
            "by_day_task_model": [dict(zip(keys, r)) for r in rows if r[0] in recent],
        }


@lru_cache(maxsize=1)
def get_usage_log() -> UsageLog:
    return UsageLog()
