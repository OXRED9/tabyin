#!/usr/bin/env python3
"""Build data/quran.json from the Tanzil text files (Uthmani, Madinah Mushaf + simple-clean).

Source files (downloaded verbatim, licence header preserved) live in data/raw/tanzil/:
  quran-uthmani.txt       https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=txt-2&agree=true
  quran-simple-clean.txt  https://tanzil.net/pub/download/index.php?quranType=simple-clean&outType=txt-2&agree=true
  quran-data.xml          https://tanzil.net/res/text/metadata/quran-data.xml

The displayed text is never altered. The only processing is separating the basmala that Tanzil
prefixes to the first ayah of each surah (it is not part of that ayah in the Mushaf numbering).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from tabayyun.normalize import normalize_ar  # noqa: E402

RAW = ROOT / "data" / "raw" / "tanzil"


def read_text(path: Path) -> dict[tuple[int, int], str]:
    out: dict[tuple[int, int], str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        s, a, text = line.split("|", 2)
        out[(int(s), int(a))] = text.strip()
    return out


def licence_header(path: Path) -> str:
    return "\n".join(l for l in path.read_text(encoding="utf-8").splitlines() if l.startswith("#"))


def main() -> None:
    uthmani = read_text(RAW / "quran-uthmani.txt")
    clean = read_text(RAW / "quran-simple-clean.txt")
    assert len(uthmani) == len(clean) == 6236, (len(uthmani), len(clean))

    surahs = []
    for m in re.finditer(r"<sura ([^>]+)/>", (RAW / "quran-data.xml").read_text(encoding="utf-8")):
        attrs = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
        surahs.append(
            {
                "n": int(attrs["index"]),
                "name_ar": attrs["name"],
                "name_en": attrs["tname"],
                "meaning_en": attrs["ename"],
                "ayas": int(attrs["ayas"]),
                "type": attrs["type"],
            }
        )
    assert len(surahs) == 114

    # The basmala is ayah 1:1; Tanzil prepends it to ayah 1 of every other surah except 9.
    basmala_words = len(uthmani[(1, 1)].split())
    basmala_norm = normalize_ar(clean[(1, 1)])
    stripped = 0
    ayahs = []
    for (s, a), u_text in uthmani.items():
        c_text = clean[(s, a)]
        if a == 1 and s not in (1, 9):
            c_words = c_text.split()
            if normalize_ar(" ".join(c_words[:basmala_words])) == basmala_norm:
                c_text = " ".join(c_words[basmala_words:])
                u_text = " ".join(u_text.split()[basmala_words:])
                stripped += 1
        ayahs.append([s, a, u_text, c_text])

    out = {
        "meta": {
            "source": "Tanzil Project — Uthmani text v1.1 (Madinah Mushaf) and simple-clean text",
            "source_url": "https://tanzil.net",
            "license": "Creative Commons Attribution 3.0 — verbatim copies only; see data/raw/tanzil/ for the full notice",
            "license_notice": licence_header(RAW / "quran-uthmani.txt"),
            "note": "Basmala prefix separated from ayah 1 of surahs other than 1 and 9; no other change to the text.",
            "basmala_uthmani": uthmani[(1, 1)],
            "ayah_fields": ["surah", "ayah", "uthmani", "simple_clean"],
        },
        "surahs": surahs,
        "ayahs": ayahs,
    }
    target = ROOT / "data" / "quran.json"
    target.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {target} — {len(ayahs)} ayahs, {len(surahs)} surahs, basmala separated in {stripped} surahs")


if __name__ == "__main__":
    main()
