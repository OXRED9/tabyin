"""Deterministic text alignment helpers shared by the Quran matcher and the hadith retriever.

Everything here is plain string algorithmics (no model): locating the span of a source text that
best matches a quoted fragment, scoring it, and producing a word-level diff.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from difflib import SequenceMatcher

from rapidfuzz import fuzz
from rapidfuzz.distance import Levenshtein

from .normalize import normalize_ar
from .schemas import DiffOp

_PUNCT_SPLIT = re.compile(r"[\s،؛؟.,;:!?()\[\]{}«»\"'“”‘’﴿﴾\-–—ـ…/\\|*]+")


def words_with_offsets(text: str) -> list[tuple[int, int, str, str]]:
    """Split ``text`` into (start, end, original_word, normalised_word); words with no Arabic letters are skipped."""
    out: list[tuple[int, int, str, str]] = []
    pos = 0
    for sep in list(_PUNCT_SPLIT.finditer(text or "")) + [None]:
        end = sep.start() if sep else len(text or "")
        if end > pos:
            piece = text[pos:end]
            norm = normalize_ar(piece).replace(" ", "")
            if norm:
                out.append((pos, end, piece, norm))
        if sep:
            pos = sep.end()
    return out


def aligned_words(text: str, *, drop_honorifics: bool = False) -> tuple[list[str], list[str]]:
    """Return (original_words, normalised_words) with a 1:1 correspondence."""
    words = words_with_offsets(text)
    originals = [w[2] for w in words]
    normalised = [w[3] for w in words]
    if drop_honorifics and normalised:
        joined = normalize_ar(" ".join(normalised), drop_honorifics=True).split()
        if len(joined) != len(normalised):
            # Re-align after removing honorific formulas: keep the words that survived, in order.
            keep_o: list[str] = []
            keep_n: list[str] = []
            j = 0
            for o, n in zip(originals, normalised):
                if j < len(joined) and n == joined[j]:
                    keep_o.append(o)
                    keep_n.append(n)
                    j += 1
            if j == len(joined):
                return keep_o, keep_n
    return originals, normalised


def similarity(a: str, b: str) -> float:
    """Normalised Levenshtein similarity (0..1) between two normalised strings."""
    if not a or not b:
        return 0.0
    return Levenshtein.normalized_similarity(a, b)


@dataclass
class SpanMatch:
    start: int  # word offsets into the source word list (inclusive)
    end: int  # exclusive
    score: float  # 0..1


def best_span(query_words: list[str], source_words: list[str]) -> SpanMatch | None:
    """Find the contiguous span of ``source_words`` most similar to ``query_words``.

    Uses a character-level sliding alignment to seed the span, snaps it to word boundaries, then
    refines both edges by a few words.
    """
    if not query_words or not source_words:
        return None
    query = " ".join(query_words)
    if len(source_words) <= len(query_words):
        return SpanMatch(0, len(source_words), similarity(query, " ".join(source_words)))

    source = " ".join(source_words)
    aln = fuzz.partial_ratio_alignment(query, source)
    if aln is None:
        return None
    # Map character offsets to word indexes.
    starts: list[int] = []
    pos = 0
    for w in source_words:
        starts.append(pos)
        pos += len(w) + 1
    w_start = max(i for i, s in enumerate(starts) if s <= aln.dest_start) if aln.dest_start >= 0 else 0
    w_end = w_start
    while w_end < len(source_words) and starts[w_end] < aln.dest_end:
        w_end += 1
    w_end = max(w_end, w_start + 1)

    n = len(query_words)
    best = SpanMatch(w_start, w_end, similarity(query, " ".join(source_words[w_start:w_end])))
    slack = 3
    for s in range(max(0, w_start - slack), min(len(source_words) - 1, w_start + slack) + 1):
        lo = max(s + 1, w_end - slack)
        hi = min(len(source_words), w_end + slack)
        for e in range(lo, hi + 1):
            if abs((e - s) - n) > max(4, n // 2):
                continue
            sc = similarity(query, " ".join(source_words[s:e]))
            if sc > best.score + 1e-9:
                best = SpanMatch(s, e, sc)
    return best


def word_diff(quoted_orig: list[str], quoted_norm: list[str], source_orig: list[str], source_norm: list[str]) -> list[DiffOp]:
    """Word-level diff computed on normalised words, reported with the original spellings."""
    ops: list[DiffOp] = []
    sm = SequenceMatcher(a=quoted_norm, b=source_norm, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        ops.append(
            DiffOp(
                op=tag,  # type: ignore[arg-type]
                quoted=" ".join(quoted_orig[i1:i2]),
                source=" ".join(source_orig[j1:j2]),
            )
        )
    return ops


def is_identical(diff: list[DiffOp]) -> bool:
    return all(d.op == "equal" for d in diff)
