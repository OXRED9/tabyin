import { ChevronDown, History, RotateCcw, Share2 } from 'lucide-react'
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { EvidenceCard } from '@/components/report/evidence-card'
import LazyNoteBody from '@/components/report/lazy-note-body'
import { PageText } from '@/components/report/page-text'
import { SourceLink } from '@/components/report/source-link'
import { VerdictHeader } from '@/components/report/verdict-header'
import type { ExportActions } from '@/components/report/verdict-header'
import type { ShareTarget } from '@/components/share/share-card-dialog'
import { StateGlyph } from '@/components/state-glyph'
import { Button } from '@/components/ui/button'
import { prefersReducedMotion } from '@/hooks/use-media-query'
import { usePlayhead } from '@/hooks/use-playhead'
import type { VerifyState } from '@/hooks/use-verify'
import { featuresOf } from '@/lib/features'
import type { ErrorTarget } from '@/lib/feedback'
import { formatSeconds, safeHref } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { STEPS, pipelineOf, stepsReached } from '@/lib/pipeline'
import { sourcesUsed, tallyOf } from '@/lib/report'
import { byAttention, chronological } from '@/lib/states'
import type { ClauseKind } from '@/lib/summary'
import type { Card, Meta, StageId, ReferralMatch } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ReportViewProps {
  state: VerifyState
  /** The request is still running: the investigation stands where the verdict will. */
  running: boolean
  onCancel: (() => void) | undefined
  meta: Meta | null
  /** A failure that arrived after some notes did: shown above what was received. */
  error: ReactNode
  /** Absent until there is a report to export. */
  exportActions: ExportActions | undefined
  onVerifyAnother: () => void
}

/** The underlines ink in along the text when a live run completes; the page stays "inking" this long. */
const INKING_MS = 700
/** How long after a report completes its on-demand parts are warmed up. */
const WARM_UP_MS = 2500

const STAGES: StageId[] = ['ingest', 'extract', 'match', 'rules', 'report']

// The investigation is its own piece of code, fetched the moment a run starts; what lies over the
// page is fetched when first used.
const loadInvestigation = () => import('@/components/investigation/investigation')
const Investigation = lazy(loadInvestigation)
const ReferralDialog = lazy(() => import('@/components/report/referral-dialog'))
const ReportErrorDialog = lazy(() => import('@/components/report/report-error-dialog'))
const ShareCardDialog = lazy(() => import('@/components/share/share-card-dialog'))

type NoteOrder = 'order' | 'state'

