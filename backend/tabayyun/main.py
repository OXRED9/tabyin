"""FastAPI application: streaming verification API + static frontend.

Privacy: request bodies are processed in memory and never written to disk or logged. Uploaded media
is held in a temporary file only for the duration of the request and deleted in a ``finally``.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import tempfile
import time
from collections import defaultdict, deque
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import __version__, pipeline
from .config import settings
from .ingest.document import Document, IngestError
from .ingest.image import ImageProblem, prepare_image, read_image
from .ingest.noise import strip_noise
from .ingest.text import ingest_text
from .llm.base import LLMError
from .llm.router import get_llm
from .meta import build_meta
from .report.export_html import render_report_html
from .report.messages import error_event
from .schemas import ContentLevel, EvidenceState, Report, ShareCardRequest, VerifyRequest
from .sources.dorar import get_dorar
from .sources.hadith import get_hadith_index
from .sources.quran import get_quran_index

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
# Privacy: HTTP client libraries log request URLs at INFO, and those URLs carry the user's words
# (a Dorar search query, a video link). Keep them out of the logs.
for _noisy in ("httpx", "httpcore", "openai", "urllib3", "trafilatura"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)
log = logging.getLogger("tabayyun")
SSE_HEADERS = {"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", "Connection": "keep-alive"}
AUDIO_VIDEO_EXT = {".mp3", ".m4a", ".wav", ".ogg", ".oga", ".opus", ".flac", ".aac", ".mp4", ".webm", ".mov", ".mkv", ".m4v", ".3gp"}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Build the indexes before the first request so the first card is fast.
    await asyncio.to_thread(get_quran_index)
    await asyncio.to_thread(get_hadith_index)
    log.info("indexes ready: %d ayahs, %d HadeethEnc narrations, %d book narrations", len(get_quran_index().ayahs), len(get_hadith_index().hadeethenc), get_hadith_index().books_count)
    yield


app = FastAPI(title="Tabayyun", version=__version__, lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")
# Scripts, styles and JSON are compressed; the middleware leaves text/event-stream alone, so the
# verification stream is never buffered.
app.add_middleware(GZipMiddleware, minimum_size=1024)
if settings.cors_origins:
    app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",")], allow_methods=["*"], allow_headers=["*"])


# Sliding-window request counter per client address. Held in memory only, never written anywhere.
_recent: dict[str, deque[float]] = defaultdict(deque)


def _rate_limited(request: Request) -> bool:
    if settings.rate_limit_requests <= 0:
        return False
    now = time.monotonic()
    window = _recent[request.client.host if request.client else "unknown"]
    while window and now - window[0] > settings.rate_limit_window_seconds:
        window.popleft()
    if len(window) >= settings.rate_limit_requests:
        return True
    window.append(now)
    if len(_recent) > 5000:  # forget idle addresses
        for key in [k for k, v in _recent.items() if not v or now - v[-1] > settings.rate_limit_window_seconds]:
            del _recent[key]
    return False


async def _refused(code: str) -> AsyncIterator[pipeline.Event]:
    yield "error", error_event(code, "ingest")
    yield "done", {}


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _stream(events: AsyncIterator[pipeline.Event]) -> AsyncIterator[str]:
    """Serialise pipeline events as SSE, with keep-alive comments while a slow stage is running."""
    it = events.__aiter__()
    pending: asyncio.Task | None = None
    try:
        while True:
            if pending is None:
                pending = asyncio.ensure_future(it.__anext__())
            done, _ = await asyncio.wait({pending}, timeout=10)
            if not done:
                yield ": keep-alive\n\n"
                continue
            try:
                name, data = pending.result()
            except StopAsyncIteration:
                break
            pending = None
            yield _sse(name, data)
    finally:
        if pending is not None and not pending.done():
            pending.cancel()
        await it.aclose()  # type: ignore[attr-defined]


@app.get("/health")
@app.get("/api/health")
async def health() -> dict:
    llm = get_llm()
    hadith = get_hadith_index()
    from .transcribe import transcription_status

    return {
        "status": "ok",
        "version": __version__,
        "mode": "full" if llm.available else "lexical_only",
        "llm": llm.status(),
        "transcription": transcription_status(),
        "sources": {
            "quran_ayahs": len(get_quran_index().ayahs),
            "hadeethenc": len(hadith.hadeethenc),
            "hadith_books": hadith.books_count,
            "dorar": get_dorar().status,
        },
    }


@app.get("/api/meta")
async def meta() -> dict:
    return build_meta()


@app.get("/admin/usage")
async def admin_usage() -> dict:
    """Development only (DEV_MODE=true): model calls and cost per day, task and model. No content is logged."""
    if not settings.dev_mode:
        raise HTTPException(status_code=404)
    from .llm.usage import get_usage_log

    return get_usage_log().summary() | {"models": get_llm().status()["models"]}


@app.post("/api/verify")
async def verify(req: VerifyRequest, request: Request) -> StreamingResponse:
    if _rate_limited(request):
        return StreamingResponse(_stream(_refused("rate_limited")), media_type="text/event-stream", headers=SSE_HEADERS)

    async def ingest() -> Document:
        if req.input_type == "text":
            return ingest_text(req.text)
        if req.input_type == "article_url":
            from .ingest.article import ingest_article

            return await ingest_article(req.url)
        from .ingest.video import ingest_video

        return await ingest_video(req.url)

    eta = {"text": 1, "article_url": 4, "video_url": 25}[req.input_type]
    return StreamingResponse(_stream(pipeline.run(ingest, ui_lang=req.ui_lang, eta_ingest=eta)), media_type="text/event-stream", headers=SSE_HEADERS)


@app.post("/api/verify/file")
async def verify_file(request: Request, file: UploadFile = File(...), ui_lang: str = Form("ar")) -> StreamingResponse:
    if _rate_limited(request):
        return StreamingResponse(_stream(_refused("rate_limited")), media_type="text/event-stream", headers=SSE_HEADERS)
    suffix = Path(file.filename or "").suffix.lower()
    limit = settings.max_upload_mb * 1024 * 1024
    tmp_path: str | None = None
    problem: str | None = None
    if suffix not in AUDIO_VIDEO_EXT:
        problem = "unsupported_file"
    else:
        with tempfile.NamedTemporaryFile(prefix="tabayyun-", suffix=suffix, delete=False) as tmp:
            tmp_path = tmp.name
            size = 0
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    problem = "file_too_large"
                    break
                tmp.write(chunk)

    async def ingest() -> Document:
        if problem:
            raise IngestError(problem)
        from .ingest.upload import ingest_file

        return await ingest_file(tmp_path, file.filename or "upload")  # type: ignore[arg-type]

    async def events() -> AsyncIterator[pipeline.Event]:
        try:
            async for ev in pipeline.run(ingest, ui_lang="en" if ui_lang == "en" else "ar", eta_ingest=30):
                yield ev
        finally:
            if tmp_path:
                Path(tmp_path).unlink(missing_ok=True)

    return StreamingResponse(_stream(events()), media_type="text/event-stream", headers=SSE_HEADERS)


@app.get("/api/examples/screenshot.png")
async def example_image() -> Response:
    """The image example of the first screen, drawn from the Mushaf data (no file in the repository)."""
    if not settings.features_image:
        raise HTTPException(status_code=404)
    from .report.example_image import example_screenshot

    try:
        png = await asyncio.to_thread(example_screenshot)
    except RuntimeError:
        raise HTTPException(status_code=404) from None
    return Response(content=png, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


@app.post("/share-target", include_in_schema=False)
async def share_target_fallback() -> RedirectResponse:
    """The installed app's service worker handles shares itself. If a share reaches the server (the
    worker is not active yet), nothing is read or kept: the browser is sent to the first screen."""
    return RedirectResponse("/?share=unavailable", status_code=303)


def _problem(status: int, code: str) -> HTTPException:
    """A JSON error with the same fields as the stream's error events: what happened + what to do."""
    return HTTPException(status_code=status, detail=error_event(code, "ingest"))


