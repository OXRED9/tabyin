#!/usr/bin/env node
/**
 * Phase 2 captures (F3 verdict card, F4 copy, F5 explainability) into docs/screenshots/phase2-*.
 * Mock mode, headless Chromium. Start the dev server first, then: `npm run screenshots:phase2`.
 *
 * The `phase2-f3-card-*.png` files are not screenshots: they are the PNG files the app itself
 * produces, downloaded through the share dialog.
 *
 *   BASE_URL   where the app is served (default http://localhost:5173)
 *   REAL=1     also capture against the real backend behind /api: an explain panel on real data,
 *              a long claim (read from data/hadeethenc.json) and the server-side fallback card
 */
import fs from 'node:fs'
import path from 'node:path'

import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const OUT = path.resolve(import.meta.dirname, '../../docs/screenshots')
const ROOT = path.resolve(import.meta.dirname, '../..')
fs.mkdirSync(OUT, { recursive: true })
const file = (name) => path.join(OUT, `${name}.png`)

const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }
const COPY = {
  ar: { tab: 'رابط مقطع', done: 'اكتمل التحقق', expand: 'عرض التفاصيل', why: /لماذا هذا الحكم/, portrait: /^عمودي/, square: /^مربّع/, light: 'فاتح', dark: 'داكن', exportBtn: 'تصدير التقرير' },
  en: { tab: 'Video link', done: 'Verification complete', expand: 'Show details', why: /Why this verdict/, portrait: /^Portrait/, square: /^Square/, light: 'Light', dark: 'Dark', exportBtn: 'Export report' },
}
// Sticky bars would be painted across element captures taller than the viewport.
const NO_STICKY = 'header.sticky{position:static!important}.fixed.bottom-0{display:none!important}'

const browser = await chromium.launch()
const problems = []
const external = new Set()

async function session({ lang = 'ar', theme = 'light', mobile = false, query = '', real = false, init, unstick = false } = {}) {
  const context = await browser.newContext({
    viewport: mobile ? MOBILE : DESKTOP,
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: 'reduce',
    acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const page = await context.newPage()
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (url.origin !== new URL(BASE).origin && !['data:', 'blob:'].includes(url.protocol)) external.add(r.url())
  })
  if (init) await page.addInitScript(init)
  await page.goto(`${BASE}/?${real ? '' : 'mock=1&speed=10&'}theme=${theme}&lang=${lang}${query}`)
  await page.locator('[data-testid="verify"]:visible').first().waitFor()
  await page.evaluate(() => document.fonts.ready)
  const t = COPY[lang]
  const verify = async (fill) => {
    await fill()
    await page.locator('[data-testid="verify"]:visible').first().click()
    await page.getByText(t.done).first().waitFor({ timeout: 60_000 })
    await page.waitForTimeout(300)
    if (unstick) await page.addStyleTag({ content: NO_STICKY })
  }
  const video = () =>
    verify(async () => {
      await page.getByRole('tab', { name: t.tab }).click()
      await page.getByRole('textbox').first().fill('https://www.youtube.com/watch?v=TABAYYUN-MOCK')
    })
  const card = (id) => page.locator(`[role="article"][data-card-id="${id}"]`)
  return { context, page, t, video, verify, card }
}

async function step(name, fn) {
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    problems.push(`${name}: ${error.message.split('\n')[0]}`)
    console.log(`✗ ${name}: ${error.message.split('\n')[0]}`)
  }
}

/** Choose size and theme in the open share dialog, then save the PNG the app produces. */
async function saveCard(s, name, size, theme) {
  const dialog = s.page.getByRole('dialog')
  await dialog.getByRole('button', { name: s.t[size] }).click()
  await dialog.getByRole('button', { name: s.t[theme], exact: true }).click()
  await s.page.waitForTimeout(250)
  const download = s.page.waitForEvent('download', { timeout: 30_000 })
  await s.page.getByTestId('share-download').click()
  await (await download).saveAs(file(name))
  await s.page.waitForTimeout(150)
}
async function openShare(s, id) {
  await s.card(id).getByTestId('share-card').click()
  await s.page.getByRole('dialog').waitFor()
  await s.page.waitForTimeout(450)
}
const closeDialog = async (s) => {
  await s.page.keyboard.press('Escape')
  await s.page.waitForTimeout(250)
}

