// Service worker: rende l'app installabile e apribile anche senza rete.
// Quando cambi i file dell'app, aumenta il numero di VERSION.
const VERSION = 'v3';
const CACHE = `mm-shell-${VERSION}`;
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/snow.js',
  'js/window.js',
  'js/forecast.js',
  'js/places.js',
  'js/storage.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('mm-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// File dell'app: prima la rete (così gli aggiornamenti arrivano subito), poi la copia salvata.
// Le chiamate alle API esterne non passano di qui: l'app tiene già l'ultima previsione.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
