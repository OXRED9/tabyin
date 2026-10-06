"""Algorithmic Quran matcher. No model takes part in any decision made here.

The index holds two normalised word streams over the whole Mushaf: one built from the Tanzil
simple-clean text (the spelling people type and speech-to-text produces) and one from the Uthmani
text (what people paste from Quran sites). A quoted fragment is matched against both; the verbatim
Uthmani text of the covered ayahs is what gets displayed.
"""
from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass, field
from functools import lru_cache
from math import log
from pathlib import Path

from ..config import settings
from ..normalize import normalize_ar
from ..schemas import DiffOp
from ..textalign import aligned_words, best_span, similarity, word_diff

MIN_EXACT_WORDS = 3
MIN_SCAN_WEIGHT = 12.0  # summed IDF a 4-word verbatim run needs before the free-text scan reports it
_MAX_SEEDS = 40


@dataclass
class _Stream:
    words: list[str] = field(default_factory=list)  # normalised
    originals: list[str] = field(default_factory=list)  # as written in the source text
    ayah_of: list[int] = field(default_factory=list)  # index into QuranIndex.ayahs
    trigrams: dict[tuple[str, str, str], list[int]] = field(default_factory=lambda: defaultdict(list))
    bigrams: dict[tuple[str, str], list[int]] = field(default_factory=lambda: defaultdict(list))

    def build_ngrams(self) -> None:
        w = self.words
        for i in range(len(w) - 1):
            self.bigrams[(w[i], w[i + 1])].append(i)
            if i < len(w) - 2:
                self.trigrams[(w[i], w[i + 1], w[i + 2])].append(i)


@dataclass
class QuranMatch:
    kind: str  # "exact" | "fuzzy"
    similarity: float
    surah: int
    ayah_start: int
    ayah_end: int
    surah_name_ar: str
    surah_name_en: str
    uthmani_text: str  # verbatim text of every covered ayah
    matched_source_words: list[str]  # the simple/uthmani words of the matched span (verbatim spelling)
    diff: list[DiffOp]
    quoted_words: int
    other_locations: list[tuple[int, int]] = field(default_factory=list)  # (surah, ayah) of other exact hits

    @property
    def ref_ar(self) -> str:
        if self.ayah_start == self.ayah_end:
            return f"سورة {self.surah_name_ar}، الآية {self.ayah_start}"
        return f"سورة {self.surah_name_ar}، الآيات {self.ayah_start}–{self.ayah_end}"

    @property
    def ref_en(self) -> str:
        if self.ayah_start == self.ayah_end:
            return f"Surah {self.surah_name_en} {self.surah}:{self.ayah_start}"
        return f"Surah {self.surah_name_en} {self.surah}:{self.ayah_start}–{self.ayah_end}"

    @property
    def url(self) -> str:
        # QuranEnc (approved source) page showing the ayah in the Madinah Mushaf with its translations.
        return f"https://quranenc.com/ar/browse/arabic_moyassar/{self.surah}/{self.ayah_start}"


