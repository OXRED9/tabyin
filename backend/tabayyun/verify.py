"""Per-claim verification: retrieve from approved sources, hand the facts to the rules, build a card.

Nothing in this module lets a model set a state. Where an LLM is consulted it only points at one of
the retrieved source texts (``judge``); the text, reference, URL and grading on the card always come
from the source record.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from dataclasses import dataclass, field

from .config import settings
from .dataversion import get_data_version
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
    decide_attribution_by_meaning,
    decide_question,
    decide_request,
    decide_ruling,
)
from .evidence_rules.explain import LEVEL_REASONS, Facts, describe
from .extract.lexical import attributes_to_revelation, mentions_prophet
from .extract.models import JUDGEMENT_SCHEMA, SELECTION_SCHEMA, LLMJudgement, LLMSelection, RawClaim
from .extract.prompts import JUDGE_SYSTEM, SELECT_SYSTEM
from .ingest.document import Document
from .llm.base import LLMError
from .llm.router import LLMSession
from .normalize import arabic_ratio, normalize_ar, normalize_latin
from .schemas import (
    ReferralMatch,
    Alternative,
    Card,
    Certainty,
    ClaimType,
    ContentLevel,
    EvidenceState,
    Explain,
    ExplainCandidate,
    Grade,
    SourceRef,
    Translation,
)
from .sources import quranenc
from .sources.binothaimeen import SITE_AR as BINOTHAIMEEN_AR
from .sources.binothaimeen import SITE_EN as BINOTHAIMEEN_EN
from .sources.binothaimeen import get_title_index
from .sources.shamela import SOURCE_NAME as SHAMELA_NAME
from .sources.shamela import ShamelaPage, get_shamela, named_in
from .sources.dorar import SOURCE_NAME as DORAR_NAME
from .sources.dorar import SOURCE_NAME_EN as DORAR_NAME_EN
from .sources.dorar import DorarClient, DorarHit
from .sources.hadith import BOOKS_NAME_EN, HADEETHENC_NAME_AR, HADEETHENC_NAME_EN, HadithCandidate, HadithIndex, content_words
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
    llm: LLMSession
    llm_enabled: bool  # False in lexical-only mode
    ui_lang: str = "ar"
    # The verses and narrations the text itself quotes (found by the scans). A statement that reports
    # one of them by meaning ("the Prophet gave the example of ...") can be tied to it.
    recited: list[RawClaim] = field(default_factory=list)


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


def _shared_vocabulary(claim_text: str, source_text: str) -> tuple[int, float]:
    """(number of shared word stems, share of the claim's stems found in the source)."""
    if arabic_ratio(claim_text) < 0.5:
        a = {w for w in normalize_latin(claim_text).split() if len(w) > 3}
        b = {w for w in normalize_latin(source_text).split() if len(w) > 3}
    else:
        a, b = _stems(claim_text), _stems(source_text)
    return (len(a & b), len(a & b) / len(a)) if a else (0, 0.0)


def _lexical_floor(claim_text: str, source_text: str, minimum: float) -> bool:
    """A model's pointer is only honoured when the two texts share real vocabulary."""
    return _shared_vocabulary(claim_text, source_text)[1] >= minimum


async def judge_relation(ctx: Context, task: str, claim_text: str, texts: list[str], *, patient: bool = False) -> tuple[int, str] | None:
    """Ask the LLM which retrieved text (if any) corresponds to the claim, and how. Returns (index, relation) or None."""
    if not ctx.llm_enabled or not texts:
        return None
    # Evidence texts are cut shorter than narrations being matched: the pointer reasons over every text
    # it is shown, and with long texts it ran past its time limit on settled rulings.
    cut = 700 if task == "evidence" else 1800
    listing = "\n\n".join(f"[{i}] {t[:cut]}" for i, t in enumerate(texts))
    try:
        result = await ctx.llm.complete_json(
            task="judge",
            system=JUDGE_SYSTEM,
            user=f"task = \"{task}\"\n\n<claim>\n{claim_text}\n</claim>\n\n<source_texts>\n{listing}\n</source_texts>",
            schema=JUDGEMENT_SCHEMA,
            model_cls=LLMJudgement,
            use_fallback=False,  # a pointer is only honoured from the model measured for it
            # ``patient``: the evidence pointer for a settled (level A) statement can give it its
            # reference, so it gets the time and the room to answer (measured: at 10 s / 900 tokens
            # most of these calls were cut off and every settled ruling fell back to "needs review").
            # Everywhere else the pointer can only show a text, never raise a state, and keeps the
            # short defaults — a lecture's explanations must not hold its report for 25 s each.
            timeout=25.0 if patient else None,
            max_tokens=1500 if patient else None,
        )
    except LLMError as e:
        log.warning("judge unavailable: %s", e)
        return None
    # A pointer can lift a claim to "supported", so it is only honoured from the model that was
    # measured for the job. When the backup model answered, the claim keeps its conservative state.
    if getattr(ctx.llm, "last_call_fallback", False):
        log.warning("judge answer came from the fallback model and is not used")
        return None
    if result.relation == "none" or not (0 <= result.best_index < len(texts)):
        return None
    return result.best_index, result.relation


async def judge(ctx: Context, task: str, claim_text: str, texts: list[str]) -> int | None:
    """The index of the text that is the same narration (task "hadith_match") or states the claim explicitly (task "evidence")."""
    hit = await judge_relation(ctx, task, claim_text, texts)
    expected = "same_narration" if task == "hadith_match" else "explicit_support"
    return hit[0] if hit is not None and hit[1] == expected else None


# Rules under which the shown source is only "the closest text", not asserted to be what was quoted:
# there is no "correct text" to copy for those.
_NO_COPY_RULES = {"hadith.possible_paraphrase", "hadith.partial", "hadith.too_short", "ayah.partial_unattributed", "ayah.below_threshold", "ayah.none", "hadith.none", "quote.none"}


def _excerpt(text: str, limit: int = 160) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0] + "…"


