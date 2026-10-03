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
from dataclasses import dataclass

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
    decide_request,
    decide_ruling,
)
from .evidence_rules.explain import LEVEL_REASONS, Facts, describe
from .extract.models import JUDGEMENT_SCHEMA, LLMJudgement, RawClaim
from .extract.prompts import JUDGE_SYSTEM
from .ingest.document import Document
from .llm.base import LLMError
from .llm.router import LLMSession
from .normalize import arabic_ratio, normalize_ar, normalize_latin
from .schemas import (
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


async def judge(ctx: Context, task: str, claim_text: str, texts: list[str]) -> int | None:
    """Ask the LLM which retrieved text (if any) corresponds to the claim. Returns an index or None."""
    if not ctx.llm_enabled or not texts:
        return None
    listing = "\n\n".join(f"[{i}] {t[:1800]}" for i, t in enumerate(texts))
    try:
        result = await ctx.llm.complete_json(
            task="judge",
            system=JUDGE_SYSTEM,
            user=f"task = \"{task}\"\n\n<claim>\n{claim_text}\n</claim>\n\n<source_texts>\n{listing}\n</source_texts>",
            schema=JUDGEMENT_SCHEMA,
            model_cls=LLMJudgement,
            use_fallback=False,  # a pointer is only honoured from the model measured for it
        )
    except LLMError as e:
        log.warning("judge unavailable: %s", e)
        return None
    # A pointer can lift a claim to "supported", so it is only honoured from the model that was
    # measured for the job. When the backup model answered, the claim keeps its conservative state.
    if getattr(ctx.llm, "last_call_fallback", False):
        log.warning("judge answer came from the fallback model and is not used")
        return None
    expected = "same_narration" if task == "hadith_match" else "explicit_support"
    if result.relation != expected or not (0 <= result.best_index < len(texts)):
        return None
    return result.best_index


# Rules under which the shown source is only "the closest text", not asserted to be what was quoted:
# there is no "correct text" to copy for those.
_NO_COPY_RULES = {"hadith.partial", "hadith.too_short", "ayah.partial_unattributed", "ayah.below_threshold", "ayah.none", "hadith.none", "quote.none"}


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
    for c in await asyncio.to_thread(ctx.hadith.topic_search, f"{query} {claim.quote}", k=5):
        if classify_grade(c.grade_text) == GradeCategory.accepted:
            g = Grade(text=c.grade_text or "", source_name=HADEETHENC_NAME_AR, source_url=c.url)
            candidates.append((c.text, _hadith_source(c, ctx), [g]))

    chosen: tuple[str, SourceRef, list[Grade]] | None = None
    if level in (ContentLevel.A, ContentLevel.B) and candidates:
        idx = await judge(ctx, "evidence", claim.quote, [c[0] for c in candidates])
        if idx is not None:
            shared, ratio = _shared_vocabulary(f"{claim.quote} {query}", candidates[idx][0])
            # the pointed-at text must share vocabulary with the claim: one stem for a verse the
            # system fetched by number, more for a narration that only keyword search surfaced
            if shared >= 1 if candidates[idx][1].kind == "quran" else (shared >= 2 or ratio >= 0.2):
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
    if claim.type == ClaimType.ayah:
        return await verify_ayah(claim, cid, index, ctx)
    if claim.type == ClaimType.hadith:
        return await verify_hadith(claim, cid, index, ctx)
    if claim.type == ClaimType.attributed_quote:
        return await verify_quote(claim, cid, index, ctx)
    if claim.type == ClaimType.request:
        return _base_card(claim, cid, index, decide_request(), ctx, certainty=Certainty.not_applicable)
    return await verify_statement(claim, cid, index, ctx)


async def verify_claim(claim: RawClaim, cid: str, index: int, ctx: Context) -> Card:
    started = time.perf_counter()
    card = await _dispatch(claim, cid, index, ctx)
    if card.explain is not None:
        card.explain.match_ms = int((time.perf_counter() - started) * 1000)
    return card
