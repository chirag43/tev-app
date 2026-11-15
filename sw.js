// Tev service worker: makes the app installable and opens it instantly from the home screen.
// Pages load network-first (so updates show up right away) and fall back to the cached copy offline.
// Requests to Supabase (another origin) are never cached.
const CACHE = 'tev-v2';

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

// ---------- daily reminders ----------
// Sent by supabase/functions/send-reminders. Payload: { title, body, url }.
self.addEventListener('push', event => {
  let msg = {};
  try { msg = event.data ? event.data.json() : {}; } catch { msg = { body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(msg.title || 'Tev', {
    body: msg.body || "Don't forget today's habits.",
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: 'tev-reminder', // a newer reminder replaces an older one
    data: { url: msg.url || self.registration.scope },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || self.registration.scope;
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const tev = open.find(c => c.url.startsWith(self.registration.scope));
    if (tev) return tev.focus();
    return self.clients.openWindow(url);
  })());
});
