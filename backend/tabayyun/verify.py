"""Per-claim verification: retrieve from approved sources, hand the facts to the rules, build a card.

Nothing in this module lets a model set a state. Where an LLM is consulted it only points at one of
the retrieved source texts (``judge``); the text, reference, URL and grading on the card always come
from the source record.
"""
from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass

from .evidence_rules import (
    THRESHOLDS,
    Decision,
    GradeCategory,
    apply_level_caps,
    attribution_in_sahihayn,
    classify_grade,
    decide_ayah,
    decide_hadith,
    decide_quote,
    decide_request,
    decide_ruling,
)
from .extract.models import JUDGEMENT_SCHEMA, LLMJudgement, RawClaim
from .extract.prompts import JUDGE_SYSTEM
from .ingest.document import Document
from .llm.base import LLMError
from .llm.router import LLMRouter
from .normalize import arabic_ratio, normalize_ar, normalize_latin
from .schemas import (
    Card,
    Certainty,
    ClaimType,
    ContentLevel,
    EvidenceState,
    Grade,
    SourceRef,
    Translation,
)
from .sources import quranenc
from .sources.dorar import SOURCE_NAME as DORAR_NAME
from .sources.dorar import DorarClient, DorarHit
from .sources.hadith import HADEETHENC_NAME_AR, HADEETHENC_NAME_EN, HadithCandidate, HadithIndex, content_words
from .sources.hadith_books import BOOKS
from .sources.quran import QuranIndex, QuranMatch
from .textalign import aligned_words, best_span, word_diff, words_with_offsets

log = logging.getLogger("tabayyun.verify")
QURAN_SOURCE_AR = "المصحف الشريف — نص مصحف المدينة النبوية (Tanzil)"
QURAN_SOURCE_EN = "The Mushaf — Madinah Mushaf text (Tanzil)"
_PROPHET_MARKERS = ("رسول الله", "النبي", "الرسول")
_STOP = {"من", "في", "علي", "عن", "ان", "الي", "ما", "لا", "هو", "هذا", "او", "ثم", "قد", "كان", "له", "به", "لم", "اذا", "حتي", "هي", "التي", "الذي", "كل", "ذلك", "هل", "يا"}
_PREFIXES = ("وال", "بال", "فال", "كال", "لل", "ال", "و", "ف", "ب", "ل")
_EVIDENCE_REF = re.compile(r"^\s*(\d{1,3})\s*:\s*(\d{1,3})\s*$")


@dataclass
class Context:
    doc: Document
    quran: QuranIndex
    hadith: HadithIndex
    dorar: DorarClient
    llm: LLMRouter
    llm_enabled: bool  # False in lexical-only mode
    ui_lang: str = "ar"


def _stems(text: str) -> set[str]:
    out: set[str] = set()
    for w in normalize_ar(text).split():
        if w in _STOP or len(w) < 3:
            continue
        for p in _PREFIXES:
            if w.startswith(p) and len(w) - len(p) >= 3:
                w = w[len(p) :]
                break
        out.add(w[:5])
    return out


def _lexical_floor(claim_text: str, source_text: str, minimum: float) -> bool:
    """A model's pointer is only honoured when the two texts share real vocabulary."""
    if arabic_ratio(claim_text) < 0.5:
        a = {w for w in normalize_latin(claim_text).split() if len(w) > 3}
        b = {w for w in normalize_latin(source_text).split() if len(w) > 3}
    else:
        a, b = _stems(claim_text), _stems(source_text)
    return bool(a) and len(a & b) / len(a) >= minimum


