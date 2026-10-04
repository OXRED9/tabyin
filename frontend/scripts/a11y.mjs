#!/usr/bin/env node
/**
 * Accessibility checks over the main UI states in mock mode, in both themes and both languages.
 * Start the dev server first, then: `npm run a11y`.
 *
 *   1. axe-core, WCAG 2.1 A/AA.
 *   2. An own contrast pass over every visible text node. axe's contrast rule skips most Arabic
 *      text (its icon-ligature heuristic treats joined Arabic letters as an icon font), so this
 *      pass measures the computed text colour against the composited background itself and
 *      applies the AA thresholds: 4.5:1, or 3:1 for large text.
 *
 *   BASE_URL   where the app is served (default http://localhost:5173)
 *   ONLY       run only the audits whose label contains this text, e.g. ONLY=390px
 */
import fs from 'node:fs'
import path from 'node:path'

import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const ONLY = process.env.ONLY
const axe = fs.readFileSync(path.resolve(import.meta.dirname, '../node_modules/axe-core/axe.min.js'), 'utf8')
const COPY = {
  ar: { asText: 'نص', unavailable: /تعذّر استلام/, referral: 'إحالة إلى أهل العلم', example: 'رابط مقطع يوتيوب', dark: 'داكن', image: 'صورة رسالة محوَّلة', removed: /حُذف من الصورة/ },
  en: { asText: 'Text', unavailable: /could not be received/, referral: 'Refer to scholars', example: 'YouTube link', dark: 'Dark', image: 'A forwarded-message screenshot', removed: /Removed from the picture/ },
}
const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }
const TABLET = { width: 820, height: 1180 }

const browser = await chromium.launch()
let failures = 0

/** Runs in the page: contrast of every visible text node against its composited background. */
function measureContrast() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const cache = new Map()
  // Any CSS colour (rgb, oklab, color-mix…) → [r, g, b, a], by letting the browser paint it.
  const rgba = (css) => {
    if (cache.has(css)) return cache.get(css)
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = '#000'
    ctx.fillStyle = css
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    const value = [r, g, b, a / 255]
    cache.set(css, value)
    return value
  }
  const over = (top, bottom) => {
    const a = top[3] + bottom[3] * (1 - top[3])
    if (a === 0) return [0, 0, 0, 0]
    return [0, 1, 2].map((i) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a).concat(a)
  }
  const luminance = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
  const page = rgba(getComputedStyle(document.documentElement).colorScheme.includes('dark') ? '#000' : '#fff')

  const backgroundOf = (element) => {
    const layers = []
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node)
      const colour = rgba(style.backgroundColor)
      if (colour[3] > 0) layers.push(colour)
      if (colour[3] === 1) break
    }
    return layers.reduceRight((below, layer) => over(layer, below), page)
  }

  const failures = []
  let checked = 0
  let lowest = 21
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const value = text.nodeValue.replace(/\s+/g, ' ').trim()
    const element = text.parentElement
    if (!value || !element || !/[\p{L}\p{N}]/u.test(value)) continue
    if (element.closest('[disabled], [aria-disabled="true"], [aria-hidden="true"], [data-sonner-toaster], script, style')) continue
    const range = document.createRange()
    range.selectNodeContents(text)
    const rect = range.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) continue
    const style = getComputedStyle(element)
    if (style.visibility === 'hidden' || element.closest('.sr-only')) continue
    let opacity = 1
    for (let node = element; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity)
    if (opacity === 0) continue

    const background = backgroundOf(element)
    const colour = rgba(style.color)
    const foreground = over([colour[0], colour[1], colour[2], colour[3] * opacity], background)
    const l1 = luminance(foreground)
    const l2 = luminance(background)
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    const size = parseFloat(style.fontSize)
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700)
    const needs = large ? 3 : 4.5
    checked += 1
    lowest = Math.min(lowest, ratio)
    if (ratio < needs - 0.005) {
      failures.push({ ratio: ratio.toFixed(2), needs, fg: hex(foreground), bg: hex(background), text: value.slice(0, 40) })
    }
  }
  return { checked, lowest, failures }
}

