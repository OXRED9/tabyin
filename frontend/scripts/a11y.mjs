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
 */
import fs from 'node:fs'
import path from 'node:path'

import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const axe = fs.readFileSync(path.resolve(import.meta.dirname, '../node_modules/axe-core/axe.min.js'), 'utf8')
const COPY = {
  ar: { tab: 'رابط مقطع', done: 'اكتمل التحقق', expand: 'عرض التفاصيل', reviewer: 'وضع المراجع', referral: 'إحالة إلى أهل العلم' },
  en: { tab: 'Video link', done: 'Verification complete', expand: 'Show details', reviewer: 'Reviewer mode', referral: 'Refer to scholars' },
}
const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }

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

async function audit(label, { theme = 'light', lang = 'ar', viewport = DESKTOP, state = 'empty' }) {
  const mobile = viewport === MOBILE
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', isMobile: mobile, hasTouch: mobile })
  const page = await context.newPage()
  const t = COPY[lang]
  const verify = page.locator('[data-testid="verify"]:visible').first()
  await page.goto(`${BASE}/?mock=1&speed=10&theme=${theme}&lang=${lang}`)
  await verify.waitFor()
  await page.evaluate(() => document.fonts.ready)
  // Let /api/meta land, so the examples and the motto verse are part of the audit.
  await page.waitForTimeout(400)

  if (state === 'error') {
    await verify.click()
    await page.getByRole('alert').waitFor()
    await page.waitForTimeout(300)
  } else if (state !== 'empty') {
    await page.getByRole('tab', { name: t.tab }).click()
    await page.getByRole('textbox').first().fill('https://www.youtube.com/watch?v=TABAYYUN-MOCK')
    await verify.click()
    await page.getByText(t.done).first().waitFor({ timeout: 30_000 })
    if (state === 'reviewer' || state === 'dialog') await page.getByRole('switch', { name: t.reviewer }).click()
    for (let i = 0; i < 20 && (await page.getByRole('button', { name: t.expand }).count()) > 0; i++) {
      await page.getByRole('button', { name: t.expand }).first().click()
    }
    // F5: open every «لماذا هذا الحكم؟» panel so its table, meter and labels are audited.
    const closedPanels = page.locator('[data-testid="explain"] > button[aria-expanded="false"]')
    for (let i = 0; i < 20 && (await closedPanels.count()) > 0; i++) await closedPanels.first().click()
    if (state === 'share' || state === 'share-summary') {
      // F3: the share dialog, with the verdict-card template inside it.
      const trigger = state === 'share' ? page.locator('[role="article"][data-state="not_found"]').first().getByTestId('share-card') : page.getByTestId('share-summary')
      await trigger.click()
      await page.getByRole('dialog').waitFor()
      if (theme === 'dark') await page.getByRole('dialog').getByRole('button', { name: lang === 'ar' ? 'داكن' : 'Dark', exact: true }).click()
    }
    if (state === 'dialog') {
      await page.locator('[role="article"][data-state="not_found"]').first().getByRole('button', { name: t.referral }).click()
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
await audit('error · light · ar', { state: 'error' })
for (const theme of ['light', 'dark']) {
  await audit(`report, all cards expanded · ${theme} · ar`, { theme, state: 'report' })
  await audit(`reviewer mode · ${theme} · ar`, { theme, state: 'reviewer' })
  await audit(`referral dialog · ${theme} · ar`, { theme, state: 'dialog' })
}
for (const theme of ['light', 'dark']) {
  await audit(`share dialog, claim card · ${theme} · ar`, { theme, state: 'share' })
}
await audit('share dialog, summary card · light · en', { lang: 'en', state: 'share-summary' })
await audit('report, all cards expanded · light · en', { lang: 'en', state: 'report' })
await audit('reviewer mode · dark · en', { lang: 'en', theme: 'dark', state: 'reviewer' })
await audit('report · light · ar · 390px', { viewport: MOBILE, state: 'report' })

await browser.close()
if (failures > 0) {
  console.error(`\n${failures} problem(s).`)
  process.exit(1)
}
console.log('\nNo WCAG A/AA violations found by axe-core, and no text below AA contrast.')
