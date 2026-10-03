from __future__ import annotations

from ..schemas import ClaimType
from .models import RawClaim


def overlap(a: RawClaim, b: RawClaim) -> int:
    return max(0, min(a.end, b.end) - max(a.start, b.start))


def merge_claims(primary: list[RawClaim], extra: list[RawClaim]) -> list[RawClaim]:
    """Add ``extra`` claims to ``primary`` (which wins), dropping duplicates of the same span.

    A verbatim verse found by the Mushaf scan always wins over a model's or a marker's reading of
    the same words; a longer claim that merely *contains* a verse (a hadith quoting one) is kept.
    """
    merged = list(primary)
    for c in sorted(extra, key=lambda c: c.start):
        duplicate = False
        for p in merged:
            ov = overlap(p, c)
            if not ov:
                continue
            same_kind = p.type == c.type or {p.type, c.type} <= {ClaimType.ayah, ClaimType.hadith}
            if same_kind and ov >= 0.6 * (c.end - c.start):
                if c.origin == "llm" and p.origin != "llm":  # keep what the model noticed about attribution
                    p.explicit_attribution = p.explicit_attribution or (c.explicit_attribution and c.type == p.type)
                    p.attributed_to = p.attributed_to or c.attributed_to
                duplicate = True
                break
        if not duplicate:
            merged.append(c)
    merged.sort(key=lambda c: c.start)
    return merged


__all__ = ["RawClaim", "merge_claims", "overlap"]