def _copy_text(card: Card, quran_match: QuranMatch | None, ctx: Context) -> str | None:
    """F4 — the source's own wording with its reference (and grading), ready to paste."""
    src = card.source
    if src is None or card.rule_id.partition("+")[0] in _NO_COPY_RULES:
        return None
    en = ctx.ui_lang == "en"
    if src.kind == "quran" and quran_match is not None:
        m = quran_match
        ayat = str(m.ayah_start) if m.ayah_start == m.ayah_end else f"{m.ayah_start}-{m.ayah_end}"
        place = f"{m.surah_name_en} {m.surah}:{ayat}" if en else f"{m.surah_name_ar}: {ayat}"
        return f"﴿{src.text}﴾ [{place}]"
    lines = [src.text.strip(), src.ref]
    for g in card.grades[:3]:
        who = " — ".join(x for x in (g.scholar, g.book) if x)
        label = "Grading" if en else "الحكم"
        lines.append(f"{label}: {g.text.strip()}" + (f" — {who}" if who else "") + f" ({g.source_name})")
    if card.grade_unavailable:
        lines.append("Grading not available from the source" if en else "الحكم غير متاح من المصدر")
    lines.append(src.url)
    return "\n".join(lines)


def _level_reason(claim: RawClaim) -> tuple[str, str, str]:
    if claim.level_reason_origin == "model" and (claim.level_reason_ar or claim.level_reason_en):
        return claim.level_reason_ar or claim.level_reason_en, claim.level_reason_en or claim.level_reason_ar, "model"
    if claim.type in (ClaimType.ayah, ClaimType.hadith):
        key = "quoted_text"
    elif claim.type == ClaimType.request:
        key = "request"
    elif claim.content_level == ContentLevel.D:
        key = "personal_pattern"
    else:
        key = "default"
    return (*LEVEL_REASONS[key], "rule")


def _explain(card: Card, claim: RawClaim, facts: Facts, candidates: list[ExplainCandidate], ctx: Context) -> Explain:
    """F5 — the rule in words, the candidates it weighed, and what the verdict does not establish."""
    facts.level = card.content_level
    if facts.similarity is None:
        facts.similarity = card.similarity
    if card.grades and facts.grade_text is None:
        facts.grade_text, facts.grade_source, facts.grade_count = card.grades[0].text, card.grades[0].source_name, len(card.grades)
    facts.machine_transcribed = _machine_transcribed(ctx)
    facts.dorar_reachable = ctx.dorar.status != "unreachable"
    rule = describe(card.rule_id, facts)
    reason_ar, reason_en, origin = _level_reason(claim)
    for rank, c in enumerate(candidates, start=1):
        c.rank = rank
    return Explain(
        rule_ar=rule.rule_ar,
        rule_en=rule.rule_en,
        limits_ar=rule.limits_ar,
        limits_en=rule.limits_en,
        similarity=facts.similarity,
        threshold=rule.threshold,
        candidates=candidates[:5],
        level_reason_ar=reason_ar,
        level_reason_en=reason_en,
        level_reason_origin=origin,  # type: ignore[arg-type]
        data_version=get_data_version(),
    )


