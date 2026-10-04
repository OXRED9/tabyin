import { useCallback, useEffect, useState } from 'react'

/**
 * A step is held on screen at least this long, so that work that took a millisecond can be seen
 * being done: seven steps add at most about 1 s to a request that was instant. (It was 420 ms for
 * a few hours on 4 Oct 2026; the team found verification too slow, and the wait for the model is
 * already long enough for the stage to be seen working.)
 */
const HOLD_MS = 60
/** A replay walks the same steps slowly enough to read each one. */
const REPLAY_MS = 520

/**
 * How many steps of the investigation the screen has revealed. It follows the number the server
 * has really reached and never passes it; it only lags, by a short hold per step, so that a step
 * that took a millisecond can be seen. The hold is kept under reduced motion too (v3.1): a step
 * appearing after the one before it is progress, not motion — how a step looks when it appears
 * (a fade, never travel) is the stylesheet's business. `replay` walks the finished steps again,
 * from the start.
 */
export function usePlayhead(reached: number): { shown: number; replaying: boolean; replay: () => void } {
  // A report that is already complete when it is first drawn (reopened from history) has no show.
  const [shown, setShown] = useState(() => (reached >= 7 ? reached : 0))
  const [replaying, setReplaying] = useState(false)

  useEffect(() => {
    if (shown >= reached) return
    const timer = window.setTimeout(() => setShown((n) => Math.min(n + 1, reached)), replaying ? REPLAY_MS : HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [reached, replaying, shown])

  // The replay ends when it has caught up.
  useEffect(() => {
    if (!replaying || shown < reached) return
    const timer = window.setTimeout(() => setReplaying(false), REPLAY_MS)
    return () => window.clearTimeout(timer)
  }, [reached, replaying, shown])

  const replay = useCallback(() => {
    setReplaying(true)
    setShown(0)
  }, [])

  return { shown: Math.min(shown, reached), replaying, replay }
}
