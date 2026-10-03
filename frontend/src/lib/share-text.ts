/**
 * The verdict as text (docs/DESIGN.md §8.3): what is sent when a card is shared "as text", shown
 * in the dialog exactly as it will go. It is built from the card's own fields only — the state,
 * the quoted words, the source's reference and grading word, the suggested action, the address —
 * and for a summary the sentence and one line per citation. Nothing here is written by a model.
 */
import type { Dictionary } from './dictionary'
import { truncateClaim } from './share-card'
import { byAttention } from './states'
import { summarySentence } from './summary'
import type { Card, EvidenceState } from './types'

export type ShareSubject =
  | { kind: 'claim'; card: Card }
  | { kind: 'summary'; total: number; counts: Record<EvidenceState, number>; title: string | null; cards: Card[] }

/**
 * A citation's reference and what its source says of it: one grading in the source's own word (a
 * grading is never cut: one too long to quote is counted), several gradings as their count. For
 * the evidence a ruling points at, the line says so: the reference is not the ruling's own.
 */
export function referenceWithGrade(card: Card, t: Dictionary): string {
  if (!card.source || card.personal_case) return ''
  const grade = card.grades.length === 1 ? card.grades[0].text.split('\n')[0].trim() : ''
  const said =
    grade && Array.from(grade).length <= 60
      ? `«${grade}»`
      : card.grades.length > 0
        ? t.card.gradesCount(card.grades.length)
        : ''
  const line = said ? `${card.source.ref} — ${said}` : card.source.ref
  return card.match_kind === 'referenced' ? `${t.card.referencedShort}: ${line}` : line
}

/** How much of the text is kept. Everything, unless a limit makes it give way. */
interface Shape {
  /** The most characters of quoted words. */
  quoted: number
  /** A summary's citation lines. */
  rows: number
  action: boolean
  reference: boolean
}

function lines(subject: ShareSubject, t: Dictionary, shape: Shape): string[] {
  if (subject.kind === 'claim') {
    const { card } = subject
    const reference = shape.reference ? referenceWithGrade(card, t) : ''
    return [
      `${t.states[card.state]}: «${truncateClaim(card.text_as_quoted, shape.quoted)}»`,
      ...(reference ? [reference] : []),
      // The caveat goes wherever the evidence referred to goes.
      ...(reference && card.match_kind === 'referenced' ? [t.card.referencedCaveat] : []),
      ...(shape.action ? [t.actionSentences[card.action]] : []),
    ]
  }
  const cards = [...subject.cards].sort(byAttention)
  const shown = cards.slice(0, shape.rows)
  const rest = cards.length - shown.length
  return [
    subject.title ? `${t.share.summaryLabel} — ${truncateClaim(subject.title, 80)}` : t.share.summaryLabel,
    summarySentence(t, subject.total, subject.counts),
    ...shown.map((card) => {
      const reference = shape.reference ? referenceWithGrade(card, t) : ''
      return `• ${t.stateWords[card.state]}: «${truncateClaim(card.text_as_quoted, shape.quoted)}»${reference ? ` (${reference})` : ''}`
    }),
    ...(rest > 0 && shown.length > 0 ? [t.share.moreCitations(rest)] : []),
  ]
}

/**
 * The verdict in a few lines. With `address` the last line invites to check and gives it. With
 * `limit` (X allows 280 characters) the text gives way in this order: the quoted words, a
 * summary's citation lines from the end, the suggested action, the reference.
 */
export function shareText(
  subject: ShareSubject,
  t: Dictionary,
  { address, limit }: { address?: string; limit?: number } = {},
): string {
  const shape: Shape = {
    quoted: 120,
    rows: subject.kind === 'summary' ? Math.min(subject.cards.length, 30) : 0,
    action: true,
    reference: true,
  }
  const build = () => [...lines(subject, t, shape), ...(address ? [`${t.share.footer}: ${address}`] : [])].join('\n')
  let text = build()
  while (limit && Array.from(text).length > limit) {
    if (shape.quoted > 20) shape.quoted -= 10
    else if (shape.rows > 0) shape.rows -= 1
    else if (shape.action) shape.action = false
    else if (shape.reference) shape.reference = false
    else break
    text = build()
  }
  return text
}

export type ShareApp = 'whatsapp' | 'x' | 'telegram'

/** The address that opens the app with the verdict as text. */
export function shareLink(app: ShareApp, subject: ShareSubject, t: Dictionary, address: string): string {
  if (app === 'whatsapp') return `https://wa.me/?text=${encodeURIComponent(shareText(subject, t, { address }))}`
  if (app === 'x') {
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText(subject, t, { address, limit: 280 }))}`
  }
  // Telegram takes the address and the text apart.
  return `https://t.me/share/url?url=${encodeURIComponent(address)}&text=${encodeURIComponent(shareText(subject, t))}`
}
