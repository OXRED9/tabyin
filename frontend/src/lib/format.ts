import type { UiLang } from './types'

/** 134 → "02:14", 3725 → "1:02:05". Western digits in both languages, like the pitch deck. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** A file size in the unit that reads naturally: kilobytes under 1 MB, megabytes above. */
export function formatFileSize(bytes: number): { size: string; unit: 'kb' | 'mb' } {
  const mb = bytes / (1024 * 1024)
  if (mb < 1) return { size: Math.max(1, Math.round(bytes / 1024)).toString(), unit: 'kb' }
  return { size: mb >= 10 ? mb.toFixed(0) : mb.toFixed(1), unit: 'mb' }
}

export function formatDateTime(iso: string, lang: UiLang): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function formatSeconds(seconds: number): string {
  if (seconds < 10) return (Math.round(seconds * 10) / 10).toString()
  return Math.round(seconds).toString()
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

/** Slice by code points, because the backend's span offsets count characters, not UTF-16 units. */
export function sliceByCodePoints(text: string, start: number, end?: number): string {
  // Fast path: no astral characters, so UTF-16 units and code points coincide.
  if (!/[\uD800-\uDFFF]/.test(text)) return text.slice(start, end)
  return Array.from(text).slice(start, end).join('')
}

export function codePointLength(text: string): number {
  return /[\uD800-\uDFFF]/.test(text) ? Array.from(text).length : text.length
}

export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.')
  } catch {
    return false
  }
}

/** Only http(s) links from the API are ever rendered as anchors. */
export function safeHref(value: string | null | undefined): string | undefined {
  return value && isHttpUrl(value) ? value : undefined
}
