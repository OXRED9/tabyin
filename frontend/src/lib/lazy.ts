import { createElement, lazy, useState } from 'react'
import type { ComponentType, FunctionComponent } from 'react'

/**
 * `lazy`, with a way to fetch the code ahead of the first render. A lazy component always starts
 * with one empty frame, even when its code is already in the browser; one that was preloaded
 * renders at once, so what stands below it is not set first and pushed down a frame later.
 */
export function lazyWithPreload<P extends object>(
  factory: () => Promise<{ default: ComponentType<P> }>,
): FunctionComponent<P> & { preload: () => Promise<void> } {
  let loaded: ComponentType<P> | null = null
  const Lazy = lazy(factory) as unknown as ComponentType<P>
  function Preloadable(props: P) {
    // Chosen once per mount: swapping the type later would remount the component and lose its state.
    const [Impl] = useState<ComponentType<P>>(() => loaded ?? Lazy)
    return createElement(Impl, props)
  }
  Preloadable.preload = () =>
    factory().then(
      (module) => {
        loaded = module.default
      },
      () => undefined,
    )
  return Preloadable
}
