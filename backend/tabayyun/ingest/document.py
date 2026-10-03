"""The unit every input type is reduced to: ordered text segments, optionally time-stamped."""
from __future__ import annotations

from bisect import bisect_right
from dataclasses import dataclass, field

from ..schemas import Segment, SourceInfo, Span, Timestamp

SEPARATOR = "\n"


class IngestError(Exception):
    """A user-facing ingestion failure. ``code`` maps to the error catalogue in report/messages.py."""

    def __init__(self, code: str, detail: str = "") -> None:
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail


@dataclass
class Document:
    source: SourceInfo
    segments: list[Segment]
    warnings: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self._offsets: list[int] = []
        pos = 0
        for seg in self.segments:
            self._offsets.append(pos)
            pos += len(seg.text) + len(SEPARATOR)
        self.full_text = SEPARATOR.join(s.text for s in self.segments)

    def locate(self, start: int, end: int) -> tuple[Span | None, Timestamp | None]:
        """Map absolute character offsets in ``full_text`` to a segment-relative span and a timestamp."""
        if not self.segments:
            return None, None
        i = max(0, bisect_right(self._offsets, start) - 1)
        seg = self.segments[i]
        rel_start = max(0, start - self._offsets[i])
        rel_end = min(len(seg.text), end - self._offsets[i])
        if rel_end <= rel_start:
            rel_end = len(seg.text)
        span = Span(segment_id=seg.id, start=rel_start, end=rel_end)
        ts = None
        if seg.start is not None:
            # Interpolate inside the segment so long segments still point near the right moment.
            frac = rel_start / max(1, len(seg.text))
            seg_end = seg.end if seg.end is not None else seg.start
            ts = Timestamp(start=round(seg.start + frac * max(0.0, seg_end - seg.start), 1), end=seg.end)
        return span, ts
