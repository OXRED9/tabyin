/**
 * «أبلغ عن خطأ»: the message a reader sends about a verdict, or about a citation the tool missed.
 * It is composed here, shown to the reader exactly as it will go, and sent by the reader's own
 * mail or WhatsApp: no endpoint of ours receives it, and nothing is sent without the reader.
 */
import type { Dictionary } from './dictionary'
import type { Card, Meta, SourceInfo } from './types'

export type ErrorTarget = { kind: 'claim'; card: Card } | { kind: 'missed' }

export const feedbackOf = (meta: Meta | null) => ({
  email: meta?.feedback?.email?.trim() || null,
  whatsapp: meta?.feedback?.whatsapp?.replace(/\D/g, '') || null,
})

export const errorSubject = (target: ErrorTarget, t: Dictionary): string =>
  target.kind === 'claim' ? t.feedback.subject : t.feedback.subjectMissed

/** The report, line by line: what the verdict was, on which data, and what the reader says. */
export function errorReport(
  target: ErrorTarget,
  t: Dictionary,
  context: { source: SourceInfo | null; dataVersion: string | undefined; address: string; comment: string },
): string {
  const line = (label: string, value: string | null | undefined) => (value ? [`${label}: ${value}`] : [])
  const comment = context.comment.trim()
  const about =
    target.kind === 'claim'
      ? [
          ...line(t.feedback.lineQuoted, `«${target.card.text_as_quoted.replace(/\s+/g, ' ').trim()}»`),
          ...line(t.feedback.lineState, t.states[target.card.state]),
          ...line(t.feedback.lineRule, target.card.rule_id),
          ...line(t.feedback.lineReference, target.card.personal_case ? null : target.card.source?.ref),
        ]
      : // What was checked is named only when it is public already: a link or its title, never a pasted text.
        line(t.feedback.lineChecked, context.source?.url || context.source?.title)
  return [
    errorSubject(target, t),
    ...about,
    ...line(t.feedback.lineData, context.dataVersion),
    ...line(t.feedback.lineAddress, context.address),
    ...line(t.feedback.lineWhat, comment),
  ].join('\n')
}
