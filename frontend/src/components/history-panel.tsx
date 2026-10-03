import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatDateTime, truncate } from '@/lib/format'
import type { HistoryEntry } from '@/lib/history'
import { useI18n } from '@/lib/i18n'
import { countStates } from '@/lib/report'
import { summarySentence } from '@/lib/summary'

/**
 * «آخر ما تحققتَ منه»: the last ten reports, kept in this browser only. A side panel that lies
 * over the page; each entry is summed up by the same sentence that heads its report.
 */
export default function HistoryPanel({
  open,
  onOpenChange,
  entries,
  onOpen,
  onClear,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: HistoryEntry[]
  onOpen: (entry: HistoryEntry) => void
  onClear: () => void
}) {
  const { t, lang } = useI18n()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="start" closeLabel={t.close}>
        <SheetHeader className="border-b">
          <SheetTitle>{t.history.title}</SheetTitle>
          <SheetDescription>{t.history.localOnly}</SheetDescription>
        </SheetHeader>

        {entries.length === 0 ? (
          <p className="p-5 text-sm text-quiet">{t.history.empty}</p>
        ) : (
          <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
            {entries.map((entry) => {
              const counts = countStates(entry.report.cards, entry.report.reviewer_overrides ?? [])
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(entry)}
                    className="block w-full px-5 py-3 text-start transition-colors duration-150 hover:bg-desk focus-visible:-outline-offset-2"
                  >
                    <span className="block truncate text-base font-semibold text-ink" dir="auto">
                      {truncate(entry.title || t.history.untitled, 60)}
                    </span>
                    <span className="block text-sm text-ink">
                      {summarySentence(t, entry.report.cards.length, counts)}
                    </span>
                    <span className="tabular block text-sm text-quiet">{formatDateTime(entry.saved_at, lang)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {entries.length > 0 ? (
          <div className="border-t p-3">
            <Button type="button" variant="destructive" size="touch" onClick={onClear}>
              <Trash2 aria-hidden="true" />
              {t.history.clear}
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
