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

/*
 * The list is read from storage once and then kept here, so the shell can subscribe to it
 * (`useSyncExternalStore`): saving a report, clearing the history, or another tab doing either
 * updates every place that shows the list or its count.
 */
let cached: HistoryEntry[] | null = null
const listeners = new Set<() => void>()

function publish(next: HistoryEntry[]): HistoryEntry[] {
  cached = next
  for (const listener of listeners) listener()
  return next
}

function readHistory(): HistoryEntry[] {
  const stored = readStored<unknown>(HISTORY_KEY, [])
  if (!Array.isArray(stored)) return []
  return (stored as HistoryEntry[]).filter(
    (entry) => entry && typeof entry.id === 'string' && entry.report && Array.isArray(entry.report.cards),
  )
}

export function loadHistory(): HistoryEntry[] {
  cached ??= readHistory()
  return cached
}

export function subscribeHistory(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === HISTORY_KEY) publish(readHistory())
  }
  listeners.add(listener)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** Insert or update an entry, newest first, capped at ten. Drops the oldest if storage is full. */
export function saveHistoryEntry(entry: HistoryEntry): HistoryEntry[] {
  let next = [entry, ...loadHistory().filter((e) => e.id !== entry.id)].slice(0, HISTORY_LIMIT)
  while (next.length > 0 && !writeStored(HISTORY_KEY, next)) {
    // A long transcript can exceed the quota: forget the oldest report and try again.
    next = next.slice(0, -1)
  }
  return publish(next)
}

export function clearHistory(): HistoryEntry[] {
  removeStored(HISTORY_KEY)
  return publish([])
}
