/* Chatruya Kitchens offline cache. Bump VERSION when you change any app file. */
const VERSION = 'chatruya-v3';
const FILES = ['./', './index.html', './core.js', './app.js', './app2.js', './app3.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// tapping an alert opens the prep list it is about
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || 'index.html', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { if ('navigate' in c) c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // sync calls go straight to Google
  // network first so updates arrive quickly, cache when offline
  e.respondWith(fetch(e.request).then((res) => {
    const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))));
});
