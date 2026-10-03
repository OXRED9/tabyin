import { Download, Moon, Sun } from 'lucide-react'
import { Suspense, lazy, useEffect, useState } from 'react'

import { LogoMark, Logotype } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/use-theme'
import { useI18n } from '@/lib/i18n'
import type { UiLang } from '@/lib/types'
import { cn } from '@/lib/utils'

// The menu is not needed to paint the bar: it is fetched the first time its button is used (or
// just before, when the pointer reaches it), and is born open.
const loadExportMenu = () => import('@/components/export-menu')
const ExportMenu = lazy(loadExportMenu)

interface AppHeaderProps {
  hasReport: boolean
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
 * A thin bar of paper with a hairline under it: the mark and the logotype, then export (once
 * there is a report), theme and language. Nothing else. The static shell in index.html draws the
 * same bar before this code runs.
 */
export function AppHeader({ hasReport, onExportJson, onExportHtml, onCopyReport, onHome }: AppHeaderProps) {
  const { t } = useI18n()
  const { theme, toggle } = useTheme()
  const themeLabel = theme === 'dark' ? t.header.darkOff : t.header.darkOn
  const [exportArmed, setExportArmed] = useState(false)

  // Once there is a report its menu is likely to be wanted: fetch it when the page is quiet.
  useEffect(() => {
    if (!hasReport) return
    const timer = window.setTimeout(() => void loadExportMenu(), 2500)
    return () => window.clearTimeout(timer)
  }, [hasReport])

  // The word joins the icon where there is room for it.
  const exportButton = (
    <Button
      type="button"
      variant="ghost"
      aria-label={t.header.export}
      aria-haspopup="menu"
      className="max-md:size-9 max-md:px-0"
      onPointerEnter={() => void loadExportMenu()}
      onFocus={() => void loadExportMenu()}
      onClick={exportArmed ? undefined : () => setExportArmed(true)}
    >
      <Download aria-hidden="true" />
      <span className="max-md:hidden">{t.header.exportShort}</span>
    </Button>
  )

  return (
    <header className="sticky top-0 z-40 border-b bg-paper print:hidden">
      <div className="flex h-12 items-center gap-1 px-4 sm:gap-3 sm:px-6">
        {/* Home: a new verification on the first screen. A link, so it can also be opened afresh;
            a plain click stays in the page, and the report just made stays in the local history. */}
        <a
          href="/"
          aria-label={t.header.home}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
            event.preventDefault()
            onHome()
          }}
          className="flex items-center gap-2 rounded-control"
        >
          <LogoMark />
          <Logotype />
        </a>

        <div className="ms-auto flex items-center gap-1 sm:gap-3">
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
