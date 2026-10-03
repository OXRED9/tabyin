import { History, RotateCcw, Share2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { ProgressPanel } from '@/components/progress-panel'
import { MarginNote, PendingNote } from '@/components/report/note'
import { NoteRow, NoteSheet, OrderToggle } from '@/components/report/notes-list'
import type { NoteOrder } from '@/components/report/notes-list'
import { PageText } from '@/components/report/page-text'
import { ReferralDialog } from '@/components/report/referral-dialog'
import { SourceLink } from '@/components/report/source-link'
import { SummarySentence } from '@/components/report/summary-sentence'
import { useMarginLayout } from '@/components/report/use-margin-layout'
import { ShareCardDialog } from '@/components/share/share-card-dialog'
import type { ShareTarget } from '@/components/share/share-card-dialog'
import { StateGlyph } from '@/components/state-glyph'
import { Button } from '@/components/ui/button'
import { prefersReducedMotion, useMediaQuery } from '@/hooks/use-media-query'
import type { VerifyState } from '@/hooks/use-verify'
import { featuresOf } from '@/lib/features'
import { formatSeconds, safeHref } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { countStates, sourcesUsed } from '@/lib/report'
import { STATES_BY_RISK, STATE_STYLE, chronological } from '@/lib/states'
import type { Card, ClaimStub, EvidenceState, Meta, ReviewerOverride } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ReportViewProps {
  state: VerifyState
  /** The request is still running: the progress line stands where the summary will. */
  running: boolean
  onCancel: (() => void) | undefined
  meta: Meta | null
  reviewerMode: boolean
  /** A failure that arrived after some notes did: shown above what was received. */
  error: ReactNode
  onSaveOverride: (override: ReviewerOverride) => void
  onRemoveOverride: (cardId: string) => void
  onVerifyAnother: () => void
}

/** The orchestrated moment lasts 600ms; the page stays in its "inking" state a little longer. */
const INKING_MS = 700
/** Notes below an opening note glide for 180ms. */
const GLIDE_MS = 220

/** A calm remark at the top of the margin: reduced coverage, or a source that is unreachable. */
function Notice({ title, icon, children }: { title?: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <p role="note" className="flex items-start gap-2 text-sm text-quiet">
      {icon ?? <StateGlyph state="needs_review" className="mt-0.5 size-[18px]" />}
      <span>
        {title ? <span className="font-medium text-ink">{title}: </span> : null}
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
  reviewerMode,
  error,
  onSaveOverride,
  onRemoveOverride,
  onVerifyAnother,
}: ReportViewProps) {
  const { t, pick } = useI18n()
  const hasMargin = useMediaQuery('(min-width: 768px)')
  const gridRef = useRef<HTMLDivElement | null>(null)
  const glideTimer = useRef<number | null>(null)
  const flashTimer = useRef<number | null>(null)

  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set())
  const [activeId, setActiveId] = useState<string | null>(null)
  const [filter, setFilter] = useState<EvidenceState | null>(null)
  const [order, setOrder] = useState<NoteOrder>('order')
  const [sheetId, setSheetId] = useState<string | null>(null)
  const [referralOpen, setReferralOpen] = useState(false)
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null)
  const [glide, setGlide] = useState(false)
  // False only between the end of a live run and the end of its orchestrated moment.
  const [inked, setInked] = useState(!running)

  const done = state.phase === 'done'
  const { claims, cards, overrides, source, segments, summary } = state
  const features = useMemo(() => featuresOf(meta), [meta])

  // Reading order; claims with no place in the text go at the end of the margin.
  const ordered = useMemo(
    () => [...claims].sort((a, b) => Number(!a.span) - Number(!b.span) || chronological(a, b)),
    [claims],
  )
  const overrideByCard = useMemo(() => new Map(overrides.map((o) => [o.card_id, o])), [overrides])
  const readyCards = useMemo(() => ordered.map((c) => cards[c.id]).filter((c): c is Card => !!c), [ordered, cards])
  const states = useMemo(
    () => new Map(readyCards.map((card) => [card.id, overrideByCard.get(card.id)?.state ?? card.state])),
    [readyCards, overrideByCard],
  )
  const counts = useMemo(() => countStates(readyCards, overrides), [readyCards, overrides])
  const used = useMemo(() => sourcesUsed(readyCards), [readyCards])

  // A filter that no longer matches anything (a reviewer changed the last such note) lets go.
  const activeFilter = filter && counts[filter] > 0 ? filter : null
  const visible = useMemo(
    () => (activeFilter ? ordered.filter((c) => states.get(c.id) === activeFilter) : ordered),
    [activeFilter, ordered, states],
  )
  const hidden = useMemo(
    () => new Set(activeFilter ? ordered.filter((c) => states.get(c.id) !== activeFilter).map((c) => c.id) : []),
    [activeFilter, ordered, states],
  )

  const hasText = segments.some((s) => s.text.trim().length > 0)
  const noClaims = done && ordered.length === 0
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
  const signature = [
    hasMargin,
    ids.join(','),
    [...openIds].join(','),
    readyCards.length,
    overrides.map((o) => `${o.card_id}:${o.state}:${o.at}`).join(','),
    reviewerMode,
    segments.length,
    state.notices.length,
    summary ? 1 : 0,
  ].join('|')
  const layout = useMarginLayout(gridRef, ids, signature)

  const toggleNote = useCallback((cardId: string) => {
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
  }, [])

  /** A passage in the text was chosen: open its note (in the margin, or as a sheet on a phone). */
  const selectPassage = useCallback(
    (claimId: string) => {
      if (!cards[claimId]) return
      if (!hasMargin) {
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
    [cards, hasMargin, hidden, toggleNote],
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

  const openReferral = useCallback(() => setReferralOpen(true), [])

  // F3: which verdict card the share dialog is showing, if any.
  const shareClaim = useCallback(
    (cardId: string) => {
      const card = cards[cardId]
      if (!card) return
      const override = overrides.find((o) => o.card_id === cardId)
      const changed = override && override.state !== override.original_state ? override.state : null
      setShareTarget({ kind: 'claim', card, overrideState: changed })
    },
    [cards, overrides],
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

  const bodyProps = {
    source,
    meta,
    features,
    stageSeconds: summary?.stage_seconds,
    reviewerMode,
    onReferral: openReferral,
    onShare: shareClaim,
    onSaveOverride,
    onRemoveOverride,
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
          Both have the same height, in the same place, so the page under them does not move. */}
      {running ? (
        <ProgressPanel state={state} onCancel={onCancel} />
      ) : noClaims ? (
        <div className="flex min-h-(--sheet-head) flex-col items-start justify-center gap-3 border-b pb-5">
          <div>
            <p className="text-lg font-medium text-ink">
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
        </div>
      ) : (
        <div className="flex min-h-(--sheet-head) items-center gap-x-6 border-b pb-5">
          <SummarySentence
            total={ordered.length}
            counts={counts}
            modified={overrides.length}
            filter={activeFilter}
            onFilter={setFilter}
            className="min-w-0 flex-1"
          />
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
          hasMargin && 'grid grid-cols-[minmax(0,1fr)_16rem] gap-x-6 lg:grid-cols-[minmax(0,36rem)_22rem] lg:gap-x-8',
        )}
      >
        {hasMargin ? (
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 size-full overflow-visible">
            {ids.map((id) => {
              const d = layout.paths[id]
              if (!d) return null
              const noteState = states.get(id)
              const lit = activeId === id || openIds.has(id)
              return (
                <path
                  key={id}
                  d={d}
                  className="connector"
                  data-connector={id}
                  data-active={lit && noteState ? '' : undefined}
                  style={
                    {
                      '--connector-active': noteState ? STATE_STYLE[noteState].variable : undefined,
                      transitionDuration: glide ? undefined : '150ms, 0s',
                    } as CSSProperties
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
            settled={settled}
            hidden={hidden}
            activeId={activeId}
            openIds={openIds}
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

        {hasMargin ? (
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
                  override={overrideByCard.get(card.id)}
                  open={openIds.has(card.id)}
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

      {hasMargin || (ordered.length === 0 && !notices) ? null : (
        <section aria-labelledby="notes-title" className="mt-8 border-t pt-4">
          <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-4">
            <h2 id="notes-title" className="text-base font-semibold text-ink">
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
                override={overrideByCard.get(claim.id)}
                onOpen={setSheetId}
              />
            ))}
          </ul>
        </section>
      )}

      {done && !noClaims && summary ? (
        <div className="mt-10 space-y-3 text-sm">
          <p>
            <span className="font-medium text-ink">
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
            {features.share_card ? (
              <Button
                type="button"
                variant="outline"
                size="touch"
                data-testid="share-summary"
                onClick={() =>
                  setShareTarget({
                    kind: 'summary',
                    summary,
                    counts,
                    total: ordered.length,
                    reviewed: overrides.some((o) => o.state !== o.original_state),
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
        </div>
      ) : null}

      {sheetCard ? (
        <NoteSheet
          {...bodyProps}
          open
          onClose={() => setSheetId(null)}
          card={sheetCard}
          override={overrideByCard.get(sheetCard.id)}
          onLocate={locate}
        />
      ) : null}

      <ReferralDialog open={referralOpen} onOpenChange={setReferralOpen} meta={meta} />
      <ShareCardDialog target={shareTarget} meta={meta} onClose={() => setShareTarget(null)} />
    </section>
  )
}
