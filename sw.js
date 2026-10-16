// Tev service worker: makes the app installable and opens it instantly from the home screen.
// Pages load network-first (so updates show up right away) and fall back to the cached copy offline.
// Requests to Supabase (another origin) are never cached.
const CACHE = 'tev-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const save = (req, res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => save(new Request(self.registration.scope), res))
        .catch(() => caches.match(self.registration.scope))
    );
    return;
  }
  // Built assets have content hashes in their names, so cache-first is safe.
  event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => save(req, res))));
});
