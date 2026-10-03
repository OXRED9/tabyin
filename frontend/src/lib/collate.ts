/**
 * Where a quotation lies in its source's text, and which of the source's words differ from it —
 * for the verdict card, which sets the source's own wording and underlines those words.
 *
 * `card.diff` speaks of the matched span only, and for a verse it may spell the words as the
 * matcher's plain text does. Both are mapped here onto the words of `source.text` as displayed:
 * plain string algorithmics, no model, and nothing here decides a state. It is the browser's twin
 * of `_collate` in backend/tabayyun/report/share_card.py and must stay in step with it.
 */
import type { Card } from './types'

// Harakat, Quranic annotation marks, dagger alef and tatweel.
const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭـ࣓-ࣿ]/g
const CONTROLS = /[​-‏‪-‮⁦-⁩﻿]/g
// Honorific ligatures and the ornate brackets.
const LIGATURES = /[ﷺﷻ﴾﴿ﷰ-ﷹ﷽]/g
const LETTER_FORMS: Record<string, string> = {
  'أ': 'ا', // alef with hamza above → alef
  'إ': 'ا', // alef with hamza below
  'آ': 'ا', // alef with madda
  'ٱ': 'ا', // alef wasla
  'ٲ': 'ا',
  'ٳ': 'ا',
  'ؤ': 'و', // waw with hamza → waw
  'ئ': 'ي', // yeh with hamza → yeh
  'ء': '', // hamza
  'ى': 'ي', // alef maqsura → yeh
  'ی': 'ي', // Farsi yeh
  'ې': 'ي',
  'ة': 'ه', // teh marbuta → heh
  'ک': 'ك', // Farsi kaf
  'ۀ': 'ه',
  'ە': 'ه',
}
const LETTER_FORM = new RegExp(`[${Object.keys(LETTER_FORMS).join('')}]`, 'g')
const NOT_ARABIC_LETTER = /[^ء-ي\s]/g
const WORD_BREAK = /[\s،؛؟.,;:!?()[\]{}«»"'“”‘’﴿﴾\-–—ـ…/\\|*]+/

/** For matching only: the text shown is always the source's own. */
function normalise(text: string): string {
  return text
    .replace(LIGATURES, ' ')
    .normalize('NFKC')
    .replace(CONTROLS, '')
    .replace(DIACRITICS, '')
    .replace(LETTER_FORM, (letter) => LETTER_FORMS[letter])
    .replace(NOT_ARABIC_LETTER, ' ')
    .replace(/\s+/g, '')
}

/** The normalised words of a text; pieces with no Arabic letter are skipped. */
const normalisedWords = (text: string): string[] => text.split(WORD_BREAK).map(normalise).filter(Boolean)

/**
 * A text's words as they are drawn. A token with no letter or digit (a pause mark, an end-of-ayah
 * sign, a lone bracket) stays with the word before it, so it never starts a line.
 */
export function displayWords(text: string): string[] {
  const out: string[] = []
  for (const token of text.split(/\s+/).filter(Boolean)) {
    if (out.length > 0 && !/[\p{L}\p{N}]/u.test(token)) out[out.length - 1] += ` ${token}`
    else out.push(token)
  }
  return out
}

function similarity(a: string, b: string): number {
  if (a === b) return 1
  const longest = Math.max(a.length, b.length)
  // Too different in length to be half alike.
  if (Math.min(a.length, b.length) * 2 < longest) return 0
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row.push(Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)))
    }
    previous = row
  }
  return 1 - previous[b.length] / longest
}

const ALIGN_LIMIT = 150_000 // words × words; beyond it the source is shown without marks
const GAP_QUOTED = -0.6
const GAP_SOURCE = -0.4

/**
 * For each normalised word of `quoted`, the index of the word of `source` it corresponds to.
 * Every quoted word is either paired with a similar source word or skipped; source words before
 * the first pair and after the last cost nothing. Similarity is by letters, so the same word in
 * the Mushaf's orthography and in everyday spelling still pair.
 */
