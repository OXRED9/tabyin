import { useEffect, useRef, useState } from 'react'

import { prefersReducedMotion } from '@/hooks/use-media-query'

const DURATION_MS = 600

/**
 * A counter that runs up to a real number in 600 ms the first time the number appears (and from
 * its last value when it changes). The number is the server's; only the way it arrives is
 * animated. With reduced motion it is simply shown.
 */
export function useCountUp(target: number): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0))
  const from = useRef(prefersReducedMotion() ? target : 0)

  useEffect(() => {
    if (prefersReducedMotion() || from.current === target) return
    const start = from.current
    const began = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const progress = Math.min(1, (now - began) / DURATION_MS)
      // The design's easing, cubic-bezier(.2,.8,.2,1), is close to an ease-out cubic.
      const eased = 1 - (1 - progress) ** 3
      const next = Math.round(start + (target - start) * eased)
      from.current = next
      setValue(next)
      if (progress < 1) frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [target])

  return prefersReducedMotion() ? target : value
}
