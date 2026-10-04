import { ChevronDown, History, RotateCcw, Share2 } from 'lucide-react'
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { ProgressPanel } from '@/components/progress-panel'
import { LegendLink } from '@/components/legend-link'
import LazyNoteBody from '@/components/report/lazy-note-body'
import { MarginNote, PendingNote } from '@/components/report/note'
import { NoteRow, OrderToggle } from '@/components/report/notes-list'
import type { NoteOrder } from '@/components/report/notes-list'
import { PageText } from '@/components/report/page-text'
import { SourceLink } from '@/components/report/source-link'
import { SummarySentence } from '@/components/report/summary-sentence'
import { useMarginLayout } from '@/components/report/use-margin-layout'
import type { ShareTarget } from '@/components/share/share-card-dialog'
import { StateGlyph } from '@/components/state-glyph'
import { Button } from '@/components/ui/button'
import { prefersReducedMotion, useMediaQuery } from '@/hooks/use-media-query'
import type { VerifyState } from '@/hooks/use-verify'
import { featuresOf } from '@/lib/features'
import type { ClauseKind } from '@/lib/summary'
import type { ErrorTarget } from '@/lib/feedback'
import { formatSeconds, safeHref } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { lazyWithPreload } from '@/lib/lazy'
import { sourcesUsed, tallyOf } from '@/lib/report'
import { STATES_BY_RISK, STATE_STYLE, chronological } from '@/lib/states'
import type { Card, ClaimStub, Meta } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ReportViewProps {
  state: VerifyState
  /** The request is still running: the progress line stands where the summary will. */
  running: boolean
  onCancel: (() => void) | undefined
  meta: Meta | null
  /** A failure that arrived after some notes did: shown above what was received. */
  error: ReactNode
  onVerifyAnother: () => void
}

/** The orchestrated moment lasts 600ms; the page stays in its "inking" state a little longer. */
const INKING_MS = 700
/** Notes below an opening note glide for 180ms. */
const GLIDE_MS = 220

const NONE: ReadonlySet<string> = new Set()

// Nothing that lies over the page is needed to draw it: each of these is fetched when first used.
const InlineNote = lazyWithPreload(() => import('@/components/report/inline-note'))
const NoteSheet = lazy(() => import('@/components/report/note-sheet'))
const ReferralDialog = lazy(() => import('@/components/report/referral-dialog'))
const ReportErrorDialog = lazy(() => import('@/components/report/report-error-dialog'))
const ShareCardDialog = lazy(() => import('@/components/share/share-card-dialog'))
/** How long after a report completes its on-demand parts are warmed up. */
const WARM_UP_MS = 2500

/** A calm remark at the top of the margin: reduced coverage, or a source that is unreachable. */
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

/**
 * The page and its margin. The user's text is the interface: it is set as a page, each claim is
 * underlined in its state's ink, and its verdict is a note in the margin, level with the line it
 * is about and tied to it by a hairline. On a phone there is no margin: the notes follow the text
 * as a list, each beginning with its words, and open as a sheet from the bottom.
 */
