import type { Dictionary } from './dictionary'
import type { Tally } from './report'
import { STATES_FOR_SUMMARY } from './states'
import type { EvidenceState } from './types'

/** What a clause counts: the citations in one state, or the questions. */
export type ClauseKind = EvidenceState | 'question'

/** One clause of the summary sentence, with the text that joins it to the clause before it. */
export interface SummaryClause {
  kind: ClauseKind
  /** The punctuation before the clause: «: » or «، ». */
  lead: string
  /** A word bound to the clause, which must not be left behind at a line end: «و». */
  joiner: string
  text: string
}

/** The state whose ring and ink a clause is drawn with: a question takes the review's. */
export const clauseState = (kind: ClauseKind): EvidenceState => (kind === 'question' ? 'needs_review' : kind)

/**
 * The report in one sentence, with number words and agreement:
 * «أربعة استشهادات: اثنان لهما مرجعية، واحد له مرجعية مع ملاحظة، وواحد بلا مرجعية».
 * When every citation has the same state there are no state clauses, only a tail:
 * «استشهادان، كلاهما له مرجعية».
 * Questions are counted apart from the five states, as the last clause: «…، وسؤال واحد أُحيل إلى
 * أهل العلم». A report that is only a question says what the tool does instead:
 * «سؤال واحد: تبيّن يتحقق مما يُنقل ولا يجيب عما يُسأل.»
 */
export function summaryParts(t: Dictionary, tally: Tally): { head: string; tail: string; clauses: SummaryClause[] } {
  const s = t.report.summary
  const { citations, counts, questions } = tally
  if (citations === 0 && questions > 0) return { head: t.question.only(questions), tail: '', clauses: [] }
  const present = STATES_FOR_SUMMARY.filter((state) => counts[state] > 0)
  if (citations === 0 || present.length === 0) return { head: s.total(citations), tail: '', clauses: [] }

  const uniform = present.length === 1
  const stateClauses: SummaryClause[] = uniform
    ? []
    : present.map((state, i) => ({
        kind: state,
        lead: i === 0 ? s.colon : s.comma,
        // «و» goes to the sentence's last clause, which is the questions' when there are any.
        joiner: i > 0 && i === present.length - 1 && questions === 0 ? s.and : '',
        text: s.clause(state, counts[state]),
      }))
  const questionClause: SummaryClause[] =
    questions > 0 ? [{ kind: 'question', lead: s.comma, joiner: s.and, text: t.question.clause(questions) }] : []
  return {
    head: s.total(citations),
    tail: uniform ? s.uniform(present[0], citations) : '',
    clauses: [...stateClauses, ...questionClause],
  }
}

export function summarySentence(t: Dictionary, tally: Tally): string {
  const { head, tail, clauses } = summaryParts(t, tally)
  return head + tail + clauses.map((clause) => clause.lead + clause.joiner + clause.text).join('')
}
