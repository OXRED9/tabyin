"""The nearest page on Shaykh Ibn Uthaymeen's official site for a question, matched by title.

The index (``data/binothaimeen.json``, built by ``scripts/build_binothaimeen_index.py`` from the
site's public sitemap) holds only titles and addresses. Matching is local and deterministic — word
stems weighted by how rare they are — so the reader's question never leaves this server, no model
takes part, and nothing of a fatwa is fetched or shown: only its title and a link to the site.

A match is offered only when the title shares most of the question's distinctive words; otherwise
nothing is offered and the reader keeps the site's search link.
"""

from __future__ import annotations

import json
import logging
import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from functools import lru_cache

from ..config import settings
from ..normalize import normalize_ar

log = logging.getLogger(__name__)

SITE_AR = "الموقع الرسمي للشيخ محمد بن صالح العثيمين"
SITE_EN = "Official site of Shaykh Ibn Uthaymeen"

# Words that carry no topic: question words, the word "ruling" itself, particles.
_STOP = {
    "من", "في", "علي", "عن", "ان", "الي", "ما", "لا", "هو", "هذا", "هذه", "او", "ثم", "قد", "كان", "له", "به", "لم",
    "اذا", "حتي", "هي", "التي", "الذي", "كل", "ذلك", "هل", "يا", "حكم", "ماحكم", "يجوز", "يجب", "مع", "بين", "عند",
    "حرام", "حلال", "جائز", "مكروه", "واجب", "مباح", "يحرم", "يحل", "تجوز", "شيخ", "الشيخ", "سوال", "سال", "اريد", "ابي", "ودي", "وش", "ايش", "كيف", "متي", "لماذا", "وهل", "فما", "وما",
}  # fmt: skip
_PREFIXES = ("وال", "بال", "فال", "كال", "لل", "ال", "و", "ف", "ب", "ل")
# A title must hold this share of the question's topic weight (0.6 let «صيام يوم الجمعة» reach a
# fatwa on fasting on Saturday), and at least two of its words.
MIN_COVERAGE = 0.8
MIN_SHARED = 2


def _stems(text: str) -> list[str]:
    out: list[str] = []
    for w in normalize_ar(text).split():
        w = "".join(ch for ch in w if ch.isalpha())
        if w in _STOP or len(w) < 3:
            continue
        for p in _PREFIXES:
            if w.startswith(p) and len(w) - len(p) >= 3:
                w = w[len(p) :]
                break
        if w in _STOP:
            continue
        out.append(w[:5])
    return out


@dataclass(frozen=True)
class FatwaPage:
    title: str
    url: str
    collection: str


class TitleIndex:
    def __init__(self, pages: list[dict]) -> None:
        self.pages = [FatwaPage(p["title"], p["url"], p.get("collection", "")) for p in pages]
        self._stems = [set(_stems(f"{p.title}")) for p in self.pages]
        df = Counter(s for stems in self._stems for s in stems)
        n = max(1, len(self.pages))
        self._idf = {s: math.log((n + 1) / (c + 0.5)) for s, c in df.items()}
        self._posting: dict[str, list[int]] = defaultdict(list)
        for i, stems in enumerate(self._stems):
            for s in stems:
                self._posting[s].append(i)

    def nearest(self, question: str) -> FatwaPage | None:
        query = set(_stems(question))
        weights = {s: self._idf.get(s, 0.0) for s in query}
        total = sum(weights.values())
        if total <= 0:
            return None
        scores: dict[int, float] = defaultdict(float)
        shared: dict[int, int] = defaultdict(int)
        for s, w in weights.items():
            for i in self._posting.get(s, ()):
                scores[i] += w
                shared[i] += 1
        best: tuple[float, int] | None = None
        for i, score in scores.items():
            coverage = score / total
            if coverage < MIN_COVERAGE or shared[i] < min(MIN_SHARED, len(query)):
                continue
            # Among titles that cover the question, the one with the fewest words beyond it.
            rank = coverage - 0.02 * max(0, len(self._stems[i]) - shared[i])
            if best is None or rank > best[0]:
                best = (rank, i)
        return self.pages[best[1]] if best else None


@lru_cache(maxsize=1)
def get_title_index() -> TitleIndex | None:
    path = settings.data_dir / "binothaimeen.json"
    if not path.exists():
        log.warning("data/binothaimeen.json is missing: questions get search links only (run scripts/bootstrap_data.py)")
        return None
    return TitleIndex(json.loads(path.read_text(encoding="utf-8"))["pages"])
