#!/usr/bin/env node
/**
 * The installable app's icons, drawn from the brand's mark (public/favicon.svg: a gold tile with
 * a green seal over its outlined source, on the green tile): `npm run icons`.
 *
 *   public/icons/icon-192.png, icon-512.png   the mark as it is, its corners transparent
 *   public/icons/icon-maskable-512.png        the green to every edge and the mark's parts inside
 *                                             the safe zone, for launchers that cut their own
 *                                             shape; also the home-screen icon on iOS, which
 *                                             does not draw transparency
 *
 * Headless Chromium draws them; nothing is fetched.
 */
import fs from 'node:fs'
import path from 'node:path'

import { chromium } from 'playwright'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = path.join(ROOT, 'public/icons')
const favicon = fs.readFileSync(path.join(ROOT, 'public/favicon.svg'), 'utf8')
fs.mkdirSync(OUT, { recursive: true })

// The mark's own green, and its three parts without the tile behind them.
const green = favicon.match(/<rect width="32" height="32"[^>]*fill="(#[0-9a-fA-F]{6})"/)?.[1]
const parts = favicon
  .replace(/<svg[^>]*>|<\/svg>/g, '')
  .replace(/<rect width="32" height="32"[^>]*\/>/, '')
  .trim()
if (!green || !parts) throw new Error('public/favicon.svg is not the mark this script expects')

const ICONS = [
  { file: 'icon-192.png', size: 192, svg: favicon },
  { file: 'icon-512.png', size: 512, svg: favicon },
  {
    file: 'icon-maskable-512.png',
    size: 512,
    // The parts span 6…26 of 32; scaled to 0.62 about the centre they stay inside the central 40%
    // radius that every launcher's mask keeps.
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="${green}"/><g transform="translate(16 16) scale(0.62) translate(-16 -16)">${parts}</g></svg>`,
  },
]

const browser = await chromium.launch()
for (const { file, size, svg } of ICONS) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  )
  await page.screenshot({ path: path.join(OUT, file), omitBackground: true })
  await page.close()
  console.log(`✓ public/icons/${file} (${fs.statSync(path.join(OUT, file)).size} bytes)`)
}
await browser.close()
