"""Standalone printable HTML report. Stateless: rendered from the report the client sends."""
from __future__ import annotations

from html import escape

from ..schemas import Card, Report
from .labels import ACTION, CERTAINTY, CLAIM_TYPE, LEVEL, STATE, STATE_COLOR

_CSS = """
*{box-sizing:border-box}body{margin:0;background:#F6F7F5;color:#0F1F1B;font-family:'IBM Plex Sans Arabic','Noto Sans Arabic',Inter,system-ui,sans-serif;line-height:1.8}
main{max-width:860px;margin:0 auto;padding:32px 24px}h1{font-size:24px;margin:0;color:#1B6B5E}h2{font-size:16px;margin:0 0 8px}
.muted{color:#4B5A56;font-size:13px}.disclaimer{border-inline-start:3px solid #C9A227;padding:8px 12px;background:#fff;margin:16px 0;font-size:13px}
.summary{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.chip{border-radius:999px;padding:2px 12px;font-size:13px;color:#fff}
.card{background:#fff;border:1px solid #E3E7E4;border-inline-start:5px solid var(--c);border-radius:12px;padding:16px 20px;margin:12px 0;break-inside:avoid}
.state{color:var(--c);font-weight:700}.row{margin:6px 0}.label{color:#4B5A56;font-size:12px;display:block}
.quote{font-size:17px}.src{background:#F6F7F5;border-radius:8px;padding:8px 12px}.ins{background:#FCEFC7}.del{background:#FBD9D5;text-decoration:line-through}
.why{border-top:1px solid #E3E7E4;padding-top:8px}.why ol{margin:4px 0;padding-inline-start:20px}
a{color:#1B6B5E;word-break:break-all}footer{margin-top:32px;font-size:12px;color:#4B5A56}
@media print{body{background:#fff}main{padding:0}.card{border-color:#ccc}}
"""


def _t(pair: tuple[str, str], en: bool) -> str:
    return pair[1] if en else pair[0]


def _clock(seconds: float) -> str:
    s = int(seconds)
    return f"{s // 3600:d}:{s % 3600 // 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60:02d}:{s % 60:02d}"


def _diff_html(card: Card) -> str:
    parts: list[str] = []
    for d in card.diff or []:
        if d.op == "equal":
            parts.append(escape(d.source))
        else:
            if d.quoted:
                parts.append(f'<span class="del">{escape(d.quoted)}</span>')
            if d.source:
                parts.append(f'<span class="ins">{escape(d.source)}</span>')
    return " ".join(parts)