@app.post("/api/ocr")
async def ocr(request: Request, file: UploadFile = File(...)) -> dict:
    """F1: the text of a screenshot or photo, exactly as written, for the user to check and then
    verify as text. Stateless: the image is held in memory, re-encoded without its metadata, sent to
    the vision model and dropped; nothing is written to disk and no content is logged."""
    if not settings.features_image:
        raise HTTPException(status_code=404)
    if _rate_limited(request):
        raise _problem(429, "rate_limited")
    llm = get_llm()
    if not llm.can("vision"):
        raise _problem(503, "ocr_unavailable")
    limit = settings.max_image_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise _problem(413, "image_too_large")
    try:
        prepared, mime = await asyncio.to_thread(prepare_image, data)
    except ImageProblem as e:
        raise _problem(415, e.code) from None
    session = llm.session()
    try:
        result = await read_image(prepared, mime, session)
    except LLMError as e:
        log.warning("image reading failed: %s", e)  # model ids and error types only
        raise _problem(502, "ocr_failed") from None
    text, removed = strip_noise(result.text)
    if not text.strip():
        raise _problem(422, "no_text_in_image")
    confidence = min(1.0, max(0.0, result.confidence))
    unreadable = text.count("[?]")
    return {
        "text": text,
        "confidence": round(confidence, 2),
        "low_confidence": confidence < 0.8 or unreadable > 0,
        "unreadable": unreadable,  # words the model could not read are written as [?]
        "notes": result.notes.strip() or None,
        "removed": removed,
    }


