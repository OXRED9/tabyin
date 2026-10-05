"""Build data/binothaimeen.json: the titles and addresses of the pages on the official site of Shaykh
Ibn Uthaymeen (binothaimeen.net), read from the site's own public sitemap.

Only titles and links are kept — never the text of a fatwa. They let a question be referred to the
nearest page on the site by title, matched locally: the reader's question never leaves our server,
and the page is opened on the scholar's own site. (docs/SOURCES.md, row 8; docs/DECISIONS.md.)

    backend/.venv/bin/python scripts/build_binothaimeen_index.py
"""

from __future__ import annotations

import http.client
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "binothaimeen.json"
SITEMAP = "https://binothaimeen.net/sitemap.xml"
UA = "Mozilla/5.0 (compatible; Tabayyun/1.0; +https://github.com/OXRED9/tabyin)"
# A page of the voice library: /ar/voice_library/lessonDetails/<collection>/<title>/<uuid>
_PAGE = re.compile(r"^https://binothaimeen\.net/ar/voice_library/lessonDetails/([^/]+)/([^/]+)/([0-9a-f-]{36})$")
# A title that only numbers a recording ("كتاب الصيام - 3", "الشريط رقم [327]") names no question.
_NUMBERED = re.compile(r"(?:-|–)\s*\d+\s*$|^\s*(?:الشريط|اللقاء|الدرس|الحلقة)\b.*\d|^\s*\d+\s*$")


def main() -> None:
    xml = ""
    for _attempt in range(3):  # a 17 MB file over a slow link: the server sometimes drops it
        try:
            request = urllib.request.Request(SITEMAP, headers={"User-Agent": UA})
            with urllib.request.urlopen(request, timeout=180) as response:
                xml = response.read().decode("utf-8", "ignore")
            break
        except (OSError, http.client.IncompleteRead) as e:
            print(f"retrying the sitemap: {type(e).__name__}", file=sys.stderr)
    seen: dict[str, dict] = {}
    for loc in re.findall(r"<loc>([^<]+)</loc>", xml):
        url = loc.strip()
        m = _PAGE.match(urllib.parse.unquote(url))
        if not m:
            continue
        collection, title, uid = (part.strip() for part in m.groups())
        title = re.sub(r"\s+", " ", title)
        if len(title) < 8 or _NUMBERED.search(title) or uid in seen:
            continue
        seen[uid] = {"title": title, "collection": collection, "url": url}
    pages = sorted(seen.values(), key=lambda p: p["url"])
    OUT.write_text(json.dumps({"source": SITEMAP, "pages": pages}, ensure_ascii=False), encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {len(pages)} titled pages")
    if not pages:
        sys.exit("no pages read from the sitemap")


if __name__ == "__main__":
    main()