async def judge(ctx: Context, task: str, claim_text: str, texts: list[str]) -> int | None:
    """Ask the LLM which retrieved text (if any) corresponds to the claim. Returns an index or None."""
    if not ctx.llm_enabled or not texts:
        return None
    listing = "\n\n".join(f"[{i}] {t[:1800]}" for i, t in enumerate(texts))
    try:
        result = await ctx.llm.complete_json(
            system=JUDGE_SYSTEM,
            user=f"task = \"{task}\"\n\n<claim>\n{claim_text}\n</claim>\n\n<source_texts>\n{listing}\n</source_texts>",
            schema=JUDGEMENT_SCHEMA,
            model_cls=LLMJudgement,
            max_tokens=4000,
        )
    except LLMError as e:
        log.warning("judge unavailable: %s", e)
        return None
    expected = "same_narration" if task == "hadith_match" else "explicit_support"
    if result.relation != expected or not (0 <= result.best_index < len(texts)):
        return None
    return result.best_index


def _base_card(claim: RawClaim, cid: str, index: int, decision: Decision, ctx: Context, **kw) -> Card:
    span, ts = ctx.doc.locate(claim.start, claim.end)
    return Card(
        id=cid,
        index=index,
        claim_type=claim.type,
        content_level=claim.content_level,
        certainty=kw.pop("certainty", claim.certainty),
        text_as_quoted=claim.quote,
        attributed_to=claim.attributed_to,
        explicit_attribution=claim.explicit_attribution,
        state=decision.state,
        action=decision.action,
        rule_id=decision.rule_id,
        note_ar=kw.pop("note_ar", decision.note_ar),
        note_en=kw.pop("note_en", decision.note_en),
        referral=decision.referral,
        personal_case=decision.personal_case,
        disagreement_noted=decision.disagreement_noted,
        grade_unavailable=decision.grade_unavailable,
        warnings=list(decision.warnings),
        span=span,
        timestamp=ts,
        position=claim.start,
        **kw,
    )


# --------------------------------------------------------------------------- ayah


def _quran_source(m: QuranMatch, ctx: Context, translation: Translation | None) -> SourceRef:
    en = ctx.ui_lang == "en"
    return SourceRef(
        kind="quran",
        source_name=QURAN_SOURCE_EN if en else QURAN_SOURCE_AR,
        text=m.uthmani_text,
        ref=m.ref_en if en else m.ref_ar,
        url=m.url if not en else f"https://quranenc.com/en/browse/english_saheeh/{m.surah}/{m.ayah_start}",
        translation=translation,
    )


_PREFIX_LENGTHS = (5, 7, 9, 12, 16, 20, 26, 34, 45)


def _trim_claim(claim: RawClaim, words: list[tuple[int, int, str, str]], n: int) -> None:
    """Shorten an open-ended quotation to its first ``n`` words (offsets stay consistent)."""
    end = words[n - 1][1]
    claim.end = claim.start + end
    claim.quote = claim.quote[:end]


def _refine_open_quote(claim: RawClaim, score) -> None:
    """A quotation found after a marker in unpunctuated text (a transcript) has no reliable end.
    Keep the longest prefix that still matches a source; ``score(text) -> similarity``."""
    words = words_with_offsets(claim.quote)
    if claim.origin != "marker" or len(words) <= _PREFIX_LENGTHS[0]:
        return
    best_n, best_sim = len(words), score(claim.quote)
    if best_sim >= 0.95:
        return
    for n in _PREFIX_LENGTHS:
        if n >= len(words):
            break
        sim = score(claim.quote[: words[n - 1][1]])
        if sim >= 0.80 and (best_sim < 0.80 or n > best_n or best_n == len(words)):
            best_n, best_sim = n, sim
        elif best_sim < 0.80 and sim > best_sim + 0.02:
            best_n, best_sim = n, sim
    if best_n < len(words):
        _trim_claim(claim, words, best_n)


def _machine_transcribed(ctx: Context) -> bool:
    return (ctx.doc.source.transcript_origin or "") in ("cloud-stt", "local-stt", "auto-captions")


