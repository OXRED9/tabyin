/**
 * The installable app (F6): the service worker's registration, what another app shared to
 * Tabayyun, and the offer to install. None of it is needed to paint or to verify.
 */
import { MOCK_MODE, loadMock } from './api'
import { readStored, writeStored } from './storage'

declare const __BUILD_ID__: string

// ── What was shared to the app ───────────────────────────────────────────────────────────────

export interface SharedPayload {
  title: string
  text: string
  url: string
  files: File[]
}

// The same names as in public/sw.js, which writes what this reads.
const SHARE_CACHE = 'tabayyun-share'
const SHARE_PAYLOAD = '/__share__/payload'

/**
 * Take what the service worker kept from `POST /share-target`, once: it is deleted as it is read.
 * It never leaves the browser before the user's verification sends it.
 */
export async function takeSharedPayload(): Promise<SharedPayload | null> {
  if (MOCK_MODE) {
    const { mockSharePayload } = await loadMock()
    return mockSharePayload()
  }
  if (!('caches' in window)) return null
  try {
    const cache = await caches.open(SHARE_CACHE)
    const kept = await cache.match(SHARE_PAYLOAD)
    if (!kept) return null
    const data = (await kept.json()) as Omit<SharedPayload, 'files'> & {
      files?: { key: string; name: string; type: string }[]
    }
    const files: File[] = []
    for (const entry of data.files ?? []) {
      const body = await cache.match(entry.key)
      if (body) files.push(new File([await body.blob()], entry.name, { type: entry.type }))
    }
    await caches.delete(SHARE_CACHE)
    return { title: data.title ?? '', text: data.text ?? '', url: data.url ?? '', files }
  } catch {
    return null
  }
}

// ── The service worker ───────────────────────────────────────────────────────────────────────

/** Once the page has loaded and settled: what follows is for installing and for the next visit. */
function afterLoad(task: () => void): void {
  const later = () => window.setTimeout(task, 3000)
  if (document.readyState === 'complete') later()
  else window.addEventListener('load', later, { once: true })
}

/**
 * The manifest and the home-screen icon are linked after the first paint, not in the page's head:
 * the browser fetches both as soon as it sees the link (to decide whether the app can be
 * installed), and on a slow connection that competes with the fonts and the code of the page
 * itself. Browsers read the link when it appears, and again when the user asks to install.
 */
function linkManifest(): void {
  const link = (rel: string, href: string) => {
    if (document.head.querySelector(`link[rel="${rel}"]`)) return
    const element = document.createElement('link')
    element.rel = rel
    element.href = href
    document.head.appendChild(element)
  }
  link('manifest', '/manifest.webmanifest')
  link('apple-touch-icon', '/icons/icon-maskable-512.png')
}

/**
 * Registered only in a production build and a secure context: the worker is for the next visit,
 * not for this one's first paint. Its URL carries the build, which names its cache (see
 * public/sw.js).
 */
function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !window.isSecureContext || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.register(`/sw.js?v=${__BUILD_ID__}`).catch(() => undefined)
}

// ── The offer to install ─────────────────────────────────────────────────────────────────────

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** `prompt`: the browser can install the app now. `ios`: Safari can, by hand, from its share button. */
export type InstallOffer = 'prompt' | 'ios' | null

const INSTALL_KEY = 'tabayyun.install'
let deferred: InstallPromptEvent | null = null
let offer: InstallOffer = null
/** The line was answered or closed on this page: it stays away even where mock mode forces it. */
let closed = false
const listeners = new Set<() => void>()

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true
const isIosSafari = () =>
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
  !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent)

function refresh(): void {
  // Mock mode can force either line, for captures: `?mock=1&install=1` or `&install=ios`.
  const forced = MOCK_MODE && !closed ? new URLSearchParams(window.location.search).get('install') : null
  const next: InstallOffer = forced
    ? forced === 'ios'
      ? 'ios'
      : 'prompt'
    : readStored<string>(INSTALL_KEY, '') || isStandalone()
      ? null
      : deferred
        ? 'prompt'
        : isIosSafari()
          ? 'ios'
          : null
  if (next === offer) return
  offer = next
  for (const listener of listeners) listener()
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const installOffer = (): InstallOffer => offer

/** «تثبيت»: the browser's own prompt. Whatever the answer, the line is not shown again. */
export async function acceptInstall(): Promise<void> {
  const event = deferred
  deferred = null
  closed = true
  writeStored(INSTALL_KEY, 'asked')
  refresh()
  if (!event) return
  try {
    await event.prompt()
    await event.userChoice
  } catch {
    /* The prompt could not be shown: nothing to do. */
  }
}

/** The line was closed: it is remembered, in this browser, and not shown again. */
export function dismissInstall(): void {
  closed = true
  writeStored(INSTALL_KEY, 'dismissed')
  refresh()
}

/** Called once, before the app renders: the install event can fire early and must not be missed. */
export function initPwa(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    // The offer is made later, in the report's footer, never by the browser's own banner on load.
    event.preventDefault()
    deferred = event as InstallPromptEvent
    refresh()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    writeStored(INSTALL_KEY, 'installed')
    refresh()
  })
  refresh()
  afterLoad(() => {
    linkManifest()
    registerServiceWorker()
  })
}
