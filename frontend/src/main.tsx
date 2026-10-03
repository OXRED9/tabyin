import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import './index.css'

/*
 * Ask for the page's faces now rather than when the first text in each arrives. A report's text
 * and its notes then lay out once, in their own face, instead of in a fallback that is swapped
 * (and re-wrapped) a moment later. The sample has an Arabic letter, a space and a Latin letter,
 * so every subset a line of text needs is fetched.
 */
for (const face of ['400 20px Amiri', '700 20px Amiri', '400 26px "Amiri Quran"', '400 16px "IBM Plex Sans Arabic"', '500 16px "IBM Plex Sans Arabic"', '600 16px "IBM Plex Sans Arabic"']) {
  void document.fonts?.load(face, 'ب a').catch(() => undefined)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
