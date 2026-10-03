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

export interface CardPalette {
  page: string
  card: string
  border: string
  text: string
  label: string
  header: string
  link: string
  row: string
}

/** The card has its own palette: its theme is chosen in the dialog, not taken from the page. */
export const CARD_PALETTE: Record<CardTheme, CardPalette> = {
  light: {
    page: '#f5f6f4',
    card: '#ffffff',
    border: '#e1e6e2',
    text: '#0f1f1b',
    label: '#55655f',
    header: '#1b6b5e',
    link: '#1b6b5e',
    row: '#eef2ef',
  },
  dark: {
    page: '#0b1210',
    card: '#15201e',
    border: '#263632',
    text: '#eef3f1',
    label: '#a3b4ae',
    header: '#1c6d60',
    link: '#6cc5b0',
    row: '#1d2b28',
  },
}

export const CARD_WIDTH = 1080
export const CARD_HEIGHT: Record<CardSize, number> = { portrait: 1350, square: 1080 }

/** The claim as quoted, cut to 240 characters with «…». */
export function truncateClaim(text: string, max = 240): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  const chars = Array.from(clean)
  return chars.length > max ? `${chars.slice(0, max).join('').trimEnd()}…` : clean
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
