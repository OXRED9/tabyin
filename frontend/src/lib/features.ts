import type { Features, Meta } from './types'

/**
 * Phase 2 feature flags from `GET /api/meta`. Each defaults to on, as in the backend's `.env`;
 * only an explicit `false` hides a feature.
 */
export function featuresOf(meta: Meta | null): Features {
  const flags = meta?.features ?? {}
  return {
    share_card: flags.share_card !== false,
    copy: flags.copy !== false,
    explain: flags.explain !== false,
  }
}

/** The address a verdict card points to: PUBLIC_URL when the backend has one, else this origin. */
export function appUrlOf(meta: Meta | null): string {
  return meta?.app_url || window.location.origin
}
