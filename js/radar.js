// Schermata Radar: mappa Leaflet con il radar animato RainViewer (ultime 2 ore, ogni 10 minuti).
// API gratuita RainViewer: solo schema colori 2 (Universal Blue), zoom del radar fino al livello 7.
import { loadLeaflet } from './leaflet-loader.js';

const API = 'https://api.rainviewer.com/public/weather-maps.json';
const CENTER = [45.92, 7.75]; // tra Cervino e Monte Rosa
const START_ZOOM = 8;
const RADAR_MAX_NATIVE_ZOOM = 7;
const FRAME_MS = 600;
const LAST_FRAME_PAUSE_MS = 1800;
const RELOAD_MS = 5 * 60 * 1000;
const RADAR_OPACITY = 0.8;
const BASE_KEY = 'mm-radar-base';
const MODE_KEY = 'mm-radar-mode';
const LAYER_KEY = 'mm-forecast-layer';

// Previsione: mappa Windy inserita (gratis, va avanti fino a ~10 giorni).
const WINDY_LAYERS = [
  { id: 'rain', label: 'Pioggia/neve', overlay: 'rain', level: 'surface' },
  { id: 'snow', label: 'Neve fresca', overlay: 'snowAccu', level: 'surface' },
  { id: 'wind', label: 'Vento 3000', overlay: 'wind', level: '700h' },
  { id: 'gust', label: 'Raffiche', overlay: 'gust', level: 'surface' },
];
function windyUrl(layer) {
  const q = new URLSearchParams({
    type: 'map', location: 'coordinates', lat: String(CENTER[0]), lon: String(CENTER[1]), zoom: String(START_ZOOM),
    overlay: layer.overlay, product: 'ecmwf', level: layer.level,
    metricRain: 'mm', metricTemp: '°C', metricWind: 'km/h', metricSnow: 'cm',
    calendar: 'now', menu: '', message: 'true', marker: '', pressure: '', detail: '',
  });
  return `https://embed.windy.com/embed2.html?${q}`;
}

export const METEOSWISS_RADAR_URL = 'https://www.meteosvizzera.admin.ch/servizi-e-pubblicazioni/applicazioni/precipitazioni.html';
const RAINVIEWER_URL = 'https://www.rainviewer.com/map.html';

let s = null; // stato della schermata montata

const esc = (t) =>
  String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const hhmm = (unix) => new Date(unix * 1000).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