def _base_card(claim: RawClaim, cid: str, index: int, decision: Decision, ctx: Context, **kw) -> Card:
    candidates: list[ExplainCandidate] = kw.pop("candidates", None) or []
    facts: Facts = kw.pop("facts", None) or Facts()
    quran_match: QuranMatch | None = kw.pop("quran_match", None)
    span, ts = ctx.doc.locate(claim.start, claim.end)
    card = Card(
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
        spans=ctx.doc.locate_all(claim.start, claim.end),
        timestamp=ts,
        position=claim.start,
        **kw,
    )
    if settings.features_copy:
        card.copy_text = _copy_text(card, quran_match, ctx)
    if settings.features_explain:
        card.explain = _explain(card, claim, facts, candidates, ctx)
    return card


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
    if claim.origin != "marker" or claim.closed or len(words) <= _PREFIX_LENGTHS[0]:
        return  # a quotation closed by quotation marks is taken exactly as written
    best_n, best_sim = len(words), score(claim.quote)
    if best_sim >= 0.80:
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
    facts = Facts(similarity=m.similarity if m else None, quoted_words=m.quoted_words if m else len(claim.quote.split()))
    candidates: list[ExplainCandidate] = []
    if settings.features_explain:
        en = ctx.ui_lang == "en"
        for c in await asyncio.to_thread(ctx.quran.candidates, claim.quote, 5):
            candidates.append(
                ExplainCandidate(
                    rank=0,
                    source_name=QURAN_SOURCE_EN if en else QURAN_SOURCE_AR,
                    ref=c.ref_en if en else c.ref_ar,
                    url=c.url,
                    similarity=c.similarity,
                    chosen=bool(m and decision.state != EvidenceState.not_found and (c.surah, c.ayah_start) == (m.surah, m.ayah_start)),
                    excerpt=_excerpt(c.uthmani_text),
                )
            )
    if m is None or decision.state == EvidenceState.not_found:
        return _base_card(claim, cid, index, decision, ctx, similarity=m.similarity if m else None, certainty=Certainty.not_applicable, facts=facts, candidates=candidates)

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
        facts=facts, candidates=candidates, quran_match=m,
    )  # fmt: skip


# --------------------------------------------------------------------------- hadith


def _hadith_source(c: HadithCandidate, ctx: Context) -> SourceRef:
    en = ctx.ui_lang == "en"
    translation = None
    if c.en and (en or arabic_ratio(c.matched_span_text or "") < 0.5):
        translation = Translation(lang="en", text=c.en["hadeeth"], source_name=HADEETHENC_NAME_EN, source_url=c.en["url"])
    ref, url, name = c.ref, c.url, c.source_name
    if en and c.corpus == "hadeethenc":
        name = HADEETHENC_NAME_EN
        if c.en:  # the source's own English takhrij line and page, verbatim
            ref, url = (c.en.get("attribution") or "").strip() or ref, c.en.get("url") or url
    elif en and c.corpus == "books" and c.book:
        name, ref = BOOKS_NAME_EN, f"{BOOKS[c.book]['name_en']}, no. {c.number} (Open-Hadith-Data numbering)"
    return SourceRef(kind="hadith", source_name=name, text=c.text, ref=ref, url=url, attribution=c.attribution, explanation=c.explanation, translation=translation)


def _dorar_source(h: DorarHit, ctx: Context) -> SourceRef:
    parts = [f"الراوي: {h.narrator}" if h.narrator else "", f"المصدر: {h.book}" if h.book else "", f"الصفحة أو الرقم: {h.number}" if h.number else ""]
    name = DORAR_NAME_EN if ctx.ui_lang == "en" else DORAR_NAME
    return SourceRef(kind="hadith", source_name=name, text=h.text, ref=" · ".join(p for p in parts if p) or DORAR_NAME, url=h.url)


