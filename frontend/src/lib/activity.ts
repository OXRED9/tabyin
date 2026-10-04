import { readStored, removeStored, writeStored } from './storage'

/*
 * How often this browser has verified something: the times of finished verifications, kept in
 * this browser only and never sent anywhere — no text, no source, nothing but when. It feeds one
 * quiet line in the rail («تحقّقت من N نصاً هذا الأسبوع») and decides when the offer to install is
 * made (after the second report). «مسح السجل» clears it with the history.
 */
const KEY = 'tabayyun.activity'
const KEEP_DAYS = 35
const KEEP = 300
const DAY = 86_400_000

const load = (): string[] => {
  const stored = readStored<unknown>(KEY, [])
  return Array.isArray(stored) ? stored.filter((value): value is string => typeof value === 'string') : []
}

/** Note a finished verification by the time its report was made; the same report counts once. */
export function recordVerification(generatedAt: string): void {
  const times = load()
  if (times.includes(generatedAt)) return
  const oldest = Date.now() - KEEP_DAYS * DAY
  writeStored(KEY, [...times, generatedAt].filter((time) => Date.parse(time) >= oldest).slice(-KEEP))
}

/** Verifications finished in the last seven days. */
export function verificationsThisWeek(now = Date.now()): number {
  return load().filter((time) => now - Date.parse(time) < 7 * DAY).length
}

/** Every verification still remembered (about a month). */
export const verificationsRemembered = (): number => load().length

export function clearActivity(): string[] {
  const times = load()
  removeStored(KEY)
  return times
}

export function restoreActivity(times: string[]): void {
  if (times.length > 0) writeStored(KEY, times)
}
