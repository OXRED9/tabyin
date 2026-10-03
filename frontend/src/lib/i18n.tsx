import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { dictionaryFor, loadDictionary } from './dictionary'
import type { Dictionary } from './dictionary'
import { LANG_KEY, initialLang } from './lang'
import { writeStored } from './storage'
import type { UiLang } from './types'

interface I18nValue {
  lang: UiLang
  dir: 'rtl' | 'ltr'
  t: Dictionary
  setLang: (lang: UiLang) => void
  /** Pick the Arabic or English variant of a bilingual API field, falling back to the other. */
  pick: (arabic: string | null | undefined, english: string | null | undefined) => string
}

const I18nContext = createContext<I18nValue | null>(null)

/** The language on screen and its words always change together. */
function initial(): { lang: UiLang; t: Dictionary } {
  const lang = initialLang()
  const t = dictionaryFor(lang)
  // main.tsx loads the initial language before it renders; Arabic is the fallback if that failed.
  return t ? { lang, t } : { lang: 'ar', t: dictionaryFor('ar')! }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [{ lang, t }, setCurrent] = useState(initial)
  const dir = lang === 'ar' ? 'rtl' : 'ltr'

  useEffect(() => {
    const root = document.documentElement
    root.lang = lang
    root.dir = dir
    document.title =
      lang === 'ar' ? 'تبيّن — تحقّق قبل أن تصدّق أو تنشر' : 'Tabayyun — verify before you believe or share'
  }, [lang, dir])

  // Only the language in use is loaded: the other one is fetched when it is chosen.
  const setLang = useCallback((next: UiLang) => {
    writeStored(LANG_KEY, next)
    void loadDictionary(next).then(
      (words) => setCurrent({ lang: next, t: words }),
      () => {
        /* Offline: the page stays in the language it has. */
      },
    )
  }, [])

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      dir,
      t,
      setLang,
      pick: (arabic, english) =>
        (lang === 'ar' ? arabic || english : english || arabic) ?? '',
    }),
    [lang, dir, t, setLang],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>')
  return value
}