function align(quoted: string[], source: string[]): (number | null)[] {
  const n = quoted.length
  const m = source.length
  const pairs: (number | null)[] = Array.from({ length: n }, () => null)
  if (!n || !m || n * m > ALIGN_LIMIT) return pairs
  const score: Float64Array[] = Array.from({ length: n + 1 }, () => new Float64Array(m + 1))
  const move: Uint8Array[] = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)) // 1 pair, 2 skip quoted, 3 skip source
  for (let i = 1; i <= n; i++) {
    score[i][0] = i * GAP_QUOTED
    move[i][0] = 2
    for (let j = 1; j <= m; j++) {
      let best = score[i - 1][j] + GAP_QUOTED
      let step = 2
      const alike = similarity(quoted[i - 1], source[j - 1])
      if (alike >= 0.5 && score[i - 1][j - 1] + 2 * alike - 1 >= best) {
        best = score[i - 1][j - 1] + 2 * alike - 1
        step = 1
      }
      if (score[i][j - 1] + GAP_SOURCE > best) {
        best = score[i][j - 1] + GAP_SOURCE
        step = 3
      }
      score[i][j] = best
      move[i][j] = step
    }
  }
  // The best end: the highest score in the last row, the earliest column among equals.
  let j = 0
  for (let column = 1; column <= m; column++) if (score[n][column] > score[n][j]) j = column
  let i = n
  while (i > 0 && j >= 0) {
    const step = move[i][j]
    if (step === 1) {
      pairs[i - 1] = j - 1
      i -= 1
      j -= 1
    } else if (step === 2) i -= 1
    else if (step === 3) j -= 1
    else break
  }
  return pairs
}

export interface Collation {
  /** The source's words, as drawn. */
  words: string[]
  /** The words the quotation corresponds to: [first, one past the last]. Null when not located. */
  span: [number, number] | null
  /** The words inside the span that differ from the quotation (`card.diff`'s "replace" steps). */
  marks: Set<number>
}

export function collate(card: Pick<Card, 'source' | 'diff' | 'text_as_quoted'>): Collation {
  const words = displayWords(card.source?.text ?? '')
  const none: Collation = { words, span: null, marks: new Set() }
  // Each normalised piece of the source, with the displayed word it belongs to.
  const pieces = words.flatMap((word, index) => normalisedWords(word).map((norm) => ({ index, norm })))
  const quoted =
    card.diff && card.diff.length > 0
      ? card.diff.flatMap((op) => normalisedWords(op.source).map((norm) => ({ norm, differs: op.op === 'replace' })))
      : normalisedWords(card.text_as_quoted).map((norm) => ({ norm, differs: false }))
  const pairs = align(
    quoted.map((word) => word.norm),
    pieces.map((piece) => piece.norm),
  )
  const found = pairs.filter((pair): pair is number => pair !== null)
  if (found.length === 0 || found.length < Math.ceil(quoted.length * 0.6)) return none

  const span: [number, number] = [pieces[Math.min(...found)].index, pieces[Math.max(...found)].index + 1]
  const marks = new Set<number>()
  let i = 0
  while (i < quoted.length) {
    if (!quoted[i].differs) {
      i += 1
      continue
    }
    let end = i
    while (end < quoted.length && quoted[end].differs) end += 1
    const run = pairs.slice(i, end)
    for (const pair of run) if (pair !== null) marks.add(pieces[pair].index)
    if (run.some((pair) => pair === null)) {
      // A differing word with no counterpart found: mark what lies between its two neighbours.
      const before = pairs.slice(0, i).reverse().find((pair) => pair !== null)
      const after = pairs.slice(end).find((pair) => pair !== null)
      if (before != null && after != null) {
        for (let k = before + 1; k < after; k++) marks.add(pieces[k].index)
      }
    }
    i = end
  }
  return { words, span, marks }
}
