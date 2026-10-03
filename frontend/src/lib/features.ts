import type { Features, Meta } from './types'

/**
 * Phase 2 feature flags from `GET /api/meta`. The shipped ones default to on, as in the backend's
 * `.env`: only an explicit `false` hides them. Image input and the authentic alternatives are the
 * reverse: only an explicit `true` shows them.
 */
export function featuresOf(meta: Meta | null): Features {
  const flags = meta?.features ?? {}
  return {
    share_card: flags.share_card !== false,
    copy: flags.copy !== false,
    explain: flags.explain !== false,
    image: flags.image === true,
    alternatives: flags.alternatives === true,
  }
}

/** The address a verdict card points to: PUBLIC_URL when the backend has one, else this origin. */
export function appUrlOf(meta: Meta | null): string {
  return meta?.app_url || window.location.origin
}