def _pick_primary(strong: list[HadithCandidate]) -> HadithCandidate:
    """Among the best-matching candidates prefer HadeethEnc (it carries a grading and an explanation),
    and among its records the one with the most concise takhrij line; then the two Sahihs."""
    top = strong[0].similarity
    near_top = [c for c in strong if c.similarity >= top - 0.03]
    curated = [c for c in near_top if c.corpus == "hadeethenc"]
    if curated:
        return min(curated, key=lambda c: (len(c.attribution or "") > 40, -c.similarity, len(c.attribution or "")))
    return next((c for c in near_top if c.in_sahihayn_book), strong[0])


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
            g = Grade(text=c.grade_text, source_name=HADEETHENC_NAME_EN if ctx.ui_lang == "en" else HADEETHENC_NAME_AR, source_url=c.url)
            if all((g.text, g.source_name) != (x.text, x.source_name) for x in grades):
                grades.append(g)
    # A Dorar grading belongs to one chain. When our source names the narrating Companion, gradings
    # of the same wording through a different Companion are left out rather than shown out of context.
    source_head = normalize_ar(primary.text[:260]) if primary is not None else ""
    same_chain = [x for x in dorar_strong if x[1].narrator and normalize_ar(x[1].narrator) in source_head]
    for _score, hit, _diff in (same_chain or dorar_strong)[:6]:
        if hit.grade:
            book = " — ".join(p for p in (hit.book, hit.number) if p) or None
            g = Grade(text=hit.grade, scholar=hit.scholar, book=book, narrator=hit.narrator, source_name=DORAR_NAME_EN if ctx.ui_lang == "en" else DORAR_NAME, source_url=hit.url)
            # the same scholar's same wording in several of his books is one grading, shown once
            if all((g.text, g.scholar) != (x.text, x.scholar) for x in grades):
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
    facts = Facts(similarity=round(similarity, 4) if (found or cands) else None, quoted_words=quoted_words, in_sahihayn=in_sahihayn)
    if not found and cands:
        facts.similarity = cands[0].similarity
    candidates: list[ExplainCandidate] = []
    if settings.features_explain:
        if dorar_strong and primary is None:
            hit = dorar_strong[0][1]
            src = _dorar_source(hit, ctx)
            candidates.append(ExplainCandidate(rank=0, source_name=src.source_name, ref=src.ref, url=src.url, similarity=round(dorar_strong[0][0], 4), chosen=True, grade_text=hit.grade, excerpt=_excerpt(hit.text)))
        seen_books: set[str] = set()
        for c in ([primary] if primary else []) + [c for c in cands if c is not primary]:
            label = c.book or c.key  # one row per book, so the list shows breadth rather than five versions from one book
            if label in seen_books:
                continue
            seen_books.add(label)
            src = _hadith_source(c, ctx)
            candidates.append(
                ExplainCandidate(
                    rank=0, source_name=src.source_name, ref=src.ref, url=src.url, similarity=c.similarity,
                    chosen=c is primary and decision.state != EvidenceState.not_found, grade_text=c.grade_text, excerpt=_excerpt(c.text),
                )
            )  # fmt: skip
            if len(candidates) >= 5:
                break
    if decision.state == EvidenceState.not_found:
        return _base_card(claim, cid, index, decision, ctx, similarity=round(similarity, 4) if found else None, certainty=Certainty.not_applicable, facts=facts, candidates=candidates)

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
        source, diff = _dorar_source(dorar_strong[0][1], ctx), dorar_strong[0][2]
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
        facts=facts, candidates=candidates,
    )  # fmt: skip


# --------------------------------------------------------------------------- rulings / facts


def _recited_candidate(recited: RawClaim, ctx: Context) -> tuple[str, SourceRef, list[Grade], bool] | None:
    """The source record of a verse or narration the text itself quotes: (text, source, gradings,
    accepted). Only a quotation the matchers confirm, and only a narration that carries its grading."""
    if recited.type == ClaimType.ayah:
        qm = ctx.quran.match(recited.quote)
        if qm is None or qm.similarity < THRESHOLDS.ayah_near:
            return None
        clean = " ".join(ctx.quran.ayahs[i][3] for a in range(qm.ayah_start, qm.ayah_end + 1) if (i := ctx.quran.by_ref.get((qm.surah, a))) is not None)
        return (clean, _quran_source(qm, ctx, None), [], True) if clean else None
    _orig, norm = aligned_words(recited.quote, drop_honorifics=True)
    required = THRESHOLDS.hadith_required(min(len(norm), content_words(norm) + 1))
    for c in ctx.hadith.search(recited.quote, k=10):
        if c.similarity >= required and c.grade_text:
            grade = Grade(text=c.grade_text, source_name=HADEETHENC_NAME_AR, source_url=c.url)
            return c.text, _hadith_source(c, ctx), [grade], classify_grade(c.grade_text) == GradeCategory.accepted
    return None


