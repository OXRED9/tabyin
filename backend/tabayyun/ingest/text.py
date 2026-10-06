from __future__ import annotations

import re

from ..config import settings
from ..schemas import Segment, SourceInfo
from .document import Document, IngestError

_PARAGRAPH = re.compile(r"\n\s*\n|\r\n\s*\r\n")
_MAX_SEGMENT = 900
# Invisible characters that copied text carries. A zero-width space (U+200B) stands between words
# where a site or an app put it in place of a space, so it becomes one: left in, two words read as one
# and a verse pasted that way was reported "not found" (6 Oct 2026). Joiners and direction marks sit
# inside words and are dropped by the matchers' normalisation; they are left as they are.
_ZERO_WIDTH_SPACE = re.compile("[\u200b\u2060\ufeff\u180e]")


def clean_pasted(text: str) -> str:
    """Pasted text as the matchers can read it: zero-width spaces become spaces (nothing else changes)."""
    return _ZERO_WIDTH_SPACE.sub(" ", text or "")


def segments_from_text(text: str) -> list[Segment]:
    """Paragraphs become segments; very long paragraphs are split on sentence ends."""
    pieces: list[str] = []
    for para in _PARAGRAPH.split(text.replace("\r\n", "\n")):
        for line in para.split("\n"):
            line = line.strip()
            while len(line) > _MAX_SEGMENT:
                cut = max(line.rfind(". ", 0, _MAX_SEGMENT), line.rfind("؟ ", 0, _MAX_SEGMENT), line.rfind("! ", 0, _MAX_SEGMENT))
                cut = cut + 1 if cut > _MAX_SEGMENT // 3 else line.rfind(" ", 0, _MAX_SEGMENT)
                if cut <= 0:
                    cut = _MAX_SEGMENT
                pieces.append(line[:cut].strip())
                line = line[cut:].strip()
            if line:
                pieces.append(line)
    return [Segment(id=i, text=p) for i, p in enumerate(pieces)]


def ingest_text(text: str | None) -> Document:
    if not text or not text.strip():
        raise IngestError("empty_input")
    if len(text) > settings.max_text_chars:
        raise IngestError("input_too_long")
    return Document(source=SourceInfo(input_type="text"), segments=segments_from_text(clean_pasted(text)))
