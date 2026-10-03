import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/** Where the notes sit in the margin, and the hairlines that tie each to its words. */
export interface MarginLayout {
  /** Top of each note, in px from the top of the margin column. */
  tops: Record<string, number>
  /** One SVG path per note that has a passage in the text, in the grid's own coordinates. */
  paths: Record<string, string>
  /** The height the notes need: the margin column reserves it. */
  height: number
}

/** Space between two notes that had to be stacked. */
const GAP = 12
/**
 * Where the hairline meets the note, measured from the note's top: the seam between its two
 * lines. A note that was not pushed down sits with its first line level with its passage and
 * the hairline runs straight.
 */
const ANCHOR = 24
/** The underline's centre sits this far above the bottom of the passage's inline box (see `.claim-ink`). */
const UNDERLINE_RISE = 6
/** Stacked notes get their own lane in the gutter, so hairlines do not share a vertical while there is room. */
const LANE_START = 6
const LANE_STEP = 4

const EMPTY: MarginLayout = { tops: {}, paths: {}, height: 0 }
const crisp = (value: number) => Math.round(value) + 0.5

function sameLayout(a: MarginLayout, b: MarginLayout, ids: string[]): boolean {
  if (Math.abs(a.height - b.height) > 0.5) return false
  if (Object.keys(a.tops).length !== Object.keys(b.tops).length) return false
  for (const id of ids) {
    if (a.tops[id] === undefined || Math.abs(a.tops[id] - b.tops[id]) > 0.5) return false
    if (a.paths[id] !== b.paths[id]) return false
  }
  return true
}

/**
 * The margin's layout engine. Each note is placed level with the first line of its passage; a
 * note that would collide with the one above is pushed down, and its hairline becomes an elbow
 * through the gutter. Notes with no passage go at the end.
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
    // The note's text-side edge, and the direction from it towards the text.
    const noteX = (marginOnLeft ? marginBox.right : marginBox.left) - gridBox.left
    const towardsText = marginOnLeft ? 1 : -1
    const gutter = Math.abs((marginOnLeft ? pageBox.left : pageBox.right) - gridBox.left - noteX)
    const lanes = Math.max(1, Math.floor((gutter - 2 * LANE_START) / LANE_STEP) + 1)

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
    const next: MarginLayout = { tops: {}, paths: {}, height: 0 }
    let cursor = headHeight > 0 ? headHeight + GAP : 0
    let lane = 0
    for (const item of measured) {
      const wanted = item.lineY === null ? cursor : item.lineY - ANCHOR - marginTop
      const top = Math.max(wanted, cursor)
      const pushed = item.lineY !== null && top - wanted > 0.5
      lane = pushed ? Math.min(lane + 1, lanes) : 0
      next.tops[item.id] = top
      cursor = top + item.height + GAP

      if (item.lineY !== null && item.lineX !== null) {
        const y1 = crisp(marginTop + top + ANCHOR)
        const y2 = pushed ? crisp(item.lineY) : y1
        const laneX = crisp(noteX + towardsText * (LANE_START + (pushed ? lane - 1 : 0) * LANE_STEP))
        // Always the same four commands, so the path can glide when a note above opens.
        next.paths[item.id] = `M${crisp(noteX)} ${y1}H${laneX}V${y2}H${crisp(item.lineX)}`
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