/**
 * States:
 *   empty      the first screen        link       the composer with a recognised link and its tag
 *   error      a validation error      running    mid-run: the investigation (a map from 1024px,
 *              a timeline below), the text on the page, evidence cards arriving
 *   drawer     (below 1280px) the rail as a drawer: new verification, history, legend, language, theme
 *   replay     a finished report with «أعد عرض التحرّي» open under its verdict
 *   image      the composer after a picture was read: its text in the field, the unread word
 *              marked and counted, the uncertainty line, the removed items listed (opened)
 *   report     every evidence card open (its trail and its note), every «لماذا هذا الحكم؟» open
 *   dialog     the referral dialog
 *   legend     «ما معنى هذه الحالات؟», opened from the report's head
 *   question   a question put to the tool: its note open, with the search links in it
 *   report-error   «أبلغ عن خطأ» on a claim, with addresses to send to
 *   share      the share dialog on a claim (`card`: the state of the claim whose card is drawn)
 *   share-summary   the share dialog on the summary
 *   card       one evidence card open in place
 *   share-phone   (390px) the share dialog opened from a card, with a share sheet present
 *   `shareAs: 'text'` puts a share dialog in its text mode: the text that will be sent, the apps'
 *   links, «نسخ النص»
 *   notice     the composer after a share that could not be received (`?share=unavailable`)
 *   single     a report with exactly one claim: its card open without a tap, and the offer to
 *              install in the footer
 *   single-ios the same, with the iOS hint in place of the offer
 */
