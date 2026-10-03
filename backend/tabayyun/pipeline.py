"""The five-stage pipeline, streamed as events (see docs/API.md).

1 ingest -> 2 extract -> 3 match -> 4 rules -> 5 report. Cards are emitted the moment each claim is
decided; verbatim verses found by the Mushaf scan are decided before the LLM has even answered.
"""
from __future__ import annotations

import asyncio
import logging
import time
import traceback
from collections.abc import AsyncIterator, Awaitable, Callable
from pathlib import Path

from .config import settings
from .evidence_rules.thresholds import THRESHOLDS as t
from .extract import RawClaim, absorb_closed_quotes, keep_personal_cases, merge_claims, widen_scanned_verses
from .extract.lexical import extract_by_markers, scan_hadith, scan_hadith_verbatim, scan_quran
from .extract.llm_extractor import extract_with_llm
from .ingest.document import Document, IngestError
from .llm.base import LLMError
from .llm.router import get_llm
from .report.messages import error_event
from .schemas import Card, ClaimStub, ClaimType, EvidenceState, Summary
from .sources.dorar import get_dorar
from .sources.hadith import get_hadith_index
from .sources.quran import get_quran_index
from .verify import Context, verify_claim

log = logging.getLogger("tabayyun.pipeline")
Event = tuple[str, dict]
STAGES = {"ingest": 1, "extract": 2, "match": 3, "rules": 4, "report": 5}
STAGE_AR = {
    "ingest": "الحصول على النص",
    "extract": "استخراج الادّعاءات",
    "match": "المطابقة مع المصادر",
    "rules": "تحديد حالة الدليل",
    "report": "تقرير التحقق",
}
STAGE_EN = {
    "ingest": "Getting the text",
    "extract": "Extracting claims",
    "match": "Matching against sources",
    "rules": "Determining the evidence state",
    "report": "Verification report",
}
_MATCH_PARALLEL = 6
_HOLD_SECONDS = 6.0  # how long certain notes wait for the model before they are shown without it


def _where(exc: BaseException) -> str:
    """Exception type and code locations only. The message is left out on purpose: validation
    errors and the like quote their input, and the input is the user's text."""
    frames = traceback.extract_tb(exc.__traceback__)[-4:]
    return f"{type(exc).__name__} at " + " < ".join(f"{Path(f.filename).name}:{f.lineno}" for f in reversed(frames))


def stage(name: str, status: str, **extra) -> Event:
    return "stage", {"stage": name, "index": STAGES[name], "status": status, "detail_ar": STAGE_AR[name], "detail_en": STAGE_EN[name], **extra}


async def run(ingest: Callable[[], Awaitable[Document]], *, ui_lang: str = "ar", eta_ingest: int | None = None) -> AsyncIterator[Event]:
    """Run the pipeline for one request. ``ingest`` produces the Document (text, article, media)."""
    queue: asyncio.Queue[Event | None] = asyncio.Queue()
    task = asyncio.create_task(_orchestrate(ingest, ui_lang, eta_ingest, queue))
    try:
        while True:
            event = await queue.get()
            if event is None:
                break
            yield event
    finally:
        if not task.done():
            task.cancel()  # the client went away: stop spending on its request


