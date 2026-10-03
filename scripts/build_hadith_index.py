#!/usr/bin/env python3
"""Build data/hadith_books.sqlite (FTS5) from the Open-Hadith-Data project.

Source: https://github.com/mhashim6/Open-Hadith-Data (ODbL 1.0 / DbCL 1.0).
Used for *retrieval only*: these files carry no gradings, so a hit here never yields a grading —
gradings always come verbatim from Dorar or HadeethEnc.

The dataset is downloaded on first run if data/raw/open-hadith-data is missing (no git needed).
"""
from __future__ import annotations

import csv
import io
import sqlite3
import sys
import tarfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from tabayyun.normalize import normalize_ar  # noqa: E402
from tabayyun.sources.hadith_books import BOOKS, clean_display  # noqa: E402

RAW = ROOT / "data" / "raw" / "open-hadith-data"
OUT = ROOT / "data" / "hadith_books.sqlite"
TARBALL = "https://codeload.github.com/mhashim6/Open-Hadith-Data/tar.gz/refs/heads/master"


def ensure_raw() -> None:
    if RAW.exists() and any(RAW.iterdir()):
        return
    print(f"downloading {TARBALL} …", flush=True)
    RAW.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(TARBALL, timeout=300) as resp:
        data = resp.read()
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        for member in tar.getmembers():
            parts = Path(member.name).parts[1:]  # strip the top-level folder
            if not parts or not member.isfile():
                continue
            target = RAW.joinpath(*parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            with tar.extractfile(member) as src:  # type: ignore[union-attr]
                target.write_bytes(src.read())


def main() -> None:
    ensure_raw()
    csv.field_size_limit(10**9)
    if OUT.exists():
        OUT.unlink()
    db = sqlite3.connect(OUT)
    db.executescript(
        """
        PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
        CREATE TABLE hadith (id INTEGER PRIMARY KEY, book TEXT NOT NULL, num INTEGER NOT NULL, text TEXT NOT NULL);
        CREATE VIRTUAL TABLE hadith_fts USING fts5(norm, content='', tokenize="unicode61 remove_diacritics 0");
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
        """
    )
    rowid = 0
    for key, book in BOOKS.items():
        folder = RAW / book["folder"]
        files = sorted(folder.glob("*mushakkala*.csv"))
        if not files:
            raise SystemExit(f"missing vocalised CSV for {key} in {folder}")
        count = 0
        with files[0].open(encoding="utf-8", newline="") as fh:
            for row in csv.reader(fh):
                if len(row) < 2 or not row[0].strip().isdigit():
                    continue
                text = clean_display(row[1])
                norm = normalize_ar(text, drop_honorifics=True)
                if not norm:
                    continue
                rowid += 1
                db.execute("INSERT INTO hadith (id, book, num, text) VALUES (?,?,?,?)", (rowid, key, int(row[0]), text))
                db.execute("INSERT INTO hadith_fts (rowid, norm) VALUES (?,?)", (rowid, norm))
                count += 1
        print(f"{key:10} {count:6} narrations", flush=True)
    db.execute("INSERT INTO meta VALUES ('source', 'Open-Hadith-Data (mhashim6) — ODbL 1.0')")
    db.execute("INSERT INTO meta VALUES ('count', ?)", (str(rowid),))
    db.commit()
    db.execute("INSERT INTO hadith_fts(hadith_fts) VALUES ('optimize')")
    db.commit()
    db.execute("VACUUM")
    db.close()
    print(f"wrote {OUT} — {rowid} narrations, {OUT.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