async def verify_statement(claim: RawClaim, cid: str, index: int, ctx: Context) -> Card:
    """Rulings and factual statements: supported only by an explicit retrieved text."""
    level = claim.content_level
    certainty = Certainty.ijtihadi if level in (ContentLevel.C, ContentLevel.D) or claim.certainty == Certainty.not_applicable else claim.certainty
    if level == ContentLevel.D:
        return _base_card(claim, cid, index, decide_ruling(level=level, explicit_text_found=False), ctx, certainty=certainty, facts=Facts(quoted_words=len(claim.quote.split())))

    query = claim.search_query or claim.quote
    candidates: list[tuple[str, SourceRef, list[Grade]]] = []
    evidence_match: QuranMatch | None = None
    m = _EVIDENCE_REF.match(claim.evidence_ref or "")
    if m and level == ContentLevel.A:
        ref = (int(m.group(1)), int(m.group(2)))
        idx = ctx.quran.by_ref.get(ref)
        if idx is not None:
            s, a, uthmani, clean = ctx.quran.ayahs[idx]
            if _shared_vocabulary(f"{claim.quote} {query}", clean)[0] >= 1:
                qm = ctx.quran.match(clean)
                if qm is not None:
                    evidence_match = qm
                    candidates.append((clean, _quran_source(qm, ctx, None), []))
    accepted: list[bool] = [True] * len(candidates)  # the verse fetched by number
    # A statement that reports what the Prophet ﷺ or the Quran says, in the speaker's words, is an
    # attribution by meaning. It is always shown, and NO retrieved text can give it a reference: it is
    # not a text. The texts this same content recites are offered first, only so that the source's own
    # wording can be shown beside it for comparison.
    attribution = attributes_to_revelation(claim.quote) and level != ContentLevel.D
    # Wider: any statement that speaks of the Prophet ﷺ (what he did, what he used to do). It is not
    # necessarily shown, but a pointer can never make it "has a reference" either.
    about_prophet = attribution or mentions_prophet(claim.quote)
    anchors: set[int] = set()
    if attribution:
        for recited in ctx.recited:
            found = await asyncio.to_thread(_recited_candidate, recited, ctx)
            if found and all(found[1].url != c[1].url or found[1].ref != c[1].ref for c in candidates):
                anchors.add(len(candidates))
                candidates.append(found[:3])
                accepted.append(found[3])
    for c in await asyncio.to_thread(ctx.hadith.topic_search, f"{query} {claim.quote}", k=5):
        if not c.grade_text:
            continue  # a narration is never shown as evidence without its grading
        if any(c.url == shown[1].url for shown in candidates):
            continue  # already offered as a text this content recites
        g = Grade(text=c.grade_text, source_name=HADEETHENC_NAME_AR, source_url=c.url)
        candidates.append((c.text, _hadith_source(c, ctx), [g]))
        accepted.append(classify_grade(c.grade_text) == GradeCategory.accepted)

    # The model points; the rules decide what the pointer is worth:
    #   "explicit_support" on an accepted text, level A or B  -> the claim has a reference (as before);
    #   any other pointer ("referenced", a weak narration, a level-C matter) -> the text is SHOWN as the
    #   evidence the speaker points at, with its grading, and the state is not raised.
    chosen: tuple[str, SourceRef, list[Grade]] | None = None
    referenced: tuple[str, SourceRef, list[Grade]] | None = None
    if attribution and anchors:
        # The text recited in this same content is the one to compare with, when the two share real
        # vocabulary: no model is asked, and the reader does not wait.
        near = max(anchors, key=lambda i: _shared_vocabulary(f"{claim.quote} {query}", candidates[i][0])[0])
        if _shared_vocabulary(f"{claim.quote} {query}", candidates[near][0])[0] >= 2:
            referenced = candidates[near]
    if referenced is None and level in (ContentLevel.A, ContentLevel.B, ContentLevel.C) and candidates:
        # Patient only where the pointer can give a settled statement its reference; for an
        # attribution it can only choose which text to show, and gets the short limit.
        hit = await judge_relation(ctx, "evidence", claim.quote, [c[0] for c in candidates], patient=level == ContentLevel.A and not about_prophet)
        if hit is not None and hit[1] in ("explicit_support", "referenced"):
            idx, relation = hit
            shared, ratio = _shared_vocabulary(f"{claim.quote} {query}", candidates[idx][0])
            # the pointed-at text must share vocabulary with the claim: one stem for a verse the
            # system fetched by number, more for a narration that only keyword search surfaced
            if shared >= 1 if candidates[idx][1].kind == "quran" else (shared >= 2 or ratio >= 0.2):
                if relation == "explicit_support" and accepted[idx] and level != ContentLevel.C and not about_prophet:
                    chosen = candidates[idx]
                else:
                    referenced = candidates[idx]

    if attribution and level != ContentLevel.C:
        decision = decide_attribution_by_meaning()
    elif claim.type == ClaimType.ruling or level in (ContentLevel.B, ContentLevel.C):
        decision = decide_ruling(level=level, explicit_text_found=chosen is not None)
    else:  # a level-A factual statement
        # Without an explicit text it is not asserted — and it is not "no source" either: that verdict
        # is for words claimed to be a quotation. A remark such as "the collector opened his book with
        # this narration" is a statement the sources here cannot confirm, which is "needs review".
        decision = decide_ruling(level=level, explicit_text_found=chosen is not None)
    decision = apply_level_caps(decision, level)

    kw: dict = {}
    if chosen and decision.state == EvidenceState.supported:
        kw = dict(source=chosen[1], grades=chosen[2], match_kind="topic")
        if chosen[1].kind == "quran" and ctx.ui_lang == "en":
            qm = ctx.quran.match(chosen[0])
            if qm:
                chosen[1].translation = await quranenc.translation(qm.surah, qm.ayah_start, qm.ayah_end, "en")
    else:
        shown = referenced or chosen  # a pointer that did not make the claim "supported" is still worth showing
        if shown:
            kw = dict(source=shown[1], grades=shown[2], match_kind="referenced")
            if attribution:
                decision.note_ar += " الحكم المعروض هو حكم النص المعروض، لا حكم هذا الكلام."
                decision.note_en += " The grading shown belongs to the text shown, not to this statement."
            decision.note_ar += " أقرب نص في المصادر لما أُشير إليه معروض مع حكمه؛ عرضه لا يعني ترجيحاً ولا حكماً من تبيّن."
            decision.note_en += " The closest text in the sources to what is referred to is shown with its grading; showing it is neither a preference nor a ruling by Tabayyun."
    if not ctx.llm_enabled and decision.state != EvidenceState.supported:
        decision.warnings.append("lexical_only")
    considered = [
        ExplainCandidate(
            rank=0, source_name=src.source_name, ref=src.ref, url=src.url, similarity=None,
            chosen=chosen is not None and src is chosen[1] and decision.state == EvidenceState.supported,
            grade_text=grades[0].text if grades else None, excerpt=_excerpt(src.text),
        )
        for _text, src, grades in candidates
    ]  # fmt: skip
    considered.sort(key=lambda c: not c.chosen)
    quran_match = evidence_match if (chosen and chosen[1].kind == "quran") else None
    return _base_card(claim, cid, index, decision, ctx, certainty=certainty, facts=Facts(quoted_words=len(claim.quote.split())), candidates=considered, quran_match=quran_match, **kw)


