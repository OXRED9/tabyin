import { ChevronDown, ChevronLeft, UserRoundCheck } from 'lucide-react'
import { Suspense, lazy, memo, useId } from 'react'
import type { CSSProperties } from 'react'

import type { NoteBodyProps } from '@/components/report/note-body'
import { StateGlyph } from '@/components/state-glyph'
import { useI18n } from '@/lib/i18n'
import { referenceLine } from '@/lib/reference-line'
import { STATE_STYLE } from '@/lib/states'
import type { ClaimStub } from '@/lib/types'
import { cn } from '@/lib/utils'

// What an open note says is not needed to draw the page: it is fetched when a note is first
// opened (and warmed up once the report is complete, so that opening is immediate).
const NoteBody = lazy(() => import('@/components/report/note-body'))

interface MarginNoteProps extends Omit<NoteBodyProps, 'showQuoted' | 'onLocate'> {
  /** Wide screens open a note in place; narrower ones hand it to a sheet and keep the margin still. */
  inPlace: boolean
  open: boolean
  /** Its passage is hovered or focused, or the note itself is. */
  active: boolean
  /** Top of the note inside the margin; undefined until the first measurement. */
  top: number | undefined
  /** Notes below an opening note glide; anything else (stream, resize) just takes its place. */
  glide: boolean
  /** Its place in the orchestrated moment. */
  delay: number
  onToggle: (cardId: string) => void
  onHover: (cardId: string | null) => void
}

/**
 * A margin note: a remark beside a line, not a card. Collapsed it is one line, no taller than a
 * line of the page, so each note can sit level with its own passage: the state's ring and word,
 * the kind of claim, then the reference, cut short. Open, it unfolds in place, the reference is
 * given in full, and a 2px bar of the state's colour on the edge that faces the text bounds it.
 */
export const MarginNote = memo(function MarginNote({
  inPlace,
  open,
  active,
  top,
  glide,
  delay,
  onToggle,
  onHover,
  ...body
}: MarginNoteProps) {
  const { t, pick } = useI18n()
  const bodyId = useId()
  const { card, override } = body
  const state = override?.state ?? card.state
  const style = STATE_STYLE[state]
  const reference = referenceLine(card, override, t, pick(card.note_ar, card.note_en))

  return (
    <div
      className="absolute inset-x-0 top-0"
      style={
        {
          transform: `translateY(${top ?? 0}px)`,
          visibility: top === undefined ? 'hidden' : undefined,
          transition: glide ? 'transform 180ms ease-out' : undefined,
        } as CSSProperties
      }
    >
      <article
        id={`note-${card.id}`}
        data-note={card.id}
        data-state={state}
        data-open={open || undefined}
        aria-label={`${t.stateWords[state]}: ${card.text_as_quoted}`}
        onMouseEnter={() => onHover(card.id)}
        onMouseLeave={() => onHover(null)}
        // The bar bounds an open note, which has no box. A collapsed note needs none: its ring
        // and its coloured word already say its state.
        className={cn('border-s-2 ps-3', open ? style.tick : 'border-transparent')}
        style={{ '--ink-delay': `${delay}ms` } as CSSProperties}
      >
        <button
          type="button"
          aria-expanded={inPlace ? open : undefined}
          aria-controls={inPlace && open ? bodyId : undefined}
          aria-haspopup={inPlace ? undefined : 'dialog'}
          title={open ? undefined : reference}
          onClick={() => onToggle(card.id)}
          onFocus={() => onHover(card.id)}
          onBlur={() => onHover(null)}
          className={cn(
            'block w-full rounded-sheet text-start transition-colors duration-150',
            (active || open) && style.soft,
          )}
        >
          <span className="flex h-7 items-center gap-2 text-sm">
            <StateGlyph state={state} />
            <span className={cn('shrink-0 font-semibold', style.ink)}>{t.stateWords[state]}</span>
            <span className="shrink-0 text-ink max-lg:hidden">— {t.claimTypes[card.claim_type]}</span>
            {override ? (
              <UserRoundCheck aria-label={t.reviewer.title} role="img" className="size-4 shrink-0 text-quiet" />
            ) : null}
            <span className="min-w-0 flex-1 truncate text-quiet">{open ? null : reference}</span>
            {inPlace ? (
              <ChevronDown
                aria-hidden="true"
                className={cn('size-4 shrink-0 text-quiet transition-transform duration-150', open && 'rotate-180')}
              />
            ) : (
              <ChevronLeft aria-hidden="true" className="size-4 shrink-0 text-quiet ltr:-scale-x-100" />
            )}
          </span>
          {/* Open, the reference is no longer cut short. */}
          {open ? <span className="block pb-1 text-sm text-quiet">{reference}</span> : null}
        </button>
        {open ? (
          <div id={bodyId} className="pt-3 pb-1">
            <Suspense fallback={null}>
              <NoteBody {...body} showQuoted={!card.span} />
            </Suspense>
          </div>
        ) : null}
      </article>
    </div>
  )
})

/**
 * A claim that was announced but not yet checked. It holds exactly the height of a collapsed
 * note (one still ruled line, no shimmer), so nothing moves when its verdict arrives.
 */
export function PendingNote({ claim, top }: { claim: ClaimStub; top: number | undefined }) {
  const { t } = useI18n()
  return (
    <div
      className="absolute inset-x-0 top-0"
      style={{ transform: `translateY(${top ?? 0}px)`, visibility: top === undefined ? 'hidden' : undefined }}
    >
      <div
        id={`note-${claim.id}`}
        data-note={claim.id}
        data-state="pending"
        aria-busy="true"
        className="border-s-2 border-transparent ps-3"
      >
        <span className="sr-only">{t.card.pending}</span>
        <span className="flex h-7 items-center gap-2 text-sm text-quiet">
          <StateGlyph state="pending" />
          <span className="shrink-0">{t.notes.pendingWord}</span>
          <span className="shrink-0 max-lg:hidden">— {t.claimTypes[claim.claim_type]}</span>
          <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-rule" />
        </span>
      </div>
    </div>
  )
}
