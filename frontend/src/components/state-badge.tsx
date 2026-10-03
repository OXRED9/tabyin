import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/lib/i18n'
import { STATE_STYLE } from '@/lib/states'
import type { EvidenceState } from '@/lib/types'
import { cn } from '@/lib/utils'

/** State in three layers, never colour alone: colour + icon + word. */
export function StateBadge({
  state,
  short = false,
  className,
}: {
  state: EvidenceState
  short?: boolean
  className?: string
}) {
  const { t } = useI18n()
  const style = STATE_STYLE[state]
  const Icon = style.icon
  return (
    <Badge
      data-state={state}
      className={cn('h-6 py-0 font-semibold leading-5 [&>svg]:size-3.5!', style.badge, className)}
    >
      <Icon aria-hidden="true" />
      {short ? t.statesShort[state] : t.states[state]}
    </Badge>
  )
}
