/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

import { build, files, version } from '$service-worker';
import { PDFJS_VERSION } from '$lib/utils/pdfjsVersion';

// ─── Cache Configuration ───────────────────────────────────────
const CACHE = `cache-${version}`;

const ASSETS = [
    ...build, // the app itself (JS, CSS, etc.)
    ...files  // everything in `static`
];

// ocr.ts loads pdf.js from this CDN at runtime rather than bundling it, so
// on a slow mobile connection the very first PDF upload could otherwise
// spend up to loadPdfJs()'s whole timeout just fetching this script live —
// exactly the "smooth on desktop broadband, stalls on phone" gap reported.
// Precaching it here (same retry-hardened path as the app's own assets)
// means every upload after the very first successful online session reads
// it straight from cache with no network round-trip at all.
const THIRD_PARTY_PRECACHE = [
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`,
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`
];

// A device on a weak signal is exactly the device most likely to have a
// single install-time fetch fail — and silently dropping that one asset
// (previously: one try, log, move on) is how the cache ends up serving a
// page with missing CSS/JS later. A couple of quick retries costs nothing
// when online and meaningfully improves the odds of a complete cache when
// the connection is merely flaky rather than actually absent.
async function fetchWithRetry(input: RequestInfo, init: RequestInit, attempts = 3, delayMs = 800): Promise<Response> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
        try {
            const response = await fetch(input, init);
            if (response.ok) return response;
            lastErr = new Error(`HTTP ${response.status}`);
        } catch (err) {
            lastErr = err;
        }
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
    throw lastErr;
}

// ─── Install: Pre-cache all assets ─────────────────────────────
self.addEventListener('install', (event) => {
    async function addFilesToCache() {
        const cache = await caches.open(CACHE);

        // Robust caching: try each asset individually (with retries) so one
        // persistently-failing asset doesn't kill the whole SW install, but
        // a merely-flaky connection doesn't silently drop assets either.
        const promises = ASSETS.map(async (url) => {
            try {
                const response = await fetchWithRetry(url, { cache: 'reload' });
                await cache.put(url, response);
            } catch (err) {
                console.error(`[SW] Failed to cache asset after retries: ${url}`, err);
            }
        });

        const thirdPartyPromises = THIRD_PARTY_PRECACHE.map(async (url) => {
            try {
                // mode: 'cors' — these URLs must resolve to a real, cacheable
                // CORS response (cdnjs serves Access-Control-Allow-Origin: *)
                // for the fetch handler's cache-first path to reuse it later.
                const response = await fetchWithRetry(url, { mode: 'cors', cache: 'reload' });
                await cache.put(url, response);
            } catch (err) {
                console.warn(`[SW] Failed to precache third-party asset: ${url}`, err);
            }
        });

        await Promise.all([...promises, ...thirdPartyPromises]);

        // Pre-cache the app shell (root page) for offline navigation.
        // This is the SvelteKit app shell that the client-side router needs.
        try {
            const rootResponse = await fetchWithRetry('/', { cache: 'reload' });
            await cache.put('/', rootResponse);
            console.log('[SW] Pre-cached app shell (/)');
        } catch (e) {
            console.warn('[SW] Failed to pre-cache app shell after retries:', e);
        }
    }

    // Activate immediately
    (self as any).skipWaiting();
    event.waitUntil(addFilesToCache());
});

// ─── Activate: Clean old caches + claim clients ────────────────
self.addEventListener('activate', (event) => {
    async function deleteOldCaches() {
        for (const key of await caches.keys()) {
            if (key !== CACHE) await caches.delete(key);
        }
    }

    // Take control of all clients immediately
    event.waitUntil(
        deleteOldCaches().then(() => (self as any).clients.claim())
    );
});

// ─── Fetch: Network-first with cache fallback ──────────────────
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    const isLocal = url.origin === self.location.origin;

    // ⚡ Never intercept API routes — always let them hit the network directly
    // Caching API responses causes stale auth errors, 500s, or wrong data to be served
    if (isLocal && url.pathname.startsWith('/api/')) return;

    // Auth flows are meaningless offline (you can't log in or reset a
    // password without a live connection) and some carry one-time tokens —
    // never cache or serve them from the SW cache.
    if (isLocal && url.pathname.startsWith('/auth/')) return;

    // Critical Third-Party Assets (CDNs) that we WANT to cache for mobile efficiency
    const isCriticalThirdParty =
        url.hostname.includes('cdnjs.cloudflare.com') ||
        url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com') ||
        url.hostname.includes('unpkg.com');

    async function respond(): Promise<Response> {
        const cache = await caches.open(CACHE);

        // Strategy 1: Cache-first for pre-built assets and critical third-party libs
        if ((isLocal && ASSETS.includes(url.pathname)) || isCriticalThirdParty) {
            const cachedResponse = await cache.match(event.request);
            if (cachedResponse) return cachedResponse;

            // If it's a critical third-party but not in cache, fetch and cache it
            if (isCriticalThirdParty) {
                try {
                    const response = await fetch(event.request);
                    if (response.status === 200) {
                        cache.put(event.request, response.clone());
                    }
                    return response;
                } catch (e) {
                    // Fallback to whatever we have
                }
            }
        }

        // Strategy 2: Network-first for navigation and other local pages
        try {
            const response = await fetch(event.request);

            if (!(response instanceof Response)) {
                throw new Error('Invalid response from fetch');
            }

            // Cache successful local navigations too, not just static
            // assets. This app has no +page.server.ts/+layout.server.ts
            // embedding per-user data into the server-rendered HTML for any
            // dashboard route — the shell is generic and all personalization
            // happens client-side after hydration — so caching it here is
            // safe. Without this, a route other than "/" had nothing of its
            // own to fall back to when offline, so it always fell back to
            // the cached landing page instead, showing the wrong page
            // entirely for a URL like /dashboard/upload.
            if (isLocal && response.status === 200) {
                cache.put(event.request, response.clone());
            }

            return response;
        } catch (err) {
            // Fallback to cache on network failure — this specific URL first
            const cachedResponse = await cache.match(event.request);
            if (cachedResponse) return cachedResponse;

            // Only fall back to the generic app shell for a route that was
            // never visited (and thus never cached) while online.
            if (event.request.mode === 'navigate') {
                const appShell = await cache.match('/');
                if (appShell) return appShell;
            }

            throw err;
        }
    }

    event.respondWith(respond());
});


// ─── Background Sync: Retry failed uploads ─────────────────────
self.addEventListener('sync', (event: any) => {
    if (event.tag === 'sync-offline-uploads') {
        event.waitUntil(
            // Notify all clients to process their offline queues
            (self as any).clients.matchAll().then((clients: any[]) => {
                clients.forEach((client: any) => {
                    client.postMessage({ type: 'SYNC_OFFLINE_QUEUE' });
                });
            })
        );
    }
});

// ─── Push Notifications (future-ready) ─────────────────────────
self.addEventListener('push', (event: any) => {
    const data = event.data?.json() ?? {};
    const title = data.title || 'CEDIMS';
    const options = {
        body: data.body || 'You have a new notification',
        icon: '/app_icon.png',
        badge: '/app_icon.png',
        tag: data.tag || 'default',
        data: { url: data.url || '/dashboard' },
        actions: data.actions || [],
        vibrate: [100, 50, 100]
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// ─── Notification Click: Open the relevant page ────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification as any).data?.url || '/dashboard';

    event.waitUntil(
        (self as any).clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients: any[]) => {
            // Focus existing window if available
            for (const client of clients) {
                if (client.url.includes(url) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise open a new window
            return (self as any).clients.openWindow(url);
        })
    );
});
