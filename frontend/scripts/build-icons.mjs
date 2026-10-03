#!/usr/bin/env node
/**
 * Draws the installable app's icons into public/icons/: the logotype «تبيّن» in Amiri, ink on
 * paper, as on the page. Run once (`npm run icons`) and commit the PNGs; run again only if the
 * logotype or the tokens change.
 *
 *   icon-192.png, icon-512.png     the logotype with a little air around it
 *   icon-maskable-512.png          the same on a full-bleed square, kept inside the safe zone
 *                                  (the middle 80%), because a launcher may cut it to any shape
 */
import fs from 'node:fs'
import path from 'node:path'

import { chromium } from 'playwright'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = path.join(ROOT, 'public/icons')
// The face is inlined: a page made with setContent may not read a font from a file:// address.
const FONT = `data:font/woff2;base64,${fs
  .readFileSync(path.join(ROOT, 'node_modules/@fontsource/amiri/files/amiri-arabic-400-normal.woff2'))
  .toString('base64')}`
// docs/DESIGN.md §2.1: paper and ink.
const PAPER = '#ffffff'
const INK = '#11221e'
fs.mkdirSync(OUT, { recursive: true })

const page = (size, textWidth) => `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
  @font-face { font-family: "Amiri"; src: url("${FONT}") format("woff2"); }
  html, body { margin: 0; }
  #icon { width: ${size}px; height: ${size}px; background: ${PAPER}; display: flex; align-items: center; justify-content: center; }
  #name { font-family: "Amiri"; color: ${INK}; line-height: 1; white-space: nowrap; font-size: 100px; }
</style></head><body><div id="icon"><span id="name">تبيّن</span></div>
<script>
  // Scale the word to the width it is given, whatever the face's metrics are.
  document.fonts.load('100px Amiri', 'تبيّن').then((faces) => {
    if (faces.length === 0) throw new Error('Amiri did not load')
    const name = document.getElementById('name')
    name.style.fontSize = (100 * ${textWidth} / name.getBoundingClientRect().width) + 'px'
    document.body.dataset.ready = '1'
  })
</script></body></html>`

const browser = await chromium.launch()
for (const [file, size, share] of [
  ['icon-192.png', 192, 0.62],
  ['icon-512.png', 512, 0.62],
  ['icon-maskable-512.png', 512, 0.46],
]) {
  const tab = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await tab.setContent(page(size, Math.round(size * share)))
  await tab.waitForSelector('body[data-ready]')
  await tab.locator('#icon').screenshot({ path: path.join(OUT, file) })
  await tab.close()
  console.log(`✓ ${file}`)
}
await browser.close()
