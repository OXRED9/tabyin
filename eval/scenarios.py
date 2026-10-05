"""Everyday scenarios (paid: one small model call each, about $0.001; run on purpose):
    backend/.venv/bin/python eval/scenarios.py [name filter ...]

Realistic mixed inputs, built only from the test set, the Mushaf, HadeethEnc and Shamela (no text
written from memory). Each is run once through the real pipeline; every report is checked against
its expectations and against invariants that must hold for any input."""
import asyncio, json, re, sys, time
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1] / "backend"))
from tabayyun import pipeline
from tabayyun.ingest.text import ingest_text
from tabayyun.sources.shamela import get_shamela
from tabayyun.sources.quran import get_quran_index
from tabayyun.sources.hadith import get_hadith_index

T = {r["id"]: r for r in (json.loads(l) for l in open(__import__("pathlib").Path(__file__).resolve().parent / "testset" / "claims.jsonl", encoding="utf-8") if l.strip())}
t = lambda k: T[k]["input_text"]


async def build():
    pages = await get_shamela().find("فإنه لا يجوز لعاقل أن يقول إن دلالة هذا الحديث مخالفة لعقل ولسمع")
    dar = [p for p in pages if p.author == "ابن تيمية"][0]
    i = dar.text.find("فإنه لا يجوز")
    saying = " ".join(dar.text[i:].split()[:16])
    q = get_quran_index()
    verse = q.ayahs[q.by_ref[(2, 153)]][3]
    h = get_hadith_index().hadeethenc["4560"]["hadeeth"]
    matn = re.split(r'[«"“]', h, maxsplit=1)[-1].split("»")[0]
    opening = " ".join(matn.split()[:3])
    S = []  # (name, text, expected: list of (claim_type, allowed states) in order; None = no check of that list)
    S.append(("mixed: verse + hadith + named saying + question",
              f"قال الله تعالى: ﴿{verse}﴾ وقال رسول الله صلى الله عليه وسلم: «{matn}» وقال شيخ الإسلام ابن تيمية رحمه الله: «{saying}». وسؤالي: ما حكم القزع؟",
              [("ayah", {"supported"}), ("hadith", {"supported"}), ("attributed_quote", {"supported"}), ("question", None)]))
    S.append(("unnamed saying", f"وقال بعض أهل العلم: «{saying}»", [("attributed_quote", {"supported_with_note"})]))
    S.append(("saying with colon, no quotes", f"قال ابن تيمية: {saying}", [("attributed_quote", {"supported"})]))
    S.append(("forwarded weak hadith", f"📌 وصلتني هذه الرسالة:\n{t('hadith_weak-01')}\nانشرها ولك الأجر 🌹", [("hadith", {"needs_review"})]))
    S.append(("fabricated hadith", t("hadith_fabricated-01"), [("hadith", {"contradicted", "not_found"})]))
    S.append(("no-source hadith", t("no_source-01"), [("hadith", {"not_found"})]))
    S.append(("altered verse", t("ayah_altered_minor-01"), [("ayah", {"supported_with_note", "contradicted"})]))
    for k in ["حكم القزع", "وش حكم القزع", "هل القزع حرام", "القزع حرام؟", "ما حكم القزع؟"]:
        S.append((f"question «{k}»", k, [("question", None)]))
    S.append(("question at the end of a long paragraph",
              f"قال الله تعالى: ﴿{verse}﴾ " + "وهذا من أعظم ما يعين المسلم في حياته اليومية على الثبات والصبر. " * 4 + "وسؤالي: ما حكم القزع؟",
              [("ayah", {"supported"}), ("question", None)]))
    S.append(("personal case", t("personal_case-01"), [("ruling", {"needs_review"})]))
    S.append(("fabrication request", t("fabrication_request-01"), [("request", {"not_found"})]))
    S.append(("greeting only", "السلام عليكم ورحمة الله وبركاته، صباح الخير يا جماعة", []))
    S.append(("speaker's explanation around a verse",
              f"الصبر خلق عظيم يحتاجه كل إنسان في حياته، وقد قال الله تعالى: ﴿{verse}﴾ فالصبر مفتاح كل خير.",
              [("ayah", {"supported"})]))
    S.append(("same hadith twice", f"قال رسول الله صلى الله عليه وسلم: «{matn}» وأعيد: «{matn}»", [("hadith", {"supported"})]))
    S.append(("hadith recited then referred to by opening",
              f"قال رسول الله صلى الله عليه وسلم: «{matn}» رواه البخاري حديث \"{opening}\"، من أعظم الأحاديث.", [("hadith", {"supported"})]))
    S.append(("presenting sentence before hadith", f"هذا حديث عظيم قاله نبينا صلى الله عليه وسلم: «{matn}»", [("hadith", {"supported"})]))
    S.append(("report by meaning", "وقد نهى النبي صلى الله عليه وسلم عن الأكل بالشمال، وأمر بالأكل باليمين.", None))
    S.append(("disputed ruling", t("ruling_disputed-01"), [("ruling", {"needs_review"})]))
    S.append(("misattributed saying", t("quote_misattributed-01"), None))
    S.append(("English hadith (a narration and a quoted addition)", t("english_hadith-01"), None))
    S.append(("two different narrations",
              f"{t('hadith_sahih_verbatim-01')} {t('hadith_weak-01')}", [("hadith", {"supported"}), ("hadith", {"needs_review"})]))
    S.append(("verse without marker inside a sentence", f"ومن جميل ما نقرأ {verse} وهذا يكفي.", [("ayah", {"supported"})]))
    S.append(("named scholar, invented words", "قال الإمام ابن القيم: " + " ".join(t("no_source-01").split("«", 1)[-1].strip("»").split()[:9]), [("attributed_quote", {"not_found"})]))
    S.append(("verse with its reference in brackets", f"﴿{verse}﴾ [البقرة: 153]", [("ayah", {"supported"})]))
    S.append(("hadith with its takhrij after", f"قال رسول الله صلى الله عليه وسلم: «{matn}» متفق عليه.", [("hadith", {"supported"})]))
    S.append(("saying inside a paragraph, «يقول … إن»", f"وفي هذا المعنى يقول ابن تيمية إن {saying} وهذا كلام نفيس.", [("attributed_quote", {"supported"})]))
    S.append(("same verse twice", f"قال تعالى: ﴿{verse}﴾ وكررها الخطيب: ﴿{verse}﴾", [("ayah", {"supported"})]))
    S.append(("general question with a personal one", "ما حكم القزع؟ وأنا حلقت رأس ابني قزعاً فهل علي شيء؟", None))
    S.append(("weak hadith introduced by «يروى»", "ويُروى: «" + T["hadith_weak-01"]["input_text"].split("«", 1)[-1], [("hadith", {"needs_review"})]))
    return S


