/**
 * Referral links: where a question, a disputed matter or a personal case is sent. Only the
 * approved fatwa sites are offered, in the order the server gives them. A link opens the site's
 * own search for a few topic words; Tabayyun fetches nothing from these sites and prefers none.
 */
import { safeHref } from './format'
import type { Meta, UiLang } from './types'

export interface ReferralTarget {
  name: string
  href: string
  /** The words the link searches for; null when it opens the site's first page. */
  words: string | null
}

export function referralTargets(meta: Meta | null, query: string | null | undefined, lang: UiLang): ReferralTarget[] {
  const topic = (query ?? '').trim().split(/\s+/).filter(Boolean)
  return (meta?.referral_links ?? [])
    .filter((link) => link.kind === undefined || link.kind === 'fatwa')
    .flatMap((link) => {
      const words = link.search_url && topic.length > 0 ? topic.slice(0, Math.max(0, link.max_words ?? 0)).join(' ') : ''
      const href = safeHref(words && link.search_url ? link.search_url.replace('{q}', encodeURIComponent(words)) : link.url)
      return href ? [{ name: lang === 'ar' ? link.name_ar : link.name_en, href, words: words || null }] : []
    })
}
