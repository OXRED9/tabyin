/**
 * The words that go with a verdict card when it is sent to a named app (docs/DESIGN.md §8.3). A
 * web page cannot hand an image to WhatsApp, X or Telegram, only text and an address: so the
 * verdict is said in text, built from the card's own fields — the state, the quoted words, the
 * reference, the grading word, the address. Nothing here is written by a model.
 */
import type { Dictionary } from './dictionary'
import { truncateClaim } from './share-card'
import { summarySentence } from './summary'
import type { Card, EvidenceState } from './types'

export type ShareSubject =
  | { kind: 'claim'; card: Card }
  | { kind: 'summary'; total: number; counts: Record<EvidenceState, number>; title: string | null }

/**
 * A citation's reference and what its source says of it: one grading in the source's own word (a
 * grading is never cut: one too long to quote is counted), several gradings as their count.
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
  return said ? `${card.source.ref} — ${said}` : card.source.ref
}

function lines(subject: ShareSubject, t: Dictionary, quotedMax: number): string[] {
  if (subject.kind === 'summary') {
    return [
      subject.title ? `${t.share.summaryLabel} — ${truncateClaim(subject.title, quotedMax)}` : t.share.summaryLabel,
      summarySentence(t, subject.total, subject.counts),
    ]
  }
  const { card } = subject
  const reference = referenceWithGrade(card, t)
  return [`${t.states[card.state]}: «${truncateClaim(card.text_as_quoted, quotedMax)}»`, ...(reference ? [reference] : [])]
}

/**
 * The verdict in a few lines. With `address` the last line invites to check and gives it. With
 * `limit` the quoted words give way until the whole text fits (X allows 280 characters).
 */
export function shareText(
  subject: ShareSubject,
  t: Dictionary,
  { address, limit }: { address?: string; limit?: number } = {},
): string {
  const build = (quotedMax: number) =>
    [...lines(subject, t, quotedMax), ...(address ? [`${t.share.footer}: ${address}`] : [])].join('\n')
  let quotedMax = 120
  let text = build(quotedMax)
  while (limit && Array.from(text).length > limit && quotedMax > 20) {
    quotedMax -= 10
    text = build(quotedMax)
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
