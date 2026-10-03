/**
 * F3 «بطاقة تثبّت»: the logic behind the shareable verdict card. The card is drawn in the browser
 * from a fixed-size HTML template (html-to-image); if that throws, the backend draws the same
 * content (`POST /api/share-card`). Nothing about the user is ever put on the card: no date, no
 * reviewer name, no video link or timestamp.
 */
import { getFontEmbedCSS, toBlob } from 'html-to-image'
import qrcode from 'qrcode-generator'

import { copyImage } from './clipboard'
import type { EvidenceState } from './types'

export type CardSize = 'portrait' | 'square'
export type CardTheme = 'light' | 'dark'

/**
 * The card's colours are the page's tokens (docs/DESIGN.md §2), fixed here: the card's theme is
 * chosen in the dialog, not taken from the page, and the PNG must look the same anywhere.
 */
export interface CardPalette {
  paper: string
  ink: string
  quiet: string
  green: string
  rule: string
  gold: string
  /** Each state's solid (glyph, underline) and ink (words). */
  states: Record<EvidenceState, { solid: string; ink: string }>
}

export const CARD_PALETTE: Record<CardTheme, CardPalette> = {
  light: {
    paper: '#ffffff',
    ink: '#11221e',
    quiet: '#4f615b',
    green: '#1b6b5e',
    rule: '#d3ddd9',
    gold: '#c9a227',
    states: {
      supported: { solid: '#1b6b5e', ink: '#14584d' },
      supported_with_note: { solid: '#6e7b1e', ink: '#56611a' },
      needs_review: { solid: '#a66a00', ink: '#7a4e00' },
      not_found: { solid: '#b5524a', ink: '#8f3b34' },
      contradicted: { solid: '#8c1d18', ink: '#73130f' },
    },
  },
  dark: {
    paper: '#10231e',
    ink: '#e7efeb',
    quiet: '#9db1aa',
    green: '#7dbfb0',
    rule: '#24392f',
    gold: '#d9b648',
    states: {
      supported: { solid: '#6fc3a9', ink: '#9ad9c5' },
      supported_with_note: { solid: '#b3c25a', ink: '#cbd784' },
      needs_review: { solid: '#e0a63a', ink: '#efc670' },
      not_found: { solid: '#e08a80', ink: '#f0aca4' },
      contradicted: { solid: '#e0605a', ink: '#f4a29d' },
    },
  },
}

export const CARD_WIDTH = 1080
export const CARD_HEIGHT: Record<CardSize, number> = { portrait: 1350, square: 1080 }

/** Cut a text to at most `max` characters, at a word boundary, with «…». */
export function truncateClaim(text: string, max = 240): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  const chars = Array.from(clean)
  if (chars.length <= max) return clean
  const cut = chars.slice(0, max).join('')
  const boundary = cut.lastIndexOf(' ')
  return `${(boundary > max * 0.6 ? cut.slice(0, boundary) : cut).trimEnd()}…`
}

/** Keep the first `count` words of a text, with «…» when something was cut. */
export function keepWords(text: string, count: number): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  return words.length <= count ? words.join(' ') : `${words.slice(0, Math.max(1, count)).join(' ')}…`
}

/** The verdict line: the first sentence of the rule's note. */
export function firstSentence(note: string): string {
  const clean = note.replace(/\s+/g, ' ').trim()
  const match = clean.match(/^.+?[.!?؟](?=\s|$)/)
  return match ? match[0] : clean
}

export function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** The app address as printed on the card: no scheme, no trailing slash. */
export const displayUrl = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/+$/, '')

/** A QR code as one SVG path over an n×n grid (drawn inline, so nothing is fetched). */
export function qrPath(text: string): { size: number; path: string } {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const size = qr.getModuleCount()
  let path = ''
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (qr.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`
    }
  }
  return { size, path }
}

// The embedded @font-face CSS is the slow part. html-to-image only embeds the families a node
// actually uses, so it is cached per set of families (a card with a verse also needs Amiri Quran).
const fontCss = new Map<string, Promise<string>>()

function fontEmbedCss(node: HTMLElement): Promise<string> {
  const key = node.querySelector('[data-quran]') ? 'with-quran' : 'plain'
  let css = fontCss.get(key)
  if (!css) {
    css = getFontEmbedCSS(node)
    fontCss.set(key, css)
    // A failed build must not be cached, or every later attempt would fail too.
    css.catch(() => fontCss.delete(key))
  }
  return css
}

const isWebKit = () =>
  typeof navigator !== 'undefined' && /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Edg\//.test(navigator.userAgent)

/** Draw the template node to a PNG at its real size, whatever scale the preview shows it at. */
export async function renderCardPng(node: HTMLElement, size: CardSize, background: string): Promise<Blob> {
  await document.fonts.ready
  const options = {
    width: CARD_WIDTH,
    height: CARD_HEIGHT[size],
    pixelRatio: 1,
    backgroundColor: background,
    fontEmbedCSS: await fontEmbedCss(node),
    // The preview is the same node scaled down with a transform: undo it in the clone.
    style: { transform: 'none', margin: '0' },
  }
  // Safari paints fonts and inline SVG only on a later pass.
  if (isWebKit()) await toBlob(node, options)
  const blob = await toBlob(node, options)
  if (!blob || blob.size === 0) throw new Error('empty image')
  return blob
}

export const cardFileName = (state: EvidenceState | 'summary', size: CardSize, theme: CardTheme) =>
  `tabayyun-card-${state.replace(/_/g, '-')}-${size}-${theme}.png`

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** True on devices whose share sheet takes files (phones, mostly). */
export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare || !navigator.share) return false
  try {
    return navigator.canShare({ files: [new File([new Uint8Array(1)], 'card.png', { type: 'image/png' })] })
  } catch {
    return false
  }
}

/** Open the system share sheet with the PNG. Resolves false when the user dismisses it. */
export async function shareFile(blob: Blob, filename: string, text: string): Promise<boolean> {
  const file = new File([blob], filename, { type: 'image/png' })
  try {
    await navigator.share({ files: [file], title: text, text })
    return true
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') return false
    throw cause
  }
}

export { copyImage }
