/**
 * Toasts answer an action, so nothing about them is needed to paint the page: the toaster and
 * its library are fetched the first time something has to be said.
 */
type Toast = (typeof import('sonner'))['toast']

let wanted = false
const listeners = new Set<() => void>()
let mounted: Promise<void> | null = null
let markMounted: () => void = () => {}

/** The shell subscribes to this and mounts the toaster once it is wanted. */
export function subscribeToaster(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const toasterWanted = () => wanted

/** Called by the toaster once it is on the page and listening. */
export const toasterMounted = () => markMounted()

/** Say something in a toast: `notify((toast) => toast.success('…'))`. */
export function notify(say: (toast: Toast) => void): void {
  if (!mounted) {
    mounted = new Promise<void>((resolve) => {
      markMounted = resolve
    })
    wanted = true
    for (const listener of listeners) listener()
  }
  // A toast published before the toaster listens would be lost, so wait for both.
  void Promise.all([import('sonner'), mounted]).then(([{ toast }]) => say(toast))
}