function ago(unix) {
  const min = Math.round((Date.now() / 1000 - unix) / 60);
  if (min < 1) return 'adesso';
  if (min < 60) return `${min} min fa`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min fa` : `${h} h fa`;
}

function readPref(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
function savePref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* nessun problema: si torna alla scelta predefinita */
  }
}
const readBase = () => readPref(BASE_KEY, 'scura');
const saveBase = (name) => savePref(BASE_KEY, name);

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function template() {
  const chips = WINDY_LAYERS.map(
    (l) => `<button type="button" class="chip" data-forecast-layer="${l.id}" aria-pressed="false">${esc(l.label)}</button>`
  ).join('');
  return `<section class="radar" aria-label="Radar precipitazioni">
    <div class="radar-modes" role="tablist" aria-label="Radar o previsione">
      <button type="button" role="tab" data-radar-mode="radar" aria-selected="true">Ultime 2 ore</button>
      <button type="button" role="tab" data-radar-mode="previsione" aria-selected="false">Previsione</button>
    </div>
    <div class="forecast" data-forecast hidden>
      <div class="forecast-bar">
        <div class="forecast-chips">${chips}</div>
        <button type="button" class="icon-btn forecast-reset" data-forecast-reset aria-label="Chiudi il dettaglio del punto" title="Chiudi il dettaglio del punto">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
      <div class="forecast-stage" data-forecast-stage></div>
    </div>
    <div class="radar-stage" data-radar-part>
      <div id="radar-map" class="radar-map" role="region" aria-label="Mappa radar"></div>
      <p class="radar-msg" data-radar-msg role="status">Carico la mappa…</p>
      <details class="radar-legend" data-radar-legend>
        <summary>Legenda</summary>
        <div class="legend-row"><span>Pioggia</span><i class="ramp rain"></i></div>
        <div class="legend-row"><span>Neve</span><i class="ramp snow"></i></div>
        <div class="legend-scale"><span>debole</span><span>forte</span></div>
        <p class="legend-note">Pioggia o neve stimata dal radar al suolo, non alla quota dei posti. Nelle valli alpine le montagne possono nascondere le precipitazioni basse.</p>
      </details>
    </div>
    <div class="radar-panel" data-radar-part>
      <div class="radar-controls">
        <button type="button" class="play" data-radar-play aria-label="Avvia animazione" disabled>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-play" fill="currentColor" d="M8 5v14l11-7z"/><path class="i-pause" fill="currentColor" d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>
        </button>
        <div class="radar-time">
          <input type="range" min="0" max="0" value="0" step="1" data-radar-slider aria-label="Ora del radar" disabled>
          <p class="radar-clock"><b data-radar-clock>--:--</b> <span data-radar-ago></span></p>
        </div>
      </div>
      <p class="radar-meta">
        <span>Radar <a href="${RAINVIEWER_URL}" target="_blank" rel="noopener">RainViewer</a>, ultime 2 ore ogni 10 min. Oltre lo zoom 7 l'immagine radar è solo ingrandita.</span>
        <a class="btn ghost small" href="${METEOSWISS_RADAR_URL}" target="_blank" rel="noopener">Radar MeteoSwiss ↗</a>
      </p>
    </div>
  </section>`;
}

/**
 * Mostra il radar dentro `container`. Se è già montato non lo ridisegna
 * (l'app ridisegna la pagina a ogni aggiornamento delle previsioni).
 * @param {HTMLElement} container
 * @param {{places: Array, favorites: string[]}} opts
 */
export function mountRadar(container, { places, favorites }) {
  if (s && container.contains(s.root)) {
    if (Date.now() - s.loadedAt > RELOAD_MS) loadFrames();
    return;
  }
  unmountRadar();
  container.innerHTML = template();
  const root = container.querySelector('.radar');
  s = {
    root,
    map: null,
    L: null,
    frames: [],
    host: '',
    layers: new Map(),
    index: 0,
    timer: null,
    playing: false,
    loadedAt: 0,
    places,
    favorites,
    el: {
      msg: root.querySelector('[data-radar-msg]'),
      play: root.querySelector('[data-radar-play]'),
      slider: root.querySelector('[data-radar-slider]'),
      clock: root.querySelector('[data-radar-clock]'),
      ago: root.querySelector('[data-radar-ago]'),
    },
  };
  const mine = s;

  root.querySelectorAll('[data-radar-mode]').forEach((b) =>
    b.addEventListener('click', () => setMode(b.dataset.radarMode))
  );
  root.querySelectorAll('[data-forecast-layer]').forEach((b) =>
    b.addEventListener('click', () => setLayer(b.dataset.forecastLayer))
  );
  root.querySelector('[data-forecast-reset]').addEventListener('click', () => showWindy(true));
  s.el.play.addEventListener('click', () => (s.playing ? pause() : play()));
  s.el.slider.addEventListener('input', () => {
    pause();
    showFrame(Number(s.el.slider.value));
  });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-radar-retry]')) (s.map ? loadFrames() : start());
  });
  document.addEventListener('visibilitychange', onVisibility);
  s.mode = 'radar';
  s.layer = WINDY_LAYERS.some((l) => l.id === readPref(LAYER_KEY, '')) ? readPref(LAYER_KEY, '') : 'rain';
  start();
  if (readPref(MODE_KEY, 'radar') === 'previsione') setMode('previsione');
}

function setMode(mode) {
  s.mode = mode === 'previsione' ? 'previsione' : 'radar';
  savePref(MODE_KEY, s.mode);
  const fc = s.mode === 'previsione';
  s.root.querySelectorAll('[data-radar-mode]').forEach((b) =>
    b.setAttribute('aria-selected', String(b.dataset.radarMode === s.mode))
  );
  s.root.querySelector('[data-forecast]').hidden = !fc;
  s.root.querySelectorAll('[data-radar-part]').forEach((el) => (el.hidden = fc));
  if (fc) {
    if (s.playing) pause();
    showWindy(false);
  } else if (s.map) {
    s.map.invalidateSize();
  }
}

function setLayer(id) {
  if (!WINDY_LAYERS.some((l) => l.id === id)) return;
  s.layer = id;
  savePref(LAYER_KEY, id);
  showWindy(true);
}

// Crea (o ricrea) la mappa Windy. Ricrearla è anche l'unico modo per chiudere
// il dettaglio del punto che Windy apre quando si tocca la mappa.
function showWindy(force) {
  const stage = s.root.querySelector('[data-forecast-stage]');
  const layer = WINDY_LAYERS.find((l) => l.id === s.layer) || WINDY_LAYERS[0];
  s.root.querySelectorAll('[data-forecast-layer]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.forecastLayer === layer.id))
  );
  if (!force && stage.querySelector('iframe')) return;
  stage.innerHTML = `<iframe title="Previsione Windy: ${esc(layer.label)}" src="${esc(windyUrl(layer))}" allowfullscreen></iframe>`;
}

function start() {
  const mine = s;
  message('Carico la mappa…');
  loadLeaflet()
    .then((L) => {
      if (s !== mine) return; // l'utente ha già cambiato scheda
      initMap(L);
      loadFrames();
    })
    .catch(() => {
      if (s !== mine) return;
      message('La mappa non si carica: serve la connessione a internet.', true);
    });
}

export function unmountRadar() {
  if (!s) return;
  stopTimer();
  document.removeEventListener('visibilitychange', onVisibility);
  if (s.map) s.map.remove();
  s = null;
}

function onVisibility() {
  if (!s) return;
  if (document.visibilityState === 'hidden') stopTimer();
  else if (Date.now() - s.loadedAt > RELOAD_MS) loadFrames();
  else if (s.playing) schedule();
}

function message(text, retry = false) {
  const { msg } = s.el;
  if (!text) {
    msg.hidden = true;
    msg.innerHTML = '';
    return;
  }
  msg.hidden = false;
  msg.innerHTML = `${esc(text)}${retry ? ' <button type="button" class="btn small" data-radar-retry>Riprova</button>' : ''}`;
}

function initMap(L) {
  s.L = L;
  const map = L.map(s.root.querySelector('#radar-map'), {
    center: CENTER,
    zoom: START_ZOOM,
    minZoom: 4,
    maxZoom: 11,
    zoomControl: true,
    attributionControl: true,
  });
  map.attributionControl.setPrefix(false);

  // Sfondi senza chiave (CARTO ora la chiede). "Scura" è OpenStreetMap con i colori invertiti via CSS.
  const OSM = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
  const osm = (className) =>
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: OSM, className });
  const bases = {
    Scura: osm('radar-base-dark'),
    Chiara: osm(''),
    Topografica: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      subdomains: 'abc',
      maxZoom: 17,
      attribution: `${OSM}, <a href="https://opentopomap.org">OpenTopoMap</a>`,
    }),
  };
  const saved = readBase();
  const startBase = Object.keys(bases).find((k) => k.toLowerCase() === saved) || 'Scura';
  bases[startBase].addTo(map);
  L.control.layers(bases, null, { position: 'topright' }).addTo(map);
  map.on('baselayerchange', (e) => saveBase(e.name.toLowerCase()));

  // Posti: pieni i preferiti, vuoti gli altri. Un tocco apre la previsione.
  const markers = L.layerGroup().addTo(map);
  for (const p of s.places) {
    const fav = s.favorites.includes(p.id);
    L.circleMarker([p.lat, p.lon], {
      radius: fav ? 7 : 5,
      color: '#ffffff',
      weight: 2,
      fillColor: fav ? '#ffd166' : '#0a1530',
      fillOpacity: 1,
      pane: 'markerPane',
    })
      .bindTooltip(esc(p.name), { permanent: true, direction: 'right', offset: [8, 0], className: 'radar-label' })
      .bindPopup(`<b>${esc(p.name)}</b><br><a href="#/posto/${encodeURIComponent(p.id)}">Apri la previsione</a>`)
      .addTo(markers);
  }
  s.map = map;
}

async function loadFrames() {
  const mine = s;
  if (!mine?.map) return;
  if (!mine.frames.length) message('Scarico le immagini radar…');
  let data;
  try {
    const res = await fetch(API, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    console.error(err);
    if (s !== mine) return;
    message('Non riesco a scaricare il radar. Controlla la connessione.', true);
    return;
  }
  if (s !== mine) return;
  const frames = data?.radar?.past ?? [];
  if (!frames.length) {
    message('RainViewer non ha immagini radar in questo momento.', true);
    return;
  }

  // Tiene solo i livelli dei fotogrammi ancora presenti.
  const keep = new Set(frames.map((f) => f.path));
  for (const [path, layer] of s.layers) {
    if (!keep.has(path)) {
      s.map.removeLayer(layer);
      s.layers.delete(path);
    }
  }
  s.host = data.host;
  s.frames = frames;
  s.loadedAt = Date.now();
  s.el.slider.max = String(frames.length - 1);
  s.el.slider.disabled = false;
  s.el.play.disabled = false;
  message('');
  showFrame(frames.length - 1);
  if (!s.playing && !reducedMotion() && !s.autoplayed) {
    s.autoplayed = true;
    play();
  }
}

function layerFor(i) {
  const f = s.frames[i];
  if (!f) return null;
  let layer = s.layers.get(f.path);
  if (!layer) {
    layer = s.L.tileLayer(`${s.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, {
      opacity: 0,
      maxNativeZoom: RADAR_MAX_NATIVE_ZOOM,
      maxZoom: 11,
      zIndex: 10,
      attribution: 'Radar © <a href="https://www.rainviewer.com/api.html">RainViewer</a>',
    });
    s.layers.set(f.path, layer);
    layer.addTo(s.map);
  }
  return layer;
}