# --------------------------------------------------------------------------- attributed quotes


_VAGUE = re.compile(r"(?<!\w)(?:بعض|احد|علماء|العلماء|اهل|السلف|الحكماء|قيل|يقال|احدهم|الشاعر)(?!\w)")


def _names_someone(attributed_to: str | None) -> bool:
    """«ابن تيمية» names someone; «بعض أهل العلم», «أحد السلف», «قيل» do not."""
    words = normalize_ar(attributed_to or "").split()
    return bool(words) and not _VAGUE.search(" ".join(words))


_QUOTING = re.compile(r"(?<!\w)(?:قال|يقول|وقال|ويقول|قوله|ذكر|نقل|حكي)(?!\w)")


def _shamela_match(quote: str, pages: list[ShamelaPage], named: str) -> tuple[ShamelaPage, float, list, bool | str | None] | None:
    """The page where the saying is found verbatim, and what that says of its attribution:
    True — in a book by the person named; "reported" — in another scholar's book that names that
    person just before it; None — found, but the attribution cannot be checked (or no one was named).
    Among pages that hold the words, the strongest attribution wins, then the closer wording."""
    q_orig, q_norm = aligned_words(quote, drop_honorifics=True)
    found: list[tuple[int, float, ShamelaPage, list, bool | str | None]] = []
    for page in pages:
        s_orig, s_norm = aligned_words(page.text, drop_honorifics=True)
        span = best_span(q_norm, s_norm)
        if span is None or span.score < THRESHOLDS.quote_verbatim:
            continue
        before = " ".join(s_orig[max(0, span.start - 30) : span.start])
        attribution: bool | str | None = None
        if named and named_in(named, page.author):
            attribution = True
        elif named and named_in(named, before):
            attribution = "reported"
        # Where no one is named (or the name is not found), the page that does not itself quote the
        # words from someone else is the likelier original: a book that introduces them with «قال …»
        # or «يقول …» is reporting them.
        quoting = bool(_QUOTING.search(normalize_ar(" ".join(s_orig[max(0, span.start - 12) : span.start]))))
        rank = {True: 3, "reported": 2, None: 0}[attribution] + (0 if quoting else 1)
        diff = word_diff(q_orig, q_norm, s_orig[span.start : span.end], s_norm[span.start : span.end])
        found.append((rank, span.score, page, diff, attribution))
    if not found:
        return None
    # Other books that quote the words and name the one they quote them from point at the original:
    # a page whose author they name ranks above one they do not.
    def cited_by_others(page: ShamelaPage) -> bool:
        if not page.author:
            return False
        for other in pages:
            if other is page:
                continue
            s_orig, s_norm = aligned_words(other.text, drop_honorifics=True)
            span = best_span(q_norm, s_norm)
            if span is not None and span.score >= THRESHOLDS.quote_verbatim and named_in(page.author, " ".join(s_orig[max(0, span.start - 40) : span.start])):
                return True
        return False

    rank, score, page, diff, attribution = max(found, key=lambda f: (f[0], cited_by_others(f[2]), f[1]))
    return page, score, diff, attribution


