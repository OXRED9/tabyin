/**
 * F4: the whole report as Markdown, for "نسخ التقرير كنص". Everything religious in it is copied
 * from the cards as the API sent them: source texts, references and gradings are verbatim.
 */
import type { Dictionary } from './dictionary'
import { formatClock, formatDateTime, formatSeconds, safeHref } from './format'
import { countStates, sourcesUsed } from './report'
import { STATES_FOR_SUMMARY } from './states'
import type { Card, Explain, Grade, Meta, Report, StageSeconds, UiLang } from './types'

interface Context {
  t: Dictionary
  lang: UiLang
  meta: Meta | null
}

const oneLine = (text: string) => text.replace(/\s*\n\s*/g, ' ').trim()
const quote = (text: string) =>
  text
    .trim()
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
const cell = (text: string) => oneLine(text).replace(/\|/g, '\\|')
const mdLink = (label: string, url: string | null | undefined) => {
  const href = safeHref(url)
  return href ? `[${label}](${href})` : label
}
export const formatSimilarity = (value: number) => value.toFixed(2)

/** A duration that stays readable when it is tiny: milliseconds under a second, seconds above. */
export function formatDuration(seconds: number, t: Dictionary): string {
  return seconds < 1
    ? t.explain.millis(String(Math.round(seconds * 1000)))
    : t.explain.seconds(formatSeconds(seconds))
}

function gradeLine(grade: Grade, t: Dictionary): string {
  const parts = [`**${oneLine(grade.text)}**`]
  if (grade.scholar) parts.push(`${t.card.scholar}: ${grade.scholar}`)
  if (grade.book) parts.push(`${t.card.book}: ${grade.book}`)
  if (grade.narrator) parts.push(`${t.card.narrator}: ${grade.narrator}`)
  parts.push(mdLink(grade.source_name, grade.source_url))
  return `  - ${parts.join(' — ')}`
}

export function stageTimingLine(stages: StageSeconds, t: Dictionary): string {
  return [
    `${t.stages.ingest}: ${formatDuration(stages.ingest, t)}`,
    `${t.stages.extract}: ${formatDuration(stages.extract, t)}`,
    `${t.stages.match}: ${formatDuration(stages.match, t)}`,
    `${t.explain.total}: ${formatDuration(stages.total, t)}`,
  ].join(' · ')
}

function explainBlock(card: Card, explain: Explain, report: Report, { t, lang }: Context): string[] {
  const pick = (ar: string, en: string) => (lang === 'ar' ? ar || en : en || ar)
  const lines = [`- **${t.explain.title}** ${pick(explain.rule_ar, explain.rule_en)}`]

  if (explain.similarity != null) {
    const similarity = t.explain.similarityOf(formatSimilarity(explain.similarity))
    if (explain.threshold != null) {
      const verdict = explain.similarity >= explain.threshold ? t.explain.meets : t.explain.below
      lines.push(`  - ${similarity} · ${t.explain.thresholdOf(formatSimilarity(explain.threshold))} · ${verdict}`)
    } else {
      lines.push(`  - ${similarity}`)
    }
  }

  const origin = explain.level_reason_origin === 'model' ? t.explain.levelByModel : t.explain.levelByRule
  lines.push(
    `  - ${t.explain.level}: ${card.content_level} · ${t.levels[card.content_level]} — ${pick(explain.level_reason_ar, explain.level_reason_en)} (${origin})`,
  )
  lines.push(`  - ${t.explain.matchMs(formatDuration(explain.match_ms / 1000, t))}`)
  if (report.summary.stage_seconds) {
    lines.push(`  - ${t.explain.timing}: ${stageTimingLine(report.summary.stage_seconds, t)}`)
  }
  lines.push(`  - ${t.explain.ruleId}: \`${card.rule_id}\``)
  lines.push(`  - ${t.explain.dataVersion}: ${explain.data_version}`)

  if (explain.candidates.length > 0) {
    lines.push('', `  ${t.explain.candidates}:`, '')
    lines.push(
      `  | ${t.explain.rank} | ${t.explain.source} | ${t.explain.reference} | ${t.explain.similarity} | ${t.explain.grade} | ${t.explain.chosen} |`,
      '  |---|---|---|---|---|---|',
    )
    for (const candidate of explain.candidates) {
      lines.push(
        `  | ${candidate.rank} | ${cell(candidate.source_name)} | ${mdLink(cell(candidate.ref), candidate.url)} | ${
          candidate.similarity == null ? t.explain.byTopic : formatSimilarity(candidate.similarity)
        } | ${candidate.grade_text ? cell(candidate.grade_text) : '—'} | ${candidate.chosen ? '✓' : ''} |`,
      )
    }
    lines.push('')
  } else {
    lines.push(`  - ${t.explain.noCandidates}`)
  }

  lines.push(`  - **${t.explain.limits}:** ${pick(explain.limits_ar, explain.limits_en)}`)
  return lines
}

