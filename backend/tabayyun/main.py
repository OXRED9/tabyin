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
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import __version__, pipeline
from .config import settings
from .ingest.document import Document, IngestError
from .ingest.text import ingest_text
from .llm.router import get_llm
from .meta import build_meta
from .report.export_html import render_report_html
from .schemas import Report, VerifyRequest
from .sources.dorar import get_dorar
from .sources.hadith import get_hadith_index
from .sources.quran import get_quran_index

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
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
if settings.cors_origins:
    app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",")], allow_methods=["*"], allow_headers=["*"])


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


@app.post("/api/verify")
async def verify(req: VerifyRequest) -> StreamingResponse:
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
async def verify_file(file: UploadFile = File(...), ui_lang: str = Form("ar")) -> StreamingResponse:
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


@app.post("/api/export/html", response_class=HTMLResponse)
async def export_html(report: Report, lang: str = "ar") -> HTMLResponse:
    return HTMLResponse(render_report_html(report, lang="en" if lang == "en" else "ar"))


# ---- static frontend (built by `npm run build` into frontend/dist) ----
_dist = settings.frontend_dist
if _dist.exists():
    if (_dist / "assets").exists():
        app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(status_code=404)
        candidate = (_dist / path).resolve()
        if path and candidate.is_file() and _dist.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(_dist / "index.html")
