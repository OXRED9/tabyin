#!/usr/bin/env node
/**
 * Motion, looked at: frame sequences with motion ON (no reduced-motion emulation), because a
 * settled capture cannot show whether anything moves. About eight frames, 250 ms apart, of
 *   home     the first screen loading (the headline's underline, the notes dropping)
 *   finish   a report's last moments (the stage giving way to the verdict, the tiles counting,
 *            the cards rising, the seal)
 * at 390 and 1440, laid side by side as one sheet per sequence in docs/screenshots/v3/frames/.
 * `REDUCED=1` takes the same sequences under prefers-reduced-motion, to see that it is not dead.
 *
 *   BASE_URL   where the app is served (default http://localhost:5173); mock mode only
 */
import fs from 'node:fs'
import path from 'node:path'

import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const REDUCED = process.env.REDUCED === '1'
const OUT = path.resolve(import.meta.dirname, '../../docs/screenshots/v3/frames')
const FRAMES = 8
const STEP = 250
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()

async function sequence(name, width, height, query, start) {
  const phone = width < 768
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: phone,
    hasTouch: phone,
    reducedMotion: REDUCED ? 'reduce' : 'no-preference',
    locale: 'ar-SA',
  })
  const page = await context.newPage()
  await page.goto(`${BASE}/?mock=1${query}`, { waitUntil: 'commit' })
  await start(page)
  const began = Date.now()
  const frames = []
  for (let i = 0; i < FRAMES; i++) {
    const due = began + i * STEP
    if (Date.now() < due) await page.waitForTimeout(due - Date.now())
    const at = Date.now() - began
    frames.push({ at, data: (await page.screenshot({ type: 'jpeg', quality: 80 })).toString('base64') })
  }
  await context.close()

  // The sheet: the frames in a row (two rows where the window is wide), each with its time.
  const columns = phone ? FRAMES : 4
  const scale = phone ? 0.6 : 0.42
  const sheet = await browser.newPage({ viewport: { width: Math.ceil(width * scale * columns + 16 * (columns + 1)), height: 600 } })
  await sheet.setContent(
    `<body style="margin:0;padding:16px;background:#222;display:grid;grid-template-columns:repeat(${columns},max-content);gap:16px;font:13px monospace;color:#ddd">${frames
      .map((f) => `<figure style="margin:0"><img src="data:image/jpeg;base64,${f.data}" width="${Math.round(width * scale)}"><figcaption>+${f.at} ms</figcaption></figure>`)
      .join('')}</body>`,
  )
  const file = path.join(OUT, `${name}-${width}${REDUCED ? '-reduced' : ''}.jpg`)
  await sheet.screenshot({ path: file, fullPage: true, type: 'jpeg', quality: 82 })
  await sheet.close()
  console.log(`✓ ${path.basename(file)} (${frames.map((f) => f.at).join(', ')} ms)`)
}

for (const [width, height] of [
  [390, 844],
  [1440, 900],
]) {
  // The first screen, from the first paint.
  await sequence('home', width, height, '', async (page) => {
    await page.waitForSelector('#root', { state: 'attached' })
  })
  // A report's finish: from the moment the rules begin to decide.
  await sequence('finish', width, height, '&scenario=text&autorun=1&speed=3', async (page) => {
    await page.locator('[data-node="rules"]:not([data-status="waiting"])').first().waitFor({ timeout: 30_000 })
  })
}

await browser.close()
console.log(`\nFrame sheets written to ${OUT}.`)
