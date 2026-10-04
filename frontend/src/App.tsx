import { FileText, Menu, PanelLeftOpen, Plus, Upload } from 'lucide-react'
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { Composer } from '@/components/composer'
import type { AttachKind } from '@/components/composer'
import { InlineError } from '@/components/inline-error'
import { EngineCards, Headline } from '@/components/home/hero'
import { InstallLine } from '@/components/install-line'
import { ReportView } from '@/components/report/report-view'
import { BrandLink, Rail } from '@/components/shell/rail'
import { Button } from '@/components/ui/button'
import { DirectionProvider } from '@/components/ui/direction'
import { useImageReader } from '@/hooks/use-image-reader'
import { useMediaQuery } from '@/hooks/use-media-query'
import { ThemeProvider } from '@/hooks/use-theme'
import { useVerify } from '@/hooks/use-verify'
import { ApiFailure, MOCK_MODE, fetchExampleImage, fetchMeta, loadMock } from '@/lib/api'
import { copyText } from '@/lib/clipboard'
import { emptyDraft } from '@/lib/draft'
import type { InputDraft } from '@/lib/draft'
import { errorCopy, errorRemedies, localError } from '@/lib/errors'
import { featuresOf } from '@/lib/features'
import { isImageFile, isMediaFile } from '@/lib/files'
import { safeHref, truncate } from '@/lib/format'
import { clearActivity, recordVerification, restoreActivity, verificationsRemembered, verificationsThisWeek } from '@/lib/activity'
import { clearHistory, loadHistory, saveHistoryEntry, subscribeHistory } from '@/lib/history'
import type { HistoryEntry, SubmittedInput } from '@/lib/history'
import { readStored, writeStored } from '@/lib/storage'
import { I18nProvider, useI18n } from '@/lib/i18n'
import { detectLink, looksLikeBrokenLink } from '@/lib/link'
import { notify, subscribeToaster, toasterWanted } from '@/lib/notify'
import { takeSharedPayload } from '@/lib/pwa'
import type { SharedPayload } from '@/lib/pwa'
import { assembleReport } from '@/lib/report'
import { chronological } from '@/lib/states'
import type { Card, Meta, MetaExample, OcrResult, Report, VerifyInput } from '@/lib/types'

const DEFAULT_LIMITS: Meta['limits'] = {
  max_text_chars: 60000,
  max_upload_mb: 50,
  max_media_minutes: 30,
  max_image_mb: 10,
}

// Not needed to paint the page: each is fetched when first wanted.
const RailDrawer = lazy(() => import('@/components/shell/rail-drawer'))
const RAIL_KEY = 'tabayyun.rail'
const Toaster = lazy(() => import('@/components/ui/sonner'))
const loadExport = () => import('@/lib/export')

/** Mock mode only: `?mock=1&scenario=<name>&autorun=1` submits that scenario's input on load. */
const AUTORUN = MOCK_MODE && new URLSearchParams(window.location.search).get('autorun') === '1'

/** What the composer shows for an input that was submitted earlier (history, autorun). */
function draftFromInput(input: SubmittedInput | VerifyInput): InputDraft {
  if (input.input_type === 'text') return { ...emptyDraft, text: input.text ?? '' }
  if (input.input_type === 'file') return emptyDraft
  return { ...emptyDraft, text: input.url ?? '', linkAs: input.input_type }
}

/** A pasted text shorter than this is placed in the field, not verified. */
const MIN_PASTE_TO_VERIFY = 10

