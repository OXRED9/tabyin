import { ExternalLink } from 'lucide-react'

import { useI18n } from '@/lib/i18n'
import { referralTargets } from '@/lib/referral'
import type { Meta } from '@/lib/types'

/**
 * Where a question, a disputed matter or a personal case is sent: the approved fatwa sites, in
 * the order the server gives them. With topic words each link opens that site's own search for
 * them (as many words as the site's search answers); without, the site's first page. Tabayyun
 * fetches nothing from these sites and prefers none, and the line above the links says so.
 */
export function ReferralLinks({ meta, query }: { meta: Meta | null; query: string | null | undefined }) {
  const { t, lang } = useI18n()
  const targets = referralTargets(meta, query, lang)
  if (targets.length === 0) return <p className="text-sm text-quiet">{t.referral.empty}</p>
  const searching = targets.some((target) => target.words)
  return (
    <div data-testid="referral-links" className="space-y-2">
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
                <span className="block truncate text-sm text-quiet" dir="ltr">
                  {new URL(target.href).hostname.replace(/^www\./, '')}
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
