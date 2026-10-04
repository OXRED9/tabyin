#!/usr/bin/env node
/**
 * Design v2 captures: every state at three widths, into docs/screenshots/v2/<state>-<width>.png.
 * Mock mode, headless Chromium. Start the dev server first (`npm run dev`), then
 * `npm run screenshots:v2`.
 *
 *   BASE_URL   where the app is served (default http://localhost:5173)
 *   ONLY       comma-separated state names to capture a subset, e.g. ONLY=empty,error
 *              (`cards` stands for the verdict-card PNGs)
 *   WIDTHS     comma-separated widths to capture a subset, e.g. WIDTHS=390
 *              (`image-reading` and `image-read` are captured at 390 and 1440 only)
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

async function open(width, { theme = 'light', query = '', init = null } = {}) {
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
  if (init) await page.addInitScript(init)
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

/** The share dialog on the contradicted claim, opened from its note, in the given mode. */
async function openShareDialog(width, shareAs = null) {
  const session = await openReport(width, {
    init: () => {
      navigator.canShare = () => true
      navigator.share = async () => {}
    },
  })
  const { page } = session
  await openNote(session, 'c9')
  await page.locator('[data-note-sheet="c9"]').getByTestId('share-card').click()
  await page.getByTestId('share-targets').waitFor()
  if (shareAs) await page.getByTestId('share-as').getByRole('button', { name: shareAs, exact: true }).click()
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
  await page.getByTestId('share-targets').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  return session
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

  // F1: a picture is read first. While it is read, its row says so and «تحقّق» waits.
  'image-reading': async (width, file) => {
    const { context, page } = await open(width, { query: '&speed=0.25' })
    await page.getByRole('button', { name: 'صورة رسالة محوَّلة' }).click()
    await page.getByTestId('image-row').getByText('جارٍ قراءة الصورة…').waitFor()
    await page.mouse.move(0, 0)
    await page.waitForTimeout(200)
    await page.screenshot({ path: file, fullPage: true })
    await context.close()
  },

  // Then its text is in the field, editable: the unread word ringed and counted, the reading's
  // uncertainty said, and what was left out listed behind a disclosure.
  'image-read': async (width, file) => {
    const { context, page } = await open(width, { query: '&speed=4' })
    await page.getByRole('button', { name: 'صورة رسالة محوَّلة' }).click()
    await page.getByText('هذا ما قرأناه من الصورة').last().waitFor()
    await page.getByTestId('image-unread').waitFor()
    await page.mouse.move(0, 0)
    await page.waitForTimeout(300)
    await page.screenshot({ path: file, fullPage: true })
    await context.close()
  },

  // Exactly one claim: the answer is open without a tap. On a phone the note is set inline under
  // the text; at 1440 its margin note has opened by itself.
  'single-claim': async (width, file) => {
    const { context, page, sheet } = await open(width, { query: '&scenario=fabrication&autorun=1&speed=10' })
    await page.getByText('اكتمل التحقق').first().waitFor({ timeout: 30_000 })
    await page.locator(sheet ? 'article[data-note][data-open]' : '[data-margin] [data-note][data-open]').waitFor()
    await page.getByRole('button', { name: 'إحالة إلى أهل العلم' }).first().waitFor()
    await page.waitForTimeout(400)
    await page.screenshot({ path: file, fullPage: true })
    await context.close()
  },

  // A link shared to the installed app (`/?share=1`): it is routed and verification starts by
  // itself. Mock mode supplies the payload; the capture is taken while the run is under way.
  'share-link': async (width, file) => {
    const { context, page } = await open(width, { query: '&share=1&speed=1' })
    await page.locator('[data-note][data-state]:not([data-state="pending"])').first().waitFor({ timeout: 30_000 })
    await page.screenshot({ path: file })
    await context.close()
  },

  // After a first successful verification, the quiet offer to install, in the report's footer.
  'install-hint': async (width, file) => {
    const { context, page } = await openReport(width, { query: '&install=1' })
    await page.getByTestId('install-line').scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(300)
    await page.screenshot({ path: file })
    await context.close()
  },

  // The evidence a ruling points at: shown under its own title, with its reference and grading,
  // and no collation. The state stays «يحتاج مراجعة».
  referenced: async (width, file) => {
    const session = await openReport(width)
    await openNote(session, 'c8')
    await session.page.screenshot({ path: file, fullPage: !session.sheet })
    await session.context.close()
  },

  // A question put to the tool: referred, never answered. Its note is open without a tap, with
  // the search links on the approved scholars' sites right in it.
  question: async (width, file) => {
    const { context, page, sheet } = await open(width, { query: '&scenario=question&autorun=1&speed=10' })
    await page.getByText('اكتمل التحقق').first().waitFor({ timeout: 30_000 })
    await page.locator(sheet ? 'article[data-note][data-open]' : '[data-margin] [data-note][data-open]').waitFor()
    await page.getByTestId('referral-links').waitFor()
    await page.waitForTimeout(400)
    await page.screenshot({ path: file, fullPage: true })
    await context.close()
  },

  // «إحالة إلى أهل العلم» on a disputed matter: the approved fatwa sites, each opened on its own
  // search for the note's topic words.
  referral: async (width, file) => {
    const session = await openReport(width)
    const { page } = session
    await openNote(session, 'c7')
    await page.locator('[data-note-sheet="c7"]').getByRole('button', { name: 'إحالة إلى أهل العلم' }).click()
    await page.getByTestId('referral-dialog').waitFor()
    await page.waitForTimeout(400)
    await page.screenshot({ path: file })
    await session.context.close()
  },

  // F2 «الثابت في الباب»: a hadith with no reference, and under its note the accepted narrations
  // retrieved on the same subject, each with its reference, its grading and a copy button.
  alternatives: async (width, file) => {
    const session = await openReport(width)
    await openNote(session, 'c11')
    const section = session.page.getByTestId('alternatives')
    await section.waitFor()
    await section.scrollIntoViewIfNeeded()
    await session.page.waitForTimeout(300)
    await session.page.screenshot({ path: file, fullPage: !session.sheet })
    await session.context.close()
  },

  // «أبلغ عن خطأ»: the report as it will be sent, the reader's own words, and the ways to send it.
  // `feedback=1` gives mock mode placeholder addresses, so both buttons show.
  'report-error': async (width, file) => {
    const session = await openReport(width, { query: '&feedback=1' })
    const { page } = session
    await openNote(session, 'c9')
    await page.locator('[data-note-sheet="c9"]').getByTestId('report-error').click()
    await page.getByTestId('report-error-dialog').waitFor()
    await page.waitForTimeout(400)
    await page.screenshot({ path: file })
    await session.context.close()
  },

  // «ما معنى هذه الحالات؟»: the five states, each with what it means and what it does not.
  legend: async (width, file) => {
    const { context, page } = await openReport(width)
    await page.getByTestId('legend-link').first().click()
    await page.getByTestId('legend').waitFor()
    await page.waitForTimeout(400)
    await page.screenshot({ path: file })
    await context.close()
  },

  // A narration with several gradings: one line of every distinct wording and their count…
  'gradings-folded': async (width, file) => {
    const session = await openReport(width)
    await openNote(session, 'c4')
    await session.page.getByTestId('grades').scrollIntoViewIfNeeded()
    await session.page.waitForTimeout(300)
    await session.page.screenshot({ path: file })
    await session.context.close()
  },

  // …which opens the full list, each grading as its source words it, with its link.
  'gradings-open': async (width, file) => {
    const session = await openReport(width)
    await openNote(session, 'c4')
    const grades = session.page.getByTestId('grades')
    await grades.getByRole('button').first().click()
    await grades.locator('li').first().waitFor()
    await grades.scrollIntoViewIfNeeded()
    await session.page.waitForTimeout(300)
    await session.page.screenshot({ path: file })
    await session.context.close()
  },

  // The share dialog on a phone, sharing as an image: the card, then the share sheet, the named
  // apps, save and copy. Headless Chromium on Linux has no share sheet, so these two captures
  // give the page one that does nothing: what a phone shows.
  'share-dialog': async (width, file) => {
    const session = await openShareDialog(width)
    await session.page.screenshot({ path: file })
    await session.context.close()
  },

  // The same, sharing as text: the preview is the exact text that will be sent.
  'share-dialog-text': async (width, file) => {
    const session = await openShareDialog(width, 'نص')
    await session.page.getByTestId('share-text').waitFor()
    await session.page.screenshot({ path: file })
    await session.context.close()
  },

  'dark-empty': async (width, file) => {
    const { context, page } = await open(width, { theme: 'dark' })
    await page.getByText('جرّب:').waitFor()
    await page.screenshot({ path: file, fullPage: true })
    await context.close()
  },
}

