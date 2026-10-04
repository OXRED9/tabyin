import type { CSSProperties } from 'react'

import { useI18n } from '@/lib/i18n'
import type { Engines } from '@/lib/types'
import { cn } from '@/lib/utils'

const count = (n: number) => n.toLocaleString('en-US')

/**
 * The first screen's one loud thing: the word in the display Naskh, with the tool's own gesture
 * under it — an underline, inked once, in gold. What follows the dash is said quietly beneath.
 */
export function Headline({ className }: { className?: string }) {
  const { t } = useI18n()
  const [lead, ...rest] = t.headline.split(' — ')
  const tail = rest.join(' — ')
  return (
    <div className={className}>
      <h1 className="naskh-display text-ink">
        <span
          className={cn(
            'relative inline-block text-green',
            tail ? 'text-[3.25rem] leading-[1.4] md:text-[4.5rem] xl:text-[5.25rem]' : 'text-[2.25rem] leading-[1.3] md:text-[3.25rem]',
          )}
        >
          {lead}
          <svg aria-hidden="true" viewBox="0 0 200 12" preserveAspectRatio="none" className="absolute inset-x-0 bottom-[0.06em] h-[0.16em] w-full text-gold">
            <path d="M3 8 C 44 2, 96 11, 197 5" pathLength={1} fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" className="headline-ink" />
          </svg>
        </span>
        {tail ? <span className="block text-[1.6rem] leading-normal md:text-[2.1rem]">{tail}</span> : null}
      </h1>
      <p className="pt-1 text-base text-quiet md:pt-2 md:text-lg">{t.input.label}</p>
    </div>
  )
}

interface Note {
  id: string
  tint: string
  tilt: number
  held: 'tape' | 'pin'
  figure: string
  unit: string | null
  title: string
  line: string
}

/**
 * What really works behind the page, as four paper notes: the Mushaf text, the narration index,
 * the models (by their roles and their number — never their names), and where gradings come from.
 * Every figure is read from `meta.engines`; nothing is drawn until the server has answered.
 *
 * A sticky column beside the centre from 1280px, two by two under the composer on a tablet, and
 * on a phone a row that scrolls sideways with the next note peeking.
 */
export function EngineNotes({ engines, className }: { engines: Engines | undefined; className?: string }) {
  const { t } = useI18n()
  const h = t.hero
  if (!engines) return <div aria-hidden="true" className={cn('min-h-[11.5rem] md:min-h-[22rem] xl:min-h-0', className)} />

  const roles = [
    engines.models.extract ? h.models.extractVerb : null,
    engines.models.vision ? h.models.visionVerb : null,
    engines.models.audio ? h.models.audioVerb : null,
  ].filter((role): role is string => !!role)
  const notes: Note[] = [
    {
      id: 'mushaf',
      tint: 'var(--note-mint)',
      tilt: -2,
      held: 'tape',
      figure: count(engines.quran_verses),
      unit: h.units.verse,
      title: h.mushaf.title,
      line: h.mushaf.body,
    },
    {
      id: 'index',
      tint: 'var(--note-gold)',
      tilt: 1.5,
      held: 'pin',
      figure: count(engines.graded_narrations + engines.book_narrations),
      unit: h.units.narration,
      title: h.index.title,
      line: h.index.body(count(engines.graded_narrations), count(engines.book_narrations)),
    },
    {
      id: 'models',
      tint: 'var(--note-sage)',
      tilt: -1,
      held: 'tape',
      figure: String(roles.length),
      unit: h.models.unit(roles.length),
      title: h.models.title,
      line: roles.length > 0 ? `${roles.join(h.models.join)}. ${h.models.propose}` : h.models.none,
    },
    {
      id: 'gradings',
      tint: 'var(--note-paper)',
      tilt: 2,
      held: 'pin',
      figure: engines.live_gradings ? h.gradings.liveWord : h.gradings.storedWord,
      unit: null,
      title: h.gradings.title,
      line: engines.live_gradings ? h.gradings.live : h.gradings.stored,
    },
  ]

  return (
    <section aria-label={h.enginesTitle} data-testid="capabilities" className={className}>
      <ul className="scroll-row -mx-4 flex snap-x snap-mandatory gap-5 px-5 pt-4 pb-7 md:mx-0 md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-9 md:overflow-visible md:px-3 xl:flex xl:flex-col xl:gap-[clamp(1.1rem,3.2vh,2.25rem)] xl:px-1 xl:pb-4">
        {notes.map((note, i) => (
          <li
            key={note.id}
            // Reachable by keyboard: the row scrolls on a phone, and a note that takes the focus lifts.
            tabIndex={0}
            data-note-id={note.id}
            data-held={note.held}
            style={{ '--tilt': `${note.tilt}deg`, '--i': i, '--note-tint': note.tint } as CSSProperties}
            className="sticky-note w-[74%] shrink-0 snap-center px-4 pt-6 pb-4 focus-visible:outline-offset-4 md:w-auto xl:pt-5 xl:pb-3.5"
          >
            <p className="flex items-baseline gap-2">
              <span className={cn('tabular leading-none font-semibold', note.unit ? 'text-[2.1rem]' : 'naskh-display text-[2.3rem]')}>{note.figure}</span>
              {note.unit ? <span className="text-sm text-(--note-quiet)">{note.unit}</span> : null}
            </p>
            <p className="pt-2 text-base font-semibold">{note.title}</p>
            <p className="text-sm text-(--note-quiet)">{note.line}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
