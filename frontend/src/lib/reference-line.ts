import type { Dictionary } from './dictionary'
import type { Card } from './types'

/**
 * The one line under a note's state: its reference as a phrase. With a single grading the
 * grading follows; with several only their count, so that none is singled out. A claim with no
 * source says what it is instead.
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
  if (card.personal_case) return t.card.personalCase
  if (card.disagreement_noted) return t.card.disagreement
  if (card.state === 'not_found') return t.states.not_found
  return note || t.states[card.state]
}
