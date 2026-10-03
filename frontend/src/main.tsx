import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { dictionaryFor, loadDictionary } from './lib/dictionary'
import { initialLang } from './lib/lang'
import { initPwa } from './lib/pwa'

/*
 * index.html links the stylesheet and paints a static shell (the bar, the sheet, the headline)
 * before this file runs; the first render replaces it with the same thing, alive. Only the language in use is loaded:
 * Arabic is part of this bundle, English is fetched first when it is the stored choice.
 */
function start() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

initPwa()

const lang = initialLang()
if (dictionaryFor(lang)) start()
else void loadDictionary(lang).then(start, start)