function cardBlock(card: Card, report: Report, ctx: Context): string {
  const { t, lang, meta } = ctx
  const state = card.state
  const note = lang === 'ar' ? card.note_ar || card.note_en : card.note_en || card.note_ar
  const lines: string[] = [
    `## ${card.index}. ${t.states[state]} — ${t.claimTypes[card.claim_type]}`,
    '',
    quote(card.text_as_quoted),
    '',
  ]

  if (card.personal_case) lines.push(`- **${t.card.personalCase}**`)
  if (card.disagreement_noted) lines.push(`- ${t.card.disagreement}`)
  if (state === 'not_found') {
    const verse = meta?.abstention_verse
    const ref = verse ? (lang === 'ar' ? verse.ref : verse.ref_en || verse.ref) : ''
    lines.push(`- ${t.card.abstention}${verse ? ` ﴿${verse.text}﴾ [${ref}]` : ''}`)
  }
  if (note) lines.push(`- **${t.card.note}:** ${oneLine(note)}`)

  if (card.source) {
    lines.push(`- **${t.card.sourceText}:**`, '', quote(card.source.text).replace(/^/gm, '  '), '')
    lines.push(`- **${t.card.reference}:** ${oneLine(card.source.ref)}`)
    lines.push(`- **${t.card.source}:** ${mdLink(card.source.source_name, card.source.url)}`)
    if (card.source.attribution && card.source.attribution !== card.source.ref) {
      lines.push(`- **${t.card.attribution}:** ${oneLine(card.source.attribution)}`)
    }
    if (card.source.translation) {
      lines.push(
        `- **${t.card.translation}:** ${oneLine(card.source.translation.text)} (${mdLink(card.source.translation.source_name, card.source.translation.source_url)})`,
      )
    }
  }

  if (card.grades.length > 0) {
    lines.push(`- **${t.card.grades}** (${t.card.gradeVerbatim}):`)
    if (card.grades.length > 1) lines.push(`  - _${t.card.gradesMany}_`)
    for (const grade of card.grades) lines.push(gradeLine(grade, t))
  } else if (card.grade_unavailable) {
    lines.push(`- **${t.card.grades}:** ${t.card.gradeUnavailable}`)
  }

  lines.push(`- **${t.card.level}:** ${card.content_level} · ${t.levels[card.content_level]}`)
  lines.push(`- **${t.card.certainty}:** ${t.certainty[card.certainty]}`)
  lines.push(`- **${t.card.action}:** ${t.actions[card.action]}`)
  if (card.attributed_to) lines.push(`- **${t.card.attributedTo}:** ${card.attributed_to}`)
  if (card.timestamp) lines.push(`- **${t.card.position}:** ${t.card.occurredAt(formatClock(card.timestamp.start))}`)
  if (card.ai_explanation) {
    lines.push(`- **${t.card.aiExplanation}** (${t.card.aiExplanationHint}) ${oneLine(card.ai_explanation)}`)
  }
  if (card.explain) lines.push(...explainBlock(card, card.explain, report, ctx))
  return lines.join('\n')
}

export function buildMarkdownReport(report: Report, ctx: Context): string {
  const { t, lang } = ctx
  const counts = countStates(report.cards)
  const summary = [
    t.report.citations(report.cards.length),
    ...STATES_FOR_SUMMARY.filter((s) => counts[s] > 0).map((s) => `${counts[s]} ${t.statesShort[s]}`),
  ].join(' · ')

  const head = [`# ${t.appName} — ${t.report.title}`, '', `**${summary}**`, '']
  const source = report.source.title || report.source.url
  if (source) head.push(`- ${t.exportMenu.inputSource}: ${mdLink(source, report.source.url)}`)
  head.push(`- ${t.exportMenu.generatedAt}: ${formatDateTime(report.generated_at, lang)}`)
  if (report.summary.mode === 'lexical_only') head.push(`- **${t.report.lexicalTitle}:** ${t.report.lexicalBody}`)

  const used = sourcesUsed(report.cards)
  const tail = ['---', '']
  if (used.length > 0) {
    tail.push(`**${t.report.sources}**`, '', ...used.map((s) => `- ${mdLink(s.name, s.url)}`), '')
  }
  tail.push(`_${t.transparency}_`)

  return [
    head.join('\n'),
    ...report.cards.map((card) => ['---', '', cardBlock(card, report, ctx)].join('\n')),
    tail.join('\n'),
  ].join('\n\n')
}
