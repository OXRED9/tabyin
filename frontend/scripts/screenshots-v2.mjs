#!/usr/bin/env node
/**
 * Design v2 captures: every state at three widths, into docs/screenshots/v2/<state>-<width>.png.
 * Mock mode, headless Chromium. Start the dev server first (`npm run dev`), then
 * `npm run screenshots:v2`.
 *
 *   BASE_URL   where the app is served (default http://localhost:5173)
 *   ONLY       comma-separated state names to capture a subset, e.g. ONLY=empty,error
 *   WIDTHS     comma-separated widths to capture a subset, e.g. WIDTHS=390
 *
 * Reports are reached through mock mode's own route, `?mock=1&scenario=<name>&autorun=1`, so no
 * state depends on a click sequence that a redesign could break. Reduced motion is on: the
 * captures show the settled page, not a frame of the one orchestrated moment.
 */
import fs from 'node:fs'
import path from 'node:path'

import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const OUT = path.resolve(import.meta.dirname, '../../docs/screenshots/v2')
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
const WIDTHS = (process.env.WIDTHS ?? '390,820,1440').split(',').map(Number)
const HEIGHTS = { 390: 844, 820: 1180, 1440: 900 }
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const problems = []
const external = new Set()

async function open(width, { theme = 'light', query = '' } = {}) {
  const phone = width < 768
  // Below 1024 a note opens as a bottom sheet; from 1024 up it opens in place, in the margin.
  const sheet = width < 1024
  const context = await browser.newContext({
    viewport: { width, height: HEIGHTS[width] ?? 900 },
    deviceScaleFactor: phone ? 2 : 1,
    isMobile: phone,
    hasTouch: phone,
    reducedMotion: 'reduce',
    locale: 'ar-SA',
  })
  const page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`)
  })
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (url.origin !== new URL(BASE).origin && !['data:', 'blob:'].includes(url.protocol)) external.add(r.url())
  })
  await page.goto(`${BASE}/?mock=1&theme=${theme}${query}`)
  // A sticky bar would be painted across a full-page capture wherever the page was scrolled to.
  await page.addStyleTag({ content: 'header.sticky{position:static!important}' })
  // Web fonts must be in before a screenshot, or Arabic renders in a fallback face.
  await page.evaluate(() => document.fonts.ready)
  return { context, page, phone, sheet }
}

/** A finished report of the full scenario (all five states, levels C and D, timestamps). */
async function openReport(width, options = {}) {
  const session = await open(width, { ...options, query: `&scenario=video&autorun=1&speed=10${options.query ?? ''}` })
  await session.page.getByText('اكتمل التحقق').first().waitFor({ timeout: 30_000 })
  await session.page.evaluate(() => document.fonts.ready)
  await session.page.waitForTimeout(350)
  return session
}

/** Open one claim's note: in place in the margin from 1024 up, as a bottom sheet below that. */
async function openNote({ page, phone, sheet }, id) {
  await page.locator(phone ? `li[data-note="${id}"] button` : `[data-margin] [data-note="${id}"] > button`).click()
  if (sheet) await page.locator(`[data-note-sheet="${id}"]`).waitFor()
  await page.waitForTimeout(400)
}

async function setReviewerMode({ page, phone }) {
  if (phone) {
    await page.getByRole('button', { name: 'المزيد' }).click()
    await page.getByRole('menuitemcheckbox', { name: 'وضع المراجع' }).click()
  } else {
    await page.getByRole('switch', { name: 'وضع المراجع' }).click()
  }
  await page.waitForTimeout(200)
}

const STATES = {
  empty: async (width, file) => {
    const { context, page } = await open(width)
    await page.getByText('جرّب:').waitFor()
    await page.screenshot({ path: file, fullPage: true })
    await context.close()
  },

  // The composer filled from the clip example: the link is recognised and confirmed by its tag.
  examples: async (width, file) => {
    const { context, page } = await open(width)
    await page.getByRole('button', { name: 'رابط مقطع يوتيوب' }).click()
    await page.getByTestId('link-tag').waitFor()
    // The tag pushed the «تحقّق» button under the pointer: move it away, or the button is captured hovered.
    await page.mouse.move(0, 0)
    await page.waitForTimeout(200)
    await page.screenshot({ path: file, fullPage: true })
    await context.close()
  },

  // Mid-run: the text is on the page, some notes have their verdict, the rest hold their place.
  processing: async (width, file) => {
    const { context, page } = await open(width, { query: '&scenario=video&autorun=1&speed=1' })
    await page.locator('[data-note][data-state]:not([data-state="pending"])').nth(1).waitFor({ timeout: 30_000 })
    await page.locator('[data-note][data-state="pending"]').first().waitFor({ timeout: 30_000 })
    await page.screenshot({ path: file, fullPage: true })
    await context.close()
  },

  report: async (width, file) => {
    const { context, page } = await openReport(width)
    await page.screenshot({ path: file, fullPage: true })
    await context.close()
  },

  // An expanded note with a source text: a narration quoted in part, with its collation.
  'note-open': async (width, file) => {
    const session = await openReport(width)
    await openNote(session, 'c2')
    await session.page.screenshot({ path: file, fullPage: !session.sheet })
    await session.context.close()
  },

  // Reviewer mode on, a note open, and a human change saved: both states are shown.
  reviewer: async (width, file) => {
    const session = await openReport(width)
    const { page, sheet } = session
    await setReviewerMode(session)
    await openNote(session, 'c5')
    const note = sheet ? page.locator('[data-note-sheet="c5"]') : page.locator('[data-margin] [data-note="c5"]')
    await note.getByLabel('اسم المراجع').fill('سليمان')
    await note.getByLabel('ملاحظة المراجع').fill('اللفظ صحيح المعنى، ويُصحَّح الترتيب قبل النشر.')
    await note.getByLabel('الحالة بعد المراجعة').click()
    await page.getByRole('menuitemradio', { name: 'مؤيَّد مع ملاحظة' }).click()
    await note.getByRole('button', { name: 'حفظ المراجعة' }).click()
    await page.getByText('حُفظت المراجعة').waitFor()
    // Let the toast leave: it would cover the bottom of the capture.
    await page.locator('[data-sonner-toast]').first().waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {})
    if (sheet) {
      // The note's sheet is the capture: scroll it to the reviewer's line.
      await note.getByRole('button', { name: 'حفظ المراجعة' }).scrollIntoViewIfNeeded()
    }
    await page.waitForTimeout(300)
    await page.screenshot({ path: file, fullPage: !sheet })
    await session.context.close()
  },

  'not-found': async (width, file) => {
    const session = await openReport(width)
    await openNote(session, 'c6')
    await session.page.screenshot({ path: file, fullPage: !session.sheet })
    await session.context.close()
  },

  // A clip that cannot be downloaded: what happened, what to do, and the buttons that do it.
  error: async (width, file) => {
    const { context, page } = await open(width, { query: '&scenario=tiktok&autorun=1&speed=10' })
    await page.getByRole('alert').waitFor({ timeout: 15_000 })
    await page.waitForTimeout(200)
    await page.screenshot({ path: file, fullPage: true })
    await context.close()
  },

  'dark-report': async (width, file) => {
    const { context, page } = await openReport(width, { theme: 'dark' })
    await page.screenshot({ path: file, fullPage: true })
    await context.close()
  },

  'dark-empty': async (width, file) => {
    const { context, page } = await open(width, { theme: 'dark' })
    await page.getByText('جرّب:').waitFor()
    await page.screenshot({ path: file, fullPage: true })
    await context.close()
  },
}

for (const [name, capture] of Object.entries(STATES)) {
  if (only && !only.has(name)) continue
  for (const width of WIDTHS) {
    const label = `${name}-${width}`
    const started = Date.now()
    try {
      await capture(width, path.join(OUT, `${label}.png`))
      console.log(`✓ ${label} (${Date.now() - started} ms)`)
    } catch (error) {
      problems.push(`${label}: ${error.message.split('\n')[0]}`)
      console.log(`✗ ${label}: ${error.message.split('\n')[0]}`)
    }
  }
}

await browser.close()

if (external.size > 0) problems.push(`external requests: ${[...external].join(', ')}`)
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log(`\nScreenshots written to ${OUT}. No console errors, no external requests.`)
