import { ChevronDown } from 'lucide-react'
import { Suspense, memo, useId } from 'react'
import type { CSSProperties } from 'react'

import NoteBody from '@/components/report/lazy-note-body'
import type { NoteBodyProps } from '@/components/report/note-body'
import { Provenance } from '@/components/report/provenance'
import { StateGlyph } from '@/components/state-glyph'
import { useI18n } from '@/lib/i18n'
import { referenceLine } from '@/lib/reference-line'
import { STATE_STYLE } from '@/lib/states'
import type { ClaimStub } from '@/lib/types'
import { cn } from '@/lib/utils'

interface EvidenceCardProps extends Omit<NoteBodyProps, 'showQuoted' | 'card'> {
  claim: ClaimStub
  /** Undefined while the claim is announced but not yet checked. */
  card: NoteBodyProps['card'] | undefined
  open: boolean
  /** Its place in the list: cards that arrive together rise one after another. */
  index: number
  /** Its passage in the text is hovered or focused, or the card itself is. */
  active: boolean
  onToggle: (cardId: string) => void
  onHover: (cardId: string | null) => void
}

/**
 * One piece of evidence: the state, the quoted words, where they are in the sources. Closed, it
 * is three lines of fixed height — the same height a claim holds while it is still being
 * checked, so nothing moves when its verdict arrives. Open, it shows its trail (how it was
 * matched, the source, the grading, the rule, the action) and then everything the note says.
 */
export const EvidenceCard = memo(function EvidenceCard({ claim, card, open, index, active, onToggle, onHover, ...body }: EvidenceCardProps) {
  // A short stagger, capped so a long report does not keep its last cards waiting.
  const cascade = { '--i': Math.min(index, 12) } as CSSProperties
  const { t, pick } = useI18n()
  const bodyId = useId()
  const state = card?.state
  const style = state ? STATE_STYLE[state] : null
  const word = !card ? t.notes.pendingWord : card.is_question ? t.question.word : t.stateWords[card.state]
  const reference = card ? referenceLine(card, t, pick(card.note_ar, card.note_en)) : ''

  const lines = (
    <span className="min-w-0 flex-1">
      <span className="flex h-7 items-center gap-2 text-sm">
        <span className={cn('shrink-0 font-semibold', style ? style.ink : 'text-quiet')}>{word}</span>
        {card && !card.is_question ? <span className="truncate text-quiet">— {t.claimTypes[card.claim_type]}</span> : null}
      </span>
      <span dir="auto" className="page-text block h-[38px] truncate leading-[38px] text-ink">
        {t.notes.quote(claim.text_as_quoted)}
      </span>
      <span className="block h-[22px] truncate text-sm leading-[22px] text-quiet">{reference}</span>
    </span>
  )

  if (!card) {
    return (
      <li className="cascade" style={cascade}>
        <article
          id={`note-${claim.id}`}
          data-note={claim.id}
          data-state="pending"
          aria-busy="true"
          className="panel flex items-start gap-3 border-s-[3px] border-s-rule-strong p-4"
        >
          <StateGlyph state="pending" className="mt-1" />
          {lines}
          <span className="sr-only">{t.card.pending}</span>
        </article>
      </li>
    )
  }

  return (
    <li className="cascade" style={cascade}>
      <article
        id={`note-${card.id}`}
        data-note={card.id}
        data-state={card.state}
        data-open={open || undefined}
        data-question={card.is_question ? '' : undefined}
        aria-label={`${word}: ${card.text_as_quoted}`}
        onMouseEnter={() => onHover(card.id)}
        onMouseLeave={() => onHover(null)}
        className={cn(
          'panel scroll-mt-20 overflow-hidden border-s-[3px] transition-shadow duration-300',
          style?.edge,
          active && 'shadow-glow',
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          onClick={() => onToggle(card.id)}
          onFocus={() => onHover(card.id)}
          onBlur={() => onHover(null)}
          className="flex w-full items-start gap-3 rounded-sheet p-4 text-start focus-visible:-outline-offset-2"
        >
          <StateGlyph state={card.state} className="mt-1" />
          {lines}
          <ChevronDown
            aria-hidden="true"
            className={cn('mt-1.5 size-4 shrink-0 text-quiet transition-transform duration-150', open && 'rotate-180')}
          />
        </button>
        {open ? (
          <div id={bodyId} className="space-y-4 border-t px-4 pt-4 pb-4">
            {/* A question was referred, not matched: it has no trail to show. */}
            {card.is_question ? null : <Provenance card={card} />}
            <Suspense fallback={null}>
              <NoteBody {...body} card={card} showQuoted={!card.span || claim.text_as_quoted.length > 60} />
            </Suspense>
          </div>
        ) : null}
      </article>
    </li>
  )
})
