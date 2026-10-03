"""The data snapshot a verdict was computed against (shown in the explainability panel)."""
from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache

from .config import settings

VERSION_FILE = "VERSION"


def compute_data_version() -> str:
    """Snapshot id built from the data files actually present: date of the newest one + corpus sizes."""
    from .sources.hadith import get_hadith_index
    from .sources.quran import get_quran_index

    files = [settings.data_dir / n for n in ("quran.json", "hadeethenc.json", "hadith_books.sqlite")]
    newest = max((f.stat().st_mtime for f in files if f.exists()), default=0.0)
    date = datetime.fromtimestamp(newest, tz=timezone.utc).strftime("%Y.%m.%d") if newest else "unknown"
    hadith = get_hadith_index()
    return f"{date} · quran {len(get_quran_index().ayahs)} (Tanzil Uthmani 1.1) · hadeethenc {len(hadith.hadeethenc)} · books {hadith.books_count}"


def write_data_version() -> str:
    version = compute_data_version()
    (settings.data_dir / VERSION_FILE).write_text(version + "\n", encoding="utf-8")
    return version


@lru_cache(maxsize=1)
def get_data_version() -> str:
    path = settings.data_dir / VERSION_FILE
    if path.exists():
        text = path.read_text(encoding="utf-8").strip()
        if text:
            return text
    return compute_data_version()
