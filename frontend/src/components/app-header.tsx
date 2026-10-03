import { Download, Ellipsis, Moon, Sun } from 'lucide-react'
import { Suspense, lazy, useEffect, useState } from 'react'

import { Logotype } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useTheme } from '@/hooks/use-theme'
import { useI18n } from '@/lib/i18n'
import type { UiLang } from '@/lib/types'
import { cn } from '@/lib/utils'

// The two menus are not needed to paint the bar: each is fetched the first time its button is
// used (or just before, when the pointer reaches it), and is born open.
const loadExportMenu = () => import('@/components/export-menu')
const loadMoreMenu = () => import('@/components/more-menu')
const ExportMenu = lazy(loadExportMenu)
const MoreMenu = lazy(loadMoreMenu)

interface AppHeaderProps {
  hasReport: boolean
  reviewerMode: boolean
  onReviewerModeChange: (on: boolean) => void
  onExportJson: () => void
  onExportHtml: () => void
  onCopyReport?: () => void
  onHome: () => void
}

function LanguageToggle() {
  const { lang, setLang, t } = useI18n()
  const options: { value: UiLang; label: string; short: string }[] = [
    { value: 'ar', label: t.header.arabic, short: 'ع' },
    { value: 'en', label: t.header.english, short: 'EN' },
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
            aria-label={option.label}
            onClick={() => setLang(option.value)}
            className={cn(
              'h-9 px-2 text-sm transition-colors duration-150',
              i > 0 && 'border-s',
              active ? 'font-semibold text-ink' : 'text-quiet hover:text-ink',
            )}
          >
            <span className="sm:hidden" aria-hidden="true">
              {option.short}
            </span>
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * A thin bar of paper with a hairline under it: the logotype, then export (once there is a
 * report), reviewer mode, theme and language. Nothing else. On phones reviewer mode and export
 * fold into one menu. The static shell in index.html draws the same bar before this code runs.
 */
export function AppHeader({
  hasReport,
  reviewerMode,
  onReviewerModeChange,
  onExportJson,
  onExportHtml,
  onCopyReport,
  onHome,
}: AppHeaderProps) {
  const { t } = useI18n()
  const { theme, toggle } = useTheme()
  const themeLabel = theme === 'dark' ? t.header.darkOff : t.header.darkOn
  const [exportArmed, setExportArmed] = useState(false)
  const [moreArmed, setMoreArmed] = useState(false)

  // Once there is a report its menus are likely to be wanted: fetch them when the page is quiet.
  useEffect(() => {
    if (!hasReport) return
    const timer = window.setTimeout(() => {
      void loadExportMenu()
      void loadMoreMenu()
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [hasReport])

  const exportButton = (
    <Button
      type="button"
      variant="ghost"
      aria-label={t.header.export}
      aria-haspopup="menu"
      className="hidden md:inline-flex"
      onPointerEnter={() => void loadExportMenu()}
      onFocus={() => void loadExportMenu()}
      onClick={exportArmed ? undefined : () => setExportArmed(true)}
    >
      <Download aria-hidden="true" />
      {t.header.exportShort}
    </Button>
  )
  const moreButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={t.header.more}
      aria-haspopup="menu"
      className="md:hidden"
      onPointerEnter={() => void loadMoreMenu()}
      onFocus={() => void loadMoreMenu()}
      onClick={moreArmed ? undefined : () => setMoreArmed(true)}
    >
      <Ellipsis aria-hidden="true" />
    </Button>
  )

  return (
    <header className="sticky top-0 z-40 border-b bg-paper print:hidden">
      <div className="flex h-12 items-center gap-1 px-4 sm:gap-3 sm:px-6">
        <button type="button" onClick={onHome} aria-label={t.header.home} className="rounded-control">
          <Logotype />
        </button>

        <div className="ms-auto flex items-center gap-1 sm:gap-3">
          {/* Wide screens: export and reviewer mode sit in the bar. */}
          {hasReport ? (
            exportArmed ? (
              <Suspense fallback={exportButton}>
                <ExportMenu defaultOpen onExportJson={onExportJson} onExportHtml={onExportHtml} onCopyReport={onCopyReport}>
                  {exportButton}
                </ExportMenu>
              </Suspense>
            ) : (
              exportButton
            )
          ) : null}

          <label
            className="hidden h-9 cursor-pointer items-center gap-2 text-sm md:flex"
            title={t.header.reviewerModeHint}
          >
            {t.header.reviewerMode}
            <Switch
              checked={reviewerMode}
              onCheckedChange={onReviewerModeChange}
              aria-label={t.header.reviewerMode}
            />
          </label>

          {/* Narrow screens: the same two behind one menu. */}
          {moreArmed ? (
            <Suspense fallback={moreButton}>
              <MoreMenu
                defaultOpen
                hasReport={hasReport}
                reviewerMode={reviewerMode}
                onReviewerModeChange={onReviewerModeChange}
                onExportJson={onExportJson}
                onExportHtml={onExportHtml}
                onCopyReport={onCopyReport}
              >
                {moreButton}
              </MoreMenu>
            </Suspense>
          ) : (
            moreButton
          )}

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

          <LanguageToggle />
        </div>
      </div>
    </header>
  )
}