async def verify_ayah(claim: RawClaim, cid: str, index: int, ctx: Context) -> Card:
    m: QuranMatch | None = claim.prematched  # type: ignore[assignment]
    if m is None:

        def match_refined() -> QuranMatch | None:
            def score(text: str) -> float:
                found = ctx.quran.match(text)
                return found.similarity if found else 0.0

            _refine_open_quote(claim, score)
            return ctx.quran.match(claim.quote)

        m = await asyncio.to_thread(match_refined)
    decision = decide_ayah(
        found=m is not None,
        exact=bool(m and m.kind == "exact"),
        similarity=m.similarity if m else 0.0,
        quoted_words=m.quoted_words if m else 0,
        explicit_attribution=claim.explicit_attribution,
        machine_transcribed=_machine_transcribed(ctx),
    )
    if m is None or decision.state == EvidenceState.not_found:
        return _base_card(claim, cid, index, decision, ctx, similarity=m.similarity if m else None, certainty=Certainty.not_applicable)

    translation = None
    if ctx.ui_lang == "en":
        translation = await quranenc.translation(m.surah, m.ayah_start, m.ayah_end, "en")
    note_ar, note_en = decision.note_ar, decision.note_en
    if m.other_locations:
        others_ar = "، ".join(f"{ctx.quran.surahs[s]['name_ar']} {a}" for s, a in m.other_locations[:4])
        others_en = ", ".join(f"{ctx.quran.surahs[s]['name_en']} {s}:{a}" for s, a in m.other_locations[:4])
        note_ar += f" وردت هذه الألفاظ أيضاً في: {others_ar}."
        note_en += f" The same words also occur in: {others_en}."
    kind = {"ayah.exact": "exact", "ayah.near": "near"}.get(decision.rule_id, "partial")
    return _base_card(
        claim, cid, index, decision, ctx,
        note_ar=note_ar, note_en=note_en,
        similarity=m.similarity,
        match_kind=kind,
        source=_quran_source(m, ctx, translation),
        diff=None if kind == "exact" else m.diff,
        certainty=Certainty.definitive if kind == "exact" else Certainty.not_applicable,
    )  # fmt: skip


# --------------------------------------------------------------------------- hadith


def _hadith_source(c: HadithCandidate, ctx: Context) -> SourceRef:
    translation = None
    if c.en and (ctx.ui_lang == "en" or arabic_ratio(c.matched_span_text or "") < 0.5):
        translation = Translation(lang="en", text=c.en["hadeeth"], source_name=HADEETHENC_NAME_EN, source_url=c.en["url"])
    return SourceRef(
        kind="hadith",
        source_name=c.source_name,
        text=c.text,
        ref=c.ref,
        url=c.url,
        attribution=c.attribution,
        explanation=c.explanation,
        translation=translation,
    )


def _dorar_source(h: DorarHit) -> SourceRef:
    parts = [f"الراوي: {h.narrator}" if h.narrator else "", f"المصدر: {h.book}" if h.book else "", f"الصفحة أو الرقم: {h.number}" if h.number else ""]
    return SourceRef(kind="hadith", source_name=DORAR_NAME, text=h.text, ref=" · ".join(p for p in parts if p) or DORAR_NAME, url=h.url)


def _pick_primary(strong: list[HadithCandidate]) -> HadithCandidate:
    top = strong[0].similarity
    near_top = [c for c in strong if c.similarity >= top - 0.03]
    for pred in (lambda c: c.corpus == "hadeethenc", lambda c: c.in_sahihayn_book):
        for c in near_top:
            if pred(c):
                return c
    return strong[0]


