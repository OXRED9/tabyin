#!/usr/bin/env python3
"""Fetch/build every data file the backend needs, skipping what already exists.

  data/quran.json            built from the Tanzil files committed in data/raw/tanzil/
  data/hadeethenc.json       downloaded from the HadeethEnc.com public API (not redistributed in this repo)
  data/hadith_books.sqlite   built from Open-Hadith-Data (downloaded on first run)
  data/VERSION               the snapshot id shown next to every verdict (date + corpus sizes)
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STEPS = [
    ("data/quran.json", "scripts/build_quran.py"),
    ("data/hadeethenc.json", "scripts/fetch_hadeethenc.py"),
    ("data/hadith_books.sqlite", "scripts/build_hadith_index.py"),
    ("data/binothaimeen.json", "scripts/build_binothaimeen_index.py"),
]

if __name__ == "__main__":
    force = "--force" in sys.argv
    built = False
    for output, script in STEPS:
        if (ROOT / output).exists() and not force:
            print(f"✓ {output} already present")
            continue
        print(f"→ {script}", flush=True)
        subprocess.run([sys.executable, str(ROOT / script)], check=True)
        built = True
    if built or not (ROOT / "data" / "VERSION").exists():
        sys.path.insert(0, str(ROOT / "backend"))
        from tabayyun.dataversion import write_data_version

        print(f"data/VERSION: {write_data_version()}")
