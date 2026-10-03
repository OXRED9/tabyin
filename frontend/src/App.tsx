import { FileText, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'

import { AppHeader } from '@/components/app-header'
import { Composer } from '@/components/composer'
import type { AttachKind } from '@/components/composer'
import { HistoryPanel } from '@/components/history-panel'
import { InlineError } from '@/components/inline-error'
import { ReportView } from '@/components/report/report-view'
import { Button } from '@/components/ui/button'
import { DirectionProvider } from '@/components/ui/direction'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useMediaQuery } from '@/hooks/use-media-query'
import { ThemeProvider } from '@/hooks/use-theme'
import { useVerify } from '@/hooks/use-verify'
import { MOCK_MODE, fetchMeta } from '@/lib/api'
import { copyText } from '@/lib/clipboard'
import { emptyDraft } from '@/lib/draft'
import type { InputDraft } from '@/lib/draft'
import { errorCopy, errorRemedies, localError } from '@/lib/errors'
import { downloadJson, exportHtml } from '@/lib/export'
import { featuresOf } from '@/lib/features'
import { safeHref, truncate } from '@/lib/format'
import { clearHistory, loadHistory, saveHistoryEntry, subscribeHistory } from '@/lib/history'
import type { HistoryEntry, SubmittedInput } from '@/lib/history'
import { I18nProvider, useI18n } from '@/lib/i18n'
import { detectLink, looksLikeBrokenLink } from '@/lib/link'
import { buildMarkdownReport } from '@/lib/markdown'
import { assembleReport } from '@/lib/report'
import { chronological } from '@/lib/states'
import { readStored, writeStored } from '@/lib/storage'
import type { Card, Meta, MetaExample, Report, ReviewerOverride, VerifyInput } from '@/lib/types'
import { cn } from '@/lib/utils'

const DEFAULT_LIMITS: Meta['limits'] = { max_text_chars: 60000, max_upload_mb: 50, max_media_minutes: 30 }
const REVIEWER_MODE_KEY = 'tabayyun.reviewerMode'
const MEDIA_EXTENSIONS = /\.(mp3|m4a|wav|ogg|oga|opus|aac|flac|wma|mp4|m4v|mov|mkv|webm|avi|3gp)$/i
const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|heic|heif)$/i

/** Mock mode only: `?mock=1&scenario=<name>&autorun=1` submits that scenario's input on load. */
const AUTORUN = MOCK_MODE && new URLSearchParams(window.location.search).get('autorun') === '1'

/** What the composer shows for an input that was submitted earlier (history, autorun). */
function draftFromInput(input: SubmittedInput | VerifyInput): InputDraft {
  if (input.input_type === 'text') return { ...emptyDraft, text: input.text ?? '' }
  if (input.input_type === 'file') return emptyDraft
  return { ...emptyDraft, text: input.url ?? '', linkAs: input.input_type }
}

