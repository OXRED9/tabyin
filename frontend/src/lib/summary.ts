import type { Dictionary } from './dictionary'
import { STATES_FOR_SUMMARY } from './states'
import type { EvidenceState } from './types'

/** One clause of the summary sentence, with the text that joins it to the clause before it. */
export interface SummaryClause {
  state: EvidenceState
  /** The punctuation before the clause: «: » or «، ». */
  lead: string
  /** A word bound to the clause, which must not be left behind at a line end: «و». */
  joiner: string
  text: string
}

/**
 * The report in one sentence, with number words and agreement:
 * «أربعة استشهادات: اثنان مؤيَّدان، واحد مع ملاحظة، وواحد بلا مصدر».
 * When every citation has the same state there are no clauses, only a tail:
 * «استشهادان، كلاهما مؤيَّد».
 */
export function summaryParts(
  t: Dictionary,
  total: number,
  counts: Record<EvidenceState, number>,
): { head: string; tail: string; clauses: SummaryClause[] } {
  const s = t.report.summary
  const present = STATES_FOR_SUMMARY.filter((state) => counts[state] > 0)
  if (total === 0 || present.length === 0) return { head: s.total(total), tail: '', clauses: [] }
  if (present.length === 1) return { head: s.total(total), tail: s.uniform(present[0], total), clauses: [] }
  return {
    head: s.total(total),
    tail: '',
    clauses: present.map((state, i) => ({
      state,
      lead: i === 0 ? s.colon : s.comma,
      joiner: i > 0 && i === present.length - 1 ? s.and : '',
      text: s.clause(state, counts[state]),
    })),
  }
}

export function summarySentence(t: Dictionary, total: number, counts: Record<EvidenceState, number>): string {
  const { head, tail, clauses } = summaryParts(t, total, counts)
  return head + tail + clauses.map((clause) => clause.lead + clause.joiner + clause.text).join('')
}
