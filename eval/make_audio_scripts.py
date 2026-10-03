#!/usr/bin/env python3
"""Generate 20 reading scripts for the audio part of the test set (recorded in the team's own voices).

Each script is one short passage built from test-set claims (so its expected results are known),
wrapped in neutral connecting sentences. Output: eval/audio_scripts/NN.txt + manifest.json listing,
for every script, the claims it contains and their expected evidence states.

Usage: backend/.venv/bin/python eval/make_audio_scripts.py
"""
from __future__ import annotations

import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TESTSET = ROOT / "eval" / "testset" / "claims.jsonl"
OUT = ROOT / "eval" / "audio_scripts"
SEED = 1448
# Categories that make sense read aloud, and how many scripts lead with each.
PLAN = [
    ("ayah_correct", 4),
    ("hadith_sahih_verbatim", 4),
    ("hadith_sahih_abridged", 2),
    ("ayah_altered_minor", 2),
    ("hadith_weak", 2),
    ("hadith_fabricated", 2),
    ("no_source", 1),
    ("ruling_disputed", 1),
    ("personal_case", 1),
    ("fabrication_request", 1),
]
OPENERS = [
    "بسم الله الرحمن الرحيم، نبدأ حديثنا اليوم بهذه الوقفة.",
    "أيها الإخوة الكرام، موضوعنا في هذا المقطع قصير ومهم.",
    "في هذه الدقيقة نتأمل معاً نصاً يتردد كثيراً على الألسنة.",
    "سألني أحد المتابعين عن هذا النص فأحببت أن أقرأه عليكم.",
]
BRIDGES = ["ومما يُذكر في هذا الباب أيضاً ما يلي.", "وننتقل بعد ذلك إلى نص آخر.", "ويتصل بهذا المعنى ما سأقرؤه الآن."]
CLOSERS = ["هذا ما تيسر ذكره، والله أعلم.", "نكتفي بهذا القدر، ونسأل الله التوفيق.", "وإلى لقاء آخر بإذن الله."]


def main() -> None:
    rows = [json.loads(line) for line in TESTSET.read_text(encoding="utf-8").splitlines() if line.strip()]
    by_cat: dict[str, list[dict]] = {}
    for r in rows:
        by_cat.setdefault(r["category"], []).append(r)
    rng = random.Random(SEED)
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.txt"):
        old.unlink()

    leads: list[dict] = []
    for cat, n in PLAN:
        pool = by_cat.get(cat, [])
        leads += pool[:n]
    supporting = [r for r in by_cat.get("ayah_correct", [])[4:] + by_cat.get("hadith_sahih_verbatim", [])[4:]]

    manifest = []
    for i, lead in enumerate(leads[:20], start=1):
        claims = [lead]
        if supporting and i % 2 == 0:  # every other script carries a second, sound citation
            claims.append(supporting[(i // 2 - 1) % len(supporting)])
        parts = [rng.choice(OPENERS)]
        for k, c in enumerate(claims):
            if k:
                parts.append(rng.choice(BRIDGES))
            parts.append(c["input_text"])
        parts.append(rng.choice(CLOSERS))
        name = f"{i:02d}.txt"
        (OUT / name).write_text("\n".join(parts) + "\n", encoding="utf-8")
        manifest.append(
            {
                "script": name,
                "recording": f"{i:02d}.m4a",
                "claims": [{"id": c["id"], "category": c["category"], "claim_type": c["claim_type"], "expected_state": c["expected_state"], "expected_ref": c["expected_ref"]} for c in claims],
                "recorded_by": None,
                "notes": "اقرأ النص كما هو مكتوب، بما فيه من خطأ مقصود إن وُجد؛ لا تصحّح أثناء القراءة.",
            }
        )
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "README.md").write_text(
        "# نصوص التسجيل الصوتي\n\n"
        "عشرون نصاً قصيراً مولَّدة آلياً من مجموعة الاختبار (`eval/testset/claims.jsonl`) لتُسجَّل بأصوات الفريق.\n\n"
        "- اقرأ كل نص كما هو، حتى إن تضمّن خطأً مقصوداً (آية غُيّر لفظها، حديث ضعيف أو موضوع): الغرض اختبار الأداة.\n"
        "- احفظ التسجيل باسم الملف المذكور في `manifest.json` (مثل `01.m4a`) داخل هذا المجلد.\n"
        "- بعد التسجيل ارفع الملف في تبويب «رفع ملف» وقارن النتيجة بالحالة المتوقعة في `manifest.json`.\n"
        "- النصوص الشرعية هنا منقولة برمجياً من المصادر المعتمدة، والنصوص المعيبة مولَّدة آلياً؛ كلها تنتظر مراجعة سليمان.\n",
        encoding="utf-8",
    )
    print(f"wrote {len(manifest)} scripts to {OUT}")


if __name__ == "__main__":
    main()