def _shamela_source(page: ShamelaPage) -> SourceRef:
    where = f"، {page.where}" if page.where else ""
    return SourceRef(
        kind="book", source_name=SHAMELA_NAME, text=page.text, url=page.url,
        ref=f"{page.book}{where}" + (f" — {page.author}" if page.author else ""),
    )  # fmt: skip


async def verify_quote(claim: RawClaim, cid: str, index: int, ctx: Context) -> Card:
    cands = await asyncio.to_thread(ctx.hadith.search, claim.quote, k=10)
    best = cands[0] if cands else None
    found = best is not None and best.similarity >= THRESHOLDS.quote_verbatim
    if not found and arabic_ratio(claim.quote) >= 0.5:
        # Not a narration: the books of the scholars, on Shamela.
        pages = await get_shamela().find(claim.quote)
        hit = _shamela_match(claim.quote, pages or [], claim.attributed_to or "")
        if hit is not None:
            page, score, diff, attribution = hit
            if attribution is None and not _names_someone(claim.attributed_to):
                attribution = "unnamed"
            decision = apply_level_caps(decide_quote(found=True, similarity=score, attribution_matches=attribution), claim.content_level)
            if attribution in (None, "unnamed"):
                decision.note_ar += f" ورد بنصه في «{page.book}»" + (f" لـ{page.author}." if page.author else ".")
                decision.note_en += f" It is found verbatim in “{page.book}”" + (f" by {page.author}." if page.author else ".")
            kw = dict(source=_shamela_source(page), diff=diff, similarity=score, match_kind="exact" if score >= 0.999 else "near")
            listed = [
                ExplainCandidate(rank=0, source_name=SHAMELA_NAME, ref=_shamela_source(p).ref, url=p.url, similarity=None, chosen=p is page, excerpt=_excerpt(p.text))
                for p in (pages or [])
            ]  # fmt: skip
            facts = Facts(similarity=score, quoted_words=len(claim.quote.split()))
            return _base_card(claim, cid, index, decision, ctx, facts=facts, candidates=listed, **kw)
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
    listed: list[ExplainCandidate] = []
    for c in cands[:5]:
        src = _hadith_source(c, ctx)
        listed.append(
            ExplainCandidate(
                rank=0, source_name=src.source_name, ref=src.ref, url=src.url, similarity=c.similarity,
                chosen=c is best and decision.state != EvidenceState.not_found, grade_text=c.grade_text, excerpt=_excerpt(c.text),
            )
        )  # fmt: skip
    facts = Facts(similarity=best.similarity if best else None, quoted_words=len(claim.quote.split()))
    return _base_card(claim, cid, index, decision, ctx, facts=facts, candidates=listed, **kw)


# --------------------------------------------------------------------------- dispatch


async def _dispatch(claim: RawClaim, cid: str, index: int, ctx: Context) -> Card:
    if claim.is_question and claim.type not in (ClaimType.ayah, ClaimType.hadith) and claim.content_level != ContentLevel.D:
        # A question is referred, never answered: nothing is retrieved for it and no model is asked.
        card = _base_card(claim, cid, index, decide_question(), ctx, certainty=Certainty.not_applicable)
        card.is_question = True
        return card
    if claim.type == ClaimType.ayah:
        return await verify_ayah(claim, cid, index, ctx)
    if claim.type == ClaimType.hadith:
        return await verify_hadith(claim, cid, index, ctx)
    if claim.type == ClaimType.attributed_quote:
        return await verify_quote(claim, cid, index, ctx)
    if claim.type == ClaimType.request:
        return _base_card(claim, cid, index, decide_request(), ctx, certainty=Certainty.not_applicable)
    return await verify_statement(claim, cid, index, ctx)