// ── F4: copy ──────────────────────────────────────────────────────────────────────────────────
await step('F4 copy button, toast, export menu', async () => {
  const s = await session()
  await s.video()
  const ayah = s.card('c1')
  await ayah.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await ayah.getByTestId('copy-source').click()
  await s.page.getByText('تم النسخ ✓').waitFor()
  await s.page.waitForTimeout(200)
  await s.page.screenshot({ path: file('phase2-f4-copy-button') })
  await s.page.evaluate(() => window.scrollTo(0, 0))
  await s.page.getByRole('button', { name: s.t.exportBtn }).first().click()
  await s.page.getByRole('menuitem', { name: /نسخ التقرير كنص/ }).waitFor()
  await s.page.waitForTimeout(600)
  await s.page.screenshot({ path: file('phase2-f4-export-menu') })
  await s.context.close()

  const m = await session({ mobile: true })
  await m.video()
  await m.card('c2').evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await m.card('c2').getByTestId('copy-source').click()
  await m.page.getByText('تم النسخ ✓').waitFor()
  await m.page.waitForTimeout(200)
  await m.page.screenshot({ path: file('phase2-f4-copy-mobile') })
  await m.context.close()
})

// ── F5: «لماذا هذا الحكم؟» ───────────────────────────────────────────────────────────────────
async function explainPanel(s, id) {
  await s.card(id).getByRole('button', { name: s.t.expand }).click()
  await s.page.waitForTimeout(250)
  const panel = s.card(id).getByTestId('explain')
  await panel.scrollIntoViewIfNeeded()
  return panel
}
async function openPanel(s, panel) {
  await panel.getByRole('button', { name: s.t.why }).click()
  await s.page.waitForTimeout(300)
  await panel.scrollIntoViewIfNeeded()
}

await step('F5 explain panel', async () => {
  const s = await session({ unstick: true })
  await s.video()
  const panel = await explainPanel(s, 'c2')
  await panel.screenshot({ path: file('phase2-f5-collapsed-teaser') })
  await openPanel(s, panel)
  await panel.screenshot({ path: file('phase2-f5-panel-hadith') })
  for (const [id, name] of [
    ['c5', 'below-threshold'],
    ['c3', 'topic-model-reason'],
    ['c9', 'personal-no-candidates'],
    ['c8', 'contradicted'],
  ]) {
    const other = await explainPanel(s, id)
    await openPanel(s, other)
    await other.screenshot({ path: file(`phase2-f5-panel-${name}`) })
  }
  // The printable fallback (mock mode has no backend) carries the same block.
  const popup = s.context.waitForEvent('page', { timeout: 15_000 })
  await s.page.evaluate(() => window.scrollTo(0, 0))
  await s.page.getByRole('button', { name: s.t.exportBtn }).first().click()
  await s.page.getByRole('menuitem', { name: /صفحة للطباعة/ }).click()
  const printable = await popup
  await printable.waitForTimeout(800)
  await printable.locator('article.card').nth(1).screenshot({ path: file('phase2-f5-printable-fallback') })
  await s.context.close()

  // The panel where a reader meets it: inside an expanded card, on the page.
  const p = await session()
  await p.video()
  const inCard = await explainPanel(p, 'c1')
  await openPanel(p, inCard)
  await inCard.evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await p.page.evaluate(() => window.scrollBy(0, -220))
  await p.page.waitForTimeout(200)
  await p.page.screenshot({ path: file('phase2-f5-in-card') })
  await p.context.close()

  for (const [options, id, name] of [
    [{ theme: 'dark', unstick: true }, 'c4', 'dark'],
    [{ lang: 'en', unstick: true }, 'c2', 'english'],
    [{ mobile: true, unstick: true }, 'c2', 'mobile'],
  ]) {
    const v = await session(options)
    await v.video()
    const variant = await explainPanel(v, id)
    await openPanel(v, variant)
    await variant.screenshot({ path: file(`phase2-f5-panel-${name}`) })
    await v.context.close()
  }
})

