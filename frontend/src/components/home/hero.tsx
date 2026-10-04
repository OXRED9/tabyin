import { BookOpenText, Library, ScrollText, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'

import { useI18n } from '@/lib/i18n'
import type { Engines } from '@/lib/types'

const count = (n: number) => n.toLocaleString('en-US')

function EngineCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="panel flex min-w-0 flex-col gap-1 p-4">
      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
        {icon}
        {title}
      </span>
      <span className="text-sm text-quiet">{children}</span>
    </li>
  )
}

/**
 * Under the composer on the first screen: what the tool really holds and what really works behind
 * it, read from `meta.engines` — the size of the Mushaf text and of the narration index, the
 * models by their ids (or that none is enabled), and where gradings come from. Nothing here is
 * a slogan: every figure and every name is the server's. Not drawn until the server has answered.
 */
export function Capabilities({ engines }: { engines: Engines | undefined }) {
  const { t } = useI18n()
  if (!engines) return <div className="min-h-[18rem] md:min-h-[11rem]" aria-hidden="true" />
  const narrations = engines.graded_narrations + engines.book_narrations
  const models: [string, string | null][] = [
    [t.hero.models.extract, engines.models.extract],
    [t.hero.models.vision, engines.models.vision],
    [t.hero.models.audio, engines.models.audio],
  ]
  const enabled = models.filter(([, id]) => id)
  return (
    <section aria-label={t.hero.enginesTitle} data-testid="capabilities" className="animate-rise space-y-4">
      <p className="tabular flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-quiet">
        <span className="font-semibold text-figure">{t.hero.verses(count(engines.quran_verses))}</span>
        <span aria-hidden="true">·</span>
        <span className="font-semibold text-figure">{t.hero.narrations(count(narrations))}</span>
        <span aria-hidden="true">·</span>
        <span>{t.hero.algorithmic}</span>
        <span aria-hidden="true">·</span>
        <span>{t.hero.verbatim}</span>
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <EngineCard icon={<BookOpenText aria-hidden="true" className="size-4 text-green" />} title={t.hero.mushaf.title}>
          {t.hero.mushaf.body}
        </EngineCard>
        <EngineCard icon={<Library aria-hidden="true" className="size-4 text-green" />} title={t.hero.index.title}>
          {t.hero.index.body(count(engines.graded_narrations), count(engines.book_narrations))}
        </EngineCard>
        <EngineCard icon={<Sparkles aria-hidden="true" className="size-4 text-green" />} title={t.hero.models.title}>
          {enabled.length === 0 ? (
            t.hero.models.none
          ) : (
            <span className="block space-y-0.5">
              {enabled.map(([label, id]) => (
                <span key={label} className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span>{label}</span>
                  <bdi dir="ltr" className="tabular text-ink">
                    {id}
                  </bdi>
                </span>
              ))}
            </span>
          )}
        </EngineCard>
        <EngineCard icon={<ScrollText aria-hidden="true" className="size-4 text-green" />} title={t.hero.gradings.title}>
          {engines.live_gradings ? t.hero.gradings.live : t.hero.gradings.stored}
        </EngineCard>
      </ul>
      <p className="text-sm text-quiet">{t.hero.rules}</p>
    </section>
  )
}
