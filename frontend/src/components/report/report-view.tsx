import { Download, Info, ListOrdered, Layers, RotateCcw, ScanText, Share2, ShieldCheck, TextSearch } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ExportMenu } from '@/components/export-menu'
import { BlankCard, ClaimCard, PendingCard } from '@/components/report/claim-card'
import { ReferralDialog } from '@/components/report/referral-dialog'
import { TranscriptPane } from '@/components/report/transcript-pane'
import { ShareCardDialog } from '@/components/share/share-card-dialog'
import type { ShareTarget } from '@/components/share/share-card-dialog'
import { Button } from '@/components/ui/button'
import { Card as Surface } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { prefersReducedMotion, useIsWide } from '@/hooks/use-media-query'
import type { VerifyState } from '@/hooks/use-verify'
import { featuresOf } from '@/lib/features'
import { formatSeconds, safeHref } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { countStates, sourcesUsed } from '@/lib/report'
import { STATES_BY_RISK, STATES_FOR_SUMMARY, STATE_STYLE, chronological } from '@/lib/states'
import type { Card, ClaimStub, EvidenceState, Meta, ReviewerOverride } from '@/lib/types'
import { cn } from '@/lib/utils'

type SortMode = 'state' | 'order'

interface ReportViewProps {
  state: VerifyState
  meta: Meta | null
  reviewerMode: boolean
  onSaveOverride: (override: ReviewerOverride) => void
  onRemoveOverride: (cardId: string) => void
  onExportJson: () => void
  onExportHtml: () => void
  onCopyReport?: () => void
  onVerifyAnother: () => void
}

function scrollIntoView(element: Element | null, block: ScrollLogicalPosition = 'center') {
  element?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block })
}

/** "4 استشهادات · 2 مؤيَّد · 1 مع ملاحظة · 1 بلا مصدر": the whole report in one line. */
function SummaryLine({
  total,
  counts,
  pending,
  modified,
  className,
}: {
  total: number
  counts: Record<EvidenceState, number>
  pending: number
  modified: number
  className?: string
}) {
  const { t } = useI18n()
  return (
    <p aria-label={t.report.summaryLabel} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-sm', className)}>
      <span className="font-semibold">{t.report.citations(total)}</span>
      {STATES_FOR_SUMMARY.filter((s) => counts[s] > 0).map((s) => {
        const Icon = STATE_STYLE[s].icon
        return (
          <span key={s} className={cn('inline-flex items-center gap-1 font-medium', STATE_STYLE[s].ink)}>
            <Icon aria-hidden="true" className="size-3.5" />
            <span className="tabular">{counts[s]}</span> {t.statesShort[s]}
          </span>
        )
      })}
      {pending > 0 ? <span className="text-muted-foreground">{t.report.pendingCount(pending)}</span> : null}
      {modified > 0 ? <span className="text-muted-foreground">{t.report.modifiedCount(modified)}</span> : null}
    </p>
  )
}

