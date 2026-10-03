import {
  BookOpen,
  CircleCheck,
  Lightbulb,
  MessageCircleQuestion,
  OctagonX,
  PencilLine,
  Quote,
  Scale,
  ScrollText,
  SearchX,
  TriangleAlert,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { Card, ClaimType, ContentLevel, EvidenceState, ReviewerOverride } from './types'

/** Riskiest first: this is the order of the grouped report (Von Restorff). */
export const STATES_BY_RISK: EvidenceState[] = [
  'contradicted',
  'not_found',
  'needs_review',
  'supported_with_note',
  'supported',
]

/** Reading order for the one-line summary, as in the pitch deck. */
export const STATES_FOR_SUMMARY: EvidenceState[] = [
  'supported',
  'supported_with_note',
  'needs_review',
  'not_found',
  'contradicted',
]

interface StateStyle {
  icon: LucideIcon
  /** The badge: colour + icon + word. */
  badge: string
  /** The thick edge on the card's inline-start side. */
  edge: string
  /** Text in the state's hue, readable on the card and on the soft surface. */
  ink: string
  /** Tinted surface. */
  soft: string
  /** Solid fill for dots and the big icon disc. */
  solid: string
  /** A highlighted claim inside the transcript. */
  mark: string
  /** Whole-card emphasis for the risky states. */
  cardTone: string
}

export const STATE_STYLE: Record<EvidenceState, StateStyle> = {
  supported: {
    icon: CircleCheck,
    badge: 'bg-supported text-supported-on',
    edge: 'border-s-supported',
    ink: 'text-supported-ink',
    soft: 'bg-supported-soft',
    solid: 'bg-supported',
    mark: 'bg-supported-soft text-supported-ink decoration-supported',
    cardTone: 'bg-card',
  },
  supported_with_note: {
    icon: PencilLine,
    badge: 'bg-noted-soft text-noted-ink border-noted/60',
    edge: 'border-s-noted',
    ink: 'text-noted-ink',
    soft: 'bg-noted-soft',
    solid: 'bg-noted',
    mark: 'bg-noted-soft text-noted-ink decoration-noted',
    cardTone: 'bg-card',
  },
  needs_review: {
    icon: TriangleAlert,
    badge: 'bg-review-soft text-review-ink border-review/60',
    edge: 'border-s-review',
    ink: 'text-review-ink',
    soft: 'bg-review-soft',
    solid: 'bg-review',
    mark: 'bg-review-soft text-review-ink decoration-review',
    cardTone: 'bg-card',
  },
  not_found: {
    icon: SearchX,
    badge: 'bg-missing-soft text-missing-ink border-missing/70',
    edge: 'border-s-missing',
    ink: 'text-missing-ink',
    soft: 'bg-missing-soft',
    solid: 'bg-missing',
    mark: 'bg-missing-soft text-missing-ink decoration-missing',
    cardTone: 'bg-missing-soft ring-missing/70 [--muted-foreground:var(--missing-ink)]',
  },
  contradicted: {
    icon: OctagonX,
    badge: 'bg-contra-solid text-white',
    edge: 'border-s-contra',
    ink: 'text-contra-ink',
    soft: 'bg-contra-soft',
    solid: 'bg-contra-solid',
    mark: 'bg-contra-soft text-contra-ink decoration-contra',
    cardTone: 'bg-contra-soft ring-contra/80 [--muted-foreground:var(--contra-ink)]',
  },
}

export const CLAIM_ICON: Record<ClaimType, LucideIcon> = {
  ayah: BookOpen,
  hadith: ScrollText,
  ruling: Scale,
  attributed_quote: Quote,
  fact: Lightbulb,
  request: MessageCircleQuestion,
}

export const isRisky = (state: EvidenceState) => state === 'contradicted' || state === 'not_found'

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