async def verify_hadith(claim: RawClaim, cid: str, index: int, ctx: Context) -> Card:
    t = THRESHOLDS
    english = arabic_ratio(claim.quote) < 0.5
    if not english:

        def score(text: str) -> float:
            top = ctx.hadith.search(text, k=1)
            return top[0].similarity if top else 0.0

        await asyncio.to_thread(_refine_open_quote, claim, score)
    q_orig, q_norm = aligned_words(claim.quote, drop_honorifics=True)
    quoted_words = len(claim.quote.split()) if english else min(len(q_norm), content_words(q_norm) + 1)

    local_task = asyncio.to_thread(ctx.hadith.search, claim.quote, k=40)
    dorar_task = ctx.dorar.search(claim.quote) if (ctx.dorar.reachable and not english) else asyncio.sleep(0, result=None)
    cands, dorar_hits = await asyncio.gather(local_task, dorar_task)

    required = t.hadith_required(quoted_words)
    strong = [c for c in cands if c.similarity >= required]
    primary: HadithCandidate | None = _pick_primary(strong) if strong else None
    paraphrase = False

    # Dorar hits aligned against the quote, so a grading is only copied from the same narration.
    dorar_strong: list[tuple[float, DorarHit, list]] = []
    for hit in dorar_hits or []:
        s_orig, s_norm = aligned_words(hit.text, drop_honorifics=True)
        span = best_span(q_norm, s_norm)
        if span and span.score >= required:
            diff = word_diff(q_orig, q_norm, s_orig[span.start : span.end], s_norm[span.start : span.end])
            dorar_strong.append((span.score, hit, diff))
    dorar_strong.sort(key=lambda x: -x[0])

    if primary is None and not dorar_strong and cands and quoted_words >= t.hadith_min_words:
        # Possibly reported by meaning or translated: let the model point at a retrieved narration.
        pool = sorted(cands, key=lambda c: (c.corpus != "hadeethenc", c.lexical_rank))[:5]
        for c in sorted(cands, key=lambda c: -c.similarity)[:3]:
            if c not in pool:
                pool.append(c)
        texts = [(c.en["hadeeth"] if english and c.en else c.text) for c in pool]
        idx = await judge(ctx, "hadith_match", claim.quote, texts)
        if idx is not None and _lexical_floor(claim.quote, texts[idx], 0.34):
            primary, paraphrase = pool[idx], True
            strong = [primary]

    best = primary or (cands[0] if cands else None)
    grades: list[Grade] = []
    for c in strong:
        if c.corpus == "hadeethenc" and c.grade_text:
            g = Grade(text=c.grade_text, source_name=HADEETHENC_NAME_AR, source_url=c.url)
            if all((g.text, g.source_name) != (x.text, x.source_name) for x in grades):
                grades.append(g)
    # A Dorar grading belongs to one chain. When our source names the narrating Companion, gradings
    # of the same wording through a different Companion are left out rather than shown out of context.
    source_head = normalize_ar(primary.text[:260]) if primary is not None else ""
    same_chain = [x for x in dorar_strong if x[1].narrator and normalize_ar(x[1].narrator) in source_head]
    for _score, hit, _diff in (same_chain or dorar_strong)[:6]:
        if hit.grade:
            book = " — ".join(p for p in (hit.book, hit.number) if p) or None
            if hit.narrator:
                book = f"الراوي: {hit.narrator}" + (f" · {book}" if book else "")
            g = Grade(text=hit.grade, scholar=hit.scholar, book=book, source_name=DORAR_NAME, source_url=hit.url)
            if all((g.text, g.scholar, g.book) != (x.text, x.scholar, x.book) for x in grades):
                grades.append(g)
    grades = grades[:6]

    in_sahihayn = any(c.in_sahihayn_book for c in strong) or any(attribution_in_sahihayn(c.attribution) for c in strong if c.corpus == "hadeethenc")
    found = primary is not None or bool(dorar_strong) or (best is not None and best.similarity >= t.hadith_partial)
    similarity = primary.similarity if primary else (dorar_strong[0][0] if dorar_strong else (best.similarity if best else 0.0))
    if dorar_strong and not primary:
        similarity = dorar_strong[0][0]

    decision = decide_hadith(
        found=found,
        similarity=similarity,
        paraphrase=paraphrase,
        grade_categories=[classify_grade(g.text) for g in grades],
        in_sahihayn=in_sahihayn,
        quoted_words=quoted_words,
        grading_source_reachable=ctx.dorar.status != "unreachable",
    )
    if decision.state == EvidenceState.not_found:
        return _base_card(claim, cid, index, decision, ctx, similarity=round(similarity, 4) if found else None, certainty=Certainty.not_applicable)

    note_ar, note_en = decision.note_ar, decision.note_en
    source: SourceRef | None = None
    diff = None
    others: list[SourceRef] = []
    if primary is not None:
        source, diff = _hadith_source(primary, ctx), primary.diff
        seen = {primary.key}
        for c in strong:
            label = c.book or c.corpus
            if c.key in seen or label in {o.kind + o.ref for o in others}:
                continue
            if c.corpus == "books" and any(o.ref.startswith(BOOKS[c.book]["name_ar"]) for o in others):
                continue
            seen.add(c.key)
            others.append(_hadith_source(c, ctx))
            if len(others) >= 4:
                break
    elif dorar_strong:
        source, diff = _dorar_source(dorar_strong[0][1]), dorar_strong[0][2]
    elif best is not None:  # partial similarity only: closest text, clearly not asserted
        source, diff = _hadith_source(best, ctx), best.diff

    if decision.state in (EvidenceState.supported, EvidenceState.supported_with_note) and not grades and in_sahihayn:
        note_ar += " الحديث وارد في أحد الصحيحين (البخاري أو مسلم)."
        note_en += " The narration is in one of the two Sahih collections (al-Bukhari or Muslim)."
    kind = "paraphrase" if paraphrase else {"hadith.accepted_exact": "exact", "hadith.partial": "partial"}.get(decision.rule_id, "near")
    if similarity >= t.hadith_exact and not paraphrase:
        kind = "exact"
    return _base_card(
        claim, cid, index, decision, ctx,
        note_ar=note_ar, note_en=note_en,
        similarity=round(similarity, 4),
        match_kind=kind,
        source=source,
        other_sources=others,
        grades=grades,
        diff=diff if kind != "exact" or (diff and any(d.op != "equal" for d in diff)) else None,
        certainty=Certainty.not_applicable,
    )  # fmt: skip


