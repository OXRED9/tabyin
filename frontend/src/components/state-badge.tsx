import { StateGlyph } from '@/components/state-glyph'
import { useI18n } from '@/lib/i18n'
import { STATE_STYLE } from '@/lib/states'
import type { EvidenceState } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * A state as it is written everywhere: its ring glyph, then its word in the state's ink. Not a
 * pill: a state is a remark in the margin, not a traffic light.
 */
export function StateWord({
  state,
  full = false,
  className,
}: {
  state: EvidenceState
  /** The full name («له مرجعية في مصدر معتمد») instead of the margin's short word. */
  full?: boolean
  className?: string
}) {
  const { t } = useI18n()
  return (
    <span
      data-state={state}
      className={cn('inline-flex items-center gap-2 text-sm font-semibold', STATE_STYLE[state].ink, className)}
    >
      <StateGlyph state={state} />
      {full ? t.states[state] : t.stateWords[state]}
    </span>
  )
}