// ── F3: «مشاركة بطاقة التثبّت» ────────────────────────────────────────────────────────────────
await step('F3 dialog and generated cards (Arabic)', async () => {
  const s = await session()
  await s.video()
  await s.card('c6').evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await s.page.waitForTimeout(200)
  await s.page.screenshot({ path: file('phase2-f3-buttons-on-card') })

  await openShare(s, 'c1')
  await s.page.screenshot({ path: file('phase2-f3-dialog') })
  await saveCard(s, 'phase2-f3-card-supported-portrait-light-ar', 'portrait', 'light')
  await saveCard(s, 'phase2-f3-card-supported-square-dark-ar', 'square', 'dark')
  await closeDialog(s)
  // Reopen so the capture shows the dialog without the "downloaded" toast over its buttons.
  await s.page.waitForTimeout(4500)
  await openShare(s, 'c1')
  await s.page.screenshot({ path: file('phase2-f3-dialog-square-dark') })
  await closeDialog(s)

  for (const [id, state, size, theme] of [
    ['c2', 'supported-with-note', 'square', 'light'],
    ['c5', 'needs-review', 'portrait', 'dark'],
    ['c6', 'not-found', 'portrait', 'light'],
    ['c6', 'not-found', 'square', 'dark'],
    ['c8', 'contradicted', 'portrait', 'light'],
    ['c8', 'contradicted', 'square', 'dark'],
  ]) {
    await openShare(s, id)
    await saveCard(s, `phase2-f3-card-${state}-${size}-${theme}-ar`, size, theme)
    await closeDialog(s)
  }

  await s.page.getByTestId('share-summary').scrollIntoViewIfNeeded()
  await s.page.getByTestId('share-summary').click()
  await s.page.getByRole('dialog').waitFor()
  await s.page.waitForTimeout(450)
  await s.page.screenshot({ path: file('phase2-f3-dialog-summary') })
  await saveCard(s, 'phase2-f3-card-summary-square-dark-ar', 'square', 'dark')
  await saveCard(s, 'phase2-f3-card-summary-portrait-light-ar', 'portrait', 'light')
  await closeDialog(s)

  // A reviewer's state: drawn with the "human review" mark, never with the reviewer's name.
  await s.page.getByRole('switch', { name: 'وضع المراجع' }).click()
  await s.card('c5').getByRole('button', { name: s.t.expand }).click()
  await s.card('c5').getByLabel('اسم المراجع').fill('سليمان')
  await s.card('c5').getByLabel('الحالة بعد المراجعة').click()
  await s.page.getByRole('menuitemradio', { name: 'مؤيَّد مع ملاحظة' }).click()
  await s.card('c5').getByRole('button', { name: 'حفظ المراجعة' }).click()
  await s.page.waitForTimeout(500)
  await openShare(s, 'c5')
  await saveCard(s, 'phase2-f3-card-override-portrait-light-ar', 'portrait', 'light')
  await s.context.close()
})

await step('F3 generated cards (English)', async () => {
  const s = await session({ lang: 'en' })
  await s.video()
  await openShare(s, 'c2')
  await s.page.screenshot({ path: file('phase2-f3-dialog-english') })
  await saveCard(s, 'phase2-f3-card-supported-with-note-portrait-light-en', 'portrait', 'light')
  await closeDialog(s)
  for (const [id, state, size, theme] of [
    ['c1', 'supported', 'square', 'light'],
    ['c5', 'needs-review', 'square', 'dark'],
    ['c6', 'not-found', 'portrait', 'dark'],
    ['c8', 'contradicted', 'portrait', 'light'],
  ]) {
    await openShare(s, id)
    await saveCard(s, `phase2-f3-card-${state}-${size}-${theme}-en`, size, theme)
    await closeDialog(s)
  }
  await s.page.getByTestId('share-summary').scrollIntoViewIfNeeded()
  await s.page.getByTestId('share-summary').click()
  await s.page.getByRole('dialog').waitFor()
  await s.page.waitForTimeout(450)
  await saveCard(s, 'phase2-f3-card-summary-portrait-dark-en', 'portrait', 'dark')
  await s.context.close()
})

