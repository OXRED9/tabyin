import { Fragment, memo } from 'react'
import type { CSSProperties, MouseEvent } from 'react'

import { SourceLink } from '@/components/report/source-link'
import { StateGlyph } from '@/components/state-glyph'
import { codePointLength, formatClock, safeHref, sliceByCodePoints } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { STATE_STYLE } from '@/lib/states'
import type { ClaimStub, EvidenceState, Segment, SourceInfo } from '@/lib/types'
import { timestampLink } from '@/lib/video'
import { cn } from '@/lib/utils'

interface PageTextProps {
  source: SourceInfo | null
  segments: Segment[]
  claims: ClaimStub[]
  /** The state each claim shows once its verdict is in; absent while it is still being checked. */
  states: ReadonlyMap<string, EvidenceState>
  /** Claims that are questions put to the tool: named «سؤال», not by the state they borrow. */
  questions: ReadonlySet<string>
  /** While the request runs every passage keeps a plain hairline: the ink comes when it is done. */
  settled: boolean
  /** Notes hidden by the summary's filter: their passages go back to a plain hairline. */
  hidden: ReadonlySet<string>
  activeId: string | null
  openIds: ReadonlySet<string>
  onSelect: (claimId: string) => void
  onHover: (claimId: string | null) => void
}

interface Piece {
  text: string
  claim: ClaimStub | null
  /** A quotation can run over several segments: its first piece is the link target, its last holds the ring. */
  first: boolean
  last: boolean
}

/** Every segment a claim covers. A report saved before `spans` existed has only the first. */
const spansOf = (claim: ClaimStub) => (claim.spans?.length ? claim.spans : claim.span ? [claim.span] : [])

/** Cut a segment into plain runs and claim runs. Overlapping spans keep the earlier claim. */
function splitSegment(segment: Segment, claims: ClaimStub[]): Piece[] {
  const length = codePointLength(segment.text)
  const spans = claims
    .flatMap((c) => {
      const all = spansOf(c)
      return all.map((span, i) => ({ claim: c, span, first: i === 0, last: i === all.length - 1 }))
    })
    .filter((s) => s.span.segment_id === segment.id)
    .map((s) => ({ ...s, start: Math.max(0, s.span.start), end: Math.min(length, s.span.end) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start)

  const plain = (text: string): Piece => ({ text, claim: null, first: false, last: false })
  const pieces: Piece[] = []
  let cursor = 0
  for (const span of spans) {
    if (span.start < cursor) continue
    if (span.start > cursor) pieces.push(plain(sliceByCodePoints(segment.text, cursor, span.start)))
    pieces.push({ text: sliceByCodePoints(segment.text, span.start, span.end), claim: span.claim, first: span.first, last: span.last })
    cursor = span.end
  }
  if (cursor < length) pieces.push(plain(sliceByCodePoints(segment.text, cursor)))
  return pieces
}

/** Underlines ink in one after another, in reading order, inside 600ms: 240ms each, staggered. */
const inkDelay = (index: number, count: number) =>
  count <= 1 ? 0 : Math.round(index * Math.min(60, 360 / (count - 1)))

/**
 * The page: the user's own text or the transcript, set as one block of Naskh. Every claim is
 * marked the way a copyist marks a line: a 2px underline in the state's colour, the words in the
 * state's ink, and a closing ring (gold only on a verified quotation). Selecting a passage opens
 * its note. For a clip, each segment carries its time in the outer gutter, like line numbers in a
 * critical edition.
 */
const PLATFORMS: [RegExp, string][] = [
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/(^|\.)(x|twitter)\.com$/, 'X'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)facebook\.com$/, 'Facebook'],
  [/(^|\.)snapchat\.com$/, 'Snapchat'],
]

/**
 * The clip the text came from: its own thumbnail (embedded by the server, so the page asks the
 * platform for nothing), a play mark that opens the clip, its title, channel, platform and length.
 */
