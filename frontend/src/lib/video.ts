import type { SourceInfo } from './types'

/**
 * Build a link that opens the source video at a given second. YouTube and Vimeo have their own
 * parameters; anything else gets a standard media fragment (`#t=134`).
 */
export function videoUrlAt(url: string, seconds: number): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  const t = Math.max(0, Math.floor(seconds))
  const host = parsed.hostname.replace(/^www\.|^m\./, '')
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'music.youtube.com') {
    parsed.searchParams.set('t', `${t}s`)
    return parsed.toString()
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    parsed.hash = `t=${t}s`
    return parsed.toString()
  }
  parsed.hash = `t=${t}`
  return parsed.toString()
}

/** A timestamp is clickable only when the report came from a video link. */
export function timestampLink(source: SourceInfo | null, seconds: number): string | null {
  if (!source || source.input_type !== 'video_url' || !source.url) return null
  return videoUrlAt(source.url, seconds)
}
