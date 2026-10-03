import { ChevronLeft } from 'lucide-react'

import { StateGlyph } from '@/components/state-glyph'
import { useI18n } from '@/lib/i18n'
import { referenceLine } from '@/lib/reference-line'
import { STATE_STYLE } from '@/lib/states'
import type { Card, ClaimStub } from '@/lib/types'
import { cn } from '@/lib/utils'

export type NoteOrder = 'order' | 'state'

/** «حسب الترتيب / الأهم أولاً»: the phone's list is the only place where the order is a choice. */
export function OrderToggle({ value, onChange }: { value: NoteOrder; onChange: (order: NoteOrder) => void }) {
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

/**
 * One line of the phone's list. There is no margin on a phone, so a note cannot sit beside its
 * words: it begins with them instead. No numbering.
 */
export function NoteRow({
  claim,
  card,
  onOpen,
}: {
  claim: ClaimStub
  card: Card | undefined
  onOpen: (claimId: string) => void
}) {
  const { t, pick } = useI18n()
  const state = card ? card.state : null

  const lines = (
    <>
      <span className="flex items-center gap-2">
        <StateGlyph state={state ?? 'pending'} />
        <span dir="auto" className="page-text h-[38px] min-w-0 truncate leading-[38px] text-ink">
          {t.notes.quote(claim.text_as_quoted)}
        </span>
      </span>
      <span className="block h-[22px] truncate ps-7 text-sm leading-[22px] text-quiet">
        <span className={cn(state && 'font-semibold', state && STATE_STYLE[state].ink)}>
          {state ? t.stateWords[state] : t.notes.pendingWord}
        </span>
        {card ? ` — ${referenceLine(card, t, pick(card.note_ar, card.note_en))}` : null}
      </span>
    </>
  )

  if (!card) {
    return (
      <li id={`note-${claim.id}`} data-note={claim.id} data-state="pending" aria-busy="true" className="py-3">
        <span className="sr-only">{t.card.pending}</span>
        {lines}
      </li>
    )
  }
  return (
    <li id={`note-${claim.id}`} data-note={claim.id} data-state={state}>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => onOpen(claim.id)}
        className="flex w-full items-center gap-2 py-3 text-start focus-visible:-outline-offset-2"
      >
        <span className="min-w-0 flex-1">{lines}</span>
        <ChevronLeft aria-hidden="true" className="size-4 shrink-0 text-quiet ltr:-scale-x-100" />
      </button>
    </li>
  )
}