function ClipCard({ source, href, origin, indent }: { source: SourceInfo; href: string; origin: string | null; indent: boolean }) {
  const { t } = useI18n()
  const host = new URL(href).hostname.replace(/^www\./, '')
  const platform = PLATFORMS.find(([re]) => re.test(host))?.[1] ?? host
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="clip-card"
      className={cn(
        'group mb-5 flex items-stretch gap-4 overflow-hidden rounded-sheet border bg-raised/60 p-2 transition-shadow hover:shadow-md focus-visible:-outline-offset-2',
        indent && 'md:ms-14',
      )}
    >
      <span className="relative block aspect-video w-36 shrink-0 overflow-hidden rounded-control bg-ink/10 sm:w-48">
        {source.thumbnail ? (
          <img src={source.thumbnail} alt="" className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : null}
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
        <span aria-hidden="true" className="absolute inset-0 grid place-items-center">
          <span className="grid size-10 place-items-center rounded-full bg-white/85 shadow-lg backdrop-blur transition-transform duration-200 group-hover:scale-110">
            <svg viewBox="0 0 24 24" className="ms-0.5 size-4 fill-ink"><path d="M8 5.5v13l11-6.5z" /></svg>
          </span>
        </span>
        {source.duration ? (
          <span className="tabular absolute end-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white" dir="ltr">
            {formatClock(source.duration)}
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-col justify-center gap-1 py-1 pe-2">
        <span className="line-clamp-2 text-base font-semibold text-ink" dir="auto">
          {source.title || host}
        </span>
        <span className="truncate text-sm text-quiet">
          {[source.channel, platform].filter(Boolean).join(t.report.summary.comma)}
        </span>
        {origin ? <span className="text-xs text-quiet">{origin}</span> : null}
        <span className="text-sm text-green underline decoration-green/40 underline-offset-4 group-hover:decoration-green">
          {t.clip.open}
        </span>
      </span>
    </a>
  )
}

export const PageText = memo(function PageText({
  source,
  segments,
  claims,
  states,
  questions,
  settled,
  hidden,
  activeId,
  openIds,
  onSelect,
  onHover,
}: PageTextProps) {
  const { t } = useI18n()
  const hasTimes = segments.some((s) => s.start !== null)
  const origin = source?.transcript_origin ? (t.transcript.origin[source.transcript_origin] ?? null) : null
  const sourceHref = safeHref(source?.url)
  const order = new Map(claims.filter((c) => c.span).map((c, i) => [c.id, i]))

  const select = (event: MouseEvent, claimId: string) => {
    event.preventDefault()
    onSelect(claimId)
  }

  return (
    <div data-page className="min-w-0">
      {source?.input_type === 'video_url' && sourceHref ? (
        <ClipCard source={source} href={sourceHref} origin={origin} indent={hasTimes} />
      ) : source?.title || sourceHref || origin || source?.duration ? (
        <div className={cn('mb-4 text-sm text-quiet', hasTimes && 'md:ps-14')}>
          {source?.title ? (
            <p className="text-base font-semibold text-ink" dir="auto">
              {source.title}
            </p>
          ) : null}
          <p>
            {sourceHref ? (
              <span dir="ltr" className="inline-block max-w-full truncate align-bottom">
                <SourceLink href={sourceHref}>{sourceHref.replace(/^https?:\/\/(www\.)?/, '')}</SourceLink>
              </span>
            ) : null}
            {origin ? (
              <span>
                {sourceHref ? t.report.summary.comma : null}
                {origin}
              </span>
            ) : null}
            {source?.duration ? (
              <span className="tabular">
                {sourceHref || origin ? t.report.summary.comma : null}
                {t.transcript.durationOf(formatClock(source.duration))}
              </span>
            ) : null}
          </p>
        </div>
      ) : null}

      <div className="page-text text-ink">
        {segments.map((segment) => {
          const pieces = splitSegment(segment, claims)
          const href = segment.start !== null ? timestampLink(source, segment.start) : null
          const clock = segment.start !== null ? formatClock(segment.start) : null
          return (
            <div key={segment.id} className={cn(hasTimes && 'mt-2 first:mt-0 md:mt-0 md:grid md:grid-cols-[3.5rem_minmax(0,1fr)]')}>
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
                    className="tabular block justify-self-start font-sans text-sm leading-6 text-green underline decoration-green/40 underline-offset-4 hover:decoration-green md:leading-10"
                  >
                    {clock}
                  </a>
                ) : (
                  <span dir="ltr" className="tabular block justify-self-start font-sans text-sm leading-6 text-quiet md:leading-10">
                    {clock}
                  </span>
                )
              ) : null}
              <p dir="auto" className="min-w-0 break-words whitespace-pre-line">
                {pieces.map((piece, i) => {
                  if (!piece.claim) return <Fragment key={i}>{piece.text}</Fragment>
                  const claim = piece.claim
                  const known = states.get(claim.id) ?? null
                  const state = settled && !hidden.has(claim.id) ? known : null
                  const style = state ? STATE_STYLE[state] : null
                  const lit = activeId === claim.id || openIds.has(claim.id)
                  // Only the quotation's last piece ends with the ring; an earlier one is all "head".
                  const cut = piece.last ? piece.text.trimEnd().lastIndexOf(' ') + 1 : piece.text.length
                  const head = piece.text.slice(0, cut)
                  const tail = piece.text.slice(cut)
                  const pending = style ? undefined : ''
                  const inkStyle = {
                    '--underline': style?.variable,
                    '--ink-delay': `${inkDelay(order.get(claim.id) ?? 0, order.size)}ms`,
                    backgroundColor: style && lit ? style.softVariable : undefined,
                  } as CSSProperties
                  return (
                    <a
                      key={i}
                      id={piece.first ? `span-${claim.id}` : undefined}
                      href={`#note-${claim.id}`}
                      data-span={claim.id}
                      data-state={state ?? 'pending'}
                      aria-label={t.transcript.passage(
                        piece.text,
                        known && settled
                          ? questions.has(claim.id)
                            ? t.question.word
                            : t.stateWords[known]
                          : t.transcript.pendingState,
                      )}
                      onClick={(event) => select(event, claim.id)}
                      onMouseEnter={() => onHover(claim.id)}
                      onMouseLeave={() => onHover(null)}
                      onFocus={() => onHover(claim.id)}
                      onBlur={() => onHover(null)}
                      className="cursor-pointer rounded-sheet"
                      style={style ? { color: style.inkVariable } : undefined}
                    >
                      {head ? (
                        <span className="claim-ink" data-pending={pending} data-head="" style={inkStyle}>
                          {head}
                        </span>
                      ) : null}
                      {/* The last word and the closing ring stay together, so the ring is never
                          left alone at the start of a line. The ring holds its place from the
                          moment the claim is announced: lines do not re-break when the verdict
                          arrives. */}
                      {piece.last ? (
                        <span className="whitespace-nowrap">
                          <span className="claim-ink" data-pending={pending} data-tail={head ? '' : undefined} style={inkStyle}>
                            {tail}
                          </span>
                          <StateGlyph
                            state={state ?? 'pending'}
                            className={cn(
                              'ms-1 inline-block size-[0.8em] align-[-0.08em]',
                              hidden.has(claim.id) && 'invisible',
                            )}
                          />
                        </span>
                      ) : null}
                    </a>
                  )
                })}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
})