async function audit(label, { theme = 'light', lang = 'ar', viewport = DESKTOP, state = 'empty', card = 'not_found', shareAs = 'image' }) {
  if (ONLY && !label.includes(ONLY)) return
  const mobile = viewport === MOBILE
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', isMobile: mobile, hasTouch: mobile })
  const page = await context.newPage()
  // Headless Chromium on Linux has no share sheet; a phone has one. This state is audited with it.
  if (state === 'share-phone') {
    await page.addInitScript(() => {
      navigator.canShare = () => true
      navigator.share = async () => {}
    })
  }
  const t = COPY[lang]
  const composer = ['empty', 'link', 'error', 'image', 'notice', 'drawer'].includes(state)
  const single = state === 'single' || state === 'single-ios'
  const question = state === 'question'
  // Reports are reached through mock mode's own route: `scenario=<name>&autorun=1`.
  const route = composer
    ? state === 'notice'
      ? '&share=unavailable'
      : ''
    : question
      ? '&scenario=question&autorun=1&speed=10'
      : single
      ? `&scenario=fabrication&autorun=1&speed=10&install=${state === 'single-ios' ? 'ios' : '1'}`
      : `&scenario=video&autorun=1&speed=${state === 'running' ? 1 : 10}${state === 'report-error' ? '&feedback=1' : ''}`
  await page.goto(`${BASE}/?mock=1&theme=${theme}&lang=${lang}${route}`)
  await page.evaluate(() => document.fonts.ready)

  if (composer) {
    const verify = page.getByTestId('verify')
    await verify.waitFor()
    // Let /api/meta land, so the example chips are part of the audit.
    await page.getByRole('button', { name: t.example }).waitFor()
    if (state === 'link') {
      await page.getByRole('button', { name: t.example }).click()
      await page.getByTestId('link-tag').waitFor()
    }
    if (state === 'error') {
      await verify.click()
      await page.getByRole('alert').waitFor()
    }
    if (state === 'notice') await page.getByText(t.unavailable).waitFor()
    if (state === 'image') {
      await page.getByRole('button', { name: t.image }).click()
      await page.getByTestId('image-unread').waitFor({ timeout: 15_000 })
      await page.getByText(t.removed).click()
    }
    if (state === 'empty') await page.getByTestId('capabilities').waitFor()
    if (state === 'drawer') {
      await page.getByTestId('menu').click()
      await page.getByTestId('rail-drawer').waitFor()
    }
    await page.waitForTimeout(300)
  } else if (state === 'running') {
    await page.locator('[data-note][data-state]:not([data-state="pending"])').nth(1).waitFor({ timeout: 30_000 })
    await page.locator('[data-note][data-state="pending"]').first().waitFor({ timeout: 30_000 })
  } else {
    await page.getByTestId('verdict').waitFor({ timeout: 30_000 })
    if (question) {
      await page.locator('[data-note][data-open]').first().waitFor()
      await page.getByTestId('referral-links').waitFor()
    }
    if (single) {
      await page.locator('[data-note][data-open]').first().waitFor()
      await page.getByTestId('install-line').waitFor()
    }
    if (state === 'card' || state === 'share-phone' || (state === 'report-error' && mobile)) {
      // One evidence card, opened in place.
      await page.locator('[data-note="c2"] > button').click()
      await page.locator('[data-note="c2"][data-open]').getByTestId('provenance').waitFor()
    } else {
      const closed = page.locator('[data-note] > button[aria-expanded="false"]')
      for (let i = 0; i < 30 && (await closed.count()) > 0; i++) await closed.first().click()
    }
    if (state === 'replay') {
      await page.getByTestId('replay').click()
      await page.getByTestId('investigation').waitFor()
    }
    // Several gradings are folded under one line: open them, so the full list is audited too.
    const foldedGrades = page.locator('[data-testid="grades"] > button[aria-expanded="false"]')
    for (let i = 0; i < 30 && (await foldedGrades.count()) > 0; i++) await foldedGrades.first().click()
    // F5: open every «لماذا هذا الحكم؟» panel so its list, meter and labels are audited.
    const closedPanels = page.locator('[data-testid="explain"] > button[aria-expanded="false"]')
    for (let i = 0; i < 30 && (await closedPanels.count()) > 0; i++) await closedPanels.first().click()
    if (state === 'share-phone') {
      await page.locator('[data-note="c2"]').getByTestId('share-card').click()
      await page.getByTestId('share-targets').waitFor()
    }
    if (state === 'share' || state === 'share-summary') {
      // F3: the share dialog, with the verdict-card template inside it.
      const trigger =
        state === 'share'
          ? page.locator(`[data-note][data-state="${card}"]`).first().getByTestId('share-card')
          : page.getByTestId('share-summary')
      await trigger.click()
      await page.getByRole('dialog').waitFor()
      if (theme === 'dark') await page.getByRole('dialog').getByRole('button', { name: t.dark, exact: true }).click()
    }
    if (shareAs === 'text') {
      await page.getByTestId('share-as').getByRole('button', { name: t.asText, exact: true }).click()
      await page.getByTestId('share-text').waitFor()
    }
    if (state === 'report-error') {
      // «أبلغ عن خطأ» on a claim, with the mock's placeholder addresses so every way to send shows.
      const note = mobile ? page.locator('[data-note="c2"]') : page.locator('[data-note]').first()
      await note.getByTestId('report-error').click()
      await page.getByTestId('report-error-dialog').waitFor()
    }
    if (state === 'legend') {
      await page.getByTestId('verdict').getByTestId('legend-link').click()
      await page.getByTestId('legend').waitFor()
    }
    if (state === 'dialog') {
      // The disputed matter's note: its referral links search the sites for its topic words.
      await page.locator('[data-note="c7"]').first().getByRole('button', { name: t.referral }).click()
      await page.getByRole('dialog').waitFor()
    }
    await page.waitForTimeout(400)
  }

  const contrast = await page.evaluate(measureContrast)
  failures += contrast.failures.length

  await page.addScriptTag({ content: axe })
  const result = await page.evaluate(async () => {
    const run = await globalThis.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    })
    return {
      checked: run.passes.find((p) => p.id === 'color-contrast')?.nodes.length ?? 0,
      violations: run.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.slice(0, 5).map((n) => `${n.target.join(' ')} — ${(n.any[0]?.message ?? '').slice(0, 160)}`),
      })),
    }
  })
  failures += result.violations.length
  console.log(
    `${result.violations.length === 0 && contrast.failures.length === 0 ? '✓' : '✗'} ${label} — axe: ${result.violations.length} violation(s); contrast: ${contrast.checked} text nodes, lowest ${contrast.lowest.toFixed(2)}:1, ${contrast.failures.length} below AA`,
  )
  for (const f of contrast.failures.slice(0, 8)) console.log(`    contrast ${f.ratio}:1 (needs ${f.needs}) ${f.fg} on ${f.bg} — “${f.text}”`)
  for (const v of result.violations) console.log(`    ${v.id}\n      ${v.nodes.join('\n      ')}`)
  await context.close()
}

