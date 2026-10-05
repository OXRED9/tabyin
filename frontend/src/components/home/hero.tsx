import { BookOpenText, GraduationCap, Library, LibraryBig, ScrollText, Sparkles } from 'lucide-react'
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
 * What really works behind the page, as six cards in the product's own style — the same panel
 * as the composer: an icon, one loud figure, a title, one quiet line. The Mushaf text, the
 * narration index, the models (by their roles and their number — never their names), and where
 * gradings come from. Every figure is read from `meta.engines`; nothing is drawn until the server
 * has answered.
 *
 * A sticky column beside the centre from 1280px, two by two under the composer on a tablet, and
 * below that an endless glass ribbon that drifts sideways.
 */
export function EngineCards({ engines, className }: { engines: Engines | undefined; className?: string }) {
  const { t } = useI18n()
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

  // An endless glass ribbon: the cards drift on their own (up the column from 1280px, sideways
  // below), twice over so the loop never shows a seam. The second copy is for the eye only. It
  // stops under the pointer or the keyboard, and stands still with reduced motion.
  const item = (card: Engine, copy: boolean) => {
    const Icon = card.icon
    return (
      <li key={`${copy ? 'b' : 'a'}-${card.id}`} data-engine={copy ? undefined : card.id} aria-hidden={copy || undefined} className="glass-card">
        <span aria-hidden="true" className="glass-icon">
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="flex items-baseline gap-1.5">
            <span className="tabular text-[1.6rem] leading-none font-semibold text-figure">{card.figure}</span>
            {card.unit ? <span className="text-sm text-quiet">{card.unit}</span> : null}
          </p>
          <p className="pt-1 text-base font-semibold text-ink">{card.title}</p>
          <p className="text-sm text-quiet">{card.line}</p>
        </div>
      </li>
    )
  }
  return (
    <section aria-label={h.enginesTitle} data-testid="capabilities" className={cn('glass-stage', className)}>
      <span aria-hidden="true" className="glass-glow" />
      <div className="glass-window" tabIndex={0} aria-label={h.enginesTitle}>
        <ul className="glass-track" style={{ '--n': cards.length } as CSSProperties}>
          {cards.map((card) => item(card, false))}
          {cards.map((card) => item(card, true))}
        </ul>
      </div>
    </section>
  )
}