// States that are not captured at every width.
const ONLY_AT = {
  'image-reading': [390, 1440],
  'image-read': [390, 1440],
  'single-claim': [390, 1440],
  'share-link': [390],
  'install-hint': [390],
  'share-dialog': [390],
  'share-dialog-text': [390],
  referenced: [390, 1440],
  legend: [390],
  question: [390, 1440],
  referral: [390],
  alternatives: [390, 1440],
  'report-error': [390],
  'gradings-folded': [390],
  'gradings-open': [390],
}

for (const [name, capture] of Object.entries(STATES)) {
  if (only && !only.has(name)) continue
  for (const width of WIDTHS) {
    if (ONLY_AT[name] && !ONLY_AT[name].includes(width)) continue
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

// ── The verdict cards: not screenshots, but the PNG files the app itself produces ─────────────
// Saved through the share dialog, as a user would: card-client-<state>-<size>-<theme>-<lang>.png

const CARD_COPY = {
  ar: { done: 'اكتمل التحقق', portrait: /^عمودي/, square: /^مربّع/, light: 'فاتح', dark: 'داكن' },
  en: { done: 'Verification complete', portrait: /^Portrait/, square: /^Square/, light: 'Light', dark: 'Dark' },
}

async function cardSession(lang) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
    acceptDownloads: true,
    locale: 'ar-SA',
  })
  const page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`)
  })
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  await page.goto(`${BASE}/?mock=1&lang=${lang}&scenario=video&autorun=1&speed=10`)
  await page.getByText(CARD_COPY[lang].done).first().waitFor({ timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready)
  return { context, page, copy: CARD_COPY[lang] }
}

/** Choose size and theme in the open share dialog, then save the PNG the app produces. */
async function saveCard({ page, copy }, name, size, theme) {
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await dialog.getByRole('button', { name: copy[size] }).click()
  await dialog.getByRole('button', { name: copy[theme], exact: true }).click()
  await page.waitForTimeout(500)
  const download = page.waitForEvent('download', { timeout: 30_000 })
  await page.getByTestId('share-download').click()
  await (await download).saveAs(path.join(OUT, `${name}.png`))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  console.log(`✓ ${name}`)
}

async function shareNote(session, id) {
  const note = session.page.locator(`[data-margin] [data-note="${id}"]`)
  if ((await note.getAttribute('data-open')) === null) await note.locator('> button').click()
  await note.getByTestId('share-card').click()
}

if (!only || only.has('cards')) {
  try {
    const ar = await cardSession('ar')
    // A text attributed to the Quran that is in fact a narration.
    await shareNote(ar, 'c9')
    await saveCard(ar, 'card-client-contradicted-portrait-light-ar', 'portrait', 'light')
    // A disputed ruling with the evidence it points at.
    await shareNote(ar, 'c8')
    await saveCard(ar, 'card-client-needs-review-referenced-portrait-light-ar', 'portrait', 'light')
    // A verse quoted word for word.
    await shareNote(ar, 'c1')
    await saveCard(ar, 'card-client-supported-square-light-ar', 'square', 'light')
    // A narration quoted in part.
    await shareNote(ar, 'c2')
    await saveCard(ar, 'card-client-supported-with-note-portrait-light-ar', 'portrait', 'light')
    // A narration quoted with two words in another order: the differing words are underlined.
    await shareNote(ar, 'c5')
    await saveCard(ar, 'card-client-needs-review-square-light-ar', 'square', 'light')
    // Nothing found: the abstention.
    await shareNote(ar, 'c6')
    await saveCard(ar, 'card-client-not-found-square-dark-ar', 'square', 'dark')
    // The whole report on one card: its sentence, then a row per citation.
    await ar.page.getByTestId('share-summary').click()
    await saveCard(ar, 'card-client-summary-portrait-light-ar', 'portrait', 'light')
    await ar.page.getByTestId('share-summary').click()
    await saveCard(ar, 'card-client-summary-square-dark-ar', 'square', 'dark')
    await ar.context.close()

    // In English: a disputed matter with no source to show, and the summary.
    const en = await cardSession('en')
    await shareNote(en, 'c7')
    await saveCard(en, 'card-client-needs-review-portrait-light-en', 'portrait', 'light')
    await en.page.getByTestId('share-summary').click()
    await saveCard(en, 'card-client-summary-square-light-en', 'square', 'light')
    await en.context.close()
  } catch (error) {
    problems.push(`cards: ${error.message.split('\n')[0]}`)
    console.log(`✗ cards: ${error.message.split('\n')[0]}`)
  }
}

await browser.close()

if (external.size > 0) problems.push(`external requests: ${[...external].join(', ')}`)
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log(`\nScreenshots written to ${OUT}. No console errors, no external requests.`)