# --------------------------------------------------------------------------- rulings / facts


async def verify_statement(claim: RawClaim, cid: str, index: int, ctx: Context) -> Card:
    """Rulings and factual statements: supported only by an explicit retrieved text."""
    level = claim.content_level
    certainty = Certainty.ijtihadi if level in (ContentLevel.C, ContentLevel.D) or claim.certainty == Certainty.not_applicable else claim.certainty
    if level == ContentLevel.D:
        return _base_card(claim, cid, index, decide_ruling(level=level, explicit_text_found=False), ctx, certainty=certainty)

    query = claim.search_query or claim.quote
    candidates: list[tuple[str, SourceRef, list[Grade]]] = []
    m = _EVIDENCE_REF.match(claim.evidence_ref or "")
    if m and level == ContentLevel.A:
        ref = (int(m.group(1)), int(m.group(2)))
        idx = ctx.quran.by_ref.get(ref)
        if idx is not None:
            s, a, uthmani, clean = ctx.quran.ayahs[idx]
            if _lexical_floor(f"{claim.quote} {query}", clean, 0.01):
                qm = ctx.quran.match(clean)
                if qm is not None:
                    candidates.append((clean, _quran_source(qm, ctx, None), []))
    for c in await asyncio.to_thread(ctx.hadith.topic_search, f"{query} {claim.quote}", k=5):
        if classify_grade(c.grade_text) == GradeCategory.accepted:
            g = Grade(text=c.grade_text or "", source_name=HADEETHENC_NAME_AR, source_url=c.url)
            candidates.append((c.text, _hadith_source(c, ctx), [g]))

    chosen: tuple[str, SourceRef, list[Grade]] | None = None
    if level in (ContentLevel.A, ContentLevel.B) and candidates:
        idx = await judge(ctx, "evidence", claim.quote, [c[0] for c in candidates])
        if idx is not None and _lexical_floor(f"{claim.quote} {query}", candidates[idx][0], 0.15):
            chosen = candidates[idx]

    if claim.type == ClaimType.ruling or level in (ContentLevel.B, ContentLevel.C):
        decision = decide_ruling(level=level, explicit_text_found=chosen is not None)
    else:  # a level-A factual statement
        decision = decide_ruling(level=level, explicit_text_found=True) if chosen else decide_quote(found=False, similarity=0.0, attribution_matches=None)
    decision = apply_level_caps(decision, level)

    kw: dict = {}
    if chosen and decision.state == EvidenceState.supported:
        kw = dict(source=chosen[1], grades=chosen[2], match_kind="topic")
        if chosen[1].kind == "quran" and ctx.ui_lang == "en":
            qm = ctx.quran.match(chosen[0])
            if qm:
                chosen[1].translation = await quranenc.translation(qm.surah, qm.ayah_start, qm.ayah_end, "en")
    elif chosen and level == ContentLevel.C:
        kw = dict(other_sources=[chosen[1]])
    if not ctx.llm_enabled and decision.state != EvidenceState.supported:
        decision.warnings.append("lexical_only")
    return _base_card(claim, cid, index, decision, ctx, certainty=certainty, **kw)


