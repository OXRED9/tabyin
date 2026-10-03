/*
 * Tabayyun's service worker. Plain JavaScript: it is served as it is, with no build step.
 *
 * It does two things and nothing else:
 *
 *  1. It keeps the app shell (the page itself and its hashed assets, each as it is requested) so
 *     the installed app opens without a network. It never answers for /api/*, and it never
 *     stores a verification, a report or anything the user typed.
 *
 *  2. It receives what another app shares to Tabayyun (POST /share-target, declared in the
 *     manifest), keeps it for the page in Cache Storage, in this browser only, and sends the
 *     browser to /?share=1. The page takes it once and deletes it.
 *
 * The page registers this file as /sw.js?v=<build>. The shell cache is named after that build,
 * so a deploy brings a new worker, which takes over at once (skipWaiting + clients.claim) and
 * deletes the caches of older builds: no stale shell.
 */
const BUILD = new URL(self.location.href).searchParams.get('v') || 'dev'
const SHELL = `tabayyun-shell-${BUILD}`
const SHARE = 'tabayyun-share'
const SHARE_PAYLOAD = '/__share__/payload'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.add(new Request('/', { cache: 'reload' })))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('tabayyun-shell-') && name !== SHELL) await caches.delete(name)
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(receiveShare(request))
    return
  }
  // Everything else that is not a plain GET, and the whole API, goes straight to the network.
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) return

  // The app has one page. Anything else opened in a tab (the manifest, an icon) is not the shell.
  if (request.mode === 'navigate' && url.pathname === '/') event.respondWith(page(request))
  else if (url.pathname.startsWith('/assets/')) event.respondWith(asset(request))
})

/** The page: from the network, so a deploy is seen at once; from the cache only when offline. */
async function page(request) {
  const cache = await caches.open(SHELL)
  try {
    const fresh = await fetch(request)
    if (fresh.ok) await cache.put('/', fresh.clone())
    return fresh
  } catch {
    return (await cache.match('/')) || Response.error()
  }
}

/** A hashed asset never changes: from the cache once it has been fetched. */
async function asset(request) {
  const cache = await caches.open(SHELL)
  const kept = await cache.match(request)
  if (kept) return kept
  const fresh = await fetch(request)
  if (fresh.ok) await cache.put(request, fresh.clone())
  return fresh
}

/** What another app shared: kept for the page, then the browser is sent to it. */
async function receiveShare(request) {
  try {
    const form = await request.formData()
    const files = form.getAll('files').filter((entry) => entry instanceof File && entry.size > 0)
    const cache = await caches.open(SHARE)
    const listed = []
    for (let i = 0; i < files.length; i++) {
      const key = `/__share__/file-${i}`
      await cache.put(
        key,
        new Response(files[i], { headers: { 'content-type': files[i].type || 'application/octet-stream' } }),
      )
      listed.push({ key, name: files[i].name, type: files[i].type })
    }
    const payload = {
      title: String(form.get('title') || ''),
      text: String(form.get('text') || ''),
      url: String(form.get('url') || ''),
      files: listed,
    }
    await cache.put(
      SHARE_PAYLOAD,
      new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } }),
    )
    return Response.redirect('/?share=1', 303)
  } catch {
    return Response.redirect('/?share=unavailable', 303)
  }
}