await audit('empty · light · ar', {})
await audit('empty · dark · ar', { theme: 'dark' })
await audit('empty · dark · en', { theme: 'dark', lang: 'en' })
await audit('empty · dark · ar · 390px', { theme: 'dark', viewport: MOBILE })
await audit('empty · light · ar · 820px', { viewport: TABLET })
for (const theme of ['light', 'dark']) {
  await audit(`rail as a drawer · ${theme} · ar · 390px`, { theme, viewport: MOBILE, state: 'drawer' })
}
await audit('composer with a link · light · ar', { state: 'link' })
await audit('composer with a link · dark · en', { state: 'link', theme: 'dark', lang: 'en' })
await audit('picture read · light · ar', { state: 'image' })
await audit('picture read · dark · ar', { state: 'image', theme: 'dark' })
await audit('picture read · light · en', { state: 'image', lang: 'en' })
await audit('picture read · light · ar · 390px', { state: 'image', viewport: MOBILE })
await audit('share not received · light · ar · 390px', { state: 'notice', viewport: MOBILE })
await audit('share not received · dark · en', { state: 'notice', theme: 'dark', lang: 'en' })
await audit('error · light · ar', { state: 'error' })
await audit('error · dark · ar', { state: 'error', theme: 'dark' })
for (const theme of ['light', 'dark']) {
  await audit(`mid-run · ${theme} · ar`, { theme, state: 'running' })
  await audit(`report, all cards open · ${theme} · ar`, { theme, state: 'report' })
  await audit(`investigation replayed under the verdict · ${theme} · ar`, { theme, state: 'replay' })
  await audit(`referral dialog · ${theme} · ar`, { theme, state: 'dialog' })
}
await audit('mid-run · dark · en', { theme: 'dark', lang: 'en', state: 'running' })
for (const theme of ['light', 'dark']) {
  await audit(`share dialog, claim card · ${theme} · ar`, { theme, state: 'share' })
}
for (const theme of ['light', 'dark']) {
  await audit(`states legend · ${theme} · ar`, { theme, state: 'legend' })
}
await audit('states legend · light · en · 390px', { lang: 'en', viewport: MOBILE, state: 'legend' })
for (const theme of ['light', 'dark']) {
  await audit(`report an error · ${theme} · ar`, { theme, state: 'report-error' })
  await audit(`a question, referred · ${theme} · ar · 390px`, { theme, viewport: MOBILE, state: 'question' })
}
await audit('a question, referred · light · en', { lang: 'en', state: 'question' })
await audit('report an error · light · en · 390px', { lang: 'en', viewport: MOBILE, state: 'report-error' })
await audit('share dialog, verse card · light · ar', { state: 'share', card: 'supported' })
await audit('share dialog, contradicted card · dark · en', { state: 'share', card: 'contradicted', theme: 'dark', lang: 'en' })
await audit('share dialog, card with a note · light · ar', { state: 'share', card: 'supported_with_note' })
await audit('share dialog, summary card · light · en', { lang: 'en', state: 'share-summary' })
await audit('share dialog, summary card · dark · ar', { theme: 'dark', state: 'share-summary' })
await audit('share dialog as text, claim · light · ar', { state: 'share', card: 'contradicted', shareAs: 'text' })
await audit('share dialog as text, summary · dark · en', { lang: 'en', theme: 'dark', state: 'share-summary', shareAs: 'text' })
await audit('report, all cards open · light · en', { lang: 'en', state: 'report' })
await audit('report, all cards open · dark · en', { lang: 'en', theme: 'dark', state: 'report' })
for (const theme of ['light', 'dark']) {
  await audit(`report, all cards open · ${theme} · ar · 390px`, { theme, viewport: MOBILE, state: 'report' })
  await audit(`one card open · ${theme} · ar · 390px`, { theme, viewport: MOBILE, state: 'card' })
  await audit(`investigation replayed · ${theme} · ar · 390px`, { theme, viewport: MOBILE, state: 'replay' })
  await audit(`share dialog with the share sheet · ${theme} · ar · 390px`, { theme, viewport: MOBILE, state: 'share-phone' })
  await audit(`share dialog as text · ${theme} · ar · 390px`, { theme, viewport: MOBILE, state: 'share-phone', shareAs: 'text' })
}
for (const theme of ['light', 'dark']) {
  await audit(`mid-run, timeline · ${theme} · ar · 390px`, { theme, viewport: MOBILE, state: 'running' })
  await audit(`one claim, card open, install offer · ${theme} · ar · 390px`, { theme, viewport: MOBILE, state: 'single' })
}
await audit('mid-run, timeline · dark · ar · 820px', { theme: 'dark', viewport: TABLET, state: 'running' })
await audit('one claim, card open, iOS hint · light · en · 390px', { lang: 'en', viewport: MOBILE, state: 'single-ios' })
await audit('one claim, card open · light · ar · 820px', { viewport: TABLET, state: 'single' })
await audit('one claim, card open · dark · ar', { theme: 'dark', state: 'single' })
for (const theme of ['light', 'dark']) {
  await audit(`report, all cards open · ${theme} · ar · 820px`, { theme, viewport: TABLET, state: 'report' })
}

await browser.close()
if (failures > 0) {
  console.error(`\n${failures} problem(s).`)
  process.exit(1)
}
console.log('\nNo WCAG A/AA violations found by axe-core, and no text below AA contrast.')
