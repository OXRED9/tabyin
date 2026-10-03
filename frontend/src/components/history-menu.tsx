import { History, Trash2 } from 'lucide-react'

import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { formatDateTime, truncate } from '@/lib/format'
import type { HistoryEntry } from '@/lib/history'
import { useI18n } from '@/lib/i18n'
import { countStates } from '@/lib/report'
import { STATES_BY_RISK, STATE_STYLE } from '@/lib/states'
import { cn } from '@/lib/utils'

/** The body of the "recent verifications" menu: last ten reports, kept in this browser only. */
export function HistoryItems({
  entries,
  onOpen,
  onClear,
}: {
  entries: HistoryEntry[]
  onOpen: (entry: HistoryEntry) => void
  onClear: () => void
}) {
  const { t, lang } = useI18n()
  return (
    <>
      <DropdownMenuLabel className="flex items-center gap-2">
        <History aria-hidden="true" className="size-4" />
        {t.history.title}
      </DropdownMenuLabel>
      {entries.length === 0 ? (
        <p className="px-2 py-1 text-sm text-muted-foreground">{t.history.empty}</p>
      ) : (
        <DropdownMenuGroup>
          {entries.map((entry) => {
            const counts = countStates(entry.report.cards, entry.report.reviewer_overrides ?? [])
            return (
              <DropdownMenuItem
                key={entry.id}
                onSelect={() => onOpen(entry)}
                className="flex-col items-stretch gap-1 py-2"
              >
                <span className="truncate font-medium" dir="auto">
                  {truncate(entry.title || t.history.untitled, 60)}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="tabular">{formatDateTime(entry.saved_at, lang)}</span>
                  <span className="ms-auto flex items-center gap-2">
                    {STATES_BY_RISK.filter((s) => counts[s] > 0).map((s) => {
                      const Icon = STATE_STYLE[s].icon
                      return (
                        <span
                          key={s}
                          title={t.states[s]}
                          className={cn('inline-flex items-center gap-1 font-medium', STATE_STYLE[s].ink)}
                        >
                          <Icon aria-hidden="true" className="size-3" />
                          <span className="tabular">{counts[s]}</span>
                          <span className="sr-only">{t.statesShort[s]}</span>
                        </span>
                      )
                    })}
                  </span>
                </span>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      )}
      <DropdownMenuSeparator />
      <p className="px-2 py-1 text-xs text-muted-foreground">{t.history.localOnly}</p>
      {entries.length > 0 ? (
        <DropdownMenuItem variant="destructive" onSelect={onClear}>
          <Trash2 aria-hidden="true" />
          {t.history.clear}
        </DropdownMenuItem>
      ) : null}
    </>
  )
}
