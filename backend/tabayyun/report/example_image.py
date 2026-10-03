"""The screenshot offered as the image example on the first screen.

Drawn at run time from the Mushaf data: a chat bubble quoting part of a verse in which ONE word has
been replaced, by code, with a word from another verse — the kind of misquotation Tabayyun exists
to catch. No religious text is typed here, and the altered wording exists only inside this image.
"""
from __future__ import annotations

import io
from functools import lru_cache
from pathlib import Path

from ..sources.quran import get_quran_index

FONTS = Path(__file__).resolve().parents[1] / "assets" / "fonts"
VERSE = (49, 6)  # the first nine words are quoted
WORDS = 9
REPLACED = 6  # index of the word that is swapped
DONOR = (2, 153)  # its last word takes the place


def altered_fragment() -> tuple[str, str, str]:
    """(the altered wording, the original word, the word put in its place)."""
    quran = get_quran_index()

    def plain(ref: tuple[int, int]) -> list[str]:  # the simple-script text, as messages are usually typed
        return quran.ayahs[quran.by_ref[ref]][3].split()

    words = plain(VERSE)[:WORDS]
    donor = plain(DONOR)[-1]
    original = words[REPLACED]
    words[REPLACED] = donor
    return " ".join(words), original, donor


@lru_cache(maxsize=1)
def example_screenshot() -> bytes:
    """PNG bytes. Raises RuntimeError when Arabic shaping (libraqm) is not available."""
    from PIL import Image, ImageDraw, ImageFont, features

    if not features.check("raqm"):
        raise RuntimeError("Arabic text shaping is not available")
    regular = ImageFont.truetype(str(FONTS / "IBMPlexSansArabic-Regular.ttf"), 34, layout_engine=ImageFont.Layout.RAQM)
    strong = ImageFont.truetype(str(FONTS / "IBMPlexSansArabic-SemiBold.ttf"), 38, layout_engine=ImageFont.Layout.RAQM)
    quote, _original, _donor = altered_fragment()
    img = Image.new("RGB", (900, 420), "#E5DDD5")
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([40, 40, 860, 380], radius=24, fill="#FFFFFF")
    kw = dict(direction="rtl", language="ar", anchor="ra")
    d.text((820, 70), "رسالة محوَّلة", font=regular, fill="#6B7280", **kw)
    d.text((820, 130), "قال الله تعالى:", font=regular, fill="#111827", **kw)
    d.text((820, 195), quote, font=strong, fill="#111827", **kw)
    d.text((820, 290), "انشرها تؤجر", font=regular, fill="#111827", **kw)
    out = io.BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue()