function SortToggle({ value, onChange }: { value: SortMode; onChange: (mode: SortMode) => void }) {
  const { t } = useI18n()
  const options: { value: SortMode; label: string; icon: typeof Layers }[] = [
    { value: 'state', label: t.report.sortByState, icon: Layers },
    { value: 'order', label: t.report.sortByOrder, icon: ListOrdered },
  ]
  return (
    <div role="group" aria-label={t.report.sortLabel} className="flex rounded-lg bg-muted p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-medium whitespace-nowrap transition-colors',
            value === option.value
              ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <option.icon aria-hidden="true" className="size-3.5 max-sm:hidden" />
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** A calm, non-blocking note: reduced coverage, or a source that is unreachable right now. */
function Notice({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div role="note" className="flex items-start gap-3 rounded-lg border border-gold/50 bg-gold-soft p-3 text-sm">
      <Info aria-hidden="true" className="mt-1 size-4 shrink-0 text-gold-ink" />
      <p>
        {title ? <span className="font-semibold">{title}: </span> : null}
        {children}
      </p>
    </div>
  )
}

export function ReportView({
  state,
  meta,
  reviewerMode,
  onSaveOverride,
  onRemoveOverride,
  onExportJson,
  onExportHtml,
  onCopyReport,
  onVerifyAnother,
}: ReportViewProps) {
  const { t, pick } = useI18n()
  const wide = useIsWide()
  const [sort, setSort] = useState<SortMode>('state')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [referralOpen, setReferralOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [flashCard, setFlashCard] = useState<string | null>(null)
  const [flashSpan, setFlashSpan] = useState<string | null>(null)
  // Which cards are expanded lives here, not in the card: a card that changes group after a
  // reviewer edit is re-mounted, and it must stay open under the reviewer's hands.
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set())
  const flashTimer = useRef<number | null>(null)

  const done = state.phase === 'done'
  const running = state.phase === 'running'
  const { claims, cards, overrides, source, segments, summary } = state

  const ordered = useMemo(() => [...claims].sort(chronological), [claims])
  const readyCards = useMemo(
    () => ordered.map((c) => cards[c.id]).filter((c): c is Card => !!c),
    [ordered, cards],
  )
  const overrideByCard = useMemo(() => new Map(overrides.map((o) => [o.card_id, o])), [overrides])
  const counts = useMemo(() => countStates(readyCards, overrides), [readyCards, overrides])
  const pending = ordered.length - readyCards.length
  const isMedia = source?.input_type === 'video_url' || source?.input_type === 'file'
  const hasText = segments.some((s) => s.text.trim().length > 0)

  useEffect(() => () => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current)
  }, [])

  const flash = useCallback((kind: 'card' | 'span', id: string) => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current)
    setFlashCard(kind === 'card' ? id : null)
    setFlashSpan(kind === 'span' ? id : null)
    flashTimer.current = window.setTimeout(() => {
      setFlashCard(null)
      setFlashSpan(null)
    }, 1700)
  }, [])

  /** Transcript → card. */
  const goToCard = useCallback(
    (claimId: string) => {
      const run = () => {
        scrollIntoView(document.getElementById(`card-${claimId}`))
        flash('card', claimId)
      }
      if (sheetOpen) {
        setSheetOpen(false)
        window.setTimeout(run, 260)
      } else run()
    },
    [flash, sheetOpen],
  )

  /** Card → its place in the transcript (opening the sheet first on narrow screens). */
  const goToSpan = useCallback(
    (claimId: string) => {
      const run = () => {
        scrollIntoView(document.getElementById(`span-${claimId}`))
        flash('span', claimId)
      }
      if (wide) run()
      else {
        setSheetOpen(true)
        window.setTimeout(run, 320)
      }
    },
    [flash, wide],
  )

  const openReferral = useCallback(() => setReferralOpen(true), [])

  // F3: which verdict card the share dialog is showing, if any.
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null)
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
  const features = useMemo(() => featuresOf(meta), [meta])

  const setCardOpen = useCallback((cardId: string, open: boolean) => {
    setOpenIds((current) => {
      const next = new Set(current)
      if (open) next.add(cardId)
      else next.delete(cardId)
      return next
    })
  }, [])

  // After a reviewer edit the card may now sit in another group: follow it.
  const followCard = useCallback(
    (cardId: string) => {
      window.requestAnimationFrame(() => {
        scrollIntoView(document.getElementById(`card-${cardId}`), 'nearest')
        flash('card', cardId)
      })
    },
    [flash],
  )
  const saveOverride = useCallback(
    (override: ReviewerOverride) => {
      onSaveOverride(override)
      followCard(override.card_id)
    },
    [followCard, onSaveOverride],
  )
  const removeOverride = useCallback(
    (cardId: string) => {
      onRemoveOverride(cardId)
      followCard(cardId)
    },
    [followCard, onRemoveOverride],
  )

  const renderClaim = (claim: ClaimStub) => {
    const card = cards[claim.id]
    if (!card) return <PendingCard key={claim.id} claim={claim} />
    return (
      <ClaimCard
        key={claim.id}
        card={card}
        override={overrideByCard.get(card.id)}
        source={source}
        meta={meta}
        features={features}
        stageSeconds={summary?.stage_seconds}
        reviewerMode={reviewerMode}
        highlighted={flashCard === card.id}
        linked={activeId === card.id}
        open={openIds.has(card.id)}
        onOpenChange={setCardOpen}
        onLocate={goToSpan}
        onHover={setActiveId}
        onReferral={openReferral}
        onShare={shareClaim}
        onSaveOverride={saveOverride}
        onRemoveOverride={removeOverride}
      />
    )
  }

  // While cards are still arriving they stay in reading order, so each skeleton is replaced in
  // place and nothing jumps. Grouping by state (riskiest first) applies once the report is done.
  const grouped = done && sort === 'state'
  const groups = grouped
    ? STATES_BY_RISK.map((s) => ({
        state: s,
        items: ordered.filter((c) => {
          const card = cards[c.id]
          return card && (overrideByCard.get(card.id)?.state ?? card.state) === s
        }),
      })).filter((g) => g.items.length > 0)
    : []

  const lexicalNotice = state.notices.find((n) => n.code === 'llm_unavailable')
  const noClaimsNotice = state.notices.find((n) => n.code === 'no_claims')
  const lexical = summary?.mode === 'lexical_only' || !!lexicalNotice
  const dorarDown = summary?.warnings.includes('dorar_unreachable') ?? false
  // The backup model answered some of this request (primary model down, or the daily spend limit).
  const backupModel = !lexical && (summary?.warnings.includes('llm_fallback') ?? false)
  const noClaims = done && ordered.length === 0
  const used = useMemo(() => sourcesUsed(readyCards), [readyCards])

  const transcript = (embedded: boolean) => (
    <TranscriptPane
      source={source}
      segments={segments}
      claims={ordered}
      cards={cards}
      overrides={overrides}
      activeId={activeId}
      flashId={flashSpan}
      onSelect={goToCard}
      onHover={setActiveId}
      embedded={embedded}
    />
  )

  return (
    <section
      aria-labelledby="report-title"
      className={cn('grid gap-6', wide && hasText && 'grid-cols-[minmax(0,5fr)_minmax(0,8fr)] items-start')}
    >
      {wide && hasText ? <aside className="sticky top-20">{transcript(false)}</aside> : null}

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 id="report-title" className="text-lg font-semibold">
            {t.report.title}
          </h2>
          {ordered.length > 0 ? (
            <SummaryLine
              total={ordered.length}
              counts={counts}
              pending={running ? pending : 0}
              modified={overrides.length}
            />
          ) : null}
          <div className="ms-auto flex items-center gap-2">
            {!wide && hasText ? (
              <Button type="button" variant="outline" size="touch" onClick={() => setSheetOpen(true)}>
                <ScanText aria-hidden="true" />
                {t.transcript.show}
              </Button>
            ) : null}
            {done && ordered.length > 1 ? <SortToggle value={sort} onChange={setSort} /> : null}
          </div>
        </div>

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
          <p className="text-xs text-muted-foreground">{t.report.restored}</p>
        ) : null}

        {noClaims ? (
          <Surface className="animate-rise items-center gap-3 p-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
              <TextSearch aria-hidden="true" className="size-6" />
            </span>
            <p className="text-base font-semibold">
              {noClaimsNotice ? pick(noClaimsNotice.message_ar, noClaimsNotice.message_en) : t.report.noClaimsTitle}
            </p>
            <p className="text-sm text-muted-foreground">
              {(noClaimsNotice && pick(noClaimsNotice.hint_ar, noClaimsNotice.hint_en)) || t.report.noClaimsHint}
            </p>
            <Button type="button" variant="outline" size="touch" onClick={onVerifyAnother}>
              <RotateCcw aria-hidden="true" />
              {t.report.another}
            </Button>
          </Surface>
        ) : null}

        {running && ordered.length === 0 ? (
          <div className="space-y-4">
            <BlankCard />
            <BlankCard />
            <BlankCard />
          </div>
        ) : null}

        {grouped ? (
          groups.map((group) => {
            const Icon = STATE_STYLE[group.state].icon
            return (
              <section key={group.state} aria-labelledby={`group-${group.state}`} className="space-y-3">
                <h3
                  id={`group-${group.state}`}
                  className={cn('flex items-center gap-2 pt-2 text-base font-semibold', STATE_STYLE[group.state].ink)}
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {t.states[group.state]}
                  <span className="tabular font-normal text-muted-foreground">({group.items.length})</span>
                </h3>
                <div className="space-y-4">{group.items.map(renderClaim)}</div>
              </section>
            )
          })
        ) : (
          <div className="space-y-4">{ordered.map(renderClaim)}</div>
        )}

        {done && !noClaims && summary ? (
          <Surface className="animate-rise gap-4 p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                <ShieldCheck aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0 space-y-1">
                <p className="text-lg font-semibold">{t.report.finishTitle}</p>
                <SummaryLine total={ordered.length} counts={counts} pending={0} modified={overrides.length} />
                {summary.elapsed_seconds >= 0.05 && !state.restored ? (
                  <p className="text-xs text-muted-foreground">
                    {t.report.finishBody(formatSeconds(summary.elapsed_seconds))}
                  </p>
                ) : null}
              </div>
            </div>
            {used.length > 0 ? (
              <>
                <Separator />
                <div className="space-y-1 text-xs">
                  <p className="font-semibold text-muted-foreground">{t.report.sources}</p>
                  <ul className="flex flex-wrap gap-x-4 gap-y-1">
                    {used.map((s) => (
                      <li key={s.name}>
                        {safeHref(s.url) ? (
                          <a
                            href={new URL(s.url).origin}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
                          >
                            {s.name}
                          </a>
                        ) : (
                          s.name
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row">
              <ExportMenu
                onExportJson={onExportJson}
                onExportHtml={onExportHtml}
                onCopyReport={onCopyReport}
                align="start"
              >
                <Button type="button" variant="gold" size="xl" className="sm:px-6">
                  <Download aria-hidden="true" />
                  {t.header.export}
                </Button>
              </ExportMenu>
              {features.share_card ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xl"
                  data-testid="share-summary"
                  className="font-medium sm:px-6"
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
                  {t.share.button}
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="xl" onClick={onVerifyAnother} className="font-medium sm:px-6">
                <RotateCcw aria-hidden="true" />
                {t.report.another}
              </Button>
            </div>
          </Surface>
        ) : null}
      </div>

      {!wide ? (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            side="bottom"
            closeLabel={t.close}
            className="gap-0 rounded-t-2xl data-[side=bottom]:h-[85dvh]"
          >
            <SheetHeader>
              <SheetTitle className="text-lg font-semibold">
                {isMedia ? t.transcript.titleMedia : t.transcript.titleText}
              </SheetTitle>
              <SheetDescription>{t.report.citations(ordered.length)}</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1">{transcript(true)}</div>
          </SheetContent>
        </Sheet>
      ) : null}

      <ReferralDialog open={referralOpen} onOpenChange={setReferralOpen} meta={meta} />
      <ShareCardDialog target={shareTarget} meta={meta} onClose={() => setShareTarget(null)} />
    </section>
  )
}
