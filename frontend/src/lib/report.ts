import { chronological } from './states'
import type {
  Card,
  ClaimStub,
  EvidenceState,
  Report,
  ReviewerOverride,
  Segment,
  SourceInfo,
  Summary,
} from './types'

export const DISCLAIMER_AR = 'تبيّن أداة مدعومة بالذكاء الاصطناعي، لا تغني عن الرجوع إلى أهل العلم'

/**
 * Assemble the `Report` the contract describes. Cards keep the state the rules produced; a human
 * change travels separately in `reviewer_overrides`, so the export can show both.
 */
export function assembleReport(parts: {
  source: SourceInfo
  segments: Segment[]
  cards: Card[]
  summary: Summary
  generatedAt: string
  overrides: ReviewerOverride[]
}): Report {
  return {
    source: parts.source,
    segments: parts.segments,
    cards: [...parts.cards].sort(chronological),
    summary: parts.summary,
    generated_at: parts.generatedAt,
    tool: 'Tabayyun',
    disclaimer_ar: DISCLAIMER_AR,
    reviewer_overrides: parts.overrides,
  }
}

export const emptyCounts = (): Record<EvidenceState, number> => ({
  supported: 0,
  supported_with_note: 0,
  needs_review: 0,
  not_found: 0,
  contradicted: 0,
})

/** Counts by the state each card currently shows (reviewer overrides included). */
export function countStates(
  cards: Card[],
  overrides: ReviewerOverride[],
): Record<EvidenceState, number> {
  const counts = emptyCounts()
  const byCard = new Map(overrides.map((o) => [o.card_id, o]))
  for (const card of cards) counts[byCard.get(card.id)?.state ?? card.state] += 1
  return counts
}

export const stubFromCard = (card: Card): ClaimStub => ({
  id: card.id,
  index: card.index,
  claim_type: card.claim_type,
  text_as_quoted: card.text_as_quoted,
  span: card.span,
  timestamp: card.timestamp,
  position: card.position,
})

/** Unique source names across the report, for the attribution line. */
export function sourcesUsed(cards: Card[]): { name: string; url: string }[] {
  const seen = new Map<string, string>()
  for (const card of cards) {
    for (const source of [card.source, ...card.other_sources]) {
      if (source && !seen.has(source.source_name)) seen.set(source.source_name, source.url)
    }
    for (const grade of card.grades) {
      if (!seen.has(grade.source_name)) seen.set(grade.source_name, grade.source_url)
    }
  }
  return [...seen].map(([name, url]) => ({ name, url }))
}
