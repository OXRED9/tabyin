from __future__ import annotations

from ..schemas import ClaimType
from .models import RawClaim

_QUOTED = {ClaimType.ayah, ClaimType.hadith}


def overlap(a: RawClaim, b: RawClaim) -> int:
    return max(0, min(a.end, b.end) - max(a.start, b.start))


def _compatible(a: RawClaim, b: RawClaim) -> bool:
    return a.type == b.type or {a.type, b.type} <= _QUOTED


def absorb_closed_quotes(scanned: list[RawClaim], closed: list[RawClaim]) -> list[RawClaim]:
    """A delimited, explicitly attributed quotation is one claim.

    Verbatim fragments that the scans found *inside* it (the intact parts of a misquoted verse, for
    example) are folded into it, so the reader gets one card with a diff instead of several
    "exact" fragments.
    """
    kept = list(scanned)
    for c in closed:
        inside = [p for p in kept if p.type == c.type and overlap(p, c) >= 0.9 * (p.end - p.start)]
        if len(inside) == 1 and (inside[0].end - inside[0].start) >= 0.9 * (c.end - c.start):
            inside[0].explicit_attribution = True  # the scan already covers the whole quotation
            continue
        kept = [p for p in kept if all(p is not i for i in inside)]
        kept.append(c)
    kept.sort(key=lambda c: c.start)
    return kept


def merge_claims(primary: list[RawClaim], extra: list[RawClaim]) -> list[RawClaim]:
    """Add ``extra`` claims to ``primary`` (which wins), dropping duplicates of the same span.

    A claim is a duplicate when claims of a compatible kind already cover most of it. A longer claim
    that merely *contains* a verse (a hadith quoting one) is kept.
    """
    merged = list(primary)
    for c in sorted(extra, key=lambda c: c.start):
        covering = [p for p in merged if _compatible(p, c) and overlap(p, c)]
        covered = sum(overlap(p, c) for p in covering)
        if covering and covered >= 0.6 * (c.end - c.start):
            if c.origin == "llm":  # keep what the model noticed about attribution
                for p in covering:
                    if p.origin != "llm" and p.type == c.type:
                        p.explicit_attribution = p.explicit_attribution or c.explicit_attribution
                        p.attributed_to = p.attributed_to or c.attributed_to
            continue
        merged.append(c)
    merged.sort(key=lambda c: c.start)
    return merged


__all__ = ["RawClaim", "absorb_closed_quotes", "merge_claims", "overlap"]
