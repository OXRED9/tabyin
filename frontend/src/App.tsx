import { FileText, MessageCircleQuestion, Newspaper, Play, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { AppHeader, TransparencyLine } from '@/components/app-header'
import { InlineError } from '@/components/inline-error'
import { InputPanel, VerifyButton } from '@/components/input-panel'
import { ProgressPanel } from '@/components/progress-panel'
import { ReportView } from '@/components/report/report-view'
import { Button } from '@/components/ui/button'
import { DirectionProvider } from '@/components/ui/direction'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useMediaQuery } from '@/hooks/use-media-query'
import { ThemeProvider } from '@/hooks/use-theme'
import { useVerify } from '@/hooks/use-verify'
import { fetchMeta } from '@/lib/api'
import { copyText } from '@/lib/clipboard'
import { emptyDraft } from '@/lib/draft'
import type { InputDraft } from '@/lib/draft'
import { errorCopy, errorRemedies, localError } from '@/lib/errors'
import { downloadJson, exportHtml } from '@/lib/export'
import { featuresOf } from '@/lib/features'
import { isHttpUrl, safeHref, truncate } from '@/lib/format'
import { clearHistory, loadHistory, saveHistoryEntry } from '@/lib/history'
import type { HistoryEntry } from '@/lib/history'
import { I18nProvider, useI18n } from '@/lib/i18n'
import { buildMarkdownReport } from '@/lib/markdown'
import { assembleReport } from '@/lib/report'
import { chronological } from '@/lib/states'
import { readStored, writeStored } from '@/lib/storage'
import type { Card, InputType, Meta, MetaExample, Report, ReviewerOverride, VerifyInput } from '@/lib/types'
import { cn } from '@/lib/utils'

const DEFAULT_LIMITS: Meta['limits'] = { max_text_chars: 60000, max_upload_mb: 50, max_media_minutes: 30 }
const REVIEWER_MODE_KEY = 'tabayyun.reviewerMode'
const MEDIA_EXTENSIONS = /\.(mp3|m4a|wav|ogg|oga|opus|aac|flac|wma|mp4|m4v|mov|mkv|webm|avi|3gp)$/i

const EXAMPLE_ICONS: Record<InputType, typeof FileText> = {
  text: FileText,
  article_url: Newspaper,
  video_url: Play,
  file: Upload,
}

/** Accept "youtube.com/watch?v=…" as typed: people rarely type the scheme. */
function normaliseUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  return /^[^\s/]+\.[^\s/]+/.test(trimmed) ? `https://${trimmed}` : trimmed
}

