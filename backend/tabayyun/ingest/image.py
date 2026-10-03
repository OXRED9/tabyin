"""Image -> text, exactly as written (the vision model never corrects a verse or a hadith)."""
from __future__ import annotations

from ..extract.models import OCR_SCHEMA, OCRResult
from ..extract.prompts import OCR_SYSTEM
from ..llm.openrouter import LLMSession, image_part, text_part


async def read_image(data: bytes, mime: str, session: LLMSession, *, model: str | None = None) -> OCRResult:
    """Raises LLMError when no vision-capable model answered."""
    return await session.complete_json(
        task="vision",
        system=OCR_SYSTEM,
        user=[text_part("Transcribe the text in this image as instructed."), image_part(data, mime)],
        schema=OCR_SCHEMA,
        model_cls=OCRResult,
        model=model,
    )