/** «حسب الترتيب / الأهم أولاً»: the evidence in the text's order, or what most needs attention first. */
function OrderToggle({ value, onChange }: { value: NoteOrder; onChange: (order: NoteOrder) => void }) {
  const { t } = useI18n()
  const options: { value: NoteOrder; label: string }[] = [
    { value: 'order', label: t.report.sortByOrder },
    { value: 'state', label: t.report.sortByState },
  ]
  return (
    <div role="group" aria-label={t.report.sortLabel} className="flex items-center">
      {options.map((option, i) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'min-h-10 px-2 text-sm transition-colors duration-150',
            i > 0 && 'border-s',
            value === option.value ? 'font-semibold text-ink' : 'text-quiet hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** A calm remark above the evidence: reduced coverage, or a source that is unreachable. */
function Notice({ title, icon, children }: { title?: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <p role="note" className="flex items-start gap-2 text-sm text-quiet">
      {icon ?? <StateGlyph state="needs_review" className="mt-0.5 size-[18px]" />}
      <span>
        {title ? <span className="font-semibold text-ink">{title}: </span> : null}
        {children}
      </span>
    </p>
  )
}

/** Seconds left, counted down locally between `stage` events so the number keeps moving. */
function useEta(eta: VerifyState['eta']): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!eta) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [eta])
  if (!eta) return null
  return Math.max(0, Math.round(eta.seconds - (now - eta.at) / 1000))
}

/**
 * Above the map while it runs: the stage in a sentence, how far the matching is, and a way out.
 * It holds the same height from the first event to the last — two lines on a phone, the button's
 * height above that — so the map under it never moves.
 */
function RunHead({ state, onCancel }: { state: VerifyState; onCancel: (() => void) | undefined }) {
  const { t } = useI18n()
  const remaining = useEta(state.eta)
  const currentId = STAGES[Math.max(1, state.highestStage) - 1]
  const current = state.stages[currentId]
  const finished = state.phase === 'done'
  return (
    <div className="flex min-h-[3.4rem] items-start gap-4 sm:min-h-10">
      <p className="min-w-0 flex-1 text-base sm:pt-1.5" aria-live="polite">
        <span aria-hidden="true" className={cn('me-2 inline-block size-2.5 rounded-tag align-middle', finished ? 'bg-green' : 'animate-live bg-gold')} />
        <span className="font-semibold text-ink">{finished ? t.pipeline.finished : t.progress.sentence(t.stages[currentId])}</span>
        {finished ? null : current?.total ? (
          <span className="tabular ms-2 whitespace-nowrap text-quiet">{t.progress.matched(current.done ?? 0, current.total)}</span>
        ) : null}
        {remaining === null || state.phase !== 'running' ? null : (
          <span className="tabular ms-2 whitespace-nowrap text-quiet">
            {remaining > 1 ? t.progress.eta(remaining) : t.progress.etaSoon}
          </span>
        )}
      </p>
      {onCancel && state.phase === 'running' ? (
        <Button type="button" variant="outline" onClick={onCancel} className="shrink-0">
          {t.input.cancel}
        </Button>
      ) : null}
    </div>
  )
}

/**
 * A verification, from its first event to its report (docs/DESIGN.md §10). While it runs, the
 * investigation is the hero: a live map of what the server is really doing. When it is done the
 * map gives way to the verdict. Under both, from the first card on: the text with its passages
 * marked, and beside it (below it on a phone) the evidence, one card per citation.
 */
export function ReportView({ state, running, onCancel, meta, error, exportActions, onVerifyAnother }: ReportViewProps) {
  const { t, pick } = useI18n()
  const notesRef = useRef<HTMLElement | null>(null)
  const flashTimer = useRef<number | null>(null)

  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set())
  const [activeId, setActiveId] = useState<string | null>(null)
  const [filter, setFilter] = useState<ClauseKind | null>(null)
  const [order, setOrder] = useState<NoteOrder>('order')
  const [referralOpen, setReferralOpen] = useState(false)
  // The dialog stays mounted once it has been opened, so it can close with its transition; it
  // keeps the topic words of the note it was opened from, which its links search for.
  const [referralFor, setReferralFor] = useState<{ query: string | null; matches: ReferralMatch[] } | null>(null)
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null)
  const [errorTarget, setErrorTarget] = useState<ErrorTarget | null>(null)
  const [replayOpen, setReplayOpen] = useState(false)
  // False only between the end of a live run and the end of its inking.
  const [inked, setInked] = useState(!running)

  const done = state.phase === 'done'
  const { claims, cards, source, segments, summary } = state
  const features = useMemo(() => featuresOf(meta), [meta])

  // The investigation: how far the server has really got, and how much of that the screen has shown.
  const reached = stepsReached(state)
  const { shown, replaying, replay } = usePlayhead(reached)
  const { nodes, log } = useMemo(() => pipelineOf(state, meta, shown, t), [state, meta, shown, t])
  // What really worked on this report, for the verdict: the nodes as they ended, whatever a replay
  // is showing at the moment.
  const finalNodes = useMemo(() => (done ? pipelineOf(state, meta, STEPS, t).nodes : []), [done, state, meta, t])
  // A live run's map stays until its last step has been seen; then it gives way to the verdict.
  const showTail = done && shown < STEPS && !replaying
  const mapVisible = running || showTail
  const verdictVisible = done && !showTail
  useEffect(() => {
    if (running) void loadInvestigation()
  }, [running])

  // When the map gives way to the verdict, what stands under it does not jump to its new place:
  // it starts where it was and glides there (a transform, so the layout changes once and nothing
  // is seen to leap). With reduced motion the change is instant.
  const belowRef = useRef<HTMLDivElement | null>(null)
  const below = useRef<{ head: string; top: number } | null>(null)
  const head = running || showTail ? 'map' : verdictVisible ? 'verdict' : 'none'
  useLayoutEffect(() => {
    const element = belowRef.current
    if (!element) return
    const top = element.getBoundingClientRect().top + window.scrollY
    const before = below.current
    below.current = { head, top }
    if (!before || before.head === head || before.head !== 'map') return
    const moved = before.top - top
    if (Math.abs(moved) < 2) return
    // Less motion: nothing glides, but the change is still seen to happen — what stands under
    // the verdict fades into its new place.
    if (prefersReducedMotion()) {
      element.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' })
      return
    }
    element.animate([{ transform: `translateY(${moved}px)` }, { transform: 'translateY(0)' }], {
      duration: 320,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    })
  })

  // This view saw the run happen (it was not reopened from history): its verdict is sealed once.
  const [live] = useState(running)

  // Reading order; claims with no place in the text go last.
  const ordered = useMemo(
    () => [...claims].sort((a, b) => Number(!a.span) - Number(!b.span) || chronological(a, b)),
    [claims],
  )
  const readyCards = useMemo(() => ordered.map((c) => cards[c.id]).filter((c): c is Card => !!c), [ordered, cards])
  const states = useMemo(() => new Map(readyCards.map((card) => [card.id, card.state])), [readyCards])
  // A question put to the tool is not a citation: it is counted, and filtered, apart from the states.
  const questions = useMemo(
    () => new Set(readyCards.filter((card) => card.is_question).map((card) => card.id)),
    [readyCards],
  )
  const kinds = useMemo(
    () => new Map<string, ClauseKind>(readyCards.map((card) => [card.id, card.is_question ? 'question' : card.state])),
    [readyCards],
  )
  const tally = useMemo(() => tallyOf(readyCards), [readyCards])
  const used = useMemo(() => sourcesUsed(readyCards), [readyCards])

  // A filter that matches nothing lets go.
  const activeFilter = filter && (filter === 'question' ? tally.questions : tally.counts[filter]) > 0 ? filter : null
  const visible = useMemo(
    () => (activeFilter ? ordered.filter((c) => kinds.get(c.id) === activeFilter) : ordered),
    [activeFilter, ordered, kinds],
  )
  const hidden = useMemo(
    () => new Set(activeFilter ? ordered.filter((c) => kinds.get(c.id) !== activeFilter).map((c) => c.id) : []),
    [activeFilter, ordered, kinds],
  )
  // The evidence can put what most needs attention first.
  const listed = useMemo(
    () =>
      order === 'state' && done
        ? [...visible].sort((a, b) => {
            const cardA = cards[a.id]
            const cardB = cards[b.id]
            return cardA && cardB ? byAttention(cardA, cardB) : 0
          })
        : visible,
    [cards, done, order, visible],
  )

  const hasText = segments.some((s) => s.text.trim().length > 0)
  const noClaims = done && ordered.length === 0

  // Nobody should have to tap to read the answer: when the report completes, the card of a
  // report's one citation opens by itself, and so does every question's (its answer is where to
  // look). Once; they can be closed.
  const [openedAlone, setOpenedAlone] = useState(false)
  if (done && !openedAlone) {
    setOpenedAlone(true)
    const alone = ordered.length === 1 ? [ordered[0].id] : [...questions]
    if (alone.length > 0) setOpenIds(new Set(alone))
  }

  const settled = !running
  const inking = settled && !inked
  useEffect(() => {
    if (!inking) return
    const timer = window.setTimeout(() => setInked(true), prefersReducedMotion() ? 0 : INKING_MS)
    return () => window.clearTimeout(timer)
  }, [inking])

  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
    },
    [],
  )

  const toggleNote = useCallback((cardId: string) => {
    setOpenIds((current) => {
      const next = new Set(current)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }, [])

  /** A passage in the text was chosen: open its card and go to it. */
  const selectPassage = useCallback(
    (claimId: string) => {
      if (!cards[claimId]) return
      if (hidden.has(claimId)) setFilter(null)
      setOpenIds((current) => new Set(current).add(claimId))
      window.requestAnimationFrame(() => {
        const note = document.getElementById(`note-${claimId}`)
        // Beside the text the card is brought into view; under the text (below 1024px) the page
        // scrolls to it, its head just under the bar.
        const beside = window.matchMedia('(min-width: 1024px)').matches
        note?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: beside ? 'nearest' : 'start' })
        note?.querySelector('button')?.focus({ preventScroll: true })
      })
    },
    [cards, hidden],
  )

  /** A card → its words in the text, tinted for a moment so the eye finds them. */
  const locate = useCallback((claimId: string) => {
    document
      .getElementById(`span-${claimId}`)
      ?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' })
    setActiveId(claimId)
    if (flashTimer.current) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setActiveId(null), 1700)
  }, [])

  const openReferral = useCallback(
    (cardId: string) => {
      setReferralFor({ query: cards[cardId]?.referral_query ?? null, matches: cards[cardId]?.referral_matches ?? [] })
      setReferralOpen(true)
    },
    [cards],
  )

  // The body of a card is fetched when one is first opened; a report that will open one by itself
  // (its only citation, or a question) fetches it just before it completes, and any finished
  // report once the page is quiet, with the Mushaf's face.
  const willOpen = running && state.stages.match?.status === 'done' && (claims.length === 1 || questions.size > 0)
  useEffect(() => {
    if (willOpen) void LazyNoteBody.preload()
  }, [willOpen])
  useEffect(() => {
    if (!done) return
    const timer = window.setTimeout(() => {
      void LazyNoteBody.preload()
      void document.fonts?.load('26px "Amiri Quran"', 'ب').catch(() => undefined)
    }, WARM_UP_MS)
    return () => window.clearTimeout(timer)
  }, [done])

  // F3: which verdict card the share dialog is showing, if any.
  const shareClaim = useCallback(
    (cardId: string) => {
      const card = cards[cardId]
      if (card) setShareTarget({ kind: 'claim', card })
    },
    [cards],
  )

  // «أبلغ عن خطأ»: on one verdict, or (from the colophon) on a citation the tool missed.
  const reportError = useCallback(
    (cardId: string) => {
      const card = cards[cardId]
      if (card) setErrorTarget({ kind: 'claim', card })
    },
    [cards],
  )

  // «أعد عرض التحرّي»: the map again under the verdict, walking the same steps with the figures
  // and times the server reported. With reduced motion it opens complete, as a checklist.
  const replayRef = useRef<HTMLDivElement | null>(null)
  const toggleReplay = useCallback(() => {
    if (!replayOpen) {
      replay()
      window.requestAnimationFrame(() =>
        replayRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' }),
      )
    }
    setReplayOpen(!replayOpen)
  }, [replay, replayOpen])

  const lexicalNotice = state.notices.find((n) => n.code === 'llm_unavailable')
  const noClaimsNotice = state.notices.find((n) => n.code === 'no_claims')
  const lexical = summary?.mode === 'lexical_only' || !!lexicalNotice
  const dorarDown = summary?.warnings.includes('dorar_unreachable') ?? false
  // The backup model answered some of this request (primary model down, or the daily spend limit).
  const backupModel = !lexical && (summary?.warnings.includes('llm_fallback') ?? false)

  const notices =
    lexical || backupModel || dorarDown || state.restored ? (
      <div className="space-y-2">
        {lexical ? (
          <Notice title={t.report.lexicalTitle}>
            {lexicalNotice
              ? `${pick(lexicalNotice.message_ar, lexicalNotice.message_en)} ${pick(lexicalNotice.hint_ar, lexicalNotice.hint_en)}`.trim()
              : t.report.lexicalBody}
          </Notice>
        ) : null}
        {backupModel ? <Notice title={t.report.lexicalTitle}>{t.report.backupModelBody}</Notice> : null}
        {dorarDown ? <Notice>{t.report.dorarUnavailable}</Notice> : null}
        {state.restored ? (
          <Notice icon={<History aria-hidden="true" className="mt-0.5 size-[18px] shrink-0" />}>{t.report.restored}</Notice>
        ) : null}
      </div>
    ) : null

  // The tool may have missed a citation: the reader can say so, in a message of their own.
  const missedLink = (
    <Button
      type="button"
      variant="link"
      data-testid="report-missed"
      aria-haspopup="dialog"
      className="text-sm text-quiet decoration-rule-strong"
      onClick={() => setErrorTarget({ kind: 'missed' })}
    >
      {t.feedback.missedAction}
    </Button>
  )

  const bodyProps = {
    source,
    meta,
    features,
    stageSeconds: summary?.stage_seconds,
    onReferral: openReferral,
    onShare: shareClaim,
    onReportError: reportError,
    onLocate: locate,
  }

  // A pasted text is known before the server sends it back: it is set on the page at once, so
  // nothing moves when its segments arrive.
  const pastedText = state.input?.input_type === 'text' ? (state.input.text ?? '') : ''
  const elapsed =
    summary && summary.elapsed_seconds >= 0.05 && !state.restored ? formatSeconds(summary.elapsed_seconds) : null
  // What really worked on this report: the nodes that ran, with their final figures.
  const enginesUsed = finalNodes.filter(
    (node) => node.id !== 'input' && node.id !== 'report' && node.id !== 'rules' && (node.status === 'done' || node.status === 'warning'),
  )

  const investigation = (head: ReactNode) => (
    <Suspense
      fallback={
        <section className="panel p-4 md:p-5" aria-busy="true">
          {head}
        </section>
      }
    >
      <Investigation
        nodes={nodes}
        log={log}
        head={head}
        citations={ordered.map((claim) => {
          const decided = states.get(claim.id) ?? null
          return {
            id: claim.id,
            kind: t.claimTypes[claim.claim_type],
            state: questions.has(claim.id) ? null : decided,
            word: decided ? (questions.has(claim.id) ? t.question.word : t.stateWords[decided]) : null,
          }
        })}
      />
    </Suspense>
  )

  return (
    <section aria-label={t.report.title} className="space-y-4">
      {/* The head: the investigation while it runs, then the verdict. */}
      {running || showTail ? (
        investigation(<RunHead state={state} onCancel={onCancel} />)
      ) : noClaims ? (
        <header className="panel flex flex-col items-start gap-3 p-5">
          <div>
            <p className="text-lg font-semibold text-ink">
              {noClaimsNotice ? pick(noClaimsNotice.message_ar, noClaimsNotice.message_en) : t.report.noClaimsTitle}
            </p>
            <p className="text-base text-quiet">
              {(noClaimsNotice && pick(noClaimsNotice.hint_ar, noClaimsNotice.hint_en)) || t.report.noClaimsHint}
            </p>
          </div>
          <Button type="button" size="touch" onClick={onVerifyAnother}>
            <RotateCcw aria-hidden="true" />
            {t.shell.newVerification}
          </Button>
          {missedLink}
        </header>
      ) : verdictVisible ? (
        <VerdictHeader
          tally={tally}
          filter={activeFilter}
          onFilter={setFilter}
          elapsed={elapsed}
          engines={enginesUsed}
          sealing={live}
          jump={
            // Where the cards stand under the text (below 1024px), one tap takes the reader to them.
            ordered.length > 1 ? (
              <a
                href="#notes-title"
                data-testid="jump-notes"
                onClick={(event) => {
                  event.preventDefault()
                  notesRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
                  document.getElementById('notes-title')?.focus({ preventScroll: true })
                }}
                className="inline-flex min-h-8 items-center gap-1 text-sm text-green underline decoration-green/40 underline-offset-4 lg:hidden"
              >
                {t.notes.jump(ordered.length)}
                <ChevronDown aria-hidden="true" className="size-4" />
              </a>
            ) : null
          }
          onReplay={state.traces.length > 0 ? toggleReplay : undefined}
          replayOpen={replayOpen}
          exportActions={exportActions}
          onVerifyAnother={onVerifyAnother}
        />
      ) : null}

      {/* The investigation again, on request: the same steps, with the figures and times it reported. */}
      {verdictVisible && replayOpen ? (
        <div ref={replayRef} className="scroll-mt-16 print:hidden">
          {investigation(<p className="text-base font-semibold text-ink">{t.pipeline.title}</p>)}
        </div>
      ) : null}

      <div ref={belowRef} className="space-y-4">
      {error ? <div>{error}</div> : null}

      {mapVisible || verdictVisible || hasText || ordered.length > 0 ? (
        <div
          data-inking={inking ? '' : undefined}
          className={cn('grid gap-4', !noClaims && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] xl:grid-cols-[minmax(0,1fr)_30rem]')}
        >
          {/* The text, with each citation marked in its state's ink. */}
          <section
            aria-label={t.panes.text}
            data-scanning={running ? '' : undefined}
            className="panel min-w-0 self-start p-4 md:p-6 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto"
          >
            {hasText ? (
              <PageText
                source={source}
                segments={segments}
                claims={ordered}
                states={states}
                questions={questions}
                settled={settled}
                hidden={hidden}
                activeId={activeId}
                openIds={openIds}
                onSelect={selectPassage}
                onHover={setActiveId}
              />
            ) : pastedText ? (
              <div data-page className="page-text whitespace-pre-line text-ink">
                <p dir="auto" className="min-w-0 break-words">
                  {pastedText}
                </p>
              </div>
            ) : (
              // A clip or an article is not read yet: the stage says so, and the pane keeps its place.
              <p className="min-h-40 text-sm text-quiet">{t.stages.ingest}…</p>
            )}
          </section>

          {/* The evidence: one card per citation, each with its trail. It takes its place when
              the first claims are announced — after the text, so nothing it would push exists yet. */}
          {noClaims || (ordered.length === 0 && !done) ? null : (
            <section
              ref={notesRef}
              aria-labelledby="notes-title"
              className="min-w-0 scroll-mt-16 space-y-3 xl:scroll-mt-4"
            >
              <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-4">
                <h2 id="notes-title" tabIndex={-1} className="text-base font-semibold text-ink">
                  {t.panes.notes}
                  {ordered.length > 0 ? <span className="tabular ms-2 font-normal text-quiet">{ordered.length}</span> : null}
                </h2>
                {done && ordered.length > 1 ? <OrderToggle value={order} onChange={setOrder} /> : null}
              </div>
              {notices}
              {ordered.length === 0 ? null : (
                <ul className="space-y-3">
                  {listed.map((claim, i) => (
                    <EvidenceCard
                      key={claim.id}
                      {...bodyProps}
                      index={i}
                      claim={claim}
                      card={cards[claim.id]}
                      open={openIds.has(claim.id)}
                      active={activeId === claim.id}
                      onToggle={toggleNote}
                      onHover={setActiveId}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      ) : null}

      {done && !noClaims && summary ? (
        <footer className="space-y-4 text-sm">
          {used.length > 0 ? (
            // Set apart from the notes above: a section of its own, with its own heading, so the
            // sources consulted are never read as one more note.
            <section aria-labelledby="sources-title" className="mt-6 space-y-3 rounded-sheet border-t-2 border-green/30 bg-raised p-4 md:p-5">
              <h2 id="sources-title" className="text-base font-semibold text-ink">{t.report.sources}</h2>
              <div className="flex flex-wrap items-center gap-2">
              {/* Each source by its name, as a link to it. */}
              {used.map((s) => (
                <span key={s.name} className="inline-flex min-h-7 max-w-full items-center rounded-control border px-2.5 py-0.5">
                  {safeHref(s.url) ? <SourceLink href={new URL(s.url).origin}>{s.name}</SourceLink> : s.name}
                </span>
              ))}
              </div>
            </section>
          ) : null}
          <div className="panel flex flex-wrap items-center gap-x-4 gap-y-2 p-4 md:p-5">
            {/* The summary card and the shared text are for citations: a report that holds only
                questions has nothing to share. */}
            {features.share_card && tally.citations > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="touch"
                data-testid="share-summary"
                onClick={() => setShareTarget({ kind: 'summary', summary, cards: readyCards, title: source?.title ?? null })}
              >
                <Share2 aria-hidden="true" />
                {t.report.shareSummary}
              </Button>
            ) : null}
            {missedLink}
          </div>
        </footer>
      ) : null}
      </div>

      <Suspense fallback={null}>
        {referralFor ? (
          <ReferralDialog open={referralOpen} onOpenChange={setReferralOpen} meta={meta} query={referralFor.query} matches={referralFor.matches} />
        ) : null}
        {shareTarget ? <ShareCardDialog target={shareTarget} meta={meta} onClose={() => setShareTarget(null)} /> : null}
        {errorTarget ? (
          <ReportErrorDialog
            key={errorTarget.kind === 'claim' ? errorTarget.card.id : 'missed'}
            target={errorTarget}
            meta={meta}
            source={source}
            onClose={() => setErrorTarget(null)}
          />
        ) : null}
      </Suspense>
    </section>
  )
}
