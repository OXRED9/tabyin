import { chronological } from './states'
import type { Card, ClaimStub, EvidenceState, Report, Segment, SourceInfo, Summary } from './types'

export const DISCLAIMER_AR = 'تبيّن أداة مدعومة بالذكاء الاصطناعي، لا تغني عن الرجوع إلى أهل العلم'

/** Assemble the `Report` the contract describes: the cards as the rules produced them. */
export function assembleReport(parts: {
  source: SourceInfo
  segments: Segment[]
  cards: Card[]
  summary: Summary
  generatedAt: string
}): Report {
  return {
    source: parts.source,
    segments: parts.segments,
    cards: [...parts.cards].sort(chronological),
    summary: parts.summary,
    generated_at: parts.generatedAt,
    tool: 'Tabayyun',
    disclaimer_ar: DISCLAIMER_AR,
  }
}

export const emptyCounts = (): Record<EvidenceState, number> => ({
  supported: 0,
  supported_with_note: 0,
  needs_review: 0,
  not_found: 0,
  contradicted: 0,
})

/** How many cards there are in each state. */
export function countStates(cards: Card[]): Record<EvidenceState, number> {
  const counts = emptyCounts()
  for (const card of cards) counts[card.state] += 1
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
