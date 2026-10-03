import { Download, Ellipsis, History, Moon, Sun, UserRoundCheck } from 'lucide-react'

import { LogoMark } from '@/components/brand'
import { ExportMenu } from '@/components/export-menu'
import { HistoryItems } from '@/components/history-menu'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTheme } from '@/hooks/use-theme'
import type { HistoryEntry } from '@/lib/history'
import { useI18n } from '@/lib/i18n'
import type { UiLang } from '@/lib/types'
import { cn } from '@/lib/utils'

interface AppHeaderProps {
  hasReport: boolean
  reviewerMode: boolean
  onReviewerModeChange: (on: boolean) => void
  history: HistoryEntry[]
  /** Called when a menu that lists the history opens. */
  onHistoryOpen: () => void
  onOpenHistory: (entry: HistoryEntry) => void
  onClearHistory: () => void
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
    <div role="group" aria-label={t.header.language} className="flex rounded-lg bg-white/12 p-1">
      {options.map((option) => {
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
              'h-7 min-w-8 rounded-md px-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:px-3',
              active
                ? 'bg-white text-[#14453d] shadow-sm'
                : 'text-header-foreground hover:bg-white/5',
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

export function AppHeader({
  hasReport,
  reviewerMode,
  onReviewerModeChange,
  history,
  onHistoryOpen,
  onOpenHistory,
  onClearHistory,
  onExportJson,
  onExportHtml,
  onCopyReport,
  onHome,
}: AppHeaderProps) {
  const { t } = useI18n()
  const { theme, toggle } = useTheme()
  const themeLabel = theme === 'dark' ? t.header.darkOff : t.header.darkOn

  return (
    <header className="sticky top-0 z-40 bg-header text-header-foreground shadow-sm print:hidden">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <button
          type="button"
          onClick={onHome}
          aria-label={t.header.home}
          className="flex items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          <LogoMark />
          <span className="text-xl font-bold leading-none">{t.appName}</span>
        </button>

        <div className="ms-auto flex items-center gap-2">
          <LanguageToggle />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="header"
                size="icon-lg"
                aria-label={themeLabel}
                aria-pressed={theme === 'dark'}
                onClick={toggle}
              >
                {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{themeLabel}</TooltipContent>
          </Tooltip>

          {/* Wide screens: reviewer mode and history sit in the bar. */}
          <label
            className={cn(
              // White text needs 4.5:1 on the bar, so the "on" state is a gold outline, not a lighter fill.
              'hidden h-9 cursor-pointer items-center gap-2 rounded-lg bg-white/12 px-3 text-sm font-medium transition-colors hover:bg-white/16 md:flex',
              reviewerMode && 'ring-2 ring-gold',
            )}
            title={t.header.reviewerModeHint}
          >
            <UserRoundCheck aria-hidden="true" className="size-4" />
            {t.header.reviewerMode}
            <Switch
              checked={reviewerMode}
              onCheckedChange={onReviewerModeChange}
              aria-label={t.header.reviewerMode}
              className="data-checked:bg-gold data-unchecked:bg-white/30 focus-visible:ring-white/50"
            />
          </label>

          <DropdownMenu onOpenChange={(open) => open && onHistoryOpen()}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="header"
                    size="icon-lg"
                    aria-label={t.header.history}
                    className="hidden md:inline-flex"
                  >
                    <History aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{t.header.history}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-80">
              <HistoryItems entries={history} onOpen={onOpenHistory} onClear={onClearHistory} />
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Narrow screens: the same two behind "المزيد". */}
          <DropdownMenu onOpenChange={(open) => open && onHistoryOpen()}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="header"
                size="icon-lg"
                aria-label={t.header.more}
                className="md:hidden"
              >
                <Ellipsis aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuCheckboxItem
                checked={reviewerMode}
                onCheckedChange={(checked) => onReviewerModeChange(checked === true)}
                className="py-2"
              >
                <UserRoundCheck aria-hidden="true" />
                {t.header.reviewerMode}
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <HistoryItems entries={history} onOpen={onOpenHistory} onClear={onClearHistory} />
            </DropdownMenuContent>
          </DropdownMenu>

          {hasReport ? (
            <ExportMenu onExportJson={onExportJson} onExportHtml={onExportHtml} onCopyReport={onCopyReport}>
              <Button
                type="button"
                variant="gold"
                size="lg"
                aria-label={t.header.export}
                className="animate-rise px-3 sm:px-4"
              >
                <Download aria-hidden="true" />
                <span className="hidden sm:inline">{t.header.export}</span>
              </Button>
            </ExportMenu>
          ) : null}
        </div>
      </div>
    </header>
  )
}

export function TransparencyLine() {
  const { t } = useI18n()
  return (
    <p className="border-b bg-secondary/60 px-4 py-1 text-center text-xs text-muted-foreground print:border-0">
      {t.transparency}
    </p>
  )
}
