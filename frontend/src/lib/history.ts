/**
 * Local history: the last ten reports, kept in this browser's localStorage and nowhere else.
 * It is the only place the user's input is ever persisted.
 */
import { readStored, removeStored, writeStored } from './storage'
import type { InputType, Report } from './types'

const HISTORY_KEY = 'tabayyun.history.v1'
export const HISTORY_LIMIT = 10

export interface SubmittedInput {
  input_type: InputType
  text?: string
  url?: string
  file_name?: string
}

export interface HistoryEntry {
  id: string
  saved_at: string
  title: string
  input: SubmittedInput
  report: Report
}

export function loadHistory(): HistoryEntry[] {
  const stored = readStored<unknown>(HISTORY_KEY, [])
  if (!Array.isArray(stored)) return []
  return (stored as HistoryEntry[]).filter(
    (entry) => entry && typeof entry.id === 'string' && entry.report && Array.isArray(entry.report.cards),
  )
}

/** Insert or update an entry, newest first, capped at ten. Drops the oldest if storage is full. */
export function saveHistoryEntry(entry: HistoryEntry): HistoryEntry[] {
  let next = [entry, ...loadHistory().filter((e) => e.id !== entry.id)].slice(0, HISTORY_LIMIT)
  while (next.length > 0 && !writeStored(HISTORY_KEY, next)) {
    // A long transcript can exceed the quota: forget the oldest report and try again.
    next = next.slice(0, -1)
  }
  return next
}

export function clearHistory(): HistoryEntry[] {
  removeStored(HISTORY_KEY)
  return []
}
