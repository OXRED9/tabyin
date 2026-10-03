/**
 * The UI copy, one module per language. Arabic is the default and is part of the page's own code;
 * English is fetched only when it is the language in use (`dictionary.en.ts`).
 */
import { ar } from './dictionary.ar'
import type { Dictionary } from './dictionary.ar'
import type { UiLang } from './types'

export type { Dictionary }

const loaded: Partial<Record<UiLang, Dictionary>> = { ar }

/** The dictionary for a language, if it is already here. */
export const dictionaryFor = (lang: UiLang): Dictionary | undefined => loaded[lang]

/** Fetch a language's dictionary (a no-op for one that is already here). */
export async function loadDictionary(lang: UiLang): Promise<Dictionary> {
  const ready = loaded[lang]
  if (ready) return ready
  const { en } = await import('./dictionary.en')
  loaded.en = en
  return en
}
