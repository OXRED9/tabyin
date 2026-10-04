import { Moon, PanelLeftClose, Plus, Sun, Trash2 } from 'lucide-react'
import type { Ref } from 'react'

import { LogoMark, Logotype } from '@/components/brand'
import { LegendLink } from '@/components/legend-link'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/use-theme'
import { formatDateTime, truncate } from '@/lib/format'
import type { HistoryEntry } from '@/lib/history'
import { useI18n } from '@/lib/i18n'
import { tallyOf } from '@/lib/report'
import { summarySentence } from '@/lib/summary'
import type { UiLang } from '@/lib/types'
import { cn } from '@/lib/utils'

export interface RailProps {
  history: HistoryEntry[]
  /** The report on screen, when it is one of the history's. */
  currentId: string | null
  onHome: () => void
  onNew: () => void
  onOpenEntry: (entry: HistoryEntry) => void
  onClearHistory: () => void
  /** Verifications finished in the last seven days, from this browser's own record. */
  weekCount: number
}

/** The brand, as the way home: a plain click stays in the page, a modified one opens it afresh. */
export function BrandLink({ onHome, className }: { onHome: () => void; className?: string }) {
  const { t } = useI18n()
  return (
    <a
      href="/"
      aria-label={t.header.home}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
        event.preventDefault()
        onHome()
      }}
      className={cn('flex items-center gap-2 rounded-control', className)}
    >
      <LogoMark />
      <Logotype />
    </a>
  )
}

function LanguageToggle() {
  const { lang, setLang, t } = useI18n()
  const options: { value: UiLang; label: string }[] = [
    { value: 'ar', label: t.header.arabic },
    { value: 'en', label: t.header.english },
  ]
  return (
    <div role="group" aria-label={t.header.language} className="flex items-center">
      {options.map((option, i) => {
        const active = lang === option.value
        return (
          <button
            key={option.value}
            type="button"
            lang={option.value}
            aria-pressed={active}
            onClick={() => setLang(option.value)}
            className={cn(
              'h-9 px-2 text-sm transition-colors duration-150',
              i > 0 && 'border-s',
              active ? 'font-semibold text-ink' : 'text-quiet hover:text-ink',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * What the rail holds: the brand, a new verification, the local history (kept in this browser
 * only), then the legend of the states, the language and the theme. On a wide screen it stands
 * beside the workspace; on a narrow one the same content is a drawer.
 */
export function RailContent({
  history,
  currentId,
  onHome,
  onNew,
  onOpenEntry,
  onClearHistory,
  weekCount,
  onClose,
  closeRef,
}: RailProps & {
  /** The standing rail can be put away; the drawer has its own way out. */
  onClose?: () => void
  closeRef?: Ref<HTMLButtonElement>
}) {
  const { t, lang } = useI18n()
  const { theme, toggle } = useTheme()
  const themeLabel = theme === 'dark' ? t.header.darkOff : t.header.darkOn
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <BrandLink onHome={onHome} />
        {onClose ? (
          <Button
            ref={closeRef}
            type="button"
            variant="ghost"
            size="icon"
            data-testid="rail-close"
            aria-label={t.shell.closeRail}
            title={t.shell.closeRail}
            aria-expanded="true"
            onClick={onClose}
          >
            {/* The rail stands at the start side: the icon is mirrored where that is the right. */}
            <PanelLeftClose aria-hidden="true" className="rtl:-scale-x-100" />
          </Button>
        ) : null}
      </div>

      <Button type="button" size="touch" data-testid="new-verification" onClick={onNew} className="w-full justify-start">
        <Plus aria-hidden="true" />
        {t.shell.newVerification}
      </Button>

      <section aria-labelledby="rail-history" className="flex min-h-0 flex-1 flex-col">
        <h2 id="rail-history" className="text-sm font-semibold text-quiet">
          {t.history.title}
        </h2>
        {/* The habit, said quietly: counted here, from what this browser remembers. */}
        <p data-testid="week-line" className={cn('tabular pb-1 text-sm text-figure', weekCount === 0 && 'invisible')}>
          {t.shell.week(Math.max(1, weekCount))}
        </p>
        {/* The list keeps its room whether it is empty or full, so what stands under it — and the
            foot of the rail — stays where it is when a report is added. */}
        {history.length === 0 ? (
          <p className="min-h-0 flex-1 text-sm text-quiet">{t.history.empty}</p>
        ) : (
          <ul className="-mx-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {history.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  aria-current={entry.id === currentId ? 'true' : undefined}
                  onClick={() => onOpenEntry(entry)}
                  className={cn(
                    'block w-full rounded-control px-2 py-2 text-start transition-colors duration-150 hover:bg-raised focus-visible:-outline-offset-2',
                    entry.id === currentId && 'bg-raised',
                  )}
                >
                  <span className="block truncate text-sm font-semibold text-ink" dir="auto">
                    {truncate(entry.title || t.history.untitled, 60)}
                  </span>
                  <span className="block truncate text-sm text-quiet">{summarySentence(t, tallyOf(entry.report.cards))}</span>
                  <span className="tabular block text-sm text-quiet">{formatDateTime(entry.saved_at, lang)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="pt-2 text-sm text-quiet">{t.history.localOnly}</p>
        <Button
          type="button"
          variant="link"
          onClick={onClearHistory}
          className={cn('self-start text-sm text-quiet decoration-rule-strong', history.length === 0 && 'invisible')}
        >
          <Trash2 aria-hidden="true" className="size-4" />
          {t.history.clear}
        </Button>
      </section>

      <div className="space-y-2 border-t pt-3">
        {/* The permanent line: beside every screen where the rail stands, and under the workspace. */}
        <p className="text-sm text-quiet">{t.transparency}</p>
        <LegendLink className="text-sm" />
        <div className="flex items-center justify-between gap-2">
          <LanguageToggle />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={themeLabel}
            title={themeLabel}
            aria-pressed={theme === 'dark'}
            onClick={toggle}
          >
            {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * The rail beside the workspace, from 1280px up. Below that it is a drawer (`rail-drawer.tsx`).
 * It can be put away: its width closes to nothing, the workspace takes the room and re-centres,
 * and a small button at the top corner brings it back. The choice is remembered in this browser.
 */
export function Rail({
  open,
  onClose,
  closeRef,
  ...props
}: RailProps & { open: boolean; onClose: () => void; closeRef?: Ref<HTMLButtonElement> }) {
  const { t } = useI18n()
  return (
    <aside
      aria-label={t.shell.rail}
      data-testid="rail"
      data-open={open || undefined}
      inert={!open}
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 overflow-hidden bg-paper transition-[width] duration-300 ease-out xl:block print:hidden',
        open ? 'w-[17rem] border-e' : 'w-0',
      )}
    >
      {/* Its content keeps its width while the rail closes over it, so nothing reflows on the way. */}
      <div className="h-full w-[17rem]">
        <RailContent {...props} onClose={onClose} closeRef={closeRef} />
      </div>
    </aside>
  )
}
