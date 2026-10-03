"""Match thresholds for the deterministic evidence rules.

Initial values come from the product brief; values tuned on the test set are recorded in
docs/METHODOLOGY.md together with the evidence for each change.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Thresholds:
    # Ayah (character-level similarity between the quote and the nearest Mushaf span)
    ayah_min_exact_words: int = 3
    ayah_near: float = 0.85  # >= : supported_with_note + diff
    ayah_partial: float = 0.60  # >= and explicitly attributed to the Quran: contradicted + correct text

    # Hadith (similarity between the quote and the best-aligned span of the retrieved narration)
    hadith_exact: float = 0.95  # >= with an accepted grading: supported
    hadith_match: float = 0.80  # >= with an accepted grading: supported_with_note
    hadith_partial: float = 0.60  # below: not_found
    hadith_min_words: int = 3  # shorter quotes cannot identify a narration
    hadith_short_words: int = 4  # quotes this short must match almost exactly ...
    hadith_short_match: float = 0.95  # ... because a few common words align with many narrations

    def hadith_required(self, quoted_words: int) -> float:
        return self.hadith_short_match if quoted_words <= self.hadith_short_words else self.hadith_match

    # Short texts resemble *some* span of a large corpus by chance: measured on shuffled source
    # vocabulary, the nearest-span similarity reaches 0.70 for 6 words but stays under 0.61 from
    # 10 words up (docs/METHODOLOGY.md). The "partial" floor therefore rises for short quotes.
    partial_short_words: int = 12
    partial_short_bonus: float = 0.12

    def partial_floor(self, base: float, quoted_words: int) -> float:
        missing = max(0, self.partial_short_words - quoted_words)
        return round(base + self.partial_short_bonus * min(1.0, missing / 6), 4)

    # Attributed quotes / facts
    quote_verbatim: float = 0.90


THRESHOLDS = Thresholds()
