#!/usr/bin/env node
/**
 * Captures every UI state into docs/screenshots/ by driving the dev server in mock mode with a
 * headless Chromium. Start the dev server first (`npm run dev`), then: `npm run screenshots`.
 *
 *   BASE_URL   where the app is served (default http://localhost:5173)
 *   ONLY       comma-separated shot names to capture a subset, e.g. ONLY=empty,error
 *   REAL=1     also capture one report from the real backend (it must be running behind /api)
 */
import fs from 'node:fs'
import path from 'node:path'

import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const OUT = path.resolve(import.meta.dirname, '../../docs/screenshots')
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
fs.mkdirSync(OUT, { recursive: true })

const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }

const browser = await chromium.launch()
const problems = []
const external = new Set()

async function open({ viewport = DESKTOP, query = '', mobile = false, theme = 'light' } = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
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
  await page.goto(`${BASE}/?mock=1&theme=${theme}${query.includes('speed=') ? '' : '&speed=8'}${query}`)
  await page.locator('[data-testid="verify"]:visible').first().waitFor()
  // Web fonts must be in before a screenshot, or Arabic renders in a fallback face.
  await page.evaluate(() => document.fonts.ready)
  return { context, page }
}

const verify = (page) => page.locator('[data-testid="verify"]:visible').first().click()

async function runVideo(page, tabName = 'رابط مقطع', doneText = 'اكتمل التحقق') {
  await page.getByRole('tab', { name: tabName }).click()
  await page.getByRole('textbox').first().fill('https://www.youtube.com/watch?v=TABAYYUN-MOCK')
  await verify(page)
  await page.getByText(doneText).first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(300)
}

async function shot(name, fn) {
  if (only && !only.has(name.replace(/^\d+-/, ''))) return
  const started = Date.now()
  try {
    await fn(path.join(OUT, `${name}.png`))
    console.log(`✓ ${name} (${Date.now() - started} ms)`)
  } catch (error) {
    problems.push(`${name}: ${error.message.split('\n')[0]}`)
    console.log(`✗ ${name}: ${error.message.split('\n')[0]}`)
  }
}

await shot('01-empty', async (file) => {
  const { context, page } = await open()
  await page.getByText('جرّب مثالاً').waitFor()
  await page.screenshot({ path: file })
  await context.close()
})

await shot('02-loading', async (file) => {
  const { context, page } = await open({ query: '&speed=1' })
  await page.getByRole('tab', { name: 'رابط مقطع' }).click()
  await page.getByRole('button', { name: 'رابط مقطع يوتيوب' }).click()
  await verify(page)
  await page.locator('[role="article"][data-state]').nth(1).waitFor({ timeout: 30_000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: file })
  await context.close()
})

await shot('03-report-light', async (file) => {
  const { context, page } = await open()
  await runVideo(page)
  await page.screenshot({ path: file, fullPage: true })
  await page.screenshot({ path: file.replace('.png', '-fold.png') })
  await context.close()
})

await shot('04-report-dark', async (file) => {
  const { context, page } = await open({ theme: 'dark' })
  await runVideo(page)
  await page.screenshot({ path: file, fullPage: true })
  await page.screenshot({ path: file.replace('.png', '-fold.png') })
  await context.close()
})

await shot('05-card-expanded-diff', async (file) => {
  const { context, page } = await open()
  await runVideo(page)
  for (const state of ['supported_with_note', 'needs_review']) {
    const card = page.locator(`[role="article"][data-state="${state}"]`).first()
    await card.getByRole('button', { name: 'عرض التفاصيل' }).click()
    await page.waitForTimeout(350)
    await card.scrollIntoViewIfNeeded()
    await card.screenshot({ path: state === 'supported_with_note' ? file : file.replace('.png', '-replace.png') })
  }
  await context.close()
})

await shot('06-not-found-referral-dialog', async (file) => {
  const { context, page } = await open()
  await runVideo(page)
  const card = page.locator('[role="article"][data-state="not_found"]').first()
  await card.scrollIntoViewIfNeeded()
  await card.screenshot({ path: file.replace('.png', '-card.png') })
  await card.getByRole('button', { name: 'إحالة إلى أهل العلم' }).click()
  await page.getByRole('dialog').waitFor()
  await page.waitForTimeout(300)
  await page.screenshot({ path: file })
  await context.close()
})

await shot('07-error', async (file) => {
  const { context, page } = await open()
  await page.getByRole('tab', { name: 'رابط مقطع' }).click()
  await page.getByRole('textbox').first().fill('https://www.tiktok.com/@someone/video/123')
  await verify(page)
  await page.getByRole('alert').waitFor({ timeout: 15_000 })
  await page.screenshot({ path: file })
  // Client-side validation: an empty field never reaches the server.
  await page.getByRole('tab', { name: 'نص' }).click()
  await verify(page)
  await page.getByRole('alert').waitFor()
  await page.screenshot({ path: file.replace('.png', '-empty-input.png') })
  await context.close()
})

