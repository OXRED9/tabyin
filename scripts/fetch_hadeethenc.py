#!/usr/bin/env python3
"""Download the full HadeethEnc.com collection (Arabic + English) into data/hadeethenc.json.

API (documented at https://hadeethenc.com/api-docs, verified 2026-10-03):
  GET /api/v1/categories/roots/?language=ar
  GET /api/v1/hadeeths/list/?language=ar&category_id={id}&page={n}&per_page={n}
  GET /api/v1/hadeeths/one/?language={ar|en}&id={id}

Every field is stored verbatim. `grade` and `attribution` are the source's own wording and are
never rewritten downstream.
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
API = "https://hadeethenc.com/api/v1"
OUT = ROOT / "data" / "hadeethenc.json"
CONCURRENCY = 6
HEADERS = {"User-Agent": "Tabayyun/0.1 (hackathon verification tool; one-time dataset download)"}


async def get_json(client: httpx.AsyncClient, url: str, params: dict) -> dict | list | None:
    for attempt in range(4):
        try:
            r = await client.get(url, params=params)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.json()
        except (httpx.HTTPError, json.JSONDecodeError):
            await asyncio.sleep(1.5 * (attempt + 1))
    return None


async def main() -> None:
    async with httpx.AsyncClient(timeout=30, headers=HEADERS) as client:
        roots = await get_json(client, f"{API}/categories/roots/", {"language": "ar"})
        ids: dict[str, str] = {}
        for root in roots:
            page = 1
            while True:
                data = await get_json(
                    client,
                    f"{API}/hadeeths/list/",
                    {"language": "ar", "category_id": root["id"], "page": page, "per_page": 200},
                )
                if not data or not data.get("data"):
                    break
                for item in data["data"]:
                    ids[item["id"]] = item["title"]
                if page >= int(data["meta"]["last_page"]):
                    break
                page += 1
            print(f"category {root['id']}: {len(ids)} unique ids so far", flush=True)

        sem = asyncio.Semaphore(CONCURRENCY)
        records: dict[str, dict] = {}

        async def fetch(hid: str) -> None:
            async with sem:
                ar = await get_json(client, f"{API}/hadeeths/one/", {"language": "ar", "id": hid})
                if not ar or "hadeeth" not in ar:
                    return
                rec = {
                    "id": ar["id"],
                    "title": ar.get("title"),
                    "hadeeth": ar.get("hadeeth"),
                    "hadeeth_intro": ar.get("hadeeth_intro"),
                    "attribution": ar.get("attribution"),
                    "grade": ar.get("grade"),
                    "explanation": ar.get("explanation"),
                    "hints": ar.get("hints"),
                    "reference": ar.get("reference"),
                    "categories": ar.get("categories"),
                    "url": f"https://hadeethenc.com/ar/browse/hadith/{ar['id']}",
                }
                if "en" in (ar.get("translations") or []):
                    en = await get_json(client, f"{API}/hadeeths/one/", {"language": "en", "id": hid})
                    if en and "hadeeth" in en:
                        rec["en"] = {
                            "title": en.get("title"),
                            "hadeeth": en.get("hadeeth"),
                            "attribution": en.get("attribution"),
                            "grade": en.get("grade"),
                            "explanation": en.get("explanation"),
                            "url": f"https://hadeethenc.com/en/browse/hadith/{ar['id']}",
                        }
                records[hid] = rec
                if len(records) % 250 == 0:
                    print(f"fetched {len(records)}/{len(ids)}", flush=True)

        await asyncio.gather(*(fetch(h) for h in ids))

    ordered = [records[k] for k in sorted(records, key=int)]
    out = {
        "meta": {
            "source": "موسوعة الأحاديث النبوية — HadeethEnc.com",
            "source_url": "https://hadeethenc.com",
            "api": "https://hadeethenc.com/api-docs",
            "note": "All fields verbatim from the API. grade/attribution are the source's wording.",
            "count": len(ordered),
        },
        "hadeeths": ordered,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    missing = len(ids) - len(ordered)
    print(f"wrote {OUT}: {len(ordered)} hadeeths ({missing} failed)")
    if missing:
        sys.exit(1 if missing > len(ids) * 0.02 else 0)


if __name__ == "__main__":
    asyncio.run(main())
