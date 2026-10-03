/**
 * localStorage helpers. Everything the app remembers (language, theme, reviewer name, the last
 * ten reports) stays in this browser; nothing here is ever sent to a server.
 */

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writeStored(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    // Private mode or a full quota: the app keeps working without persistence.
    return false
  }
}

export function removeStored(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* nothing to do */
  }
}
