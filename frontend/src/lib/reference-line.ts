import type { Dictionary } from './dictionary'
import type { Card, ReviewerOverride } from './types'

/**
 * The one line under a note's state: its reference as a phrase. With a single grading the
 * grading follows; with several only their count, so that none is singled out. A claim with no
 * source says what it is instead; a reviewed note says so.
 */
export function referenceLine(card: Card, override: ReviewerOverride | undefined, t: Dictionary, note: string): string {
  if (override && override.state !== override.original_state) {
    return t.card.reviewedShort(t.stateWords[override.original_state])
  }
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
  if ((override?.state ?? card.state) === 'not_found') return t.states.not_found
  return note || t.states[override?.state ?? card.state]
}
