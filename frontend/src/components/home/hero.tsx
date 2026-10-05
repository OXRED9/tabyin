import { BookOpenText, GraduationCap, Library, LibraryBig, ScrollText, Sparkles } from 'lucide-react'
import type { CSSProperties } from 'react'

import { useMediaQuery } from '@/hooks/use-media-query'
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
      <p className="max-w-[36rem] pt-1 text-base text-balance text-quiet md:pt-2 md:text-lg">{t.input.label}</p>
    </div>
  )
}

interface Engine {
  id: string
  icon: typeof BookOpenText
  figure: string
  unit: string | null
  title: string
  line: string
}

/**
 * What really works behind the page, as four cards in the product's own style — the same panel
 * as the composer: an icon, one loud figure, a title, one quiet line. The Mushaf text, the
 * narration index, the models (by their roles and their number — never their names), and where
 * gradings come from. Every figure is read from `meta.engines`; nothing is drawn until the server
 * has answered.
 *
 * A sticky column beside the centre from 1280px, two by two under the composer on a tablet, and
 * on a phone a row that scrolls sideways with the next card peeking.
 */
export function EngineCards({ engines, className }: { engines: Engines | undefined; className?: string }) {
  const { t } = useI18n()
  // On a phone the row scrolls, so it must be reachable by keyboard; wider, it is plain content.
  const scrolls = !useMediaQuery('(min-width: 768px)')
  const h = t.hero
  if (!engines) return <div aria-hidden="true" className={cn('min-h-[10rem] md:min-h-[17rem] xl:min-h-0', className)} />

  const roles = [
    engines.models.extract ? h.models.extractVerb : null,
    engines.models.vision ? h.models.visionVerb : null,
    engines.models.audio ? h.models.audioVerb : null,
  ].filter((role): role is string => !!role)
  const cards: Engine[] = [
    {
      id: 'mushaf',
      icon: BookOpenText,
      figure: count(engines.quran_verses),
      unit: h.units.verse,
      title: h.mushaf.title,
      line: h.mushaf.body,
    },
    {
      id: 'index',
      icon: Library,
      figure: count(engines.graded_narrations + engines.book_narrations),
      unit: h.units.narration,
      title: h.index.title,
      line: h.index.body(count(engines.graded_narrations), count(engines.book_narrations)),
    },
    {
      id: 'models',
      icon: Sparkles,
      figure: String(roles.length),
      unit: h.models.unit(roles.length),
      title: h.models.title,
      line: roles.length > 0 ? `${roles.join(h.models.join)}. ${h.models.propose}` : h.models.none,
    },
    {
      id: 'gradings',
      icon: ScrollText,
      figure: engines.live_gradings ? h.gradings.liveWord : h.gradings.storedWord,
      unit: null,
      title: h.gradings.title,
      line: engines.live_gradings ? h.gradings.live : h.gradings.stored,
    },
    {
      id: 'shamela',
      icon: LibraryBig,
      figure: h.shamela.figure,
      unit: h.shamela.unit,
      title: h.shamela.title,
      line: h.shamela.body,
    },
    {
      id: 'referral',
      icon: GraduationCap,
      figure: '4',
      unit: h.referral.unit,
      title: h.referral.title,
      line: h.referral.body,
    },
  ]

  return (
    <section aria-label={h.enginesTitle} data-testid="capabilities" className={className}>
      <ul
        tabIndex={scrolls ? 0 : undefined}
        aria-label={scrolls ? h.enginesTitle : undefined}
        className="scroll-row -mx-4 flex snap-x snap-mandatory gap-3 px-4 pb-3 md:mx-0 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:px-0 md:pb-0 xl:flex xl:flex-col xl:gap-2"
      >
        {cards.map((card, i) => {
          const Icon = card.icon
          return (
            <li
              key={card.id}
              data-engine={card.id}
              style={{ '--i': i * 2 } as CSSProperties}
              className="panel cascade flex w-[78%] shrink-0 snap-center gap-3 p-4 md:w-auto xl:px-3.5 xl:py-2"
            >
              <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-control bg-raised text-green xl:size-8">
                <Icon className="size-[18px]" />
              </span>
              <div className="min-w-0">
                {/* The figure is the one loud thing on the card. */}
                {/* In the desktop column the six cards are compact: the line in two lines (whole on
                    hover and to a screen reader). */}
                <p className="flex items-baseline gap-1.5">
                  <span className="tabular text-[1.75rem] leading-none font-semibold text-figure xl:text-[1.375rem]">{card.figure}</span>
                  {card.unit ? <span className="text-sm text-quiet">{card.unit}</span> : null}
                </p>
                <p className="pt-1.5 text-base font-semibold text-ink xl:pt-0.5">{card.title}</p>
                <p title={card.line} className="text-sm text-quiet xl:line-clamp-2 xl:pt-1">{card.line}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
