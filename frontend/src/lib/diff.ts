import type { DiffOp } from './types'

export const hasDifferences = (diff: DiffOp[] | null): diff is DiffOp[] =>
  !!diff && diff.some((op) => op.op !== 'equal')

/** True when the diff's source side reproduces the source text word for word. */
export function diffCoversSource(diff: DiffOp[], sourceText: string): boolean {
  const squash = (s: string) => s.replace(/\s+/g, ' ').trim()
  return squash(diff.map((op) => op.source).filter(Boolean).join(' ')) === squash(sourceText)
}

/** True when part of the source was left out of the quotation. */
export const hasUnquoted = (diff: DiffOp[]) => diff.some((op) => op.op === 'insert')

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * Where the compared part of the source sits in its full text: the text before it and after it, so
 * the whole source can be shown with only the related words marked. Null when it cannot be placed.
 */
export function sourceWindow(diff: DiffOp[], sourceText: string): { before: string; after: string } | null {
  const window = squash(diff.map((op) => op.source).filter(Boolean).join(' '))
  if (!window) return null
  const full = squash(sourceText)
  const at = full.indexOf(window)
  return at < 0 ? null : { before: full.slice(0, at), after: full.slice(at + window.length) }
}
