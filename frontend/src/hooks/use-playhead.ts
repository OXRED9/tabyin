import { useCallback, useEffect, useState } from 'react'

import { prefersReducedMotion } from '@/hooks/use-media-query'

/**
 * A step is held on screen at least this long, so that work that took a millisecond can be seen
 * being done: seven steps add at most about 2.9 s to a request that was instant, and nothing to one
 * whose steps each took longer than this (the team asked for the work to be felt — 4 Oct 2026).
 */
const HOLD_MS = 420
/** A replay walks the same steps slowly enough to read each one. */
const REPLAY_MS = 520

/**
 * How many steps of the investigation the screen has revealed. It follows the number the server
 * has really reached and never passes it; it only lags, by a short hold per step, so that a step
 * that took a millisecond can be seen. With reduced motion there is no lag at all. `replay` walks
 * the finished steps again, from the start.
 */
export function usePlayhead(reached: number): { shown: number; replaying: boolean; replay: () => void } {
  // A report that is already complete when it is first drawn (reopened from history) has no show.
  const [shown, setShown] = useState(() => (reached >= 7 ? reached : 0))
  const [replaying, setReplaying] = useState(false)
  const instant = prefersReducedMotion()

  useEffect(() => {
    if (instant || shown >= reached) return
    const timer = window.setTimeout(() => setShown((n) => Math.min(n + 1, reached)), replaying ? REPLAY_MS : HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [instant, reached, replaying, shown])

  // The replay ends when it has caught up.
  useEffect(() => {
    if (!replaying || shown < reached) return
    const timer = window.setTimeout(() => setReplaying(false), REPLAY_MS)
    return () => window.clearTimeout(timer)
  }, [reached, replaying, shown])

  const replay = useCallback(() => {
    if (instant) return
    setReplaying(true)
    setShown(0)
  }, [instant])

  return { shown: instant ? reached : Math.min(shown, reached), replaying, replay }
}
