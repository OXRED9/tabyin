import type { Dictionary } from './dictionary'
import type { Card } from './types'

/**
 * The one line beside a note's state: its reference as a phrase. With a single grading the
 * grading follows; with several only their count, so that none is singled out.
 *
 * A claim with no source gets a line only where the line says something the open note will not
 * say again in the same words. A disputed matter and a personal case get none: their one sentence
 * is the note's own text, and the claim type stands beside the state instead. Anything else shows
 * the start of its note, which an open note then drops from its head (`referenceWhenOpen`).
 */
export function referenceLine(card: Card, t: Dictionary, note: string): string {
  if (card.source) {
    const grade =
      card.grades.length === 1
        ? card.grades[0].text.split('\n')[0]
        : card.grades.length > 1
          ? t.card.gradesCount(card.grades.length)
          : card.grade_unavailable
            ? t.card.gradeUnavailable
            : null
    return grade ? `${card.source.ref}${t.report.summary.comma}${grade}` : card.source.ref
  }
  if (card.personal_case || card.disagreement_noted) return ''
  if (card.state === 'not_found') return t.states.not_found
  return note
}

/** Under an open note's head: a reference, never the note's own sentence a second time. */
export const referenceWhenOpen = (card: Card, t: Dictionary): string =>
  card.source || card.state === 'not_found' ? referenceLine(card, t, '') : ''
