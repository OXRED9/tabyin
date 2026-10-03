import { readStored } from './storage'
import type { UiLang } from './types'

export const LANG_KEY = 'tabayyun.lang'

/** `?lang=` wins, then the stored choice, then Arabic. The inline script in index.html does the same before first paint. */
export function initialLang(): UiLang {
  const fromUrl = new URLSearchParams(window.location.search).get('lang')
  if (fromUrl === 'ar' || fromUrl === 'en') return fromUrl
  const stored = readStored<string>(LANG_KEY, '')
  return stored === 'en' ? 'en' : 'ar'
}
