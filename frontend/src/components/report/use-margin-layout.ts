import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/** Where the notes sit in the margin, and the hairlines that tie each to its words. */
export interface MarginLayout {
  /** Top of each note, in px from the top of the margin column. */
  tops: Record<string, number>
  /**
   * The resting tie: a short hairline across the gutter, from the edge of the text block to the
   * note, at the passage's first line. Only a note that sits by its passage has one.
   */
  stubs: Record<string, string>
  /** The full tie, from the passage itself to the note: drawn while a note is hovered, focused or open. */
  ties: Record<string, string>
  /** The height the notes need: the margin column reserves it. */
  height: number
}

/**
 * Space between two stacked notes. A collapsed note is one 28px line, so note and gap together
 * are shorter than one line of the page (40px): passages on consecutive lines get notes that
 * each sit level with their own line.
 */
const GAP = 8
/**
 * Where the hairline meets the note, measured from the note's top: just above its foot. A note
 * that was not pushed down has its one line level with its passage's line, and the hairline
 * continues the passage's underline straight across the gutter.
 */
const ANCHOR = 26
/** The underline's centre sits this far above the bottom of the passage's inline box (see `.claim-ink`). */
const UNDERLINE_RISE = 6

const EMPTY: MarginLayout = { tops: {}, stubs: {}, ties: {}, height: 0 }
const crisp = (value: number) => Math.round(value) + 0.5

function sameLayout(a: MarginLayout, b: MarginLayout, ids: string[]): boolean {
  if (Math.abs(a.height - b.height) > 0.5) return false
  if (Object.keys(a.tops).length !== Object.keys(b.tops).length) return false
  for (const id of ids) {
    if (a.tops[id] === undefined || Math.abs(a.tops[id] - b.tops[id]) > 0.5) return false
    if (a.stubs[id] !== b.stubs[id] || a.ties[id] !== b.ties[id]) return false
  }
  return true
}

/**
 * The margin's layout engine. Each note is placed level with the first line of its passage; a
 * note that would collide with the one above is pushed down. Notes with no passage go at the end.
 *
 * At rest the tie is only a stub in the gutter, and a note pushed more than half a line away
 * from its passage has none: a hairline that has to travel is noise. The full tie, passage to
 * note, is computed too and drawn only for the note in hand.
 *
 * Everything is read in one pass (the passages' first line boxes, the notes' heights) and
 * written in one state update, so there is no layout thrash. It runs again on resize, when the
 * fonts finish loading, when a note opens or closes, and when the stream adds a note; all of
 * those arrive through one ResizeObserver or the `signature`.
 */
export function useMarginLayout(
  gridRef: RefObject<HTMLElement | null>,
  ids: string[],
  /** Changes whenever something that affects note heights or order changes. */
  signature: string,
): MarginLayout {
  const [layout, setLayout] = useState<MarginLayout>(EMPTY)
  const idsRef = useRef(ids)
  const frame = useRef(0)

  const measure = useCallback(() => {
    const grid = gridRef.current
    const margin = grid?.querySelector<HTMLElement>('[data-margin]')
    const page = grid?.querySelector<HTMLElement>('[data-page]')
    if (!grid || !margin || !page) return

    // ── Read ──
    const gridBox = grid.getBoundingClientRect()
    const marginBox = margin.getBoundingClientRect()
    const pageBox = page.getBoundingClientRect()
    const head = margin.querySelector<HTMLElement>('[data-margin-head]')
    const marginOnLeft = marginBox.left < pageBox.left
    const marginTop = marginBox.top - gridBox.top
    // The note's text-side edge, the text block's margin-side edge, and the gutter between them.
    const noteX = (marginOnLeft ? marginBox.right : marginBox.left) - gridBox.left
    const textX = (marginOnLeft ? pageBox.left : pageBox.right) - gridBox.left
    const laneX = (noteX + textX) / 2
    const pitch = parseFloat(getComputedStyle(page.querySelector('.page-text') ?? page).lineHeight) || 40

    const measured = idsRef.current.map((id) => {
      const key = CSS.escape(id)
      const note = margin.querySelector<HTMLElement>(`[data-note="${key}"]`)
      const ink = page.querySelector<HTMLElement>(`[data-span="${key}"] .claim-ink`)
      const line = ink ? Array.from(ink.getClientRects()).find((rect) => rect.width > 1) : undefined
      return {
        id,
        height: note?.offsetHeight ?? 0,
        // The underline of the passage's first line, and the end of it nearest the margin.
        lineY: line ? line.bottom - gridBox.top - UNDERLINE_RISE : null,
        lineX: line ? (marginOnLeft ? line.left : line.right) - gridBox.left : null,
      }
    })
    const headHeight = head?.offsetHeight ?? 0

    // ── Compute ──
    const next: MarginLayout = { tops: {}, stubs: {}, ties: {}, height: 0 }
    let cursor = headHeight > 0 ? headHeight + GAP : 0
    for (const item of measured) {
      const wanted = item.lineY === null ? cursor : item.lineY - ANCHOR - marginTop
      const top = Math.max(wanted, cursor)
      const drift = top - wanted
      next.tops[item.id] = top
      cursor = top + item.height + GAP

      if (item.lineY !== null && item.lineX !== null) {
        const y1 = crisp(marginTop + top + ANCHOR)
        const y2 = drift > 0.5 ? crisp(item.lineY) : y1
        const across = `M${crisp(noteX)} ${y1}H${crisp(laneX)}V${y2}`
        next.ties[item.id] = `${across}H${crisp(item.lineX)}`
        if (drift <= pitch / 2) next.stubs[item.id] = `${across}H${crisp(textX)}`
      }
    }
    next.height = Math.max(0, cursor - GAP)

    // ── Write ──
    setLayout((current) => (sameLayout(current, next, idsRef.current) ? current : next))
  }, [gridRef])

  const schedule = useCallback(() => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(measure)
  }, [measure])

  // Synchronously after every change that can move a note, so a new or opened note is never
  // painted in the wrong place.
  useLayoutEffect(() => {
    idsRef.current = ids
    measure()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` stands for `ids` and the notes' content
  }, [measure, signature])

  // Resizes, reflowed text and late fonts.
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const observer = new ResizeObserver(schedule)
    observer.observe(grid)
    for (const element of grid.querySelectorAll('[data-page], [data-note], [data-margin-head]')) {
      observer.observe(element)
    }
    void document.fonts.ready.then(schedule)
    document.fonts.addEventListener('loadingdone', schedule)
    return () => {
      observer.disconnect()
      document.fonts.removeEventListener('loadingdone', schedule)
      cancelAnimationFrame(frame.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-observe when the set of notes changes
  }, [gridRef, schedule, signature])

  return layout
}
