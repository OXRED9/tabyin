import { ChevronDown, UserRoundCheck } from 'lucide-react'
import { memo, useId } from 'react'
import type { CSSProperties } from 'react'

import { NoteBody } from '@/components/report/note-body'
import type { NoteBodyProps } from '@/components/report/note-body'
import { StateGlyph } from '@/components/state-glyph'
import { useI18n } from '@/lib/i18n'
import { referenceLine } from '@/lib/reference-line'
import { STATE_STYLE } from '@/lib/states'
import type { ClaimStub } from '@/lib/types'
import { cn } from '@/lib/utils'

interface MarginNoteProps extends Omit<NoteBodyProps, 'showQuoted' | 'onLocate'> {
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
 * A margin note: a remark beside a line, not a card. It has no box, only a 2px tick of its
 * state's colour on the edge that faces the text. Collapsed it is two lines: the state's ring and
 * word with the kind of claim, then one line of reference. Open, it unfolds in place.
 */
export const MarginNote = memo(function MarginNote({
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
        className={cn('border-s-2 ps-3', style.tick)}
        style={{ '--ink-delay': `${delay}ms` } as CSSProperties}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          onClick={() => onToggle(card.id)}
          onFocus={() => onHover(card.id)}
          onBlur={() => onHover(null)}
          className={cn(
            'block w-full rounded-sheet text-start transition-colors duration-150',
            (active || open) && style.soft,
          )}
        >
          <span className="flex h-6 items-center gap-2">
            <StateGlyph state={state} />
            <span className={cn('truncate text-sm font-medium', style.ink)}>{t.stateWords[state]}</span>
            <span className="truncate text-sm text-quiet max-lg:hidden">— {t.claimTypes[card.claim_type]}</span>
            {override ? (
              <UserRoundCheck aria-label={t.reviewer.title} role="img" className="size-4 shrink-0 text-quiet" />
            ) : null}
            <ChevronDown
              aria-hidden="true"
              className={cn('ms-auto size-4 shrink-0 text-quiet transition-transform duration-150', open && 'rotate-180')}
            />
          </span>
          <span className="block h-[22px] truncate text-sm leading-[22px] text-quiet">
            {referenceLine(card, override, t, pick(card.note_ar, card.note_en))}
          </span>
        </button>
        {open ? (
          <div id={bodyId} className="pt-3 pb-1">
            <NoteBody {...body} showQuoted={!card.span} />
          </div>
        ) : null}
      </article>
    </div>
  )
})

/**
 * A claim that was announced but not yet checked. It holds exactly the height of a collapsed
 * note (two still ruled lines, no shimmer), so nothing moves when its verdict arrives.
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
        className="border-s-2 border-rule ps-3"
      >
        <span className="sr-only">{t.card.pending}</span>
        <span className="flex h-6 items-center gap-2">
          <StateGlyph state="pending" />
          <span className="truncate text-sm text-quiet">{t.notes.pendingWord}</span>
          <span className="truncate text-sm text-quiet max-lg:hidden">— {t.claimTypes[claim.claim_type]}</span>
        </span>
        <span aria-hidden="true" className="block h-[22px] pt-[10px]">
          <span className="block h-px w-3/5 bg-rule" />
        </span>
      </div>
    </div>
  )
}