def _card_html(card: Card, en: bool) -> str:
    L = (lambda ar, e: e if en else ar)
    state = card.state.value
    rows: list[str] = []
    head = f'<span class="state">{escape(_t(STATE[state], en))}</span> · {escape(_t(CLAIM_TYPE[card.claim_type.value], en))}'
    if card.timestamp:
        head += f' · {L("ورد في الدقيقة", "at")} {_clock(card.timestamp.start)}'
    rows.append(f'<div class="row">{head}</div>')
    rows.append(f'<div class="row"><span class="label">{L("النص كما ورد", "As quoted")}</span><div class="quote">{escape(card.text_as_quoted)}</div></div>')
    if card.attributed_to:
        rows.append(f'<div class="row"><span class="label">{L("منسوب إلى", "Attributed to")}</span>{escape(card.attributed_to)}</div>')
    if card.source:
        s = card.source
        rows.append(f'<div class="row"><span class="label">{L("النص في المصدر", "Source text")}</span><div class="src" dir="rtl">{escape(s.text)}</div></div>')
        if card.diff and any(d.op != "equal" for d in card.diff):
            rows.append(f'<div class="row"><span class="label">{L("الفروق (المحذوف مشطوب، والصحيح مظلَّل)", "Differences (quoted struck through, source highlighted)")}</span><div class="src">{_diff_html(card)}</div></div>')
        if s.translation:
            rows.append(f'<div class="row"><span class="label">{L("الترجمة", "Translation")} — {escape(s.translation.source_name)}</span><div dir="ltr">{escape(s.translation.text)}</div></div>')
        rows.append(f'<div class="row"><span class="label">{L("المرجع", "Reference")}</span>{escape(s.ref)} — {escape(s.source_name)}<br><a href="{escape(s.url, quote=True)}">{escape(s.url)}</a></div>')
    for g in card.grades:
        who = " — ".join(x for x in (g.scholar, g.book, (L("الراوي: ", "Narrator: ") + g.narrator) if g.narrator else None) if x)
        rows.append(
            f'<div class="row"><span class="label">{L("الحكم (منقول حرفياً)", "Grading (verbatim)")}</span>{escape(g.text)}'
            f'{(" — " + escape(who)) if who else ""}<br><span class="muted">{escape(g.source_name)} · <a href="{escape(g.source_url, quote=True)}">{escape(g.source_url)}</a></span></div>'
        )
    if card.grade_unavailable:
        rows.append(f'<div class="row">{L("الحكم غير متاح من المصدر", "Grading not available from the source")}</div>')
    for o in card.other_sources:
        rows.append(f'<div class="row muted">{L("ورد أيضاً في", "Also in")}: {escape(o.ref)}</div>')
    note = card.note_en if en else card.note_ar
    if note:
        rows.append(f'<div class="row"><span class="label">{L("ملاحظة", "Note")}</span>{escape(note)}</div>')
    meta = [f'{L("المستوى", "Level")}: {escape(_t(LEVEL[card.content_level.value], en))}']
    certainty = _t(CERTAINTY[card.certainty.value], en)
    if certainty:
        meta.append(f'{L("القطعية", "Certainty")}: {escape(certainty)}')
    meta.append(f'{L("الإجراء", "Action")}: {escape(_t(ACTION[card.action.value], en))}')
    rows.append(f'<div class="row muted">{" · ".join(meta)}</div>')
    if card.explain:
        e = card.explain
        items = [f'<div>{escape(e.rule_en if en else e.rule_ar)}</div>']
        if e.candidates:
            lis = "".join(
                f'<li>{"✓ " if c.chosen else ""}{escape(c.ref)} — {escape(c.source_name)}'
                f'{(" · " + L("تشابه", "similarity") + f" {c.similarity:.2f}") if c.similarity is not None else ""}'
                f'{(" · " + escape(c.grade_text.splitlines()[0])) if c.grade_text else ""}</li>'
                for c in e.candidates
            )
            items.append(f'<div class="muted">{L("المرشحون المسترجَعون", "Retrieved candidates")}:</div><ol class="muted">{lis}</ol>')
        reason = e.level_reason_en if en else e.level_reason_ar
        if reason:
            who = L("سبب التصنيف (من النموذج اللغوي)", "Level reason (from the language model)") if e.level_reason_origin == "model" else L("سبب التصنيف", "Level reason")
            items.append(f'<div class="muted">{who}: {escape(reason)}</div>')
        items.append(f'<div class="muted">{L("نسخة البيانات", "Data snapshot")}: {escape(e.data_version)}</div>')
        items.append(f'<div><strong>{L("حدود هذا الحكم", "Limits of this verdict")}:</strong> {escape(e.limits_en if en else e.limits_ar)}</div>')
        rows.append(f'<div class="row why"><span class="label">{L("لماذا هذا الحكم؟", "Why this verdict?")}</span>{"".join(items)}</div>')
    return f'<section class="card" style="--c:{STATE_COLOR[state]}">{"".join(rows)}</section>'


def render_report_html(report: Report, lang: str = "ar") -> str:
    en = lang == "en"
    L = (lambda ar, e: e if en else ar)
    counts: dict[str, int] = {}
    for c in report.cards:
        counts[c.state.value] = counts.get(c.state.value, 0) + 1
    chips = "".join(f'<span class="chip" style="background:{STATE_COLOR[s]}">{n} · {escape(_t(STATE[s], en))}</span>' for s, n in counts.items())
    src = report.source
    src_line = " · ".join(escape(x) for x in (src.title, src.url) if x)
    cards = "".join(_card_html(c, en) for c in sorted(report.cards, key=lambda c: c.position))
    reduced = f'<p class="disclaimer">{L("أُنجز هذا التقرير بالوضع اللفظي (تغطية أقل): نموذج اللغة لم يكن متاحاً.", "This report was produced in lexical mode (reduced coverage): the language model was unavailable.")}</p>' if report.summary.mode == "lexical_only" else ""
    return f"""<!doctype html>
<html lang="{'en' if en else 'ar'}" dir="{'ltr' if en else 'rtl'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>{L('تقرير تحقق — تبيّن', 'Verification report — Tabayyun')}</title><style>{_CSS}</style></head>
<body><main>
<h1>{L('تبيّن — تقرير التحقق', 'Tabayyun — Verification report')}</h1>
<p class="muted">{escape(report.generated_at)}{' · ' + src_line if src_line else ''}</p>
<p class="disclaimer">{escape(report.disclaimer_ar) if not en else 'Tabayyun is an AI-assisted tool; it does not replace referring to qualified scholars.'}</p>
{reduced}
<div class="summary"><span class="muted">{report.summary.total} {L('استشهادات', 'citations')}</span>{chips}</div>
{cards}
<footer>{L('كل نص مصدر ومرجع وحكم في هذا التقرير منقول من مصدره المذكور بجانبه. النصوص القرآنية: مشروع تنزيل (tanzil.net). الأحاديث: موسوعة الأحاديث النبوية (hadeethenc.com) وبيانات Open-Hadith-Data.',
 'Every source text, reference and grading in this report is copied from the source named beside it. Quran text: Tanzil Project (tanzil.net). Hadith: HadeethEnc.com and Open-Hadith-Data.')}</footer>
</main></body></html>"""
