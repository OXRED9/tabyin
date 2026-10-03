import type { Card, Grade } from './types'

/** Every distinct grading wording, in the order the sources give them. None is singled out. */
export const distinctGradings = (grades: Grade[]): string[] => [
  ...new Set(grades.map((grade) => grade.text.replace(/\s+/g, ' ').trim())),
]

/**
 * A hadith whose state is read with its gradings beside it: any hadith card that has gradings and
 * is not «له مرجعية» — a narration the sources carry and grade weak or reject is "in the sources",
 * and the state alone («مخالف للمصدر», «يحتاج مراجعة») would not say so.
 */
export const gradedBesideState = (card: Card): boolean =>
  card.claim_type === 'hadith' && card.grades.length > 0 && card.state !== 'supported'
