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