function Shell() {
  const { t, lang, dir } = useI18n()
  const { state, start, cancel, reset, restore, clearError, showError, setOverride, removeOverride } =
    useVerify(lang)

  const [meta, setMeta] = useState<Meta | null>(null)
  const [draft, setDraft] = useState<InputDraft>(emptyDraft)
  const [reviewerMode, setReviewerMode] = useState(() => readStored<boolean>(REVIEWER_MODE_KEY, false))
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)
  const fieldRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null)
  const wide = useMediaQuery('(min-width: 640px)')

  const limits = meta?.limits ?? DEFAULT_LIMITS
  const running = state.phase === 'running'
  const done = state.phase === 'done'
  const hasResults = running || done || state.claims.length > 0

  // Static content the UI must not hard-code (verses, examples, referral links).
  useEffect(() => {
    const controller = new AbortController()
    fetchMeta(controller.signal)
      .then(setMeta)
      .catch(() => {
        /* The page works without it: examples and verses simply do not show. */
      })
    return () => controller.abort()
  }, [])

  const report: Report | null = useMemo(() => {
    if (!done || !state.source || !state.summary || !state.generatedAt) return null
    const cards = state.claims.map((c) => state.cards[c.id]).filter((c): c is Card => !!c)
    if (cards.length === 0) return null
    return assembleReport({
      source: state.source,
      segments: state.segments,
      cards,
      summary: state.summary,
      generatedAt: state.generatedAt,
      overrides: state.overrides,
    })
  }, [done, state.source, state.summary, state.generatedAt, state.claims, state.cards, state.segments, state.overrides])

  // Local history: the last ten reports, in this browser only. Re-saved when a reviewer edits.
  useEffect(() => {
    if (!report || !state.input) return
    const first = [...report.cards].sort(chronological)[0]
    const title =
      report.source.title ||
      state.input.url ||
      state.input.file_name ||
      truncate(state.input.text ?? first?.text_as_quoted ?? '', 80)
    saveHistoryEntry({
      id: report.generated_at,
      saved_at: report.generated_at,
      title,
      input: state.input,
      report,
    })
  }, [report, state.input])

  // The menu reads the stored list each time it opens, so it never shows a stale one.
  const refreshHistory = useCallback(() => setHistory(loadHistory()), [])

  const patchDraft = useCallback(
    (patch: Partial<InputDraft>) => {
      setDraft((current) => ({ ...current, ...patch }))
      clearError()
    },
    [clearError],
  )

  const focusField = useCallback(() => {
    window.requestAnimationFrame(() => fieldRef.current?.focus())
  }, [])

  const submit = useCallback(
    (override?: InputDraft) => {
      if (running) return
      const current = override ?? draft
      let input: VerifyInput
      if (current.tab === 'text') {
        const text = current.text.trim()
        if (!text) return showError(localError('empty_input'))
        if (text.length > limits.max_text_chars) return showError(localError('input_too_long'))
        input = { input_type: 'text', text }
      } else if (current.tab === 'file') {
        const file = current.file
        if (!file) return showError(localError('empty_input'))
        if (file.size > limits.max_upload_mb * 1024 * 1024) return showError(localError('file_too_large'))
        const isMedia = /^(audio|video)\//.test(file.type) || MEDIA_EXTENSIONS.test(file.name)
        if (!isMedia) return showError(localError('unsupported_file'))
        input = { input_type: 'file', file }
      } else {
        const key = current.tab
        const url = normaliseUrl(current[key])
        if (!url) return showError(localError('empty_input'))
        if (!isHttpUrl(url)) return showError(localError('invalid_url'))
        if (url !== current[key]) setDraft((d) => ({ ...d, [key]: url }))
        input = { input_type: key, url }
      }
      void start(input)
    },
    [draft, limits, running, showError, start],
  )

  const applyExample = useCallback(
    (example: MetaExample) => {
      const tab = example.input_type
      patchDraft({
        tab,
        ...(tab === 'text' ? { text: example.text ?? '' } : {}),
        ...(tab === 'article_url' ? { article_url: example.url ?? '' } : {}),
        ...(tab === 'video_url' ? { video_url: example.url ?? '' } : {}),
      })
      focusField()
    },
    [focusField, patchDraft],
  )

  const verifyAnother = useCallback(() => {
    reset()
    setDraft((d) => ({ ...emptyDraft, tab: d.tab }))
    window.scrollTo({ top: 0 })
    focusField()
  }, [focusField, reset])

  const goHome = useCallback(() => {
    reset()
    setDraft(emptyDraft)
    window.scrollTo({ top: 0 })
  }, [reset])

  const openHistory = useCallback(
    (entry: HistoryEntry) => {
      restore(entry)
      const { input } = entry
      setDraft({
        ...emptyDraft,
        tab: input.input_type,
        text: input.input_type === 'text' ? (input.text ?? '') : '',
        article_url: input.input_type === 'article_url' ? (input.url ?? '') : '',
        video_url: input.input_type === 'video_url' ? (input.url ?? '') : '',
      })
      window.scrollTo({ top: 0 })
    },
    [restore],
  )

  const wipeHistory = useCallback(() => {
    const previous = loadHistory()
    setHistory(clearHistory())
    toast(t.history.cleared, {
      action: {
        label: t.reviewer.undo,
        onClick: () => {
          let restored: HistoryEntry[] = []
          for (const entry of [...previous].reverse()) restored = saveHistoryEntry(entry)
          setHistory(restored)
        },
      },
    })
  }, [t])

  const changeReviewerMode = useCallback((on: boolean) => {
    setReviewerMode(on)
    writeStored(REVIEWER_MODE_KEY, on)
  }, [])

  // Reviewer edits are undoable from the toast as well as from the card itself.
  const saveOverride = useCallback(
    (override: ReviewerOverride) => {
      const previous = state.overrides.find((o) => o.card_id === override.card_id)
      setOverride(override)
      toast.success(t.reviewer.saved, {
        action: {
          label: t.reviewer.undo,
          onClick: () => (previous ? setOverride(previous) : removeOverride(override.card_id)),
        },
      })
    },
    [removeOverride, setOverride, state.overrides, t],
  )

  const dropOverride = useCallback(
    (cardId: string) => {
      const previous = state.overrides.find((o) => o.card_id === cardId)
      removeOverride(cardId)
      toast(t.reviewer.undone, {
        action: previous ? { label: t.reviewer.undo, onClick: () => setOverride(previous) } : undefined,
      })
    },
    [removeOverride, setOverride, state.overrides, t],
  )

  const exportJson = useCallback(() => {
    if (!report) return
    downloadJson(report)
    toast.success(t.exportMenu.doneJson)
  }, [report, t])

  const exportPrintable = useCallback(() => {
    if (!report) return
    exportHtml(report, { t, lang, meta })
      .then((outcome) => {
        if (outcome.via === 'client') toast(t.exportMenu.fallback)
        else toast.success(outcome.opened ? t.exportMenu.doneHtml : t.exportMenu.downloadedHtml)
      })
      .catch(() => toast.error(t.errors.internal.message))
  }, [report, t, lang, meta])

  // F4: the whole report as Markdown, on the clipboard.
  const copyReport = useCallback(() => {
    if (!report) return
    void copyText(buildMarkdownReport(report, { t, lang, meta })).then((copied) => {
      if (copied) toast(t.copy.reportDone)
      else toast.error(t.copy.failed)
    })
  }, [report, t, lang, meta])
  const features = useMemo(() => featuresOf(meta), [meta])

  // Ctrl/⌘ + Enter anywhere on the page runs the verification.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.defaultPrevented) {
        const target = event.target as HTMLElement | null
        if (target?.closest('[role="dialog"], [role="menu"]')) return
        event.preventDefault()
        submit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [submit])

  const errorId = 'verify-error'
  const error = state.fatalError
  const errorNode = error
    ? (() => {
        const copy = errorCopy(error, { t, lang, tab: draft.tab, limits })
        const remedies = errorRemedies(error.code)
        return (
          <InlineError
            id={errorId}
            message={copy.message}
            hint={copy.hint}
            onDismiss={clearError}
            actions={
              remedies.length > 0
                ? remedies.map((remedy) => {
                    if (remedy === 'upload') {
                      return (
                        <Button key={remedy} type="button" size="touch" onClick={() => patchDraft({ tab: 'file' })}>
                          <Upload aria-hidden="true" />
                          {t.errors.uploadInstead}
                        </Button>
                      )
                    }
                    if (remedy === 'retry') {
                      return (
                        <Button key={remedy} type="button" size="touch" onClick={() => submit()}>
                          {t.errors.retry}
                        </Button>
                      )
                    }
                    return (
                      <Button
                        key={remedy}
                        type="button"
                        variant="outline"
                        size="touch"
                        className="bg-background"
                        onClick={() => {
                          patchDraft({ tab: 'text' })
                          focusField()
                        }}
                      >
                        <FileText aria-hidden="true" />
                        {remedy === 'paste-article' ? t.errors.pasteText : t.errors.pasteInstead}
                      </Button>
                    )
                  })
                : undefined
            }
          />
        )
      })()
    : null

  const examples = (meta?.examples ?? []).filter((example) =>
    example.input_type === 'text' ? !!example.text : !!safeHref(example.url),
  )
  const motto = meta?.motto_verse ?? null

  return (
    <DirectionProvider dir={dir}>
      <TooltipProvider delayDuration={300}>
        <a
          href="#main"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:start-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-card focus-visible:px-4 focus-visible:py-2 focus-visible:shadow-raised"
        >
          {t.skipToContent}
        </a>

        <div className="flex min-h-dvh flex-col">
          <AppHeader
            hasReport={!!report}
            reviewerMode={reviewerMode}
            onReviewerModeChange={changeReviewerMode}
            history={history}
            onHistoryOpen={refreshHistory}
            onOpenHistory={openHistory}
            onClearHistory={wipeHistory}
            onExportJson={exportJson}
            onExportHtml={exportPrintable}
            onCopyReport={features.copy ? copyReport : undefined}
            onHome={goHome}
          />
          <TransparencyLine />

          <main
            id="main"
            className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 pt-6 pb-28 sm:px-6 sm:pb-12"
          >
            <div className={hasResults ? 'space-y-6' : 'mx-auto max-w-3xl space-y-6 sm:pt-8'}>
              {hasResults ? (
                <h1 className="sr-only">{t.headline}</h1>
              ) : (
                <div className="space-y-2 text-center">
                  <h1 className="text-3xl font-bold leading-tight text-primary sm:text-4xl">{t.headline}</h1>
                  <p className="text-base text-muted-foreground">{t.subline}</p>
                </div>
              )}

              <InputPanel
                draft={draft}
                onChange={patchDraft}
                onSubmit={() => submit()}
                running={running}
                compact={hasResults}
                limits={limits}
                hasError={!!error}
                errorId={errorId}
                error={errorNode}
                fieldRef={fieldRef}
              />

              {!hasResults && examples.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-center text-sm font-medium text-muted-foreground">{t.input.examples}</p>
                  <ul
                    className={cn(
                      'mx-auto grid gap-3',
                      examples.length === 2 && 'max-w-xl sm:grid-cols-2',
                      examples.length >= 3 && 'sm:grid-cols-3',
                      examples.length === 1 && 'max-w-xs',
                    )}
                  >
                    {examples.map((example) => {
                      const Icon = example.id === 'fabrication' ? MessageCircleQuestion : EXAMPLE_ICONS[example.input_type]
                      return (
                        <li key={example.id}>
                          <button
                            type="button"
                            onClick={() => applyExample(example)}
                            className="group flex h-full w-full items-center gap-3 rounded-xl bg-card p-3 text-start shadow-card ring-1 ring-border transition hover:ring-primary hover:shadow-raised"
                          >
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                              <Icon aria-hidden="true" className="size-5" />
                            </span>
                            <span className="text-sm font-medium text-primary underline decoration-primary/30 underline-offset-4 group-hover:decoration-primary">
                              {lang === 'ar' ? example.label_ar : example.label_en}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null}

              {!hasResults && motto ? (
                <figure className="space-y-2 pt-4 text-center">
                  <blockquote lang="ar" dir="rtl" className="quran-text text-xl text-foreground/80">
                    ﴿{motto.text}﴾
                  </blockquote>
                  <figcaption className="text-xs text-muted-foreground">
                    <a
                      href={safeHref(motto.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
                    >
                      {lang === 'ar' ? motto.ref : motto.ref_en || motto.ref}
                    </a>
                  </figcaption>
                </figure>
              ) : null}
            </div>

            {running ? <ProgressPanel state={state} onCancel={cancel} /> : null}

            {hasResults ? (
              <ReportView
                key={state.run}
                state={state}
                meta={meta}
                reviewerMode={reviewerMode}
                onSaveOverride={saveOverride}
                onRemoveOverride={dropOverride}
                onExportJson={exportJson}
                onExportHtml={exportPrintable}
                onCopyReport={features.copy ? copyReport : undefined}
                onVerifyAnother={verifyAnother}
              />
            ) : null}
          </main>
        </div>

        {/* Fitts: on a phone the primary action is always under the thumb. */}
        <div className="fixed inset-x-0 bottom-0 z-30 flex gap-3 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden print:hidden">
          {running ? (
            <Button type="button" variant="outline" size="xl" onClick={cancel} className="px-6 font-medium">
              {t.input.cancel}
            </Button>
          ) : null}
          <VerifyButton running={running} onClick={() => submit()} className="flex-1" />
        </div>

        <Toaster
          dir={dir}
          position={wide ? 'bottom-center' : 'top-center'}
          offset={24}
          mobileOffset={{ top: 72 }}
        />
      </TooltipProvider>
    </DirectionProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <Shell />
      </I18nProvider>
    </ThemeProvider>
  )
}
