import type { Action, Card, ContentLevel, EvidenceState, ReviewerOverride } from './types'

/** Riskiest first: the order of «الأهم أولاً» in the phone's list of notes. */
export const STATES_BY_RISK: EvidenceState[] = [
  'contradicted',
  'not_found',
  'needs_review',
  'supported_with_note',
  'supported',
]

/**
 * The action that belongs to each state (the rules' own pairing, in their order). The engine sends
 * a card's action itself; this is only for a state a human reviewer has set, on the verdict card.
 */
export const ACTION_OF_STATE: Record<EvidenceState, Action> = {
  supported: 'adopt',
  supported_with_note: 'correct_wording',
  needs_review: 'refer_to_scholars',
  not_found: 'remove_or_request_source',
  contradicted: 'remove_and_warn',
}

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
    variable: 'var(--supported)',
    inkVariable: 'var(--supported-ink)',
    softVariable: 'var(--supported-soft)',
  },
  supported_with_note: {
    ink: 'text-noted-ink',
    soft: 'bg-noted-soft',
    solid: 'bg-noted',
    tick: 'border-noted',
    variable: 'var(--noted)',
    inkVariable: 'var(--noted-ink)',
    softVariable: 'var(--noted-soft)',
  },
  needs_review: {
    ink: 'text-review-ink',
    soft: 'bg-review-soft',
    solid: 'bg-review',
    tick: 'border-review',
    variable: 'var(--review)',
    inkVariable: 'var(--review-ink)',
    softVariable: 'var(--review-soft)',
  },
  not_found: {
    ink: 'text-missing-ink',
    soft: 'bg-missing-soft',
    solid: 'bg-missing',
    tick: 'border-missing',
    variable: 'var(--missing)',
    inkVariable: 'var(--missing-ink)',
    softVariable: 'var(--missing-soft)',
  },
  contradicted: {
    ink: 'text-contra-ink',
    soft: 'bg-contra-soft',
    solid: 'bg-contra',
    tick: 'border-contra',
    variable: 'var(--contra)',
    inkVariable: 'var(--contra-ink)',
    softVariable: 'var(--contra-soft)',
  },
}

/** The state a card shows: the reviewer's, when a human changed it. */
export function effectiveState(card: Card, override: ReviewerOverride | undefined): EvidenceState {
  return override ? override.state : card.state
}

/**
 * States a human reviewer may choose. The product's non-negotiable rules still bind a reviewer's
 * override, because the export presents the result under the tool's name:
 *  - no "supported" state without a retrieved source text;
 *  - level C is capped at "needs review" and is never "contradicted";
 *  - level D (a personal case) gets no state at all.
 */
export function allowedReviewerStates(
  card: Pick<Card, 'content_level' | 'source'>,
): { states: EvidenceState[]; reason: 'levelD' | 'levelC' | 'needsSource' | null } {
  const level: ContentLevel = card.content_level
  if (level === 'D') return { states: [], reason: 'levelD' }
  if (level === 'C') return { states: ['needs_review', 'not_found'], reason: 'levelC' }
  if (!card.source) return { states: ['needs_review', 'not_found', 'contradicted'], reason: 'needsSource' }
  return { states: [...STATES_FOR_SUMMARY], reason: null }
}

export const chronological = (a: { position?: number; index: number }, b: { position?: number; index: number }) =>
  (a.position ?? a.index) - (b.position ?? b.index) || a.index - b.index
