import { isHttpUrl } from './format'

/** What a pasted link turned out to be. `certain` is false when the host told us nothing. */
export interface DetectedLink {
  url: string
  kind: 'article_url' | 'video_url'
  platform: 'youtube' | 'tiktok' | 'video' | 'article'
  certain: boolean
}

const MEDIA_PATH = /\.(mp3|m4a|wav|ogg|oga|opus|aac|flac|mp4|m4v|mov|mkv|webm)(\?.*)?$/i
const VIDEO_HOSTS = [
  'vimeo.com',
  'dailymotion.com',
  'x.com',
  'twitter.com',
  'instagram.com',
  'facebook.com',
  'fb.watch',
  'snapchat.com',
  'twitch.tv',
]

/** Accept "youtube.com/watch?v=…" as typed: people rarely type the scheme. */
export function normaliseUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  return /^[^\s/]+\.[^\s/]+/.test(trimmed) ? `https://${trimmed}` : trimmed
}

const hostIs = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`)

/**
 * The field holds a link when its whole content is one address: no spaces, and a host with a dot.
 * A text that merely contains a link stays a text.
 */
export function detectLink(text: string): DetectedLink | null {
  const trimmed = text.trim()
  if (!trimmed || /\s/.test(trimmed)) return null
  const hasScheme = /^https?:\/\//i.test(trimmed)
  // Without a scheme, only something shaped like "host.tld/…" in Latin letters counts.
  if (!hasScheme && !/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(trimmed)) return null
  const url = normaliseUrl(trimmed)
  if (!isHttpUrl(url)) return null

  const parsed = new URL(url)
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  if (hostIs(host, 'youtube.com') || host === 'youtu.be') {
    return { url, kind: 'video_url', platform: 'youtube', certain: true }
  }
  if (hostIs(host, 'tiktok.com')) return { url, kind: 'video_url', platform: 'tiktok', certain: true }
  if (VIDEO_HOSTS.some((domain) => hostIs(host, domain)) || MEDIA_PATH.test(parsed.pathname)) {
    return { url, kind: 'video_url', platform: 'video', certain: true }
  }
  return { url, kind: 'article_url', platform: 'article', certain: false }
}

/** Something typed as an address ("https://…") that is not a usable one. */
export function looksLikeBrokenLink(text: string): boolean {
  const trimmed = text.trim()
  return !!trimmed && !/\s/.test(trimmed) && /^(https?:\/\/|www\.)/i.test(trimmed) && detectLink(trimmed) === null
}