class QuranIndex:
    def __init__(self, path: Path | None = None) -> None:
        raw = json.loads((path or settings.data_dir / "quran.json").read_text(encoding="utf-8"))
        self.meta = raw["meta"]
        self.surahs = {s["n"]: s for s in raw["surahs"]}
        self.ayahs: list[tuple[int, int, str, str]] = [tuple(a) for a in raw["ayahs"]]  # type: ignore[misc]
        self.by_ref = {(a[0], a[1]): i for i, a in enumerate(self.ayahs)}

        self.clean = _Stream()
        self.uthmani = _Stream()
        self.whole_ayah: dict[str, int] = {}
        doc_freq: dict[str, int] = defaultdict(int)
        self.word_ayahs: dict[str, list[int]] = defaultdict(list)
        for idx, (_s, _a, u_text, c_text) in enumerate(self.ayahs):
            c_orig, c_norm = aligned_words(c_text)
            u_orig, u_norm = aligned_words(u_text)
            self.clean.words += c_norm
            self.clean.originals += c_orig
            self.clean.ayah_of += [idx] * len(c_norm)
            self.uthmani.words += u_norm
            self.uthmani.originals += u_orig
            self.uthmani.ayah_of += [idx] * len(u_norm)
            self.whole_ayah.setdefault(" ".join(c_norm), idx)
            for w in set(c_norm):
                doc_freq[w] += 1
                self.word_ayahs[w].append(idx)
        self.clean.build_ngrams()
        self.uthmani.build_ngrams()
        n = len(self.ayahs)
        self.idf = {w: log(1 + n / df) for w, df in doc_freq.items()}
        # first word offset of every ayah in the clean stream
        self.ayah_start_clean: list[int] = [0] * n
        seen = -1
        for pos, a in enumerate(self.clean.ayah_of):
            if a != seen:
                self.ayah_start_clean[a] = pos
                seen = a

    # ------------------------------------------------------------------ public API

    def ayah_text(self, surah: int, ayah: int) -> str:
        return self.ayahs[self.by_ref[(surah, ayah)]][2]

    def _edge_word(self, surah: int, ayah: int, last: bool) -> set[str]:
        idx = self.by_ref.get((surah, ayah))
        if idx is None:
            return set()
        out = set()
        for text in self.ayahs[idx][2:4]:
            words = normalize_ar(text).split()
            if words:
                out.add(words[-1] if last else words[0])
        return out

    def ends_at_ayah_end(self, m: QuranMatch) -> bool:
        """The matched words run to the last word of the verse they end in."""
        return bool(m.matched_source_words) and normalize_ar(m.matched_source_words[-1]).replace(" ", "") in self._edge_word(m.surah, m.ayah_end, True)

    def starts_at_ayah_start(self, m: QuranMatch) -> bool:
        """The matched words begin with the first word of the verse they start in."""
        return bool(m.matched_source_words) and normalize_ar(m.matched_source_words[0]).replace(" ", "") in self._edge_word(m.surah, m.ayah_start, False)

    def match(self, quoted: str) -> QuranMatch | None:
        """Match a quoted fragment. Returns None when nothing in the Mushaf resembles it."""
        q_orig, q_norm = aligned_words(quoted)
        if not q_norm:
            return None

        best: QuranMatch | None = None
        for stream in (self.clean, self.uthmani):
            m = self._match_stream(stream, q_orig, q_norm)
            if m and (best is None or m.similarity > best.similarity):
                best = m
            if best and best.kind == "exact":
                break
        return best

    def find_quotes(self, text: str, min_words: int = 4) -> list[tuple[int, int, QuranMatch]]:
        """Scan free text for verbatim Quran fragments of at least ``min_words`` words.

        Returns (start_word, end_word, match) over the words of ``text`` as split by
        ``aligned_words``. Used by the extractor so that ayah detection never depends on a model.
        """
        orig, norm = aligned_words(text)
        return self.find_quotes_in(orig, norm, min_words)

    def find_quotes_in(self, orig: list[str], norm: list[str], min_words: int = 4) -> list[tuple[int, int, QuranMatch]]:
        found: list[tuple[int, int, QuranMatch]] = []
        i = 0
        while i <= len(norm) - min_words:
            run = self._longest_run_at(self.clean, norm, i)
            if run is None:
                run = self._longest_run_at(self.uthmani, norm, i)
            if run and run[1] >= min_words:
                pos, length, stream = run
                # Short runs of very common words also occur outside the Quran; require distinctive content.
                weight = sum(self.idf.get(w, 6.0) for w in norm[i : i + length])
                if length >= 5 or weight >= MIN_SCAN_WEIGHT:
                    m = self._build(stream, pos, pos + length, orig[i : i + length], norm[i : i + length], "exact", 1.0)
                    m.other_locations = self._other_exact(stream, norm[i : i + length], pos)
                    found.append((i, i + length, m))
                    i += length
                    continue
            i += 1
        return found

    # ------------------------------------------------------------------ internals

    def _longest_run_at(self, stream: _Stream, norm: list[str], i: int) -> tuple[int, int, _Stream] | None:
        if i + 2 >= len(norm):
            return None
        best: tuple[int, int, _Stream] | None = None
        for pos in stream.trigrams.get((norm[i], norm[i + 1], norm[i + 2]), ()):
            length = 3
            while i + length < len(norm) and pos + length < len(stream.words) and norm[i + length] == stream.words[pos + length]:
                length += 1
            if best is None or length > best[1]:
                best = (pos, length, stream)
        return best

    def _other_exact(self, stream: _Stream, norm: list[str], first_pos: int) -> list[tuple[int, int]]:
        if len(norm) < 3:
            return []
        out: list[tuple[int, int]] = []
        for pos in stream.trigrams.get((norm[0], norm[1], norm[2]), ()):
            if pos == first_pos or stream.words[pos : pos + len(norm)] != norm:
                continue
            s, a = self.ayahs[stream.ayah_of[pos]][:2]
            if (s, a) not in out:
                out.append((s, a))
            if len(out) >= 8:
                break
        return out

    def _match_stream(self, stream: _Stream, q_orig: list[str], q_norm: list[str]) -> QuranMatch | None:
        n = len(q_norm)

        # 1) Exact, contiguous, whole-quote match.
        if n >= MIN_EXACT_WORDS:
            for pos in stream.trigrams.get((q_norm[0], q_norm[1], q_norm[2]), ()):
                if stream.words[pos : pos + n] == q_norm:
                    m = self._build(stream, pos, pos + n, q_orig, q_norm, "exact", 1.0)
                    m.other_locations = self._other_exact(stream, q_norm, pos)
                    return m
        elif stream is self.clean:
            idx = self.whole_ayah.get(" ".join(q_norm))
            if idx is not None:  # a complete (very short) ayah quoted exactly
                pos = self.ayah_start_clean[idx]
                return self._build(stream, pos, pos + n, q_orig, q_norm, "exact", 1.0)
            return None
        else:
            return None

        # 2) Fuzzy: seed candidate windows from shared n-grams and rare words, then align.
        best: QuranMatch | None = None
        for score, start, end in self._fuzzy_spans(stream, q_norm):
            if best is None or score > best.similarity + 1e-9:
                best = self._build(stream, start, end, q_orig, q_norm, "fuzzy", score)
        if best and best.similarity >= 0.999:
            best.kind = "exact" if best.quoted_words >= MIN_EXACT_WORDS else "fuzzy"
        return best

    def _fuzzy_spans(self, stream: _Stream, q_norm: list[str]) -> list[tuple[float, int, int]]:
        """(similarity, start, end) of the best-aligned span in every seeded window, in seed order."""
        n = len(q_norm)
        seeds: dict[int, int] = defaultdict(int)  # anchor (stream position of the quote's first word) -> votes
        for i in range(n - 1):
            hits = stream.bigrams.get((q_norm[i], q_norm[i + 1]), ())
            if len(hits) > 60:
                continue
            for pos in hits:
                seeds[(pos - i) // 4] += 2 if len(hits) < 10 else 1
        if stream is self.clean:
            scores: dict[int, float] = defaultdict(float)
            for w in set(q_norm):
                postings = self.word_ayahs.get(w)
                if postings and len(postings) <= 400:
                    for a in postings:
                        scores[a] += self.idf[w]
            for a, _sc in sorted(scores.items(), key=lambda kv: -kv[1])[:12]:
                seeds[self.ayah_start_clean[a] // 4] += 1

        spans: list[tuple[float, int, int]] = []
        slack = max(4, n // 3)
        for bucket, _votes in sorted(seeds.items(), key=lambda kv: -kv[1])[:_MAX_SEEDS]:
            anchor = bucket * 4
            lo = max(0, anchor - slack)
            hi = min(len(stream.words), anchor + n + slack + 4)
            span = best_span(q_norm, stream.words[lo:hi])
            if span is not None:
                spans.append((span.score, lo + span.start, lo + span.end))
        return spans

    def candidates(self, quoted: str, k: int = 5) -> list[QuranMatch]:
        """The ``k`` closest places in the Mushaf, best first — what the explainability panel lists."""
        q_orig, q_norm = aligned_words(quoted)
        if not q_norm:
            return []
        by_place: dict[tuple[int, int], QuranMatch] = {}

        def keep(m: QuranMatch) -> None:
            key = (m.surah, m.ayah_start)
            if key not in by_place or m.similarity > by_place[key].similarity:
                by_place[key] = m

        n = len(q_norm)
        for stream in (self.clean, self.uthmani):
            if n >= MIN_EXACT_WORDS:
                for pos in stream.trigrams.get((q_norm[0], q_norm[1], q_norm[2]), ()):
                    if stream.words[pos : pos + n] == q_norm:
                        keep(self._build(stream, pos, pos + n, q_orig, q_norm, "exact", 1.0))
            if by_place:
                continue
            if n >= MIN_EXACT_WORDS:
                for score, start, end in sorted(self._fuzzy_spans(stream, q_norm), key=lambda x: -x[0])[: k * 2]:
                    keep(self._build(stream, start, end, q_orig, q_norm, "fuzzy", score))
        return sorted(by_place.values(), key=lambda m: (-m.similarity, m.surah, m.ayah_start))[:k]

    def _build(self, stream: _Stream, start: int, end: int, q_orig: list[str], q_norm: list[str], kind: str, score: float) -> QuranMatch:
        first = stream.ayah_of[start]
        last = stream.ayah_of[end - 1]
        s, a1 = self.ayahs[first][:2]
        # Never report a range that crosses a surah boundary: clamp to the first surah.
        while self.ayahs[last][0] != s:
            last -= 1
        a2 = self.ayahs[last][1]
        uthmani = " ۝ ".join(self.ayahs[i][2] for i in range(first, last + 1)) if last > first else self.ayahs[first][2]
        src_orig = stream.originals[start:end]
        src_norm = stream.words[start:end]
        return QuranMatch(
            kind=kind,
            similarity=round(score, 4),
            surah=s,
            ayah_start=a1,
            ayah_end=a2,
            surah_name_ar=self.surahs[s]["name_ar"],
            surah_name_en=self.surahs[s]["name_en"],
            uthmani_text=uthmani,
            matched_source_words=src_orig,
            diff=word_diff(q_orig, q_norm, src_orig, src_norm),
            quoted_words=len(q_norm),
        )


@lru_cache(maxsize=1)
def get_quran_index() -> QuranIndex:
    return QuranIndex()


__all__ = ["QuranIndex", "QuranMatch", "get_quran_index", "similarity", "normalize_ar"]