# --------------------------------------------------------------------------- attributed quotes


async def verify_quote(claim: RawClaim, cid: str, index: int, ctx: Context) -> Card:
    cands = await asyncio.to_thread(ctx.hadith.search, claim.quote, k=10)
    best = cands[0] if cands else None
    found = best is not None and best.similarity >= THRESHOLDS.quote_verbatim
    attribution: bool | None = None
    kw: dict = {}
    if found and best is not None:
        named = normalize_ar(claim.attributed_to or "")
        claimed_prophet = any(normalize_ar(p) in named for p in _PROPHET_MARKERS)
        intro = normalize_ar(ctx.hadith.hadeethenc.get(best.key, {}).get("hadeeth_intro") or "") if best.corpus == "hadeethenc" else ""
        source_is_prophetic = any(f"قال {normalize_ar(p)}" in intro for p in _PROPHET_MARKERS)
        if source_is_prophetic and named and not claimed_prophet:
            attribution = False  # the source reports these words as the Prophet's, not the named person's
        grades = [Grade(text=best.grade_text, source_name=HADEETHENC_NAME_AR, source_url=best.url)] if best.grade_text else []
        kw = dict(source=_hadith_source(best, ctx), diff=best.diff, similarity=best.similarity, grades=grades, match_kind="near" if best.similarity < 0.999 else "exact")
    decision = apply_level_caps(decide_quote(found=found, similarity=best.similarity if best else 0.0, attribution_matches=attribution), claim.content_level)
    if decision.state == EvidenceState.not_found:
        kw = {}
    if decision.rule_id.startswith("quote.misattributed"):
        decision.note_ar += " المصدر يرويه حديثاً عن النبي ﷺ."
        decision.note_en += " The source reports it as a hadith of the Prophet ﷺ."
    return _base_card(claim, cid, index, decision, ctx, **kw)


# --------------------------------------------------------------------------- dispatch


async def verify_claim(claim: RawClaim, cid: str, index: int, ctx: Context) -> Card:
    if claim.type == ClaimType.ayah:
        return await verify_ayah(claim, cid, index, ctx)
    if claim.type == ClaimType.hadith:
        return await verify_hadith(claim, cid, index, ctx)
    if claim.type == ClaimType.attributed_quote:
        return await verify_quote(claim, cid, index, ctx)
    if claim.type == ClaimType.request:
        return _base_card(claim, cid, index, decide_request(), ctx, certainty=Certainty.not_applicable)
    return await verify_statement(claim, cid, index, ctx)