await shot('08-reviewer-mode', async (file) => {
  const { context, page } = await open()
  await runVideo(page)
  await page.getByRole('switch', { name: 'وضع المراجع' }).click()
  const card = page.locator('[role="article"][data-card-id="c5"]')
  await card.getByRole('button', { name: 'عرض التفاصيل' }).click()
  await card.getByLabel('اسم المراجع').fill('سليمان')
  await card.getByLabel('ملاحظة المراجع').fill('اللفظ صحيح المعنى، ويُصحَّح الترتيب قبل النشر.')
  await card.getByLabel('الحالة بعد المراجعة').click()
  await page.getByRole('menuitemradio', { name: 'مؤيَّد مع ملاحظة' }).waitFor()
  await page.waitForTimeout(250)
  await page.screenshot({ path: file.replace('.png', '-editing.png') })
  await page.getByRole('menuitemradio', { name: 'مؤيَّد مع ملاحظة' }).click()
  await card.getByRole('button', { name: 'حفظ المراجعة' }).click()
  await page.getByText('حُفظت المراجعة').waitFor()
  await page.waitForTimeout(500)
  await page.locator('[role="article"][data-card-id="c5"]').evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await page.evaluate(() => window.scrollBy(0, -90))
  await page.waitForTimeout(200)
  await page.screenshot({ path: file })
  await context.close()
})

await shot('09-english', async (file) => {
  const { context, page } = await open({ query: '&lang=en' })
  await page.getByText('Try an example').waitFor()
  await page.screenshot({ path: file.replace('.png', '-empty.png') })
  await runVideo(page, 'Video link', 'Verification complete')
  const card = page.locator('[role="article"][data-state="supported_with_note"]').first()
  await card.getByRole('button', { name: 'Show details' }).click()
  await page.waitForTimeout(350)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: file, fullPage: true })
  await context.close()
})

await shot('10-mobile-empty', async (file) => {
  const { context, page } = await open({ viewport: MOBILE, mobile: true })
  await page.getByText('جرّب مثالاً').waitFor()
  await page.screenshot({ path: file })
  await context.close()
})

await shot('11-mobile-report', async (file) => {
  const { context, page } = await open({ viewport: MOBILE, mobile: true })
  await runVideo(page)
  await page.screenshot({ path: file })
  await context.close()
})

await shot('12-mobile-transcript-sheet', async (file) => {
  const { context, page } = await open({ viewport: MOBILE, mobile: true })
  await runVideo(page)
  await page.getByRole('button', { name: 'عرض النص الأصلي' }).click()
  await page.getByRole('dialog').waitFor()
  await page.waitForTimeout(400)
  await page.screenshot({ path: file })
  await context.close()
})

await shot('13-lexical-only-warning', async (file) => {
  const { context, page } = await open({ query: '&scenario=lexical&dorar=1' })
  await page.getByRole('button', { name: 'نص فيه آية وحديث' }).click()
  await verify(page)
  await page.getByText('اكتمل التحقق').waitFor({ timeout: 30_000 })
  await page.screenshot({ path: file })
  await context.close()
})

await shot('14-two-gradings-and-missing-grading', async (file) => {
  const { context, page } = await open()
  await runVideo(page)
  const two = page.locator('[role="article"][data-card-id="c4"]')
  await two.getByRole('button', { name: 'عرض التفاصيل' }).click()
  await page.waitForTimeout(350)
  await two.scrollIntoViewIfNeeded()
  await two.screenshot({ path: file })
  await context.close()
})

await shot('15-no-claims-and-request', async (file) => {
  const { context, page } = await open({ query: '&scenario=no_claims' })
  await page.getByRole('textbox').first().fill('مرحباً، كيف حالك اليوم؟')
  await verify(page)
  await page.getByRole('button', { name: 'تحقّق من نص آخر' }).waitFor({ timeout: 30_000 })
  await page.screenshot({ path: file })
  await context.close()

  const second = await open()
  await second.page.getByRole('button', { name: 'طلب اختلاق حديث' }).click()
  await verify(second.page)
  await second.page.getByText('اكتمل التحقق').waitFor({ timeout: 30_000 })
  await second.page.screenshot({ path: file.replace('no-claims-and-request', 'fabrication-request') })
  await second.context.close()
})

if (process.env.REAL) {
  await shot('16-real-backend', async (file) => {
    const context = await browser.newContext({ viewport: DESKTOP, reducedMotion: 'reduce', locale: 'ar-SA' })
    const page = await context.newPage()
    await page.goto(`${BASE}/?theme=light`)
    await page.getByText('جرّب مثالاً').waitFor()
    await page.evaluate(() => document.fonts.ready)
    await page.getByRole('button', { name: 'نص فيه آية وحديث' }).click()
    await verify(page)
    await page.getByText('اكتمل التحقق').waitFor({ timeout: 60_000 })
    const hadith = page.locator('[role="article"][data-state]').filter({ hasText: 'حديث' }).first()
    await hadith.getByRole('button', { name: 'عرض التفاصيل' }).click()
    await page.waitForTimeout(400)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: file, fullPage: true })
    await context.close()
  })
}

await browser.close()

if (external.size > 0) problems.push(`external requests: ${[...external].join(', ')}`)
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log(`\nScreenshots written to ${OUT}. No console errors, no external requests.`)
