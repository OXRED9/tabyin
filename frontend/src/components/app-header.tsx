import { ClipboardCopy, Download, Ellipsis, FileJson, Moon, Printer, Sun } from 'lucide-react'

import { Logotype } from '@/components/brand'
import { ExportMenu } from '@/components/export-menu'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTheme } from '@/hooks/use-theme'
import { useI18n } from '@/lib/i18n'
import type { UiLang } from '@/lib/types'
import { cn } from '@/lib/utils'

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
 * fold into one menu.
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

  return (
    <header className="sticky top-0 z-40 border-b bg-paper print:hidden">
      <div className="mx-auto flex h-12 max-w-[69rem] items-center gap-1 px-4 sm:gap-3 sm:px-6">
        <button type="button" onClick={onHome} aria-label={t.header.home} className="rounded-control">
          <Logotype />
        </button>

        <div className="ms-auto flex items-center gap-1 sm:gap-3">
          {/* Wide screens: export and reviewer mode sit in the bar. */}
          {hasReport ? (
            <ExportMenu onExportJson={onExportJson} onExportHtml={onExportHtml} onCopyReport={onCopyReport}>
              <Button type="button" variant="ghost" aria-label={t.header.export} className="hidden md:inline-flex">
                <Download aria-hidden="true" />
                {t.header.exportShort}
              </Button>
            </ExportMenu>
          ) : null}

          <label
            className="hidden h-9 cursor-pointer items-center gap-2 text-sm font-medium md:flex"
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={t.header.more} className="md:hidden">
                <Ellipsis aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuCheckboxItem
                checked={reviewerMode}
                onCheckedChange={(checked) => onReviewerModeChange(checked === true)}
              >
                {t.header.reviewerMode}
              </DropdownMenuCheckboxItem>
              {hasReport ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>{t.header.export}</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={onExportHtml}>
                    <Printer aria-hidden="true" />
                    {t.exportMenu.html}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onExportJson}>
                    <FileJson aria-hidden="true" />
                    {t.exportMenu.json}
                  </DropdownMenuItem>
                  {onCopyReport ? (
                    <DropdownMenuItem onSelect={onCopyReport}>
                      <ClipboardCopy aria-hidden="true" />
                      {t.copy.report}
                    </DropdownMenuItem>
                  ) : null}
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={themeLabel}
                aria-pressed={theme === 'dark'}
                onClick={toggle}
              >
                {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{themeLabel}</TooltipContent>
          </Tooltip>

          <LanguageToggle />
        </div>
      </div>
    </header>
  )
}
