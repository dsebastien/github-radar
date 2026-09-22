// GitHub Radar service worker: caches the app shell (the page, its hashed assets, icons) so
// the dashboard opens offline and instantly. API responses are never cached here: requests to
// api.github.com are cross-origin and pass straight through; the item list lives in
// localStorage already.
const CACHE = 'radar-shell-v1'
const SHELL = ['./', 'favicon.svg', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png']

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE)
            .then((cache) => cache.addAll(SHELL))
            .then(() => self.skipWaiting())
    )
})

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
            )
            .then(() => self.clients.claim())
    )
})

/** Hashed build assets referenced by a page, as absolute URLs. */
function assetsOf(html, base) {
    return [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)].map(
        (m) => new URL(m[1], base).href
    )
}

/**
 * Navigations go to the network first (revalidating, so a new deploy shows up at once) and
 * fall back to the cached page offline. A fresh page also drops the assets of older builds.
 */
async function navigate(request) {
    const cache = await caches.open(CACHE)
    const index = new URL('./', self.registration.scope).href
    try {
        const response = await fetch(request, { cache: 'no-cache' })
        if (response.ok) {
            const html = await response.clone().text()
            const keep = new Set(assetsOf(html, index))
            for (const key of await cache.keys()) {
                if (key.url.includes('/assets/') && !keep.has(key.url)) await cache.delete(key)
            }
            await cache.put(index, response.clone())
        }
        return response
    } catch {
        return (await cache.match(index)) ?? Response.error()
    }
}

/** Everything else of our own is immutable (hashed) or tiny: cache first, then network. */
async function asset(request) {
    const cache = await caches.open(CACHE)
    const hit = await cache.match(request)
    if (hit) return hit
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
}

self.addEventListener('fetch', (event) => {
    const { request } = event
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
    event.respondWith(request.mode === 'navigate' ? navigate(request) : asset(request))
})
