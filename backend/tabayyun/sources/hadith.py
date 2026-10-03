"""Hadith retrieval over two corpora.

* HadeethEnc (curated; carries the source's own grading, takhrij line, explanation and URL).
* The Six Books, Muwatta and Musnad Ahmad from Open-Hadith-Data (retrieval only, no gradings).

Retrieval is lexical BM25 (SQLite FTS5) optionally fused with multilingual embeddings, followed by
a deterministic rerank: the quote is aligned against each candidate and scored by the similarity of
the best-matching span. The score that reaches the evidence rules is always that alignment score.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote as urlquote

from ..config import settings
from ..normalize import arabic_ratio, normalize_ar, normalize_latin
from ..schemas import DiffOp
from ..textalign import aligned_words, best_span, word_diff
from .hadith_books import BOOKS, DATASET_URL

HADEETHENC_NAME_AR = "موسوعة الأحاديث النبوية (HadeethEnc.com)"
HADEETHENC_NAME_EN = "Encyclopedia of Translated Prophetic Hadiths (HadeethEnc.com)"
BOOKS_NAME_AR = "كتب السنة — بيانات Open-Hadith-Data"

_STOP = {
    "من", "في", "علي", "عن", "ان", "الي", "ما", "لا", "قال", "هو", "هذا", "يا", "او", "ثم", "قد", "كان",
    "الله", "رسول", "النبي", "له", "به", "لم", "اذا", "حتي", "بن", "ابن", "ابي", "ابو", "حدثنا", "اخبرنا",
}  # fmt: skip


@dataclass
class HadithCandidate:
    corpus: str  # "hadeethenc" | "books"
    key: str  # stable id inside the corpus
    text: str  # verbatim source text
    source_name: str
    ref: str
    url: str
    similarity: float = 0.0
    lexical_rank: int = 0
    title: str | None = None
    attribution: str | None = None  # takhrij line, verbatim (HadeethEnc)
    grade_text: str | None = None  # verbatim (HadeethEnc)
    explanation: str | None = None
    book: str | None = None  # books corpus key
    number: int | None = None
    in_sahihayn_book: bool = False
    en: dict | None = None
    diff: list[DiffOp] = field(default_factory=list)
    matched_span_text: str = ""
    coverage: float = 0.0  # share of the candidate's words covered by the matched span


def _fts_query(tokens: list[str], limit: int = 36) -> str | None:
    seen: list[str] = []
    for t in tokens:
        if len(t) < 2 or t in _STOP or t in seen:
            continue
        seen.append(t)
    if len(seen) < 2:  # fall back to every token when the quote is made of very common words
        seen = list(dict.fromkeys(t for t in tokens if len(t) >= 2))
    if not seen:
        return None
    return " OR ".join(f'"{t}"' for t in seen[:limit])


class HadithIndex:
    def __init__(self, data_dir: Path | None = None) -> None:
        data_dir = data_dir or settings.data_dir
        self._lock = threading.Lock()

        # --- HadeethEnc: small, kept in memory ---
        self.hadeethenc: dict[str, dict] = {}
        self._mem = sqlite3.connect(":memory:", check_same_thread=False)
        self._mem.execute('CREATE VIRTUAL TABLE ar USING fts5(norm, tokenize="unicode61 remove_diacritics 0")')
        self._mem.execute('CREATE VIRTUAL TABLE en USING fts5(norm, tokenize="porter unicode61")')
        path = data_dir / "hadeethenc.json"
        if path.exists():
            for rec in json.loads(path.read_text(encoding="utf-8"))["hadeeths"]:
                rid = int(rec["id"])
                self.hadeethenc[str(rid)] = rec
                self._mem.execute("INSERT INTO ar (rowid, norm) VALUES (?,?)", (rid, normalize_ar(rec["hadeeth"], drop_honorifics=True)))
                if rec.get("en", {}).get("hadeeth"):
                    self._mem.execute("INSERT INTO en (rowid, norm) VALUES (?,?)", (rid, normalize_latin(rec["en"]["hadeeth"])))
            self._mem.commit()

        # --- Books: on disk ---
        self._books: sqlite3.Connection | None = None
        self.books_count = 0
        books_path = data_dir / "hadith_books.sqlite"
        if books_path.exists():
            self._books = sqlite3.connect(f"file:{books_path}?mode=ro", uri=True, check_same_thread=False)
            self.books_count = int(self._books.execute("SELECT value FROM meta WHERE key='count'").fetchone()[0])

    # ------------------------------------------------------------------ candidates

    def _hadeethenc_candidate(self, rid: str, rank: int) -> HadithCandidate:
        rec = self.hadeethenc[rid]
        return HadithCandidate(
            corpus="hadeethenc",
            key=rid,
            text=rec["hadeeth"],
            source_name=HADEETHENC_NAME_AR,
            ref=(rec.get("attribution") or "").strip() or f"HadeethEnc #{rid}",
            url=rec["url"],
            lexical_rank=rank,
            title=rec.get("title"),
            attribution=rec.get("attribution"),
            grade_text=(rec.get("grade") or "").strip() or None,
            explanation=rec.get("explanation"),
            en=rec.get("en"),
        )

    def _book_candidate(self, row: tuple, rank: int) -> HadithCandidate:
        _id, book, num, text = row
        meta = BOOKS[book]
        # A search link on Dorar lets the reader verify the narration and read scholars' gradings.
        probe = " ".join(normalize_ar(text, drop_honorifics=True).split()[-12:])
        return HadithCandidate(
            corpus="books",
            key=f"{book}:{num}",
            text=text,
            source_name=BOOKS_NAME_AR,
            ref=f"{meta['name_ar']}، رقم {num} (ترقيم Open-Hadith-Data)",
            url=f"https://dorar.net/hadith/search?q={urlquote(probe)}",
            lexical_rank=rank,
            book=book,
            number=num,
            in_sahihayn_book=bool(meta["sahih"]),
        )

    def search(self, quoted: str, *, k: int = 10, pool: int = 40) -> list[HadithCandidate]:
        """Return up to ``k`` candidates ordered by alignment similarity (best first)."""
        if arabic_ratio(quoted) < 0.5:
            return self._search_english(quoted, k=k, pool=pool)

        q_orig, q_norm = aligned_words(quoted, drop_honorifics=True)
        query = _fts_query(q_norm)
        if not query:
            return []
        cands: list[HadithCandidate] = []
        with self._lock:
            rows = self._mem.execute("SELECT rowid FROM ar WHERE ar MATCH ? ORDER BY bm25(ar) LIMIT ?", (query, pool)).fetchall()
            cands += [self._hadeethenc_candidate(str(r[0]), i) for i, r in enumerate(rows)]
            if self._books is not None:
                rows = self._books.execute(
                    "SELECT h.id, h.book, h.num, h.text FROM hadith_fts f JOIN hadith h ON h.id = f.rowid "
                    "WHERE hadith_fts MATCH ? ORDER BY bm25(hadith_fts) LIMIT ?",
                    (query, pool),
                ).fetchall()
                cands += [self._book_candidate(r, i) for i, r in enumerate(rows)]

        for c in cands:
            self._align(c, q_orig, q_norm)
        cands.sort(key=lambda c: (-c.similarity, c.corpus != "hadeethenc", c.lexical_rank))
        return cands[:k]

    def _align(self, c: HadithCandidate, q_orig: list[str], q_norm: list[str]) -> None:
        s_orig, s_norm = aligned_words(c.text, drop_honorifics=True)
        span = best_span(q_norm, s_norm)
        if span is None:
            return
        c.similarity = round(span.score, 4)
        c.matched_span_text = " ".join(s_orig[span.start : span.end])
        c.coverage = (span.end - span.start) / max(1, len(s_norm))
        c.diff = word_diff(q_orig, q_norm, s_orig[span.start : span.end], s_norm[span.start : span.end])

    def _search_english(self, quoted: str, *, k: int, pool: int) -> list[HadithCandidate]:
        """English quotes are matched against HadeethEnc's published English translations."""
        q_words = [w for w in normalize_latin(quoted).split() if len(w) > 2]
        if len(q_words) < 2:
            return []
        query = " OR ".join(f'"{w}"' for w in dict.fromkeys(q_words[:40]))
        with self._lock:
            rows = self._mem.execute("SELECT rowid FROM en WHERE en MATCH ? ORDER BY bm25(en) LIMIT ?", (query, pool)).fetchall()
        out: list[HadithCandidate] = []
        q_norm = normalize_latin(quoted).split()
        for i, r in enumerate(rows):
            c = self._hadeethenc_candidate(str(r[0]), i)
            en_text = c.en["hadeeth"] if c.en else ""
            s_orig = en_text.split()
            s_norm = [normalize_latin(w) or "·" for w in s_orig]
            span = best_span(q_norm, s_norm)
            if span is None:
                continue
            c.similarity = round(span.score, 4)
            c.matched_span_text = " ".join(s_orig[span.start : span.end])
            c.diff = word_diff(quoted.split(), [normalize_latin(w) or "·" for w in quoted.split()], s_orig[span.start : span.end], s_norm[span.start : span.end])
            out.append(c)
        out.sort(key=lambda c: (-c.similarity, c.lexical_rank))
        return out[:k]

    def topic_search(self, text: str, *, k: int = 5) -> list[HadithCandidate]:
        """BM25 over HadeethEnc narrations for a topic or ruling statement (no alignment score)."""
        _orig, q_norm = aligned_words(text, drop_honorifics=True)
        query = _fts_query(q_norm)
        if not query:
            return []
        with self._lock:
            rows = self._mem.execute("SELECT rowid FROM ar WHERE ar MATCH ? ORDER BY bm25(ar) LIMIT ?", (query, k)).fetchall()
        return [self._hadeethenc_candidate(str(r[0]), i) for i, r in enumerate(rows)]


@lru_cache(maxsize=1)
def get_hadith_index() -> HadithIndex:
    return HadithIndex()


__all__ = ["HadithCandidate", "HadithIndex", "get_hadith_index", "DATASET_URL", "HADEETHENC_NAME_AR", "HADEETHENC_NAME_EN"]
