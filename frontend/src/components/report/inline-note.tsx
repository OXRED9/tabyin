import NoteBody from '@/components/report/note-body'
import type { NoteBodyProps } from '@/components/report/note-body'
import { StateWord } from '@/components/state-badge'
import { useI18n } from '@/lib/i18n'
import { referenceWhenOpen } from '@/lib/reference-line'
import { STATE_STYLE } from '@/lib/states'
import { cn } from '@/lib/utils'

/**
 * A report with exactly one claim answers first: below 1024px its note is not a row to tap but
 * the open note itself, set directly under the text. It is the body the sheet shows, bounded by
 * the state's bar as an open margin note is.
 */
export default function InlineNote(body: Omit<NoteBodyProps, 'showQuoted'>) {
  const { t } = useI18n()
  const { card } = body
  const state = card.state
  const reference = referenceWhenOpen(card, t)
  return (
    <article
      id={`note-${card.id}`}
      data-note={card.id}
      data-state={state}
      data-open=""
      aria-label={`${t.stateWords[state]}: ${card.text_as_quoted}`}
      className={cn('scroll-mt-16 border-s-2 ps-3', STATE_STYLE[state].tick)}
    >
      <p className="flex flex-wrap items-center gap-x-2">
        <StateWord state={state} className="text-base" />
        <span className="text-sm text-ink">— {t.claimTypes[card.claim_type]}</span>
      </p>
      {reference ? <p className="text-sm text-quiet">{reference}</p> : null}
      <div className="h-3" />
      {/* Its words are right above, underlined: they are repeated only for a claim with no place in the text. */}
      <NoteBody {...body} showQuoted={!card.span} />
    </article>
  )
}
