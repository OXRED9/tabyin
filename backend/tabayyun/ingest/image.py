"""Image -> text, exactly as written (the vision model never corrects a verse or a hadith)."""
from __future__ import annotations

import io

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


MAX_SIDE = 2000  # longest side sent to the model; enough for a phone screenshot, bounded in cost
_FORMATS = {"PNG", "JPEG", "MPO", "WEBP", "HEIF", "HEIC"}


class ImageProblem(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def prepare_image(data: bytes) -> tuple[bytes, str]:
    """Validate an uploaded image and re-encode it for the model: upright, at most MAX_SIDE pixels,
    and without its metadata (a photo's EXIF can hold a location; it never leaves this process)."""
    from PIL import Image, ImageOps

    try:
        from pillow_heif import register_heif_opener

        register_heif_opener()
    except ImportError:  # HEIC then fails as an unsupported image, with a readable message
        pass
    try:
        img = Image.open(io.BytesIO(data))
        fmt = (img.format or "").upper()
        if fmt not in _FORMATS:
            raise ImageProblem("unsupported_image")
        img.load()
        img = ImageOps.exif_transpose(img)
    except ImageProblem:
        raise
    except Exception as e:  # truncated file, decompression bomb, not an image at all
        raise ImageProblem("unsupported_image") from e
    if max(img.size) > MAX_SIDE:
        img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    out = io.BytesIO()
    if fmt in ("JPEG", "MPO", "HEIF", "HEIC"):  # photographs
        img.convert("RGB").save(out, "JPEG", quality=90)
        return out.getvalue(), "image/jpeg"
    (img if img.mode in ("RGB", "L") else img.convert("RGB")).save(out, "PNG", optimize=True)  # screenshots stay lossless
    return out.getvalue(), "image/png"