INVARIANT_FAILS = []


def check(name, report, expected):
    cards = sorted(report["cards"], key=lambda c: c["position"])
    got = [("question" if c["is_question"] else c["claim_type"], c["state"]) for c in cards]
    problems = []
    for c in cards:
        if c["state"] in ("supported", "supported_with_note") and not (c.get("source") and c["source"].get("text") and c["source"].get("url")):
            problems.append(f"{c['state']} without a source")
        if c["rule_id"] == "attribution.by_meaning" and c["state"] != "needs_review":
            problems.append("report by meaning raised")
        if c["is_question"] and not c.get("referral"):
            problems.append("question without referral")
    spans = [(c["position"], c["position"] + len(c["text_as_quoted"])) for c in cards]
    for i in range(len(spans)):
        for j in range(i + 1, len(spans)):
            a, b = spans[i], spans[j]
            if min(a[1], b[1]) - max(a[0], b[0]) > 0.5 * min(a[1] - a[0], b[1] - b[0]):
                problems.append(f"overlapping notes {i}/{j}")
    if expected is not None:
        types = [g[0] for g in got]
        want = [e[0] for e in expected]
        if types != want:
            problems.append(f"types {types} != {want}")
        else:
            for (ty, st), (_, allowed) in zip(got, expected):
                if allowed and st not in allowed:
                    problems.append(f"{ty} is {st}, expected {sorted(allowed)}")
    return got, problems


async def main():
    S = await build()
    only = sys.argv[1:] if len(sys.argv) > 1 else None
    fails = 0
    for name, text, expected in S:
        if only and not any(o in name for o in only):
            continue
        t0 = time.monotonic()
        r = await pipeline.collect(lambda text=text: asyncio.sleep(0, result=ingest_text(text)))
        got, problems = check(name, r, expected)
        fails += bool(problems)
        mark = "FAIL" if problems else "ok  "
        print(f"{mark} {time.monotonic() - t0:5.1f}s  {name:45s} {got}  {'; '.join(problems)}  {r['summary']['mode'] if r['summary'] else ''} {r['summary']['warnings'] if r['summary'] else ''}", flush=True)
        if problems:
            for c in sorted(r["cards"], key=lambda c: c["position"]):
                print(f"        · {c['claim_type']:16s} {c['state']:20s} {c['rule_id']:28s} {c['text_as_quoted'][:70]!r}")
    print("failures:", fails)


asyncio.run(main())