@app.post("/api/export/html", response_class=HTMLResponse)
async def export_html(report: Report, lang: str = "ar") -> HTMLResponse:
    return HTMLResponse(render_report_html(report, lang="en" if lang == "en" else "ar"))


@app.post("/api/share-card")
async def share_card(req: ShareCardRequest, request: Request) -> Response:
    """F3 fallback: draw the verdict card on the server when the browser cannot. Stateless."""
    if not settings.features_share_card:
        raise HTTPException(status_code=404, detail="feature disabled")
    if _rate_limited(request):
        raise HTTPException(status_code=429, detail="rate limited")
    from .report.share_card import render_claim_card, render_summary_card, renderer_available

    if not renderer_available():
        raise HTTPException(status_code=503, detail="Arabic text shaping is not available on this server")
    app_url = (settings.public_url or str(request.base_url)).rstrip("/")
    if req.kind == "summary":
        png = await asyncio.to_thread(render_summary_card, req.summary, size=req.size, theme=req.theme, lang=req.lang, app_url=app_url, human_reviewed=req.human_reviewed)
    else:
        allowed = _reviewer_states(req.card)
        override = req.override_state if req.override_state in allowed else None
        png = await asyncio.to_thread(
            render_claim_card, req.card, size=req.size, theme=req.theme, lang=req.lang, app_url=app_url,
            abstention_verse=build_meta()["abstention_verse"], override_state=override,
        )  # fmt: skip
    return Response(content=png, media_type="image/png", headers={"Cache-Control": "no-store"})


def _reviewer_states(card) -> set:
    """States a human review may give a card — the same ceilings the engine obeys."""
    if card.content_level == ContentLevel.D:
        return set()
    if card.content_level == ContentLevel.C:
        return {EvidenceState.needs_review, EvidenceState.not_found}
    states = {EvidenceState.needs_review, EvidenceState.not_found, EvidenceState.contradicted}
    if card.source is not None:
        states |= {EvidenceState.supported, EvidenceState.supported_with_note}
    return states


# ---- static frontend (built by `npm run build` into frontend/dist) ----
_dist = settings.frontend_dist
if _dist.exists():
    if (_dist / "assets").exists():

        class _HashedAssets(StaticFiles):
            """Vite names every asset after its content hash, so a file never changes under its URL."""

            async def get_response(self, path, scope):
                response = await super().get_response(path, scope)
                if response.status_code == 200:
                    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
                return response

        app.mount("/assets", _HashedAssets(directory=_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        if path.startswith(("api/", "admin/")):
            raise HTTPException(status_code=404)
        candidate = (_dist / path).resolve()
        if path and candidate.is_file() and _dist.resolve() in candidate.parents:
            if candidate.suffix == ".webmanifest":
                return FileResponse(candidate, media_type="application/manifest+json", headers={"Cache-Control": "no-cache"})
            if candidate.name == "sw.js":  # the worker must be revalidated on every load
                return FileResponse(candidate, media_type="text/javascript", headers={"Cache-Control": "no-cache", "Service-Worker-Allowed": "/"})
            return FileResponse(candidate)
        return FileResponse(_dist / "index.html", headers={"Cache-Control": "no-cache"})
