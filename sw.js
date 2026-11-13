// Service worker: rende l'app installabile e apribile anche senza rete.
// Quando cambi i file dell'app, aumenta il numero di VERSION.
const VERSION = 'v39';
const CACHE = `mm-shell-${VERSION}`;
// Tutti i file dell'app, così funziona senza rete già dalla prima apertura.
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'css/addplace.css',
  'css/season.css',
  'js/app.js',
  'js/addplace.js',
  'js/avalanche.js',
  'js/avalanche-view.js',
  'js/charts.js',
  'js/forecast.js',
  'js/geo.js',
  'js/leaflet-loader.js',
  'js/myplaces.js',
  'js/places.js',
  'js/presets.js',
  'js/powder.js',
  'js/radar.js',
  'js/transfer.js',
  'js/season.js',
  'js/season-view.js',
  'js/snow.js',
  'js/storage.js',
  'js/window.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon-2.png',
];

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const FONT_CACHE = 'mm-fonts-v1';
// Con poco segnale (in montagna) non si aspetta la rete più di così: si usa la copia salvata.
const NET_WAIT_MS = 3000;
// Dopo un'attesa andata a vuoto, per un minuto si usa subito la copia salvata
// (altrimenti ogni file dell'app aspetterebbe di nuovo 3 secondi).
const SLOW_FOR_MS = 60 * 1000;
let slowUntil = 0;

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

// File dell'app: prima la rete (così gli aggiornamenti arrivano subito), ma se tarda più di
// NET_WAIT_MS si usa la copia salvata; la risposta della rete aggiorna comunque la copia.
// Le chiamate alle API esterne non passano di qui: l'app tiene già l'ultima previsione.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Carattere dei titoli (Google Fonts): si scarica una volta, poi si usa la copia salvata anche senza rete.
  if (req.method === 'GET' && FONT_HOSTS.includes(new URL(req.url).hostname)) {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const fromCache = () => caches.match(req, { ignoreSearch: true });
  const net = fetch(req).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  });
  event.waitUntil(net.catch(() => {}));
  event.respondWith(
    new Promise((resolve) => {
      let done = false;
      const finish = (r) => {
        if (!done && r) {
          done = true;
          resolve(r);
        }
      };
      const wait = Date.now() < slowUntil ? 0 : NET_WAIT_MS;
      const timer = setTimeout(
        () =>
          fromCache().then((r) => {
            if (r && wait) slowUntil = Date.now() + SLOW_FOR_MS;
            finish(r);
          }),
        wait,
      );
      net
        .then((res) => {
          clearTimeout(timer);
          finish(res);
        })
        .catch(async () => {
          clearTimeout(timer);
          finish((await fromCache()) || (await caches.match('index.html')) || Response.error());
        });
    }),
  );
});
