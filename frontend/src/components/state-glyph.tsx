import type { CSSProperties } from 'react'

import type { EvidenceState } from '@/lib/types'
import { cn } from '@/lib/utils'

/*
 * The five state glyphs are one drawing, a ring, in five conditions: closed and checked, closed
 * with a dot, half open, broken, struck through. 20px grid, 1.5px stroke. The ring is the one
 * piece of Mushaf ornament in the product, and gold appears on it once: on the closed ring of a
 * verified quotation, as the marker that closes an ayah.
 */
const RING = <circle cx="10" cy="10" r="7.25" />

export function StateGlyph({
  state,
  className,
  style,
}: {
  state: EvidenceState | 'pending'
  className?: string
  /** For the verdict card, which is sized in pixels and not by classes. */
  style?: CSSProperties
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-glyph={state}
      className={cn('size-5 shrink-0', className)}
      style={style}
    >
      {state === 'supported' ? (
        <>
          <g stroke="var(--gold)">{RING}</g>
          <path d="M6.75 10.25 9 12.5l4.25-4.75" stroke="var(--supported)" />
        </>
      ) : state === 'supported_with_note' ? (
        <>
          <g stroke="var(--noted)">{RING}</g>
          <circle cx="10" cy="10" r="1.6" fill="var(--noted)" />
        </>
      ) : state === 'needs_review' ? (
        <path d="M15.13 4.87A7.25 7.25 0 0 0 4.87 15.13" stroke="var(--review)" />
      ) : state === 'not_found' ? (
        <path d="M16.81 7.52A7.25 7.25 0 1 1 12.48 3.19" stroke="var(--missing)" />
      ) : state === 'contradicted' ? (
        <g stroke="var(--contra)">
          {RING}
          <path d="M4.25 15.75 15.75 4.25" />
        </g>
      ) : (
        <g stroke="var(--rule-strong)" strokeDasharray="1.5 3">
          {RING}
        </g>
      )}
    </svg>
  )
}