await step('F3 dialog on a phone (share sheet available)', async () => {
  // Headless Chromium has no share sheet: `canShare` and `share` are stubbed so the dialog shows
  // what a phone shows. The stub records what would be shared.
  const s = await session({
    mobile: true,
    init: () => {
      navigator.canShare = (data) => !!data && Array.isArray(data.files) && data.files.length > 0
      navigator.share = async (data) => {
        window.__shared = data.files.map((f) => `${f.name} ${f.type} ${f.size}`)
      }
    },
  })
  await s.video()
  await s.card('c6').getByTestId('share-card').scrollIntoViewIfNeeded()
  await openShare(s, 'c6')
  await s.page.screenshot({ path: file('phase2-f3-dialog-mobile') })
  await s.page.getByRole('dialog').getByRole('button', { name: 'مشاركة', exact: true }).click()
  await s.page.getByText('تمت المشاركة ✓').waitFor({ timeout: 15_000 })
  const shared = await s.page.evaluate(() => window.__shared)
  if (!shared?.[0]?.includes('image/png')) throw new Error(`nothing shared: ${JSON.stringify(shared)}`)
  await s.context.close()
})

if (process.env.REAL) {
  await step('real backend: explain panel, long claim, server-side fallback', async () => {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/hadeethenc.json'), 'utf8'))
    // A whole hadith text as the quoted claim, read from the data file by id: far over 240 characters.
    const long = data.hadeeths.find((h) => String(h.id) === '4560').hadeeth
    const s = await session({ real: true, unstick: true })
    await s.page.getByText('جرّب مثالاً').waitFor()
    await s.verify(() => s.page.getByRole('button', { name: 'نص فيه آية وحديث' }).click())
    const hadith = s.page.locator('[role="article"][data-card-id]').filter({ hasText: 'حديث' }).first()
    await hadith.getByRole('button', { name: s.t.expand }).click()
    const panel = hadith.getByTestId('explain')
    await openPanel(s, panel)
    await panel.screenshot({ path: file('phase2-f5-real-backend-hadith') })
    await s.context.close()

    const l = await session({ real: true })
    await l.verify(() => l.page.getByRole('textbox').first().fill(long))
    await l.page.locator('[role="article"][data-card-id]').first().getByTestId('share-card').click()
    await l.page.getByRole('dialog').waitFor()
    await l.page.waitForTimeout(450)
    await saveCard(l, 'phase2-f3-card-long-claim-square-light-ar', 'square', 'light')
    await saveCard(l, 'phase2-f3-card-long-claim-portrait-light-ar', 'portrait', 'light')
    // Break the canvas the client renderer needs: the app must fall back to POST /api/share-card.
    let calls = 0
    l.page.on('request', (r) => r.url().includes('/api/share-card') && calls++)
    await l.page.evaluate(() => {
      HTMLCanvasElement.prototype.getContext = () => {
        throw new Error('canvas disabled for the fallback test')
      }
    })
    await saveCard(l, 'phase2-f3-card-server-fallback-portrait-light-ar', 'portrait', 'light')
    if (calls !== 1) throw new Error(`expected one call to /api/share-card, saw ${calls}`)
    await l.context.close()
  })
}

await browser.close()

// In REAL mode the app talks to its own origin only as well; anything else is a privacy bug.
if (external.size > 0) problems.push(`external requests: ${[...external].join(', ')}`)
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log(`\nPhase 2 captures written to ${OUT}. No console errors, no external requests.`)