function showFrame(i) {
  if (!s.frames.length) return;
  const n = s.frames.length;
  i = ((i % n) + n) % n;
  const current = layerFor(i);
  for (const layer of s.layers.values()) layer.setOpacity(layer === current ? RADAR_OPACITY : 0);
  layerFor((i + 1) % n); // precarica il successivo
  s.index = i;
  const f = s.frames[i];
  s.el.slider.value = String(i);
  s.el.slider.setAttribute('aria-valuetext', `ore ${hhmm(f.time)}`);
  s.el.clock.textContent = hhmm(f.time);
  s.el.ago.textContent = i === n - 1 ? `ultima immagine, ${ago(f.time)}` : ago(f.time);
}

function schedule() {
  stopTimer();
  const last = s.index === s.frames.length - 1;
  s.timer = setTimeout(() => {
    showFrame(s.index + 1);
    schedule();
  }, last ? LAST_FRAME_PAUSE_MS : FRAME_MS);
}

function stopTimer() {
  if (s?.timer) clearTimeout(s.timer);
  if (s) s.timer = null;
}

function play() {
  if (!s.frames.length) return;
  s.playing = true;
  s.el.play.classList.add('playing');
  s.el.play.setAttribute('aria-label', 'Ferma animazione');
  if (s.index === s.frames.length - 1) showFrame(0);
  schedule();
}

function pause() {
  s.playing = false;
  stopTimer();
  s.el.play.classList.remove('playing');
  s.el.play.setAttribute('aria-label', 'Avvia animazione');
}
