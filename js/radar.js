// Schermata Radar: mappa Windy inserita (gratis), con previsione che va avanti
// fino a ~10 giorni e il radar delle ultime ore. Pulsanti rapidi per gli strati
// che servono in montagna, ognuno con una spiegazione breve.

const CENTER = [45.92, 7.75]; // tra Cervino e Monte Rosa, se non ci sono preferiti
const ZOOM = 9;
const LAYER_KEY = 'mm-forecast-layer';

// Ogni strato: come lo chiede Windy e la spiegazione breve. I colori sono nella barra di Windy sulla mappa.
const LAYERS = [
  {
    id: 'rain',
    label: 'Pioggia/neve',
    overlay: 'rain',
    level: 'surface',
    text: 'Precipitazione prevista ora per ora. I fiocchi sono neve, le gocce pioggia.',
  },
  {
    id: 'snow',
    label: 'Neve fresca',
    overlay: 'snowAccu',
    level: 'surface',
    text: 'Neve nuova che si accumula nel periodo scelto in basso sulla mappa (per esempio i prossimi 3 giorni).',
  },
  {
    id: 'wind',
    label: 'Vento 3000 m',
    overlay: 'wind',
    level: '700h',
    text: 'Vento a circa 3000 m (700 hPa), quello delle creste. Sopra i 40 km/h sposta molta neve e carica i versanti sottovento.',
  },
  {
    id: 'gust',
    label: 'Raffiche',
    overlay: 'gust',
    level: 'surface',
    text: 'Le punte di vento vicino al suolo, più forti del vento medio. Contano per impianti chiusi e per stare in vetta.',
  },
  {
    id: 'radar',
    label: 'Radar',
    overlay: 'radar',
    product: 'radar',
    level: 'surface',
    text: 'Precipitazione misurata dai radar nelle ultime ore: cosa sta cadendo adesso, non la previsione. Nelle valli le montagne possono nascondere le precipitazioni basse.',
  },
];

let s = null; // stato della schermata montata

const esc = (t) =>
  String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

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
    /* nessun problema: si torna allo strato predefinito */
  }
}

// Centro della mappa: in mezzo ai posti preferiti, se sono vicini; altrimenti tra Cervino e Monte Rosa.
function centerFor(places, favorites) {
  const fav = places.filter((p) => favorites.includes(p.id));
  if (!fav.length) return CENTER;
  const lat = fav.reduce((a, p) => a + p.lat, 0) / fav.length;
  const lon = fav.reduce((a, p) => a + p.lon, 0) / fav.length;
  const spread = Math.max(...fav.map((p) => Math.hypot(p.lat - lat, p.lon - lon)));
  return spread < 0.6 ? [+lat.toFixed(3), +lon.toFixed(3)] : CENTER;
}

function windyUrl(layer, center) {
  const q = new URLSearchParams({
    type: 'map', location: 'coordinates', lat: String(center[0]), lon: String(center[1]), zoom: String(ZOOM),
    overlay: layer.overlay, product: layer.product || 'ecmwf', level: layer.level,
    metricRain: 'mm', metricTemp: '°C', metricWind: 'km/h', metricSnow: 'cm',
    calendar: 'now', menu: '', message: 'true', marker: '', pressure: '', detail: '', radarRange: '-1',
  });
  return `https://embed.windy.com/embed2.html?${q}`;
}

function template() {
  const chips = LAYERS.map(
    (l) => `<button type="button" class="chip" data-forecast-layer="${l.id}" aria-pressed="false">${esc(l.label)}</button>`
  ).join('');
  return `<section class="radar forecast" aria-label="Previsione e radar">
    <div class="forecast-bar">
      <div class="forecast-chips">${chips}</div>
    </div>
    <div class="forecast-info">
      <p data-forecast-info aria-live="polite"></p>
      <button type="button" class="btn ghost small" data-forecast-reset>Chiudi previsione del punto</button>
    </div>
    <div class="forecast-stage" data-forecast-stage></div>
  </section>`;
}

/**
 * Mostra la mappa dentro `container`. Se è già montata non la ridisegna
 * (l'app ridisegna la pagina a ogni aggiornamento delle previsioni).
 * @param {HTMLElement} container
 * @param {{places: Array, favorites: string[]}} opts
 */
export function mountRadar(container, { places, favorites }) {
  if (s && container.contains(s.root)) return;
  unmountRadar();
  container.innerHTML = template();
  const root = container.querySelector('.radar');
  const saved = readPref(LAYER_KEY, 'rain');
  s = {
    root,
    center: centerFor(places, favorites),
    layer: LAYERS.some((l) => l.id === saved) ? saved : 'rain',
  };
  root.querySelectorAll('[data-forecast-layer]').forEach((b) =>
    b.addEventListener('click', () => setLayer(b.dataset.forecastLayer))
  );
  root.querySelector('[data-forecast-reset]').addEventListener('click', () => showWindy());
  showWindy();
}

export function unmountRadar() {
  s = null;
}

function setLayer(id) {
  if (!s || !LAYERS.some((l) => l.id === id)) return;
  s.layer = id;
  savePref(LAYER_KEY, id);
  showWindy();
}

// Crea (o ricrea) la mappa Windy. Ricrearla è anche l'unico modo per chiudere
// il dettaglio del punto che Windy apre quando si tocca la mappa.
function showWindy() {
  const layer = LAYERS.find((l) => l.id === s.layer) || LAYERS[0];
  s.root.querySelectorAll('[data-forecast-layer]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.forecastLayer === layer.id))
  );
  s.root.querySelector('[data-forecast-info]').textContent = layer.text;
  s.root.querySelector('[data-forecast-stage]').innerHTML =
    `<iframe title="Mappa Windy: ${esc(layer.label)}" src="${esc(windyUrl(layer, s.center))}" allowfullscreen></iframe>`;
}
