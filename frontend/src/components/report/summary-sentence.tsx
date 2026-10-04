import { StateGlyph } from '@/components/state-glyph'
import { useI18n } from '@/lib/i18n'
import { STATE_STYLE } from '@/lib/states'
import type { Tally } from '@/lib/report'
import { clauseState, summaryParts } from '@/lib/summary'
import type { ClauseKind } from '@/lib/summary'
import { cn } from '@/lib/utils'

/**
 * The whole report as one sentence, with number words and agreement:
 * «أربعة استشهادات: اثنان لهما مرجعية، واحد له مرجعية مع ملاحظة، وواحد بلا مرجعية».
 * Each clause is a switch: pressing it shows only the notes in that state.
 */
export function SummarySentence({
  tally,
  filter,
  onFilter,
  className,
}: {
  tally: Tally
  filter: ClauseKind | null
  onFilter: (kind: ClauseKind | null) => void
  className?: string
}) {
  const { t } = useI18n()
  const { head, tail, clauses } = summaryParts(t, tally)
  return (
    <div className={className}>
      <p aria-label={t.report.summaryLabel} className="text-lg text-ink">
        <span className="font-semibold">{head}</span>
        {tail}
        {clauses.map((clause) => {
          const pressed = filter === clause.kind
          // A question is not one of the five states: it borrows the review's ring and ink.
          const state = clauseState(clause.kind)
          const style = STATE_STYLE[state]
          return (
            <span key={clause.kind}>
              {clause.lead}
              <button
                type="button"
                aria-pressed={pressed}
                title={pressed ? t.report.summary.showAll : t.report.summary.filterHint(clause.text)}
                onClick={() => onFilter(pressed ? null : clause.kind)}
                className={cn(
                  'rounded-sheet whitespace-nowrap underline decoration-1 underline-offset-[0.3em] transition-colors duration-150',
                  style.ink,
                  pressed ? cn('decoration-2', style.soft) : 'decoration-transparent hover:decoration-current',
                )}
              >
                <StateGlyph state={state} className="me-1 inline-block size-[0.9em] align-[-0.1em]" />
                {clause.joiner}
                {clause.text}
              </button>
            </span>
          )
        })}
      </p>
    </div>
  )
}