async def _orchestrate(ingest, ui_lang: str, eta_ingest: int | None, queue: asyncio.Queue) -> None:
    started = time.monotonic()
    put = queue.put
    current = "ingest"
    try:
        # ---- 1. ingest
        await put(stage("ingest", "start", eta_seconds=eta_ingest or 2))
        try:
            doc = await ingest()
        except IngestError as e:
            await put(("error", error_event(e.code, "ingest")))
            return
        t_ingest = time.monotonic()
        await put(("source", doc.source.model_dump()))
        await put(("segments", {"segments": [s.model_dump() for s in doc.segments]}))
        await put(stage("ingest", "done"))

        # ---- 2. extract (and start matching what is already certain)
        current = "extract"
        quran, hadith, llm = get_quran_index(), get_hadith_index(), get_llm().session()
        ctx = Context(doc=doc, quran=quran, hadith=hadith, dorar=get_dorar(), llm=llm, llm_enabled=llm.available, ui_lang=ui_lang)
        text_len = len(doc.full_text)
        await put(stage("extract", "start", eta_seconds=4 + text_len // 1500 if llm.available else 1))

        sem = asyncio.Semaphore(_MATCH_PARALLEL)
        cards: list[Card] = []
        tasks: list[asyncio.Task] = []
        counter = 0
        total = 0

        async def process(claim: RawClaim, cid: str, index: int) -> None:
            async with sem:
                try:
                    card = await verify_claim(claim, cid, index, ctx)
                except Exception as e:
                    log.error("verification failed for one claim: %s", _where(e))
                    await put(("error", error_event("internal", "match", fatal=False)))
                    return
            cards.append(card)
            await put(("card", card.model_dump(mode="json")))
            await put(stage("match", "progress", done=len(cards), total=total))

        async def announce(claims: list[RawClaim]) -> None:
            nonlocal counter, total
            if not claims:
                return
            stubs = []
            total += len(claims)
            for c in claims:
                counter += 1
                cid = f"c{counter}"
                span, ts = doc.locate(c.start, c.end)
                stubs.append(ClaimStub(id=cid, index=counter, claim_type=c.type, text_as_quoted=c.quote, span=span, timestamp=ts, position=c.start))
                tasks.append(asyncio.create_task(process(c, cid, counter)))
            await put(("claims", {"claims": [s.model_dump(mode="json") for s in stubs]}))

        # Deterministic, model-free claims first: verbatim verses and narrations found by scanning,
        # and quotations delimited by quotation marks after an explicit marker.
        markers = extract_by_markers(doc)
        closed = [c for c in markers if c.closed]
        quick = await asyncio.to_thread(scan_quran, doc, quran)
        quick = absorb_closed_quotes(quick, [c for c in closed if c.type == ClaimType.ayah])
        scanned = await asyncio.to_thread(scan_hadith_verbatim, doc, hadith, [(c.start, c.end) for c in quick])
        quick = merge_claims(quick, absorb_closed_quotes(scanned, [c for c in closed if c.type == ClaimType.hadith]))
        # "قال الله تعالى:" followed by a verse with a changed word: the scan sees only the intact part.
        # The marked quotation replaces that fragment when the matcher finds it is the same verse.
        quick, _ = widen_scanned_verses(quick, [c for c in markers if not c.closed and c.type == ClaimType.ayah], quran, t.ayah_near)

        async def announce_quick() -> None:
            if quick:
                await put(stage("match", "start", done=0, total=len(quick)))
                await announce(quick)

        mode = "full"
        rest: list[RawClaim] = []
        if llm.available:
            # What the scans found is certain, but it is held for a moment: the model may show that an
            # "exact" fragment is the intact part of a verse quoted with a changed word, and a note
            # that has been shown cannot be taken back. If the model is slow, the certain notes go out
            # first as before.
            extraction = asyncio.create_task(extract_with_llm(doc, llm, max_claims=settings.max_claims))
            held = True
            try:
                try:
                    rest = await asyncio.wait_for(asyncio.shield(extraction), timeout=_HOLD_SECONDS)
                except asyncio.TimeoutError:
                    held = False
                    await announce_quick()
                    rest = await extraction
            except LLMError as e:
                log.warning("LLM extraction failed, switching to lexical-only mode: %s", e)
                mode = "lexical_only"
            if mode == "full":
                rest = keep_personal_cases(rest, markers)
            if held:
                if mode == "full":
                    quick, rest = widen_scanned_verses(quick, rest, quran, t.ayah_near)
                await announce_quick()
        else:
            mode = "lexical_only"
            await announce_quick()
        if mode == "lexical_only":
            ctx.llm_enabled = False
            await put(("error", error_event("llm_unavailable", "extract", fatal=False)))
            rest = [c for c in markers if not c.closed]
            merged = merge_claims(quick, rest)
            taken = [(c.start, c.end) for c in merged]
            rest = rest + await asyncio.to_thread(scan_hadith, doc, hadith, taken)

        merged = merge_claims(quick, rest)
        new = [c for c in merged if all(c is not q for q in quick)][: max(0, settings.max_claims - len(quick))]
        t_extract = time.monotonic()
        await put(stage("extract", "done"))

        # ---- 3. match (+ 4. rules, applied inside verify_claim)
        current = "match"
        if not quick:
            await put(stage("match", "start", done=0, total=len(new)))
        await announce(new)
        if total == 0:
            await put(("error", error_event("no_claims", "extract", fatal=False)))
        if tasks:
            await asyncio.gather(*tasks)
        await put(stage("match", "done", done=len(cards), total=total))
        await put(stage("rules", "done"))

        # ---- 5. report
        current = "report"
        by_state = {s: 0 for s in EvidenceState}
        for card in cards:
            by_state[card.state] += 1
        warnings = list(dict.fromkeys(doc.warnings))
        if ctx.dorar.status == "unreachable":
            warnings.append("dorar_unreachable")
        if mode == "full" and llm.fallback_used:
            warnings.append("llm_fallback")  # the backup model answered: the UI shows "reduced coverage"
        summary = Summary(
            total=len(cards),
            by_state=by_state,
            mode=mode,  # type: ignore[arg-type]
            llm_provider=", ".join(llm.models_used) if mode == "full" and llm.models_used else None,
            warnings=warnings,
            elapsed_seconds=round(time.monotonic() - started, 2),
            stage_seconds={
                "ingest": round(t_ingest - started, 2),
                "extract": round(t_extract - t_ingest, 2),
                "match": round(time.monotonic() - t_extract, 2),
                "total": round(time.monotonic() - started, 2),
            },
        )
        await put(("summary", summary.model_dump(mode="json")))
        await put(stage("report", "done"))
    except asyncio.CancelledError:
        raise
    except Exception as e:
        log.error("pipeline failed: %s", _where(e))
        await put(("error", error_event("internal", current)))
    finally:
        await put(("done", {}))
        await put(None)


async def collect(ingest: Callable[[], Awaitable[Document]], *, ui_lang: str = "ar") -> dict:
    """Run to completion and return everything (used by tests and the evaluation harness)."""
    out: dict = {"cards": [], "errors": [], "segments": [], "summary": None, "source": None}
    async for name, data in run(ingest, ui_lang=ui_lang):
        if name == "card":
            out["cards"].append(data)
        elif name == "error":
            out["errors"].append(data)
        elif name == "segments":
            out["segments"] = data["segments"]
        elif name in ("summary", "source"):
            out[name] = data
    out["cards"].sort(key=lambda c: c["position"])
    return out
