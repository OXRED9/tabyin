import { ExternalLink } from 'lucide-react'

import { useI18n } from '@/lib/i18n'
import { referralTargets } from '@/lib/referral'
import type { Meta, ReferralMatch } from '@/lib/types'

/**
 * Where a question, a disputed matter or a personal case is sent: the four references the
 * challenge's package names for rulings. First, when one was found, the nearest page on a scholar's
 * site, matched by its title on our server (the question is not sent anywhere); then each site's
 * own search for the topic words, and the Kuwaiti encyclopedia's search page with the words to type.
 * Tabayyun shows nothing of a fatwa but its title, and prefers none.
 */
export function ReferralLinks({
  meta,
  query,
  matches = [],
}: {
  meta: Meta | null
  query: string | null | undefined
  matches?: ReferralMatch[]
}) {
  const { t, lang } = useI18n()
  const targets = referralTargets(meta, query, lang)
  if (targets.length === 0 && matches.length === 0) return <p className="text-sm text-quiet">{t.referral.empty}</p>
  const searching = targets.some((target) => target.words || target.typeWords)
  return (
    <div data-testid="referral-links" className="space-y-3">
      {matches.length > 0 ? (
        <section className="space-y-1">
          <h5 className="text-sm font-semibold text-ink">{t.referral.nearest}</h5>
          <ul className="space-y-2">
            {matches.map((match) => (
              <li key={match.url}>
                <a
                  href={match.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="referral-match"
                  className="group flex items-center gap-3 rounded-control border border-green/30 bg-supported-soft/50 p-3 focus-visible:-outline-offset-2"
                >
                  <span className="min-w-0 flex-1">
                    <span lang="ar" dir="rtl" className="block text-base font-semibold text-green underline decoration-green/40 underline-offset-4 group-hover:decoration-green">
                      «{match.title}»
                    </span>
                    <span className="block text-sm text-quiet">{lang === 'ar' ? match.site_ar : match.site_en}</span>
                  </span>
                  <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-quiet rtl:-scale-x-100" />
                  <span className="sr-only">{t.opensInNewTab}</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="text-xs text-quiet">{t.referral.nearestNote}</p>
        </section>
      ) : null}
      {searching ? <p className="text-sm text-quiet">{t.referral.searchNote}</p> : null}
      <ul className="divide-y border-y">
        {targets.map((target) => (
          <li key={target.href}>
            <a
              href={target.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 py-3 focus-visible:-outline-offset-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-base text-green underline decoration-green/40 underline-offset-4 group-hover:decoration-green">
                  {target.words ? t.referral.searchFor(target.words, target.name) : target.name}
                </span>
                {target.typeWords ? (
                  <span className="block text-sm text-quiet">{t.referral.typeThere(target.typeWords)}</span>
                ) : null}
                <span className="block truncate text-sm text-quiet" dir="ltr">
                  {target.host}
                </span>
              </span>
              <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-quiet rtl:-scale-x-100" />
              <span className="sr-only">{t.opensInNewTab}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
