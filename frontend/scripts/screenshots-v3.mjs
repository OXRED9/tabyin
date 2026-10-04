#!/usr/bin/env node
/**
 * Design v3 captures ("the investigation, shown"): every state at three widths and in both
 * themes, into docs/screenshots/v3/<state>-<width>-<theme>.png. Mock mode, headless Chromium.
 * Start the dev server first (`npm run dev`), then `npm run screenshots`.
 *
 *   BASE_URL   where the app is served (default http://localhost:5173)
 *   ONLY       comma-separated state names to capture a subset, e.g. ONLY=empty,running
 *   WIDTHS     comma-separated widths, e.g. WIDTHS=390
 *   THEMES     comma-separated themes, e.g. THEMES=dark
 *
 * Reports are reached through mock mode's own route, `?mock=1&scenario=<name>&autorun=1`.
 * Reduced motion is on, so a capture shows a settled frame; `running` is taken mid-run, with the
 * mock at its real pace, when some steps have reported and others have not.
 *
 * Below 1280px a capture is the whole page, as a phone or a tablet scrolls it. From 1280px it is
 * the window, as the application is seen: the rail stays beside the workspace and the text pane
 * keeps its own scroll, which a whole-page capture would show cut off.
 */
import fs from 'node:fs'
import path from 'node:path'

import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const OUT = path.resolve(import.meta.dirname, '../../docs/screenshots/v3')
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
const WIDTHS = (process.env.WIDTHS ?? '390,820,1440').split(',').map(Number)
const THEMES = (process.env.THEMES ?? 'light,dark').split(',')
const HEIGHTS = { 390: 844, 820: 1180, 1440: 900 }
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const problems = []
const external = new Set()

async function open(width, theme, query = '') {
  const phone = width < 768
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
  await page.evaluate(() => document.fonts.ready)
  const shoot = async (file) => {
    // Under reduced motion things still fade into place: a settled capture waits for them.
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => undefined)),
      ),
    )
    // A whole-page capture is taken from the top, or the bar would be painted across the middle.
    if (width < 1280) await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: file, fullPage: width < 1280 })
  }
  return { context, page, phone, shoot }
}

/** A finished report of the full scenario (all five states, a referenced-evidence card, timestamps). */
async function openReport(width, theme, scenario = 'video') {
  const session = await open(width, theme, `&scenario=${scenario}&autorun=1&speed=10`)
  await session.page.getByTestId('verdict').waitFor({ timeout: 30_000 })
  await session.page.evaluate(() => document.fonts.ready)
  await session.page.waitForTimeout(350)
  return session
}

const STATES = {
  // The first screen: the hero, the composer as a command surface, what really works behind it.
  empty: async (width, theme, file) => {
    const { context, page, shoot } = await open(width, theme)
    await page.getByTestId('capabilities').waitFor()
    await page.mouse.move(0, 0)
    // The notes have dropped and settled.
    await page.waitForTimeout(400)
    await shoot(file)
    await context.close()
  },

  // Mid-investigation: the map (a timeline below 1024px) with some steps reported and others
  // still working, the text on the page, the first cards in.
  running: async (width, theme, file) => {
    const { context, page, shoot } = await open(width, theme, '&scenario=video&autorun=1&speed=1')
    await page.locator('[data-node="model"][data-status="done"]').waitFor({ timeout: 30_000 })
    await page.locator('[data-note][data-state]:not([data-state="pending"])').nth(2).waitFor({ timeout: 30_000 })
    await shoot(file)
    await context.close()
  },

  // The finished report: the verdict, the text with its passages marked, the evidence.
  report: async (width, theme, file) => {
    const { context, shoot } = await openReport(width, theme)
    await shoot(file)
    await context.close()
  },

  // An evidence card, open: its trail, then everything the note says (a narration quoted in part).
  'card-open': async (width, theme, file) => {
    const { context, page, shoot } = await openReport(width, theme)
    const card = page.locator('[data-note="c2"]')
    await card.locator('> button').click()
    await card.getByTestId('provenance').waitFor()
    await card.getByTestId('share-card').waitFor()
    // In the window: the open card from its head down.
    await card.evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await page.waitForTimeout(400)
    await shoot(file)
    await context.close()
  },

  // A question put to the tool: referred, never answered, with the search links in its card.
  question: async (width, theme, file) => {
    const { context, page, shoot } = await openReport(width, theme, 'question')
    await page.getByTestId('referral-links').waitFor()
    await page.waitForTimeout(300)
    await shoot(file)
    await context.close()
  },

  // Below 1024px one pane is shown at a time: the report with «النص» chosen.
  'text-pane': async (width, theme, file) => {
    if (width >= 1024) return false
    const { context, page, shoot } = await openReport(width, theme)
    await page.locator('[data-pane="text"]').click()
    await page.locator('[data-page]').first().waitFor()
    await page.waitForTimeout(300)
    await shoot(file)
    await context.close()
  },

  // From 1280px the rail can be put away: the first screen without it, re-centred.
  'rail-closed': async (width, theme, file) => {
    if (width < 1280) return false
    const { context, page, shoot } = await open(width, theme)
    await page.getByTestId('capabilities').waitFor()
    await page.getByTestId('rail-close').click()
    await page.getByTestId('rail-open').waitFor()
    await page.waitForTimeout(500)
    await page.mouse.move(0, 0)
    await shoot(file)
    await context.close()
  },

  // A clip that cannot be downloaded: what happened, what to do, and the buttons that do it.
  error: async (width, theme, file) => {
    const { context, page, shoot } = await open(width, theme, '&scenario=tiktok&autorun=1&speed=10')
    await page.getByRole('alert').waitFor({ timeout: 15_000 })
    await page.waitForTimeout(200)
    await shoot(file)
    await context.close()
  },
}

for (const [name, capture] of Object.entries(STATES)) {
  if (only && !only.has(name)) continue
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      const label = `${name}-${width}-${theme}`
      const started = Date.now()
      try {
        const taken = await capture(width, theme, path.join(OUT, `${label}.png`))
        if (taken !== false) console.log(`✓ ${label} (${Date.now() - started} ms)`)
      } catch (error) {
        problems.push(`${label}: ${error.message.split('\n')[0]}`)
        console.log(`✗ ${label}: ${error.message.split('\n')[0]}`)
      }
    }
  }
}

await browser.close()

if (external.size > 0) problems.push(`requests left the origin: ${[...external].join(', ')}`)
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n- ${[...new Set(problems)].join('\n- ')}`)
  process.exit(1)
}
console.log(`\nScreenshots written to ${OUT}. No console errors, no external requests.`)
