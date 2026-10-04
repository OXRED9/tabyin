from __future__ import annotations

import re

from ..normalize import normalize_ar
from ..schemas import ClaimType, ContentLevel
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


def widen_scanned_verses(scanned: list[RawClaim], proposed: list[RawClaim], quran, near: float) -> tuple[list[RawClaim], list[RawClaim]]:
    """One note for a verse quoted with a changed word.

    The scan finds such a verse only as its intact fragment(s), each of which is "exact" on its own.
    When the model proposes a wider quotation around a fragment, and the Mushaf matcher finds that
    the wider wording is still the same verse (similarity >= ``near``), the wider claim replaces the
    fragment(s): the reader gets one note showing the word that differs, not a "supported" fragment
    beside it. The model only proposed where the quotation starts and ends; whether it is that verse
    is the matcher's decision. Returns (the scanned claims after replacement, the proposals left).
    """
    kept = list(scanned)
    left: list[RawClaim] = []
    for c in proposed:
        inside = [p for p in kept if p.type == ClaimType.ayah and overlap(p, c) >= 0.9 * (p.end - p.start)] if c.type == ClaimType.ayah else []
        if not inside or (c.end - c.start) < 1.2 * max(p.end - p.start for p in inside):
            left.append(c)
            continue
        match = quran.match(c.quote)
        fragments = [p.prematched for p in inside if p.prematched is not None]
        same_verse = match is not None and match.similarity >= near and any(
            f.surah == match.surah and f.ayah_start <= match.ayah_end and match.ayah_start <= f.ayah_end for f in fragments
        )
        if not same_verse:
            left.append(c)
            continue
        kept = [p for p in kept if all(p is not i for i in inside)]
        kept.append(c)
    kept.sort(key=lambda c: c.start)
    return kept, left


def keep_personal_cases(proposed: list[RawClaim], markers: list[RawClaim]) -> list[RawClaim]:
    """A question about the asker's own situation is level D whatever the model called it.

    The marker rules recognise such questions without a model ("طلقت … فهل يقع؟"). Where one overlaps
    a claim the model proposed, that claim becomes a level-D ruling — the level only ever moves to the
    more sensitive side — and where the model reported nothing there, the marker's claim is added.
    """
    out = list(proposed)
    for m in markers:
        if m.content_level != ContentLevel.D:
            continue
        hit = [c for c in out if overlap(c, m) >= 0.5 * min(c.end - c.start, m.end - m.start)]
        for c in hit:
            if c.type not in _QUOTED:  # a verse or narration quoted inside the question is still verified
                c.type, c.content_level, c.certainty = m.type, ContentLevel.D, m.certainty
        if not hit:
            out.append(m)
    out.sort(key=lambda c: c.start)
    return out


_NOT_WORDS = re.compile(r"[^\w\s]|_")


def _words(text: str) -> str:
    return " ".join(_NOT_WORDS.sub(" ", normalize_ar(text)).split())


def drop_noise(claims: list[RawClaim], shown: list[RawClaim] | None = None, quotations: list[RawClaim] | None = None) -> list[RawClaim]:
    """What is not worth a note of its own (``shown`` are claims already announced; they stay;
    ``quotations`` are every quotation seen in the text, including repeats that were dropped).

    * A quotation repeated in the text is reported once, at its fullest occurrence: a lecture that
      recites a narration and then refers to it by its opening words is about one narration.
    * A statement that merely contains a quotation — introduces it, names its collector, praises it —
      is not a claim: the quotation is, and it is verified. (Seen on the example clip: «رواه البخاري
      حديث "…"، من أعظم الأحاديث …» came back "needs review" beside the narration it is about.)
    * An attributed saying of one or two words cannot be checked against anything, and "no source"
      on two words is noise.
    A ruling that quotes its evidence keeps its own note, as do questions and personal cases.
    """
    shown = shown or []
    quoted = [c for c in shown + claims if c.type in _QUOTED]
    plain = {id(c): _words(c.quote) for c in quoted}
    out: list[RawClaim] = []
    for c in claims:
        if c.type == ClaimType.attributed_quote and len(_words(c.quote).split()) < 3:
            continue
        if c.type == ClaimType.fact and not c.is_question and any(q is not c and overlap(q, c) >= 0.9 * (q.end - q.start) for q in quoted + (quotations or [])):
            continue
        if c.type in _QUOTED:
            mine = plain[id(c)]
            fuller = [q for q in quoted if q is not c and q.type == c.type and len(plain[id(q)]) > len(mine) and f" {mine} " in f" {plain[id(q)]} "]
            same = [q for q in quoted if q is not c and q.type == c.type and plain[id(q)] == mine and (q in shown or q.start < c.start)]
            if len(mine.split()) >= 3 and (fuller or same):
                continue
        out.append(c)
    return out


def keep_questions(proposed: list[RawClaim], markers: list[RawClaim], looks_like_question, is_fabrication_request) -> list[RawClaim]:
    """A question put to the tool is referred, whatever the model called it (it tends to call
    "ما حكم الزكاة؟" a request for evidence, which then reads "no source").

    Only where the marker rules saw a question (short inputs): a statement, ruling or request the
    model proposed there becomes a question unless it is a personal case (level D keeps its own
    message) or a request to produce evidence (which is refused, not referred). Quoted verses and
    narrations inside the question are still verified. A question the model did not report is added.
    """
    out = list(proposed)
    for m in markers:
        if not m.is_question:
            continue
        hit = [c for c in out if overlap(c, m) >= 0.5 * min(c.end - c.start, m.end - m.start)]
        for c in hit:
            if c.type in _QUOTED or c.content_level == ContentLevel.D:
                continue
            if looks_like_question(c.quote) and not is_fabrication_request(c.quote):
                c.is_question, c.type = True, ClaimType.ruling
        if not hit:
            out.append(m)
    out.sort(key=lambda c: c.start)
    return out


__all__ = ["RawClaim", "absorb_closed_quotes", "drop_noise", "keep_personal_cases", "keep_questions", "merge_claims", "overlap", "widen_scanned_verses"]