function Shell() {
  const { t, lang, dir } = useI18n()
  const { state, start, cancel, reset, restore, clearError, showError } = useVerify(lang)

  const [meta, setMeta] = useState<Meta | null>(null)
  const [draft, setDraft] = useState<InputDraft>(emptyDraft)
  const history = useSyncExternalStore(subscribeHistory, loadHistory)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // The drawer stays mounted once it has been opened, so it can close with its transition.
  const [drawerSeen, setDrawerSeen] = useState(false)
  const toaster = useSyncExternalStore(subscribeToaster, toasterWanted)
  const [autorunPending, setAutorunPending] = useState(AUTORUN)
  // `?share=unavailable`: something was shared to the app but could not be received.
  const [shareUnavailable, setShareUnavailable] = useState(
    () => new URLSearchParams(window.location.search).get('share') === 'unavailable',
  )
  const fieldRef = useRef<HTMLTextAreaElement | null>(null)
  const pickerRef = useRef<((kind: AttachKind) => void) | null>(null)
  const autorunStarted = useRef(false)
  const shareTaken = useRef(false)
  const metaLoaded = useRef<Promise<Meta | null>>(Promise.resolve(null))
  const wide = useMediaQuery('(min-width: 640px)')

  const limits = meta?.limits ?? DEFAULT_LIMITS
  const features = useMemo(() => featuresOf(meta), [meta])
  const running = state.phase === 'running' || autorunPending
  const done = state.phase === 'done'
  const hasResults = running || done || state.claims.length > 0

  // Static content the UI must not hard-code (verses, examples, referral links).
  useEffect(() => {
    const controller = new AbortController()
    metaLoaded.current = fetchMeta(controller.signal).then(
      (loaded) => {
        setMeta(loaded)
        return loaded
      },
      () => null, // The page works without it: examples and verses simply do not show.
    )
    return () => controller.abort()
  }, [])

  // Mock mode's direct route to a finished report, for audits of the report page.
  useEffect(() => {
    if (!AUTORUN || autorunStarted.current) return
    autorunStarted.current = true
    void loadMock().then(({ mockAutorunInput }) => {
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
      trace: state.traces,
    })
  }, [done, state.source, state.summary, state.generatedAt, state.claims, state.cards, state.segments, state.traces])

  // Local history: the last ten reports, in this browser only.
  useEffect(() => {
    if (!report || !state.input) return
    const first = [...report.cards].sort(chronological)[0]
    const title =
      report.source.title ||
      state.input.url ||
      state.input.file_name ||
      truncate(state.input.text ?? first?.text_as_quoted ?? '', 80)
    // When, and nothing else: the week's line in the rail and the offer to install read it.
    if (!state.restored) recordVerification(report.generated_at)
    saveHistoryEntry({
      id: report.generated_at,
      saved_at: report.generated_at,
      title,
      input: state.input,
      report,
    })
  }, [report, state.input, state.restored])

  const patchDraft = useCallback(
    (patch: Partial<InputDraft>) => {
      setDraft((current) => ({ ...current, ...patch }))
      setShareUnavailable(false)
      clearError()
    },
    [clearError],
  )

  const focusField = useCallback(() => {
    window.requestAnimationFrame(() => fieldRef.current?.focus())
  }, [])

  // F1: a picture is read, never verified directly. Its text lands in the field, editable, and
  // the cursor with it; what «تحقّق» then sends is that text, as an ordinary text request.
  const onImageRead = useCallback(
    (result: OcrResult) => {
      setDraft({ text: result.text, file: null, linkAs: null })
      clearError()
      focusField()
    },
    [clearError, focusField],
  )
  const { image, read: readImage, remove: removeImage } = useImageReader({
    maxMb: limits.max_image_mb ?? 10,
    onRead: onImageRead,
    onError: showError,
  })
  const readImageFile = useCallback(
    (file: File) => {
      clearError()
      setDraft((current) => ({ ...current, file: null }))
      void readImage(file)
    },
    [clearError, readImage],
  )

  /** One field, four kinds of request: what is in the composer decides which one is sent. */
  const submit = useCallback(
    (given?: InputDraft) => {
      if (running || image?.status === 'reading') return
      const current = given ?? draft
      let input: VerifyInput
      if (current.file) {
        const file = current.file
        if (file.size > limits.max_upload_mb * 1024 * 1024) return showError(localError('file_too_large'))
        if (!isMediaFile(file)) return showError(localError('unsupported_file'))
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
      // A text that the vision model read from a picture says so: that reading was a real step.
      void start(input, input.input_type === 'text' && image?.status === 'read' ? 'image' : undefined)
    },
    [draft, image?.status, limits, running, showError, start],
  )

  // F6: what another app shared to the installed app arrives as `/?share=1`. It is taken once,
  // the address is cleaned, and it is routed by what it is: a link (in `url`, or a `text` that is
  // only a link, as Android apps often send it) and any other text start verifying by
  // themselves, as does a clip; a picture goes to the reader, which stops to ask, as always.
  const actions = useRef({ submit, readImageFile })
  useEffect(() => {
    actions.current = { submit, readImageFile }
  })
  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const share = query.get('share')
    if (!share || shareTaken.current) return
    shareTaken.current = true
    query.delete('share')
    const rest = query.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`)
    if (share !== '1') return

    const route = (payload: SharedPayload, loaded: Meta | null) => {
      const file = payload.files[0]
      if (file && isImageFile(file)) {
        if (featuresOf(loaded).image) actions.current.readImageFile(file)
        else showError(localError('unsupported_file'))
        return
      }
      const link = detectLink(payload.url) ?? detectLink(payload.text)
      const next: InputDraft = file
        ? { ...emptyDraft, file }
        : { ...emptyDraft, text: link ? link.url : payload.text.trim() || payload.title.trim() }
      if (!next.file && !next.text) return
      setDraft(next)
      actions.current.submit(next)
    }
    void takeSharedPayload().then(async (payload) => {
      if (payload) route(payload, await metaLoaded.current)
      else setShareUnavailable(true)
    })
  }, [showError])

  // The «لصق» button: what it takes from the clipboard is put in the field and verified at once.
  // A few characters are not something to verify: they are only placed. (A picture goes to the
  // reader instead, which asks first; typing and a keyboard paste never start anything.)
  const pasteAndVerify = useCallback(
    (text: string) => {
      const next: InputDraft = { ...draft, text, linkAs: null }
      patchDraft({ text, linkAs: null })
      if (Array.from(text.trim()).length >= MIN_PASTE_TO_VERIFY) submit(next)
      else focusField()
    },
    [draft, focusField, patchDraft, submit],
  )

  const applyExample = useCallback(
    (example: MetaExample) => {
      if (example.input_type === 'image') {
        // The image example is a picture like any other: fetched, then read.
        if (!example.url) return
        clearError()
        fetchExampleImage(example.url).then(readImageFile, (cause: unknown) =>
          showError(cause instanceof ApiFailure ? cause.error : localError('network')),
        )
        return
      }
      removeImage()
      patchDraft({
        file: null,
        linkAs: null,
        text: example.input_type === 'text' ? (example.text ?? '') : (example.url ?? ''),
      })
      focusField()
    },
    [clearError, focusField, patchDraft, readImageFile, removeImage, showError],
  )

  const verifyAnother = useCallback(() => {
    reset()
    removeImage()
    setDraft(emptyDraft)
    window.scrollTo({ top: 0 })
    focusField()
  }, [focusField, removeImage, reset])

  const goHome = useCallback(() => {
    reset()
    removeImage()
    setDraft(emptyDraft)
    window.scrollTo({ top: 0 })
  }, [removeImage, reset])

  const openHistoryEntry = useCallback(
    (entry: HistoryEntry) => {
      restore(entry)
      removeImage()
      setDraft(draftFromInput(entry.input))
      window.scrollTo({ top: 0 })
    },
    [removeImage, restore],
  )

  const openDrawer = useCallback(() => {
    setDrawerSeen(true)
    setDrawerOpen(true)
  }, [])

  const wipeHistory = useCallback(() => {
    const previous = loadHistory()
    // The record of when this browser verified goes with the reports, and comes back with them.
    const times = clearActivity()
    clearHistory()
    notify((toast) =>
      toast(t.history.cleared, {
        action: {
          label: t.undo,
          onClick: () => {
            restoreActivity(times)
            for (const entry of [...previous].reverse()) saveHistoryEntry(entry)
          },
        },
      }),
    )
  }, [t])

  // The rail can be put away (from 1280px, where it stands beside the workspace); the choice is
  // remembered in this browser. Focus follows the control that was used to its counterpart.
  const [railOpen, setRailOpen] = useState(() => readStored<string>(RAIL_KEY, 'open') !== 'closed')
  const railClose = useRef<HTMLButtonElement | null>(null)
  const railReopen = useRef<HTMLButtonElement | null>(null)
  const setRail = useCallback((open: boolean) => {
    setRailOpen(open)
    writeStored(RAIL_KEY, open ? 'open' : 'closed')
    window.requestAnimationFrame(() => (open ? railClose : railReopen).current?.focus())
  }, [])
  // Counted from this browser's own record, each time the history changes.
  const weekCount = useMemo(() => (history ? verificationsThisWeek() : 0), [history])
  // The offer to install waits for the second report (mock mode's `install` flag asks for it at once).
  const installDue = useMemo(
    () => (history ? verificationsRemembered() >= 2 : false) || (MOCK_MODE && new URLSearchParams(window.location.search).has('install')),
    [history],
  )

  // The export code is fetched when a report exists and the page is quiet, so that the click
  // itself can open the print window without waiting (a late window.open is blocked by browsers).
  const exportModule = useRef<Awaited<ReturnType<typeof loadExport>> | null>(null)
  const hasReport = !!report
  useEffect(() => {
    if (!hasReport) return
    const timer = window.setTimeout(() => {
      void loadExport().then((module) => {
        exportModule.current = module
      })
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [hasReport])

  const exportJson = useCallback(() => {
    if (!report) return
    void loadExport().then(({ downloadJson }) => {
      downloadJson(report)
      notify((toast) => toast.success(t.exportMenu.doneJson))
    })
  }, [report, t])

  const exportPrintable = useCallback(() => {
    if (!report) return
    const run = ({ exportHtml }: Awaited<ReturnType<typeof loadExport>>) =>
      exportHtml(report, { t, lang, meta })
        .then((outcome) => {
          if (outcome.via === 'client') notify((toast) => toast(t.exportMenu.fallback))
          else notify((toast) => toast.success(outcome.opened ? t.exportMenu.doneHtml : t.exportMenu.downloadedHtml))
        })
        .catch(() => notify((toast) => toast.error(t.errors.internal.message)))
    if (exportModule.current) void run(exportModule.current)
    else void loadExport().then(run)
  }, [report, t, lang, meta])

  // F4: the whole report as Markdown, on the clipboard.
  const copyReport = useCallback(() => {
    if (!report) return
    void import('@/lib/markdown')
      .then(({ buildMarkdownReport }) => copyText(buildMarkdownReport(report, { t, lang, meta })))
      .then((copied) => {
        if (copied) notify((toast) => toast(t.copy.reportDone))
        else notify((toast) => toast.error(t.copy.failed))
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
                      // A picture that could not be read is read again; anything else is re-sent.
                      return (
                        <Button
                          key={remedy}
                          type="button"
                          size="touch"
                          onClick={() => (image?.status === 'failed' ? readImageFile(image.file) : submit())}
                        >
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
                          removeImage()
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
    example.input_type === 'text'
      ? !!example.text
      : example.input_type === 'image'
        ? features.image && !!example.url
        : !!safeHref(example.url),
  )

  const rail = {
    history,
    currentId: done ? state.generatedAt : null,
    onHome: goHome,
    onNew: verifyAnother,
    onOpenEntry: openHistoryEntry,
    onClearHistory: wipeHistory,
    weekCount,
  }

  return (
    <DirectionProvider dir={dir}>
      <>
        <a
          href="#main"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:start-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-control focus-visible:border focus-visible:bg-paper focus-visible:px-4 focus-visible:py-2 focus-visible:shadow-overlay"
        >
          {t.skipToContent}
        </a>

        {/* A full-viewport application: the rail beside the workspace (a drawer below 1280px). */}
        <div className="flex min-h-dvh">
          <Rail {...rail} open={railOpen} onClose={() => setRail(false)} closeRef={railClose} />

          <div className="relative flex min-w-0 flex-1 flex-col">
            {/* The way back to a rail that was put away: one small button at the top corner. */}
            {railOpen ? null : (
              <Button
                ref={railReopen}
                type="button"
                variant="ghost"
                size="icon"
                data-testid="rail-open"
                aria-label={t.shell.openRail}
                title={t.shell.openRail}
                aria-expanded="false"
                onClick={() => setRail(true)}
                className="fixed start-3 top-3 z-30 hidden bg-paper shadow-panel xl:inline-flex print:hidden"
              >
                <PanelLeftOpen aria-hidden="true" className="rtl:-scale-x-100" />
              </Button>
            )}
            <header className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b bg-paper px-3 xl:hidden print:hidden">
              <Button type="button" variant="ghost" size="icon" data-testid="menu" aria-label={t.shell.menu} aria-haspopup="dialog" onClick={openDrawer}>
                <Menu aria-hidden="true" />
              </Button>
              <BrandLink onHome={goHome} />
              <span className="flex-1" />
              {hasResults ? (
                <Button type="button" variant="ghost" size="icon" aria-label={t.shell.newVerification} onClick={verifyAnother}>
                  <Plus aria-hidden="true" />
                </Button>
              ) : null}
            </header>

            <main id="main" className="relative flex-1 px-4 py-5 md:px-8 md:py-8">
              {hasResults ? (
                // At least a screen tall: what stands under the workspace is below the fold from the
                // first event, so the text and the cards arriving never push it across the screen.
                <div className="mx-auto min-h-dvh w-full max-w-[86rem]">
                  <h1 className="sr-only">{t.report.title}</h1>
                  <ReportView
                    key={state.run}
                    state={state}
                    running={running}
                    onCancel={autorunPending ? undefined : cancel}
                    meta={meta}
                    error={errorNode}
                    exportActions={
                      hasReport
                        ? {
                            onExportJson: exportJson,
                            onExportHtml: exportPrintable,
                            onCopyReport: features.copy ? copyReport : undefined,
                          }
                        : undefined
                    }
                    onVerifyAnother={verifyAnother}
                  />
                </div>
              ) : (
                // The first screen, in three zones from 1280px: the rail, a calm centre (the headline
                // and the composer, with room around them), and on the far side the engines as a
                // column of cards. Narrower, the cards go under the composer two by two; on a
                // phone they are a row between the headline and the composer, which sits low,
                // under the thumb.
                <div className="mx-auto flex w-full max-w-[44rem] flex-col gap-5 max-md:min-h-[calc(100dvh-5.5rem)] md:gap-8 md:pt-[6vh] xl:grid xl:max-w-[78rem] xl:grid-cols-[minmax(0,1fr)_17rem] xl:grid-rows-[auto_1fr] xl:gap-x-14 xl:gap-y-9 xl:pt-0">
                  <Headline className="xl:col-start-1 xl:mx-auto xl:w-full xl:max-w-[44rem] xl:pt-[13vh]" />
                  <div className="max-md:order-3 max-md:mt-auto xl:col-start-1 xl:mx-auto xl:w-full xl:max-w-[44rem]">
                    <Composer
                      draft={draft}
                      onChange={patchDraft}
                      onSubmit={() => submit()}
                      limits={limits}
                      imageInput={features.image}
                      notice={shareUnavailable ? t.pwa.shareUnavailable : null}
                      image={image}
                      onImage={readImageFile}
                      onPasteText={pasteAndVerify}
                      onImageRemove={() => {
                        // The error about a picture leaves with the picture.
                        if (image?.status === 'failed') clearError()
                        removeImage()
                      }}
                      examples={examples}
                      onExample={applyExample}
                      hasError={!!error}
                      errorId={errorId}
                      error={errorNode}
                      fieldRef={fieldRef}
                      pickerRef={pickerRef}
                    />
                  </div>
                  <EngineCards
                    engines={meta?.engines}
                    className="max-md:order-2 xl:sticky xl:top-0 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:self-start xl:pt-[13vh]"
                  />
                </div>
              )}
            </main>

            {/* The transparency line stands under the workspace in every state. */}
            <footer className="space-y-3 px-4 pb-5 text-sm text-quiet md:px-8">
              <p className="mx-auto w-full max-w-[86rem]">{t.transparency}</p>
              {/* Offered only after a verification has succeeded, never on load. */}
              {hasReport && installDue ? (
                <div className="mx-auto w-full max-w-[86rem]">
                  <InstallLine />
                </div>
              ) : null}
            </footer>
          </div>
        </div>

        <Suspense fallback={null}>
          {drawerSeen ? <RailDrawer open={drawerOpen} onOpenChange={setDrawerOpen} {...rail} /> : null}
          {toaster ? (
            <Toaster dir={dir} position={wide ? 'bottom-center' : 'top-center'} offset={24} mobileOffset={{ top: 64 }} />
          ) : null}
        </Suspense>
      </>
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