_QUESTION_WORDS = re.compile(r"[؟?!.،,:«»\"']")


def _referral_query(claim: RawClaim, card: Card) -> str | None:
    """The few topic words a referral link searches a scholar's site for. For a personal case only the
    topic keywords the model named are used — never the asker's own account of his situation — and
    when there are none the link opens the site's first page."""
    words = (claim.search_query or "").split()
    if not words and card.is_question:
        words = _QUESTION_WORDS.sub(" ", claim.quote).split()
    return " ".join(words[:6]) or None


def _referral_matches(claim: RawClaim, card: Card) -> list[ReferralMatch]:
    """The nearest page on Shaykh Ibn Uthaymeen's site, by title, matched here (the question never
    leaves this server). Tried on the topic words, then on a question's own words — never on a
    personal case's own account."""
    index = get_title_index()
    if index is None:
        return []
    tries = [card.referral_query or ""] + ([claim.quote] if card.is_question and not card.personal_case else [])
    for words in tries:
        page = index.nearest(words) if words.strip() else None
        if page is not None:
            return [ReferralMatch(site_ar=BINOTHAIMEEN_AR, site_en=BINOTHAIMEEN_EN, title=page.title, url=page.url)]
    return []


async def authentic_alternatives(card: Card, claim: RawClaim, ctx: Context) -> list[Alternative]:
    """F2 — «الثابت في الباب»: for words attributed to the Prophet that have no reference, or a weak or
    rejected one, up to three ACCEPTED narrations on the same subject, retrieved from HadeethEnc with
    their gradings. Never for a verse, a ruling, a request, or a disputed or personal matter; nothing
    is generated, and when nothing fits nothing is shown.

    Keyword search proposes, a vocabulary floor filters, the model only says which of the retrieved
    texts are on the same subject. The verdict of the card is not touched.
    """
    if not (settings.features_alternatives and ctx.llm_enabled) or card.claim_type != ClaimType.hadith:
        return []
    if card.content_level not in (ContentLevel.A, ContentLevel.B):
        return []
    if not (card.state in (EvidenceState.contradicted, EvidenceState.not_found) or card.rule_id == "hadith.weak"):
        return []
    pool: list[HadithCandidate] = []
    for c in await asyncio.to_thread(ctx.hadith.topic_search, claim.quote, k=14):
        if not (c.grade_text and c.url) or classify_grade(c.grade_text) != GradeCategory.accepted:
            continue
        if card.source is not None and c.url == card.source.url:
            continue  # the narration the card is already about
        shared, ratio = _shared_vocabulary(claim.quote, c.text)
        if shared < 2 or (shared < 3 and ratio < 0.3):
            continue  # a narration that shares a word or two with the claim is not "on the same subject"
        pool.append(c)
        if len(pool) >= 6:
            break
    if not pool:
        return []
    listing = "\n\n".join(f"[{i}] {c.text[:1200]}" for i, c in enumerate(pool))
    try:
        picked = await ctx.llm.complete_json(
            task="select",
            system=SELECT_SYSTEM,
            user=f"<claim>\n{claim.quote}\n</claim>\n\n<source_texts>\n{listing}\n</source_texts>",
            schema=SELECTION_SCHEMA,
            model_cls=LLMSelection,
            use_fallback=False,
        )
    except LLMError as e:
        log.warning("alternatives unavailable: %s", e)
        return []
    out: list[Alternative] = []
    for i in dict.fromkeys(picked.indices):
        if not (0 <= i < len(pool)) or len(out) >= 3:
            continue
        c = pool[i]
        src = _hadith_source(c, ctx)
        out.append(
            Alternative(text=src.text, ref=src.ref, source_name=src.source_name, source_url=src.url, grade_text=c.grade_text,
                        grade_source_name=HADEETHENC_NAME_EN if ctx.ui_lang == "en" else HADEETHENC_NAME_AR, grade_source_url=c.url)
        )  # fmt: skip
    return out


async def verify_claim(claim: RawClaim, cid: str, index: int, ctx: Context) -> Card:
    started = time.perf_counter()
    card = await _dispatch(claim, cid, index, ctx)
    card.alternatives = await authentic_alternatives(card, claim, ctx)
    if card.referral:
        card.referral_query = _referral_query(claim, card)
        card.referral_matches = _referral_matches(claim, card)
    if card.explain is not None:
        card.explain.match_ms = int((time.perf_counter() - started) * 1000)
    return card
