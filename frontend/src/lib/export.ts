/**
 * Export: JSON entirely in the browser; printable HTML from the backend (`POST /api/export/html`)
 * with a client-side page as the fallback when that call fails.
 */
import { ApiFailure, requestExportHtml } from './api'
import type { Dictionary } from './dictionary'
import { formatClock, formatDateTime, formatPercent, safeHref } from './format'
import { countStates, sourcesUsed } from './report'
import { STATES_FOR_SUMMARY } from './states'
import type { Card, Meta, Report, SourceRef, UiLang } from './types'

function stamp(iso: string): string {
  const d = new Date(iso)
  const safe = Number.isNaN(d.getTime()) ? new Date() : d
  const p = (n: number) => String(n).padStart(2, '0')
  return `${safe.getFullYear()}${p(safe.getMonth() + 1)}${p(safe.getDate())}-${p(safe.getHours())}${p(safe.getMinutes())}`
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function downloadJson(report: Report): void {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' })
  download(blob, `tabayyun-report-${stamp(report.generated_at)}.json`)
}

export type HtmlExportOutcome = { via: 'server' | 'client'; opened: boolean }

/**
 * Must be called straight from a user gesture: the tab is opened first (so popup blockers allow
 * it) and filled once the HTML is ready. If the tab cannot be opened, the page is downloaded.
 */
export async function exportHtml(
  report: Report,
  ctx: { t: Dictionary; lang: UiLang; meta: Meta | null },
): Promise<HtmlExportOutcome> {
  const tab = window.open('', '_blank')
  if (tab) {
    try {
      tab.opener = null
      tab.document.title = ctx.t.report.title
    } catch {
      /* cross-origin guards: harmless */
    }
  }

  let html: string
  let via: HtmlExportOutcome['via'] = 'server'
  try {
    html = await requestExportHtml(report)
  } catch (cause) {
    if (!(cause instanceof ApiFailure)) throw cause
    html = buildPrintableHtml(report, ctx)
    via = 'client'
  }

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  if (tab && !tab.closed) {
    const url = URL.createObjectURL(blob)
    tab.location.replace(url)
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return { via, opened: true }
  }
  download(blob, `tabayyun-report-${stamp(report.generated_at)}.html`)
  return { via, opened: false }
}

// ── Client-side printable page (fallback) ─────────────────────────────────────────────────────

const esc = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const link = (url: string, label: string): string => {
  const href = safeHref(url)
  return href ? `<a href="${esc(href)}" rel="noopener noreferrer" target="_blank">${esc(label)}</a>` : esc(label)
}

const field = (label: string, value: string): string =>
  value ? `<div class="field"><dt>${esc(label)}</dt><dd>${value}</dd></div>` : ''

function sourceBlock(source: SourceRef, t: Dictionary, heading: string): string {
  const quran = source.kind === 'quran'
  return `<section class="source">
    <h4>${esc(heading)}</h4>
    <blockquote class="${quran ? 'quran' : ''}" lang="ar" dir="rtl">${esc(source.text)}</blockquote>
    <dl>
      ${field(t.card.reference, esc(source.ref))}
      ${field(t.card.source, link(source.url, source.source_name))}
      ${source.attribution ? field(t.card.attribution, esc(source.attribution)) : ''}
    </dl>
    ${
      source.translation
        ? `<p class="translation" dir="auto"><strong>${esc(t.card.translation)}:</strong> ${esc(source.translation.text)} <span class="muted">(${link(source.translation.source_url, source.translation.source_name)})</span></p>`
        : ''
    }
    ${
      source.explanation
        ? `<p class="commentary" lang="ar" dir="rtl"><strong>${esc(t.card.explanation)}</strong> <span class="muted">(${esc(t.card.explanationHint)})</span><br>${esc(source.explanation)}</p>`
        : ''
    }
  </section>`
}

function cardBlock(card: Card, report: Report, ctx: { t: Dictionary; lang: UiLang; meta: Meta | null }): string {
  const { t, lang, meta } = ctx
  const override = report.reviewer_overrides.find((o) => o.card_id === card.id)
  const state = override?.state ?? card.state
  const note = lang === 'ar' ? card.note_ar || card.note_en : card.note_en || card.note_ar
  const stateChanged = override && override.state !== override.original_state

  const grades =
    card.grades.length > 0
      ? `<section><h4>${esc(t.card.grades)} <span class="muted">(${esc(t.card.gradeVerbatim)})</span></h4>
          ${card.grades.length > 1 ? `<p class="muted">${esc(t.card.gradesMany)}</p>` : ''}
          <ul class="grades">${card.grades
            .map(
              (g) =>
                `<li><strong lang="ar" dir="rtl">${esc(g.text)}</strong>${g.scholar ? ` — ${esc(t.card.scholar)}: ${esc(g.scholar)}` : ''}${g.book ? ` — ${esc(g.book)}` : ''} <span class="muted">(${link(g.source_url, g.source_name)})</span></li>`,
            )
            .join('')}</ul></section>`
      : card.grade_unavailable
        ? `<p class="notice">${esc(t.card.gradeUnavailable)}</p>`
        : ''

  const abstention =
    state === 'not_found'
      ? `<p class="abstention">${esc(t.card.abstention)}${
          meta?.abstention_verse
            ? ` <span class="quran" lang="ar" dir="rtl">﴿${esc(meta.abstention_verse.text)}﴾</span> <span class="muted">${esc(lang === 'ar' ? meta.abstention_verse.ref : meta.abstention_verse.ref_en || meta.abstention_verse.ref)}</span>`
            : ''
        }</p>`
      : ''

  return `<article class="card state-${esc(state)}">
    <header>
      <span class="index">${card.index}</span>
      <span class="badge">${esc(t.states[state])}</span>
      <span class="muted">${esc(t.claimTypes[card.claim_type])}</span>
      ${card.timestamp ? `<span class="muted time">${esc(t.card.occurredAt(formatClock(card.timestamp.start)))}</span>` : ''}
    </header>
    ${
      override
        ? `<p class="override"><strong>${esc(stateChanged ? t.reviewer.modified : t.reviewer.noted)}</strong>
            ${stateChanged ? ` — ${esc(t.reviewer.original)}: ${esc(t.states[override.original_state])}` : ''}
            — ${esc(t.reviewer.by(override.reviewer || t.reviewer.anonymous))}
            <span class="muted">(${esc(formatDateTime(override.at, lang))})</span>
            ${override.note ? `<br>${esc(override.note)}` : ''}</p>`
        : ''
    }
    <p class="quoted" lang="ar" dir="rtl">${esc(card.text_as_quoted)}</p>
    ${card.personal_case ? `<p class="notice">${esc(t.card.personalCase)}</p>` : ''}
    ${card.disagreement_noted ? `<p class="notice">${esc(t.card.disagreement)}</p>` : ''}
    ${abstention}
    ${note ? `<p class="note">${esc(note)}</p>` : ''}
    ${card.source ? sourceBlock(card.source, t, t.card.sourceText) : ''}
    ${grades}
    <dl class="meta">
      ${field(t.card.level, `${esc(card.content_level)} · ${esc(t.levels[card.content_level])}`)}
      ${field(t.card.certainty, esc(t.certainty[card.certainty]))}
      ${field(t.card.action, esc(t.actions[card.action]))}
      ${card.attributed_to ? field(t.card.attributedTo, esc(card.attributed_to)) : ''}
      ${field(t.card.matchKind, esc(t.matchKinds[card.match_kind]))}
      ${card.similarity != null ? field(t.card.similarity, esc(formatPercent(card.similarity))) : ''}
      ${field(t.card.rule, `<code>${esc(card.rule_id)}</code>`)}
    </dl>
    ${
      card.ai_explanation
        ? `<p class="ai"><strong>${esc(t.card.aiExplanation)}</strong> <span class="muted">${esc(t.card.aiExplanationHint)}</span><br>${esc(card.ai_explanation)}</p>`
        : ''
    }
    ${card.other_sources.map((s) => sourceBlock(s, t, t.card.otherSources(card.other_sources.length))).join('')}
    ${card.referral ? `<p class="notice">${esc(t.actions.refer_to_scholars)}</p>` : ''}
  </article>`
}

export function buildPrintableHtml(
  report: Report,
  ctx: { t: Dictionary; lang: UiLang; meta: Meta | null },
): string {
  const { t, lang, meta } = ctx
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  const counts = countStates(report.cards, report.reviewer_overrides)
  const summary = [
    t.report.citations(report.cards.length),
    ...STATES_FOR_SUMMARY.filter((s) => counts[s] > 0).map((s) => `${counts[s]} ${t.statesShort[s]}`),
  ].join(' · ')
  const sourceLine =
    report.source.title || report.source.url || t.input.tabs[report.source.input_type]
  const sourceHref = safeHref(report.source.url)
  const used = sourcesUsed(report.cards)

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.appName)} — ${esc(t.report.title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 24px 48px; background: #f6f7f5; color: #0f1f1b; font: 15px/1.75 "IBM Plex Sans Arabic", "Noto Sans Arabic", "Segoe UI", Tahoma, system-ui, sans-serif; }
  main { max-width: 820px; margin: 0 auto; }
  h1 { margin: 0; font-size: 22px; color: #1b6b5e; }
  h4 { margin: 12px 0 4px; font-size: 13px; color: #4a5b56; font-weight: 600; }
  a { color: #1b6b5e; }
  .muted { color: #4a5b56; font-size: 13px; font-weight: 400; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid #1b6b5e; padding-bottom: 12px; }
  .disclaimer { margin: 12px 0; padding: 8px 12px; background: #faf3d9; border-radius: 8px; font-size: 13px; }
  .summary { font-weight: 600; margin: 16px 0 4px; }
  dl { margin: 8px 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 4px 16px; }
  .field { display: flex; gap: 8px; }
  dt { color: #4a5b56; font-size: 13px; flex: none; }
  dt::after { content: ":"; }
  dd { margin: 0; }
  .card { background: #fff; border: 1px solid #dce2de; border-inline-start: 6px solid #4a5b56; border-radius: 12px; padding: 12px 16px; margin: 16px 0; break-inside: avoid; }
  .card header { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .index { font-weight: 700; color: #4a5b56; }
  .badge { padding: 2px 10px; border-radius: 999px; font-size: 13px; font-weight: 600; border: 1px solid currentColor; }
  .time { margin-inline-start: auto; }
  .quoted { font-size: 17px; font-weight: 600; margin: 8px 0; }
  blockquote { margin: 4px 0; padding: 8px 12px; background: #f6f7f5; border-radius: 8px; }
  .quran { font-family: "Amiri Quran", "Amiri", "Scheherazade New", "Traditional Arabic", serif; font-size: 20px; line-height: 2.2; }
  .note, .notice, .abstention, .override, .ai, .commentary, .translation { margin: 8px 0; padding: 8px 12px; border-radius: 8px; background: #f6f7f5; }
  .override { background: #faf3d9; border: 1px solid #c9a227; }
  .ai { border: 1px dashed #4a5b56; }
  .grades { margin: 4px 0; padding-inline-start: 20px; }
  code { font-size: 12px; direction: ltr; unicode-bidi: isolate; }
  .state-supported { border-inline-start-color: #1a7f4e; } .state-supported .badge { color: #125c38; background: #e2f3e9; }
  .state-supported_with_note { border-inline-start-color: #5c9a2b; } .state-supported_with_note .badge { color: #3c6417; background: #eaf4de; }
  .state-needs_review { border-inline-start-color: #b87a00; } .state-needs_review .badge { color: #734700; background: #fcf0cf; }
  .state-not_found { border-inline-start-color: #d94848; background: #fceaea; } .state-not_found .badge { color: #a81f1f; background: #fff; }
  .state-contradicted { border-inline-start-color: #8e1b1b; background: #f6dada; } .state-contradicted .badge { color: #fff; background: #8e1b1b; border-color: #8e1b1b; }
  footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #dce2de; font-size: 13px; color: #4a5b56; }
  footer ul { margin: 4px 0; padding-inline-start: 20px; }
  .print { font: inherit; padding: 8px 20px; border-radius: 8px; border: 0; background: #c9a227; color: #1c1703; font-weight: 600; cursor: pointer; }
  @media print { body { background: #fff; padding: 0; } .print { display: none; } .card { box-shadow: none; } }
</style>
</head>
<body>
<main>
  <div class="top">
    <div>
      <h1>${esc(t.appName)} — ${esc(t.report.title)}</h1>
      <div class="muted">${esc(t.exportMenu.generatedAt)}: ${esc(formatDateTime(report.generated_at, lang))}</div>
      <div class="muted">${esc(t.exportMenu.inputSource)}: ${sourceHref ? link(sourceHref, sourceLine) : esc(sourceLine)}${
        report.source.duration ? ` · ${esc(t.transcript.duration)} ${esc(formatClock(report.source.duration))}` : ''
      }</div>
    </div>
    <button class="print" type="button" onclick="window.print()">${esc(t.exportMenu.print)}</button>
  </div>
  <p class="disclaimer">${esc(t.transparency)}</p>
  <p class="summary">${esc(summary)}</p>
  ${report.summary.mode === 'lexical_only' ? `<p class="notice"><strong>${esc(t.report.lexicalTitle)}:</strong> ${esc(t.report.lexicalBody)}</p>` : ''}
  ${report.reviewer_overrides.length > 0 ? `<p class="muted">${esc(t.report.modifiedCount(report.reviewer_overrides.length))}</p>` : ''}
  ${report.cards.map((card) => cardBlock(card, report, ctx)).join('\n')}
  <footer>
    ${
      used.length > 0
        ? `<strong>${esc(t.report.sources)}</strong><ul>${used.map((s) => `<li>${link(s.url, s.name)}</li>`).join('')}</ul>`
        : ''
    }
    ${
      meta && meta.referral_links.length > 0
        ? `<strong>${esc(t.referral.title)}</strong><ul>${meta.referral_links
            .map((r) => `<li>${link(r.url, lang === 'ar' ? r.name_ar : r.name_en)}</li>`)
            .join('')}</ul>`
        : ''
    }
    <p>${esc(t.transparency)}</p>
  </footer>
</main>
</body>
</html>`
}
