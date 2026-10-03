import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { dictionaries } from './dictionary'
import type { Dictionary } from './dictionary'
import { readStored, writeStored } from './storage'
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

const LANG_KEY = 'tabayyun.lang'

function initialLang(): UiLang {
  const fromUrl = new URLSearchParams(window.location.search).get('lang')
  if (fromUrl === 'ar' || fromUrl === 'en') return fromUrl
  const stored = readStored<string>(LANG_KEY, '')
  return stored === 'en' ? 'en' : 'ar'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<UiLang>(initialLang)
  const dir = lang === 'ar' ? 'rtl' : 'ltr'

  useEffect(() => {
    const root = document.documentElement
    root.lang = lang
    root.dir = dir
    document.title =
      lang === 'ar' ? 'تبيّن — تحقّق قبل أن تصدّق أو تنشر' : 'Tabayyun — verify before you believe or share'
  }, [lang, dir])

  const setLang = useCallback((next: UiLang) => {
    setLangState(next)
    writeStored(LANG_KEY, next)
  }, [])

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      dir,
      t: dictionaries[lang],
      setLang,
      pick: (arabic, english) =>
        (lang === 'ar' ? arabic || english : english || arabic) ?? '',
    }),
    [lang, dir, setLang],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>')
  return value
}