export function ReportView({
  state,
  running,
  onCancel,
  meta,
  error,
  onVerifyAnother,
}: ReportViewProps) {
  const { t, pick } = useI18n()
  const hasMargin = useMediaQuery('(min-width: 768px)')
  // A note opens in place only where the margin is wide enough to read in. Below that the margin
  // keeps its notes collapsed and level, and a note opens as a sheet, as on a phone.
  const inPlace = useMediaQuery('(min-width: 1024px)')
  const gridRef = useRef<HTMLDivElement | null>(null)
  const notesRef = useRef<HTMLElement | null>(null)
  const glideTimer = useRef<number | null>(null)
  const flashTimer = useRef<number | null>(null)

  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set())
  const [activeId, setActiveId] = useState<string | null>(null)
  const [filter, setFilter] = useState<ClauseKind | null>(null)
  const [order, setOrder] = useState<NoteOrder>('order')
  const [sheetId, setSheetId] = useState<string | null>(null)
  const [referralOpen, setReferralOpen] = useState(false)
  // The dialog stays mounted once it has been opened, so it can close with its transition; it
  // keeps the topic words of the note it was opened from, which its links search for.
  const [referralFor, setReferralFor] = useState<{ query: string | null } | null>(null)
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null)
  const [errorTarget, setErrorTarget] = useState<ErrorTarget | null>(null)
  const [glide, setGlide] = useState(false)
  const [notesBelow, setNotesBelow] = useState(false)
  // False only between the end of a live run and the end of its orchestrated moment.
  const [inked, setInked] = useState(!running)

  const done = state.phase === 'done'
  const { claims, cards, source, segments, summary } = state
  const features = useMemo(() => featuresOf(meta), [meta])

  // Reading order; claims with no place in the text go at the end of the margin.
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

  const hasText = segments.some((s) => s.text.trim().length > 0)
  const noClaims = done && ordered.length === 0

  // Exactly one claim: nobody should have to tap to read the answer. At 1024 and up its margin
  // note opens by itself (once; it can be closed). Below that the note is set open, inline,
  // directly under the text, with no margin and no one-item list. Only once the report is
  // complete: while it streams, the page behaves as always.
  // A question's note opens by itself in the same way, wherever notes open in place: its answer
  // is where to look, and nobody should have to ask for that twice.
  const single = done && ordered.length === 1 ? cards[ordered[0].id] : undefined
  const singleInline = !!single && !inPlace
  const [openedAlone, setOpenedAlone] = useState(false)
  if (done && inPlace && !openedAlone) {
    setOpenedAlone(true)
    const alone = single ? [single.id] : [...questions]
    if (alone.length > 0) setOpenIds(new Set(alone))
  }
  const withMargin = hasMargin && !singleInline
  const settled = !running
  const inking = settled && !inked

  // The one orchestrated moment: when a live run completes, the underlines ink in along the text
  // and the notes settle. It is a CSS animation keyed on `data-inking`; this only ends it.
  useEffect(() => {
    if (!inking) return
    const timer = window.setTimeout(() => setInked(true), prefersReducedMotion() ? 0 : INKING_MS)
    return () => window.clearTimeout(timer)
  }, [inking])

  useEffect(
    () => () => {
      if (glideTimer.current) window.clearTimeout(glideTimer.current)
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
    },
    [],
  )

  const ids = useMemo(() => visible.map((c) => c.id), [visible])
  // Notes opened in place stay open only while the screen is wide enough for that.
  const openInPlace = inPlace ? openIds : NONE
  const signature = [
    withMargin,
    ids.join(','),
    [...openInPlace].join(','),
    readyCards.length,
    segments.length,
    state.notices.length,
    summary ? 1 : 0,
  ].join('|')
  const layout = useMarginLayout(gridRef, ids, signature)

  const toggleNote = useCallback(
    (cardId: string) => {
      if (!inPlace) {
        setSheetId(cardId)
        return
      }
      setOpenIds((current) => {
        const next = new Set(current)
        if (next.has(cardId)) next.delete(cardId)
        else next.add(cardId)
        return next
      })
      // The notes below make room: for this one change their move is a glide, not a jump.
      setGlide(true)
      if (glideTimer.current) window.clearTimeout(glideTimer.current)
      glideTimer.current = window.setTimeout(() => setGlide(false), GLIDE_MS)
    },
    [inPlace],
  )

  /** A passage in the text was chosen: open its note (in the margin, or as a sheet on a phone). */
  const selectPassage = useCallback(
    (claimId: string) => {
      if (!cards[claimId]) return
      if (singleInline) {
        // The note is already open under the text: go to it.
        document
          .getElementById(`note-${claimId}`)
          ?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
        return
      }
      if (!inPlace) {
        setSheetId(claimId)
        return
      }
      if (hidden.has(claimId)) setFilter(null)
      toggleNote(claimId)
      window.requestAnimationFrame(() => {
        const note = document.getElementById(`note-${claimId}`)
        note?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' })
        note?.querySelector('button')?.focus({ preventScroll: true })
      })
    },
    [cards, hidden, inPlace, singleInline, toggleNote],
  )

  /** A phone's note → its words in the text, tinted for a moment so the eye finds them. */
  const locate = useCallback((claimId: string) => {
    setSheetId(null)
    window.setTimeout(() => {
      document
        .getElementById(`span-${claimId}`)
        ?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' })
      setActiveId(claimId)
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
      flashTimer.current = window.setTimeout(() => setActiveId(null), 1700)
    }, 220)
  }, [])

  // Does the phone's list of notes start below the first screen? Asked again whenever the page's
  // height changes (the text arrives, a note is added) or the window does — and already while the
  // report streams, so that the link is in the head from the first frame of the finished report.
  const listCount = ordered.length
  useEffect(() => {
    if (hasMargin || listCount < 2) return
    const check = () => {
      const section = notesRef.current
      setNotesBelow(!!section && section.getBoundingClientRect().top + window.scrollY > window.innerHeight)
    }
    const observer = new ResizeObserver(check)
    observer.observe(document.body)
    window.addEventListener('resize', check)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', check)
    }
  }, [hasMargin, listCount])

  const openReferral = useCallback(
    (cardId: string) => {
      setReferralFor({ query: cards[cardId]?.referral_query ?? null })
      setReferralOpen(true)
    },
    [cards],
  )

  // Once the report is complete and the page is quiet, fetch what a first tap on a note will
  // need (its body, the sheet, the Mushaf face), so that opening a note is immediate.
  useEffect(() => {
    if (!done) return
    const timer = window.setTimeout(() => {
      void LazyNoteBody.preload()
      if (!inPlace) void import('@/components/report/note-sheet')
      void document.fonts?.load('26px "Amiri Quran"', 'ب').catch(() => undefined)
    }, WARM_UP_MS)
    return () => window.clearTimeout(timer)
  }, [done, inPlace])

  // A report that will have one claim opens its note when it completes (inline below 1024px, in
  // the margin above). Once matching is over the claims are all known: if there is one, the
  // note's code is fetched in the moment before the report completes, so the note is there with
  // the rest of it and nothing under it is pushed down.
  const loneClaim = running && claims.length === 1 && state.stages.match?.status === 'done'
  useEffect(() => {
    if (loneClaim) void (inPlace ? LazyNoteBody : InlineNote).preload()
  }, [loneClaim, inPlace])

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
  }

  // Phone only: the list can put the notes that matter most first.
  const listed =
    order === 'state' && done
      ? [...visible].sort((a, b) => {
          const rank = (claim: ClaimStub) => {
            const s = states.get(claim.id)
            return s ? STATES_BY_RISK.indexOf(s) : STATES_BY_RISK.length
          }
          return rank(a) - rank(b) || chronological(a, b)
        })
      : visible
  const sheetCard = sheetId ? cards[sheetId] : undefined

  // A pasted text is known before the server sends it back: it is set on the page at once, so
  // nothing moves when its segments arrive.
  const pastedText = state.input?.input_type === 'text' ? (state.input.text ?? '') : ''

  return (
    <section aria-label={t.report.title}>
      {/* The head of the sheet: the progress line while running, then the report in one sentence.
          Each takes the height it needs and no more: the answer starts at the top of the sheet. */}
      {running ? (
        <ProgressPanel state={state} onCancel={onCancel} />
      ) : noClaims ? (
        <div className="flex flex-col items-start gap-3 border-b pb-5">
          <div>
            <p className="text-lg font-semibold text-ink">
              {noClaimsNotice ? pick(noClaimsNotice.message_ar, noClaimsNotice.message_en) : t.report.noClaimsTitle}
            </p>
            <p className="text-base text-quiet">
              {(noClaimsNotice && pick(noClaimsNotice.hint_ar, noClaimsNotice.hint_en)) || t.report.noClaimsHint}
            </p>
          </div>
          <Button type="button" variant="outline" size="touch" onClick={onVerifyAnother}>
            <RotateCcw aria-hidden="true" />
            {t.report.another}
          </Button>
          {missedLink}
        </div>
      ) : (
        <div className="flex items-start gap-x-6 border-b pb-5">
          <div className="min-w-0 flex-1">
            <SummarySentence
              tally={tally}
              filter={activeFilter}
              onFilter={setFilter}
            />
            {/* Two quiet links under the sentence: what the states mean, and, on a phone where the
                notes follow the text and start below the first screen, the way to them. */}
            <div className="flex flex-wrap items-center gap-x-5">
            {notesBelow && !withMargin && !singleInline ? (
              <a
                href="#notes-title"
                onClick={(event) => {
                  event.preventDefault()
                  notesRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
                  document.getElementById('notes-title')?.focus({ preventScroll: true })
                }}
                className="inline-flex min-h-8 items-center gap-1 text-sm text-green underline decoration-green/40 underline-offset-4"
              >
                {t.notes.jump(ordered.length)}
                <ChevronDown aria-hidden="true" className="size-4" />
              </a>
            ) : null}
              <LegendLink className="min-h-8 text-sm" />
            </div>
          </div>
          <Button type="button" variant="outline" size="touch" onClick={onVerifyAnother} className="shrink-0 max-md:hidden">
            <RotateCcw aria-hidden="true" />
            {t.report.another}
          </Button>
        </div>
      )}

      {error ? <div className="mt-5">{error}</div> : null}

      <div
        ref={gridRef}
        data-inking={inking ? '' : undefined}
        className={cn(
          'relative isolate mt-6',
          withMargin && 'grid grid-cols-[minmax(0,1fr)_16rem] gap-x-6 lg:grid-cols-[minmax(0,36rem)_22rem] lg:gap-x-8',
          // Without a margin beside it the text keeps the page's measure.
          hasMargin && !withMargin && 'max-w-[36rem]',
        )}
      >
        {withMargin ? (
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 size-full overflow-visible">
            {/* At rest a note is tied to its line by a stub in the gutter, and a note that was
                pushed away from its line by none. The note in hand (hovered, focused, open) gets
                the full tie, from its words, in its state's colour. */}
            {ids.map((id) => {
              const noteState = states.get(id)
              const lit = !!noteState && (activeId === id || openInPlace.has(id))
              const d = lit ? layout.ties[id] : layout.stubs[id]
              if (!d) return null
              return (
                <path
                  key={id}
                  d={d}
                  className="connector"
                  data-connector={id}
                  data-active={lit ? '' : undefined}
                  style={
                    { '--connector-active': noteState ? STATE_STYLE[noteState].variable : undefined } as CSSProperties
                  }
                />
              )
            })}
          </svg>
        ) : null}

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
            openIds={openInPlace}
            onSelect={selectPassage}
            onHover={setActiveId}
          />
        ) : running && pastedText ? (
          <p data-page dir="auto" className="page-text min-w-0 break-words whitespace-pre-line text-ink">
            {pastedText}
          </p>
        ) : running ? (
          // A clip or an article is not known yet: still ruled lines down to the fold, so that
          // what lies under the page is out of sight when the text takes its place.
          <div data-page aria-hidden="true" className="ruled min-h-[calc(100dvh-15rem)]" />
        ) : (
          <p data-page className="text-sm text-quiet">
            {t.transcript.empty}
          </p>
        )}

        {withMargin ? (
          <aside
            data-margin
            aria-label={t.notes.title}
            className="relative"
            style={{ minHeight: layout.height || undefined }}
          >
            {notices ? <div data-margin-head>{notices}</div> : null}
            {visible.map((claim, i) => {
              const card = cards[claim.id]
              const top = layout.tops[claim.id]
              if (!card) return <PendingNote key={claim.id} claim={claim} top={top} />
              return (
                <MarginNote
                  key={claim.id}
                  {...bodyProps}
                  card={card}
                  inPlace={inPlace}
                  open={openInPlace.has(card.id)}
                  active={activeId === card.id}
                  top={top}
                  glide={glide}
                  delay={Math.round(i * Math.min(60, 360 / Math.max(1, visible.length - 1)))}
                  onToggle={toggleNote}
                  onHover={setActiveId}
                />
              )
            })}
          </aside>
        ) : null}
      </div>

      {/* One boundary around the inline note and what follows it: the colophon is not set under
          the text first and then pushed down when the note arrives. */}
      <Suspense fallback={null}>
      {singleInline && single ? (
        <div className="mt-6 max-w-[36rem] space-y-4">
          {notices}
          <InlineNote {...bodyProps} card={single} />
        </div>
      ) : null}

      {withMargin || singleInline || (ordered.length === 0 && !notices) ? null : (
        <section ref={notesRef} aria-labelledby="notes-title" className="mt-8 scroll-mt-16 border-t pt-4">
          <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-4">
            <h2 id="notes-title" tabIndex={-1} className="text-base font-semibold text-ink">
              {t.notes.title}
            </h2>
            {done && ordered.length > 1 ? <OrderToggle value={order} onChange={setOrder} /> : null}
          </div>
          {notices ? <div className="py-2">{notices}</div> : null}
          <ul className="divide-y">
            {listed.map((claim) => (
              <NoteRow
                key={claim.id}
                claim={claim}
                card={cards[claim.id]}
                onOpen={setSheetId}
              />
            ))}
          </ul>
        </section>
      )}

      {done && !noClaims && summary ? (
        <div className="mt-10 space-y-3 text-sm">
          <p>
            <span className="text-ink">
              {t.report.finished(
                summary.elapsed_seconds >= 0.05 && !state.restored ? formatSeconds(summary.elapsed_seconds) : null,
              )}
            </span>
            {used.length > 0 ? (
              <span className="text-quiet">
                {' '}
                {t.report.sources}:{' '}
                {used.map((s, i) => (
                  <span key={s.name}>
                    {i > 0 ? t.report.summary.comma : null}
                    {safeHref(s.url) ? <SourceLink href={new URL(s.url).origin}>{s.name}</SourceLink> : s.name}
                  </span>
                ))}
              </span>
            ) : null}
          </p>
          <div className="flex flex-col gap-3 md:flex-row">
            {/* The summary card and the shared text are for citations: a report that holds only
                questions has nothing to share. */}
            {features.share_card && tally.citations > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="touch"
                data-testid="share-summary"
                onClick={() =>
                  setShareTarget({
                    kind: 'summary',
                    summary,
                    cards: readyCards,
                    title: source?.title ?? null,
                  })
                }
              >
                <Share2 aria-hidden="true" />
                {t.report.shareSummary}
              </Button>
            ) : null}
            <Button type="button" size="xl" onClick={onVerifyAnother} className="md:hidden">
              <RotateCcw aria-hidden="true" />
              {t.report.another}
            </Button>
          </div>
          {missedLink}
        </div>
      ) : null}
      </Suspense>

      <Suspense fallback={null}>
        {sheetCard ? (
          <NoteSheet
            {...bodyProps}
            open
            onClose={() => setSheetId(null)}
            card={sheetCard}
            onLocate={locate}
          />
        ) : null}
        {referralFor ? (
          <ReferralDialog open={referralOpen} onOpenChange={setReferralOpen} meta={meta} query={referralFor.query} />
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
