/* Neon Mayham VIP — offline-first service worker.
   First visit: everything is downloaded and stored. After that the game opens with no internet.
   When online the newest version is always used; offline the stored copy is used. */
const VERSION = 'nmv-online-v2';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const PEER = /peerjs@1\.5\.4\/dist\/peerjs\.min\.js$/;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(CORE);
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach((cl) => cl.postMessage({ type: 'cached' }));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  if (!sameOrigin && !PEER.test(url.href)) return;     // matchmaking / WebRTC traffic is never touched
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    // Online: always the NEWEST files (so an update reaches players at once).
    // Offline or very slow: the stored copy, so the game still opens.
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 5000);
      const res = await fetch(req, { signal: ctl.signal, cache: 'no-cache' });
      clearTimeout(timer);
      if (res && (res.ok || res.type === 'opaque')) { cache.put(req, res.clone()); return res; }
      const hit = await cache.match(req, { ignoreSearch: sameOrigin });
      return hit || res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: sameOrigin });
      if (hit) return hit;
      if (req.mode === 'navigate') { const idx = await cache.match('./index.html'); if (idx) return idx; }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
