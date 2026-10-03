import { StateGlyph } from '@/components/state-glyph'
import { useI18n } from '@/lib/i18n'
import { STATE_STYLE } from '@/lib/states'
import { summaryParts } from '@/lib/summary'
import type { EvidenceState } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * The whole report as one sentence, with number words and agreement:
 * «أربعة استشهادات: اثنان مؤيَّدان، واحد مع ملاحظة، وواحد بلا مصدر».
 * Each clause is a switch: pressing it shows only the notes in that state.
 */
export function SummarySentence({
  total,
  counts,
  modified,
  filter,
  onFilter,
  className,
}: {
  total: number
  counts: Record<EvidenceState, number>
  modified: number
  filter: EvidenceState | null
  onFilter: (state: EvidenceState | null) => void
  className?: string
}) {
  const { t } = useI18n()
  const { head, tail, clauses } = summaryParts(t, total, counts)
  return (
    <div className={className}>
      <p aria-label={t.report.summaryLabel} className="text-lg text-ink">
        <span className="font-semibold">{head}</span>
        {tail}
        {clauses.map((clause) => {
          const pressed = filter === clause.state
          const style = STATE_STYLE[clause.state]
          return (
            <span key={clause.state}>
              {clause.lead}
              <button
                type="button"
                aria-pressed={pressed}
                title={pressed ? t.report.summary.showAll : t.report.summary.filterHint(clause.text)}
                onClick={() => onFilter(pressed ? null : clause.state)}
                className={cn(
                  'rounded-sheet whitespace-nowrap underline decoration-1 underline-offset-[0.3em] transition-colors duration-150',
                  style.ink,
                  pressed ? cn('decoration-2', style.soft) : 'decoration-transparent hover:decoration-current',
                )}
              >
                <StateGlyph state={clause.state} className="me-1 inline-block size-[0.9em] align-[-0.1em]" />
                {clause.joiner}
                {clause.text}
              </button>
            </span>
          )
        })}
      </p>
      {modified > 0 ? <p className="text-sm text-quiet">{t.report.summary.reviewed(modified)}</p> : null}
    </div>
  )
}
