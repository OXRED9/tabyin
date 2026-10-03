import { ExternalLink } from 'lucide-react'
import { Fragment, memo } from 'react'
import type { MouseEvent } from 'react'

import { Card as Surface } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { codePointLength, formatClock, safeHref, sliceByCodePoints } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { STATE_STYLE } from '@/lib/states'
import type { Card, ClaimStub, ReviewerOverride, Segment, SourceInfo } from '@/lib/types'
import { timestampLink } from '@/lib/video'
import { cn } from '@/lib/utils'

interface TranscriptPaneProps {
  source: SourceInfo | null
  segments: Segment[]
  claims: ClaimStub[]
  cards: Record<string, Card>
  overrides: ReviewerOverride[]
  activeId: string | null
  flashId: string | null
  onSelect: (claimId: string) => void
  onHover: (claimId: string | null) => void
  /** Inside the mobile sheet the pane fills the sheet instead of sticking to the viewport. */
  embedded?: boolean
}

interface Piece {
  text: string
  claim: ClaimStub | null
}

/** Cut a segment into plain runs and claim runs. Overlapping spans keep the earlier claim. */
function splitSegment(segment: Segment, claims: ClaimStub[]): Piece[] {
  const length = codePointLength(segment.text)
  const spans = claims
    .filter((c) => c.span && c.span.segment_id === segment.id)
    .map((c) => ({ claim: c, start: Math.max(0, c.span!.start), end: Math.min(length, c.span!.end) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start)

  const pieces: Piece[] = []
  let cursor = 0
  for (const span of spans) {
    if (span.start < cursor) continue
    if (span.start > cursor) pieces.push({ text: sliceByCodePoints(segment.text, cursor, span.start), claim: null })
    pieces.push({ text: sliceByCodePoints(segment.text, span.start, span.end), claim: span.claim })
    cursor = span.end
  }
  if (cursor < length) pieces.push({ text: sliceByCodePoints(segment.text, cursor), claim: null })
  return pieces
}

/**
 * The original text or transcript, with every claim highlighted in its state colour. Selecting a
 * highlight scrolls to its card and flashes it; the cards do the same in the other direction.
 */
export const TranscriptPane = memo(function TranscriptPane({
  source,
  segments,
  claims,
  cards,
  overrides,
  activeId,
  flashId,
  onSelect,
  onHover,
  embedded = false,
}: TranscriptPaneProps) {
  const { t } = useI18n()
  const isMedia = source?.input_type === 'video_url' || source?.input_type === 'file'
  const hasTimes = segments.some((s) => s.start !== null)
  const overrideByCard = new Map(overrides.map((o) => [o.card_id, o]))
  const origin = source?.transcript_origin ? (t.transcript.origin[source.transcript_origin] ?? null) : null
  const sourceHref = safeHref(source?.url)

  const select = (event: MouseEvent, claimId: string) => {
    event.preventDefault()
    onSelect(claimId)
  }

  return (
    <Surface className={cn('min-h-0', embedded && 'h-full rounded-none bg-transparent shadow-none ring-0')}>
      <div className={cn('space-y-1 border-b', embedded ? 'px-4 pb-3' : 'p-4')}>
        {embedded ? null : (
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">{isMedia ? t.transcript.titleMedia : t.transcript.titleText}</h2>
            <span className="text-sm text-muted-foreground">{t.report.citations(claims.length)}</span>
          </div>
        )}
        {source?.title || sourceHref || origin ? (
          <div className="space-y-1 text-xs text-muted-foreground">
            {source?.title ? (
              <p className="truncate text-sm font-medium text-foreground" dir="auto">
                {source.title}
              </p>
            ) : null}
            {sourceHref ? (
              <a
                href={sourceHref}
                target="_blank"
                rel="noopener noreferrer"
                dir="ltr"
                className="flex items-center gap-1 font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
              >
                <span className="truncate">{sourceHref.replace(/^https?:\/\/(www\.)?/, '')}</span>
                <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
                <span className="sr-only">{t.transcript.openSource}</span>
              </a>
            ) : null}
            {origin ? <p>{origin}</p> : null}
          </div>
        ) : null}
      </div>

      <ScrollArea
        className="min-h-0 flex-1"
        // Beside the report the pane is sticky, so the text scrolls inside it and the whole pane
        // (title, text, duration) always fits under the header.
        viewportClassName={embedded ? undefined : 'max-h-[calc(100dvh-17rem)]'}
      >
        {segments.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t.transcript.empty}</p>
        ) : (
          <ol className="space-y-3 p-4">
            {segments.map((segment) => {
              const pieces = splitSegment(segment, claims)
              const href = segment.start !== null ? timestampLink(source, segment.start) : null
              const clock = segment.start !== null ? formatClock(segment.start) : null
              return (
                <li key={segment.id} className={cn('gap-3', hasTimes && 'grid grid-cols-[3rem_1fr]')}>
                  {hasTimes ? (
                    clock === null ? (
                      <span />
                    ) : href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        dir="ltr"
                        aria-label={t.card.openVideoAt(clock)}
                        className="tabular pt-1 font-mono text-xs font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
                      >
                        {clock}
                      </a>
                    ) : (
                      <span dir="ltr" className="tabular pt-1 font-mono text-xs text-muted-foreground">
                        {clock}
                      </span>
                    )
                  ) : null}
                  <p dir="auto" className="min-w-0 whitespace-pre-line text-sm leading-loose break-words">
                    {pieces.map((piece, i) => {
                      if (!piece.claim) return <Fragment key={i}>{piece.text}</Fragment>
                      const claim = piece.claim
                      const card = cards[claim.id]
                      const state = card ? (overrideByCard.get(card.id)?.state ?? card.state) : null
                      const style = state ? STATE_STYLE[state] : null
                      const Icon = style?.icon
                      const label = t.transcript.jumpToCard(
                        claim.index,
                        state ? t.states[state] : t.transcript.pendingState,
                      )
                      return (
                        <a
                          key={i}
                          id={`span-${claim.id}`}
                          href={`#card-${claim.id}`}
                          data-claim-id={claim.id}
                          data-state={state ?? 'pending'}
                          title={label}
                          aria-label={`${label}: ${piece.text}`}
                          onClick={(event) => select(event, claim.id)}
                          onMouseEnter={() => onHover(claim.id)}
                          onMouseLeave={() => onHover(null)}
                          onFocus={() => onHover(claim.id)}
                          onBlur={() => onHover(null)}
                          className={cn(
                            'cursor-pointer rounded px-1 py-1 font-medium underline decoration-2 underline-offset-4 box-decoration-clone transition-shadow',
                            style ? style.mark : 'bg-muted text-foreground decoration-muted-foreground decoration-dashed',
                            activeId === claim.id && 'ring-2 ring-primary/60',
                            flashId === claim.id && 'ring-2 ring-gold',
                          )}
                        >
                          {Icon ? <Icon aria-hidden="true" className="me-1 inline size-3.5 align-[-2px]" /> : null}
                          {piece.text}
                        </a>
                      )
                    })}
                  </p>
                </li>
              )
            })}
          </ol>
        )}
      </ScrollArea>

      {source?.duration ? (
        <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
          <span>{t.transcript.duration}</span>
          <span dir="ltr" className="tabular font-mono">
            {formatClock(source.duration)}
          </span>
        </div>
      ) : null}
    </Surface>
  )
})
