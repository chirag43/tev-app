// Tev service worker: makes the app installable and opens it instantly from the home screen.
// The app page opens from the cached copy straight away and is refreshed in the background,
// so an update shows up on the next open. Without a cached copy it comes from the network.
// Requests to Supabase (another origin) are never cached.
const CACHE = 'tev-v4';

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
  if (url.pathname.endsWith('/version.json')) return; // always ask the network which version is live

  if (req.mode === 'navigate') {
    const page = new Request(self.registration.scope);
    const fresh = fetch(req).then(res => save(page, res));
    event.waitUntil(fresh.catch(() => {}));
    event.respondWith(caches.match(page).then(hit => hit || fresh));
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

// "Reload" in the new-version notice: fetch a fresh copy of the app page into the cache first,
// so the reload opens the new version straight away.
self.addEventListener('message', event => {
  if (event.data !== 'tev-refresh') return;
  const page = new Request(self.registration.scope);
  event.waitUntil(
    fetch(page, { cache: 'reload' }).then(res => res.ok && caches.open(CACHE).then(c => c.put(page, res)))
      .catch(() => {})
      .then(() => event.source?.postMessage('tev-refreshed'))
  );
});