function Shell() {
  const { t, lang, dir } = useI18n()
  const { state, start, cancel, reset, restore, clearError, showError, setOverride, removeOverride } =
    useVerify(lang)

  const [meta, setMeta] = useState<Meta | null>(null)
  const [draft, setDraft] = useState<InputDraft>(emptyDraft)
  const [reviewerMode, setReviewerMode] = useState(() => readStored<boolean>(REVIEWER_MODE_KEY, false))
  const history = useSyncExternalStore(subscribeHistory, loadHistory)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [autorunPending, setAutorunPending] = useState(AUTORUN)
  const fieldRef = useRef<HTMLTextAreaElement | null>(null)
  const pickerRef = useRef<((kind: AttachKind) => void) | null>(null)
  const autorunStarted = useRef(false)
  const wide = useMediaQuery('(min-width: 640px)')

  const limits = meta?.limits ?? DEFAULT_LIMITS
  const features = useMemo(() => featuresOf(meta), [meta])
  const running = state.phase === 'running' || autorunPending
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

  // Mock mode's direct route to a finished report, for audits of the report page.
  useEffect(() => {
    if (!AUTORUN || autorunStarted.current) return
    autorunStarted.current = true
    void import('@/mocks/mock-stream').then(({ mockAutorunInput }) => {
      const input = mockAutorunInput()
      if (input) {
        setDraft(draftFromInput(input))
        void start(input)
      }
      setAutorunPending(false)
    })
  }, [start])

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

  /** One field, four kinds of request: what is in the composer decides which one is sent. */
  const submit = useCallback(
    (override?: InputDraft) => {
      if (running) return
      const current = override ?? draft
      let input: VerifyInput
      if (current.file) {
        const file = current.file
        if (file.size > limits.max_upload_mb * 1024 * 1024) return showError(localError('file_too_large'))
        const isMedia = /^(audio|video)\//.test(file.type) || MEDIA_EXTENSIONS.test(file.name)
        const isImage = features.image && (/^image\//.test(file.type) || IMAGE_EXTENSIONS.test(file.name))
        if (!isMedia && !isImage) return showError(localError('unsupported_file'))
        input = { input_type: 'file', file }
      } else {
        const text = current.text.trim()
        if (!text) return showError(localError('empty_input'))
        const link = detectLink(text)
        if (link) {
          if (link.url !== current.text) setDraft((d) => ({ ...d, text: link.url }))
          input = { input_type: current.linkAs ?? link.kind, url: link.url }
        } else {
          if (looksLikeBrokenLink(text)) return showError(localError('invalid_url'))
          if (text.length > limits.max_text_chars) return showError(localError('input_too_long'))
          input = { input_type: 'text', text }
        }
      }
      window.scrollTo({ top: 0 })
      void start(input)
    },
    [draft, features.image, limits, running, showError, start],
  )

  const applyExample = useCallback(
    (example: MetaExample) => {
      patchDraft({
        file: null,
        linkAs: null,
        text: example.input_type === 'text' ? (example.text ?? '') : (example.url ?? ''),
      })
      focusField()
    },
    [focusField, patchDraft],
  )

  const verifyAnother = useCallback(() => {
    reset()
    setDraft(emptyDraft)
    window.scrollTo({ top: 0 })
    focusField()
  }, [focusField, reset])

  const goHome = useCallback(() => {
    reset()
    setDraft(emptyDraft)
    window.scrollTo({ top: 0 })
  }, [reset])

  const openHistoryEntry = useCallback(
    (entry: HistoryEntry) => {
      setHistoryOpen(false)
      restore(entry)
      setDraft(draftFromInput(entry.input))
      window.scrollTo({ top: 0 })
    },
    [restore],
  )

  const showHistory = useCallback(() => setHistoryOpen(true), [])

  const wipeHistory = useCallback(() => {
    const previous = loadHistory()
    clearHistory()
    setHistoryOpen(false)
    toast(t.history.cleared, {
      action: {
        label: t.reviewer.undo,
        onClick: () => {
          for (const entry of [...previous].reverse()) saveHistoryEntry(entry)
        },
      },
    })
  }, [t])

  const changeReviewerMode = useCallback((on: boolean) => {
    setReviewerMode(on)
    writeStored(REVIEWER_MODE_KEY, on)
  }, [])

  // Reviewer edits are undoable from the toast as well as from the note itself.
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

  // Ctrl/⌘ + Enter anywhere on the page runs the verification.
  useEffect(() => {
    if (hasResults) return
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
  }, [hasResults, submit])

  const errorId = 'verify-error'
  const error = state.fatalError
  const errorNode = error
    ? (() => {
        const copy = errorCopy(error, { t, lang, limits })
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
                        <Button
                          key={remedy}
                          type="button"
                          size="touch"
                          onClick={() => {
                            if (hasResults) verifyAnother()
                            window.requestAnimationFrame(() => pickerRef.current?.('file'))
                          }}
                        >
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
                        onClick={() => {
                          // The link gives way to the text the user is about to paste.
                          if (hasResults) reset()
                          setDraft(emptyDraft)
                          clearError()
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

  return (
    <DirectionProvider dir={dir}>
      <TooltipProvider delayDuration={300}>
        <a
          href="#main"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:start-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-control focus-visible:border focus-visible:bg-paper focus-visible:px-4 focus-visible:py-2 focus-visible:shadow-overlay"
        >
          {t.skipToContent}
        </a>

        <div className="flex min-h-dvh flex-col">
          <AppHeader
            hasReport={!!report}
            reviewerMode={reviewerMode}
            onReviewerModeChange={changeReviewerMode}
            onExportJson={exportJson}
            onExportHtml={exportPrintable}
            onCopyReport={features.copy ? copyReport : undefined}
            onHome={goHome}
          />

          <main id="main" className="flex-1 sm:px-4 sm:py-6 lg:py-10">
            {/* One sheet of paper on the desk. It is narrow while it is a blank page and widens
                to the text-and-margin layout the moment a verification starts. */}
            <div
              data-sheet={hasResults ? 'report' : 'compose'}
              className={cn(
                'mx-auto flex w-full flex-col border-b bg-paper p-5 sm:rounded-sheet sm:border md:p-8 lg:p-12 print:border-0',
                hasResults ? 'max-w-[66rem]' : 'max-w-[45rem]',
              )}
            >
              {hasResults ? (
                <>
                  <h1 className="sr-only">{t.report.title}</h1>
                  <ReportView
                    key={state.run}
                    state={state}
                    running={running}
                    onCancel={autorunPending ? undefined : cancel}
                    meta={meta}
                    reviewerMode={reviewerMode}
                    error={errorNode}
                    onSaveOverride={saveOverride}
                    onRemoveOverride={dropOverride}
                    onVerifyAnother={verifyAnother}
                  />
                </>
              ) : (
                <Composer
                  draft={draft}
                  onChange={patchDraft}
                  onSubmit={() => submit()}
                  limits={limits}
                  imageInput={features.image}
                  examples={examples}
                  onExample={applyExample}
                  historyCount={history.length}
                  onOpenHistory={showHistory}
                  hasError={!!error}
                  errorId={errorId}
                  error={errorNode}
                  fieldRef={fieldRef}
                  pickerRef={pickerRef}
                />
              )}

              {/* The transparency line is the sheet's footer in every state. */}
              <footer className="mt-10 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t pt-4 text-sm text-quiet">
                <p>{t.transparency}</p>
                {hasResults && !running && history.length > 0 ? (
                  <Button type="button" variant="link" onClick={showHistory} className="print:hidden">
                    {t.input.recent(history.length)}
                  </Button>
                ) : null}
              </footer>
            </div>
          </main>
        </div>

        <HistoryPanel
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          entries={history}
          onOpen={openHistoryEntry}
          onClear={wipeHistory}
        />

        <Toaster dir={dir} position={wide ? 'bottom-center' : 'top-center'} offset={24} mobileOffset={{ top: 64 }} />
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
