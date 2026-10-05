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
  /** The site has no search address: the link opens its search page, and these are the words to type. */
  typeWords: string | null
  host: string
}

/** The encyclopedia is ordered by term: the words to type are the topic's terms, without "ruling",
 *  question words or particles ("حكم القزع في الشعر" → "القزع الشعر"). */
const NOT_A_TERM = new Set(['حكم', 'ما', 'ماحكم', 'هل', 'في', 'من', 'على', 'عن', 'إلى', 'الى', 'يجوز', 'يجب', 'وهل', 'كيف', 'متى'])
function termOf(topic: string[]): string | null {
  const terms = topic.filter((word) => !NOT_A_TERM.has(word.replace(/[؟?،,.]/g, '')))
  return terms.length > 0 ? terms.slice(0, 2).join(' ') : null
}

export function referralTargets(meta: Meta | null, query: string | null | undefined, lang: UiLang): ReferralTarget[] {
  const topic = (query ?? '').trim().split(/\s+/).filter(Boolean)
  return (meta?.referral_links ?? [])
    .filter((link) => link.kind === undefined || link.kind === 'fatwa')
    .flatMap((link) => {
      const picked = topic.slice(0, Math.max(0, link.max_words ?? 0)).join(' ')
      const words = link.search_url ? picked : ''
      const href = safeHref(words && link.search_url ? link.search_url.replace('{q}', encodeURIComponent(words)) : link.url)
      if (!href) return []
      const host = new URL(href).hostname.replace(/^www\./, '')
      return [{ name: lang === 'ar' ? link.name_ar : link.name_en, href, words: words || null, typeWords: !link.search_url ? termOf(topic) : null, host }]
    })
}
