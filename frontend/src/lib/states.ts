import type { EvidenceState } from './types'

/** Riskiest first: the order of «الأهم أولاً» in the phone's list of notes. */
export const STATES_BY_RISK: EvidenceState[] = [
  'contradicted',
  'not_found',
  'needs_review',
  'supported_with_note',
  'supported',
]

/** Reading order for the summary sentence, as in the pitch deck. */
export const STATES_FOR_SUMMARY: EvidenceState[] = [
  'supported',
  'supported_with_note',
  'needs_review',
  'not_found',
  'contradicted',
]

/**
 * How a state is drawn. A state is never colour alone: its ring glyph (`StateGlyph`) and its word
 * always come with it. The classes are spelled out so Tailwind sees them.
 */
interface StateStyle {
  /** The words, in the state's ink. */
  ink: string
  /** The tint behind an active highlight. */
  soft: string
  /** A solid fill (the similarity meter). */
  solid: string
  /** The 2px tick on a note's text-side edge. */
  tick: string
  /** The start edge of an evidence card, in the state's colour (the other edges stay hairlines). */
  edge: string
  /** The CSS variable holding the solid colour: underlines and connectors read it. */
  variable: string
  /** The CSS variable holding the ink colour. */
  inkVariable: string
  /** The CSS variable holding the soft colour. */
  softVariable: string
}

export const STATE_STYLE: Record<EvidenceState, StateStyle> = {
  supported: {
    ink: 'text-supported-ink',
    soft: 'bg-supported-soft',
    solid: 'bg-supported',
    tick: 'border-supported',
    edge: 'border-s-supported',
    variable: 'var(--supported)',
    inkVariable: 'var(--supported-ink)',
    softVariable: 'var(--supported-soft)',
  },
  supported_with_note: {
    ink: 'text-noted-ink',
    soft: 'bg-noted-soft',
    solid: 'bg-noted',
    tick: 'border-noted',
    edge: 'border-s-noted',
    variable: 'var(--noted)',
    inkVariable: 'var(--noted-ink)',
    softVariable: 'var(--noted-soft)',
  },
  needs_review: {
    ink: 'text-review-ink',
    soft: 'bg-review-soft',
    solid: 'bg-review',
    tick: 'border-review',
    edge: 'border-s-review',
    variable: 'var(--review)',
    inkVariable: 'var(--review-ink)',
    softVariable: 'var(--review-soft)',
  },
  not_found: {
    ink: 'text-missing-ink',
    soft: 'bg-missing-soft',
    solid: 'bg-missing',
    tick: 'border-missing',
    edge: 'border-s-missing',
    variable: 'var(--missing)',
    inkVariable: 'var(--missing-ink)',
    softVariable: 'var(--missing-soft)',
  },
  contradicted: {
    ink: 'text-contra-ink',
    soft: 'bg-contra-soft',
    solid: 'bg-contra',
    tick: 'border-contra',
    edge: 'border-s-contra',
    variable: 'var(--contra)',
    inkVariable: 'var(--contra-ink)',
    softVariable: 'var(--contra-soft)',
  },
}

/** What most needs attention first, and the text's order inside each state. */
export const byAttention = (
  a: { state: EvidenceState; position?: number; index: number },
  b: { state: EvidenceState; position?: number; index: number },
) => STATES_BY_RISK.indexOf(a.state) - STATES_BY_RISK.indexOf(b.state) || chronological(a, b)

export const chronological = (a: { position?: number; index: number }, b: { position?: number; index: number }) =>
  (a.position ?? a.index) - (b.position ?? b.index) || a.index - b.index
