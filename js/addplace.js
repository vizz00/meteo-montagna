// Pagina "Aggiungi un posto": ricerca per nome (Open-Meteo geocoding)
// oppure tocco sulla mappa (Leaflet), quote proposte in automatico e modificabili.
import { PLACES } from './places.js';
import { PRESETS } from './presets.js';
import { savePlace, deletePlace, getPlace } from './myplaces.js';
import { loadLeaflet } from './leaflet-loader.js';
import {
  REGION_OPTIONS,
  regionName,
  regionFromGeocoding,
  regionFromNominatim,
  nameFromNominatim,
  gridPoints,
  proposeElevations,
  checkElevations,
} from './geo.js';

const GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search';
const ELEVATION = 'https://api.open-meteo.com/v1/elevation';
const REVERSE = 'https://nominatim.openstreetmap.org/reverse';
const RADIUS_KM = 4;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let map = null;
let marker = null;
let token = 0; // per ignorare risposte arrivate dopo una scelta più recente
let sel = null; // punto scelto: { id?, name, lat, lon, region, regionName, elevations }

// ---------- rete ----------

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function searchPlaces(q) {
  const u = new URLSearchParams({ name: q, count: '8', language: 'it', format: 'json' });
  const data = await getJson(`${GEOCODING}?${u}`);
  return data.results || [];
}

async function elevationsAround(lat, lon) {
  const pts = gridPoints(lat, lon, RADIUS_KM);
  const u = new URLSearchParams({
    latitude: pts.map((p) => p.lat).join(','),
    longitude: pts.map((p) => p.lon).join(','),
  });
  const data = await getJson(`${ELEVATION}?${u}`);
  return data.elevation || [];
}

async function reverse(lat, lon) {
  const u = new URLSearchParams({ format: 'jsonv2', lat, lon, zoom: '14', 'accept-language': 'it' });
  return getJson(`${REVERSE}?${u}`);
}

// ---------- disegno ----------

function regionSelect(current) {
  const opts = [...REGION_OPTIONS];
  if (current && !opts.some((o) => o.code === current)) opts.unshift({ code: current, name: sel?.regionName || current });
  return opts
    .map((o) => `<option value="${esc(o.code)}" ${o.code === current ? 'selected' : ''}>${esc(o.name)}</option>`)
    .join('');
}

function formHtml(loading) {
  const e = sel.elevations || {};
  const edit = Boolean(sel.id);
  const mode = sel.single ? 'single' : 'mountain';
  const input = (id, label, value = e[id]) =>
    `<label class="elev-field"><span>${label}</span><input type="number" inputmode="numeric" name="${id}" min="0" max="4810" step="10" value="${value ?? ''}" ${loading ? 'disabled' : ''}><small>m</small></label>`;
  const modeBtn = (value, label) =>
    `<label class="mode-opt"><input type="radio" name="mode" value="${value}" ${mode === value ? 'checked' : ''}><span>${label}</span></label>`;
  return `<form id="place-form" class="add-form" data-mode="${mode}" novalidate>
    <label class="field"><span>Nome</span>
      <input type="text" name="placeName" maxlength="40" required value="${esc(sel.name)}" placeholder="Nome del posto">
    </label>
    <p class="muted coords">${sel.lat.toFixed(4)}, ${sel.lon.toFixed(4)}</p>
    <label class="field"><span>Zona per il bollettino valanghe</span>
      <select name="region">${regionSelect(sel.region)}</select>
    </label>
    <fieldset class="mode">
      <legend>Quote</legend>
      <div class="mode-switch">${modeBtn('mountain', 'Tre quote (montagna)')}${modeBtn('single', 'Una quota sola')}</div>
    </fieldset>
    <div class="elevs elevs-3">${input('valle', 'Valle')}${input('meta', 'Metà')}${input('cima', 'Cima')}</div>
    <div class="elevs elevs-1">${input('quota', 'Quota', e.valle)}</div>
    <p class="hint">${
      loading
        ? 'Calcolo le quote dal modello del terreno…'
        : sel.elevNote ||
          `<span class="hint-3">Proposte in automatico: valle è la quota del punto scelto, cima il punto più alto entro ${RADIUS_KM} km, metà sta in mezzo. Correggile se il tuo itinerario è diverso.</span><span class="hint-1">Una quota sola, per posti in pianura o in città (es. casa): la quota del punto scelto.</span>`
    }</p>
    <p class="form-error" role="alert" hidden></p>
    <div class="form-actions">
      ${
        edit
          ? `<button class="btn" type="submit" name="action" value="save" ${loading ? 'disabled' : ''}>Salva modifiche</button>
      ${sel.builtin ? '' : `<button class="btn ghost danger" type="button" data-delete-place>${sel.override ? 'Ripristina originale' : 'Elimina posto'}</button>`}`
          : `<button class="btn" type="submit" name="action" value="view" ${loading ? 'disabled' : ''}>Vedi previsioni →</button>
      <button class="btn ghost" type="submit" name="action" value="fav" ${loading ? 'disabled' : ''}>★ Salva con la stella</button>`
      }
    </div>
  </form>`;
}

function showForm(loading = false) {
  const box = document.getElementById('place-pick');
  if (!box) return;
  box.hidden = false;
  box.innerHTML = formHtml(loading);
}

function showResults(list, message) {
  const ul = document.getElementById('place-results');
  if (!ul) return;
  if (message) {
    ul.innerHTML = `<li class="muted">${esc(message)}</li>`;
    return;
  }
  ul.innerHTML = list
    .map((r, i) => {
      const where = [r.admin1, r.country].filter(Boolean).join(', ');
      const elev = Number.isFinite(r.elevation) ? ` · ${Math.round(r.elevation)} m` : '';
      return `<li><button type="button" class="result" data-result="${i}">
        <b>${esc(r.name)}</b><span class="muted">${esc(where)}${elev}</span></button></li>`;
    })
    .join('');
}

// ---------- scelta del punto ----------

async function pick({ lat, lon, name, region, regionName: rName, baseElevation, id, single, elevations }) {
  const my = ++token;
  sel = { id, name: name || '', lat, lon, region, regionName: rName, elevations: null, single: Boolean(single) };
  if (elevations) {
    // Località predefinita: quote già note, niente calcolo.
    sel.elevations = { ...elevations };
    sel.regionName = rName || regionName(region);
    placeMarker(lat, lon);
    showForm(false);
    document.getElementById('place-pick')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  placeMarker(lat, lon);
  showForm(true);
  document.getElementById('place-pick')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const tasks = [elevationsAround(lat, lon).catch(() => null)];
  tasks.push(!region || !name ? reverse(lat, lon).catch(() => null) : Promise.resolve(null));
  const [samples, rev] = await Promise.all(tasks);
  if (my !== token) return;

  if (rev) {
    if (!sel.name) sel.name = nameFromNominatim(rev);
    if (!sel.region) {
      sel.region = regionFromNominatim(rev.address);
      sel.regionName = regionName(sel.region) || rev.address?.state || rev.address?.country;
    }
  }
  if (!sel.name) sel.name = `Punto ${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  if (!sel.region) sel.region = 'ALTRO';

  const base = Number.isFinite(samples?.[0]) ? samples[0] : baseElevation;
  sel.elevations = proposeElevations(base, samples || []);
  // Pianura o città: poco dislivello attorno, propone una quota sola.
  if (!id && sel.elevations) sel.single = sel.elevations.cima - sel.elevations.valle < 300;
  if (!samples) {
    sel.elevNote = sel.elevations
      ? 'Non riesco a leggere il terreno attorno: ho messo solo la quota del paese. Correggi metà e cima.'
      : 'Non riesco a calcolare le quote (sei senza rete?): inseriscile a mano.';
  }
  showForm(false);
}

function placeMarker(lat, lon) {
  if (!map || !window.L) return;
  if (marker) marker.setLatLng([lat, lon]);
  else
    marker = window.L.circleMarker([lat, lon], {
      radius: 10,
      color: '#ffffff',
      weight: 3,
      fillColor: '#8fe3ff',
      fillOpacity: 1,
    }).addTo(map);
  map.setView([lat, lon], Math.max(map.getZoom(), 12));
}

// Sfondi senza chiave: OpenStreetMap (anche in versione scura, invertita via CSS),
// topografico (curve di livello) e satellite Esri.
const LAYER_KEY = 'mm.mapLayer3';
const MAPBOX_TOKEN = 'pk.eyJ1Ijoidml6ejAwIiwiYSI6ImNtd2V3d3R3ZjAxeWwyenIyYnBxd2g0dTEifQ.5a9kSc5frG-Ir-3OlZShAg';
const DOT = '#2f7de1'; // un solo colore per tutti i pallini (poi i preferiti saranno gialli)
const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

function baseLayers(L) {
  const osm = (className) =>
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: OSM, className });
  return {
    // Stile Mapbox Outdoors (verde, curve di livello, impianti). Chiave pubblica: fatta per stare nei siti.
    Outdoors: L.tileLayer(
      `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`,
      { tileSize: 512, zoomOffset: -1, maxZoom: 20, attribution: '&copy; <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener">Mapbox</a> &copy; OpenStreetMap' },
    ),
    Chiara: osm(''),
    Scura: osm('tiles-dark'),
    Topografica: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: `${OSM}, <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)`,
    }),
    Satellite: L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 18, attribution: 'Immagini &copy; Esri, Maxar, Earthstar Geographics' },
    ),
  };
}

async function setupMap(center) {
  const el = document.getElementById('place-map');
  const note = document.getElementById('map-note');
  try {
    const L = await loadLeaflet();
    if (!document.body.contains(el)) return; // pagina già cambiata
    if (map) map.remove();
    marker = null;
    map = L.map(el, { zoomControl: true }).setView(center || [45.9, 7.75], center ? 12 : 9);
    const layers = baseLayers(L);
    let chosen = 'Outdoors';
    try {
      chosen = localStorage.getItem(LAYER_KEY) || chosen;
    } catch {
      /* ignorato */
    }
    (layers[chosen] || layers.Outdoors).addTo(map);
    L.control.layers(layers, null, { position: 'topright' }).addTo(map);
    map.on('baselayerchange', (e) => {
      try {
        localStorage.setItem(LAYER_KEY, e.name);
      } catch {
        /* ignorato */
      }
    });
    // Pallini: tutti dello stesso colore. Un tocco sul pallino (o vicino) sceglie quel posto
    // con il SUO nome, senza passare dal nome di frazioni vicine.
    const dots = [];
    const addDot = (item, onPick) => {
      const dot = L.circleMarker([item.lat, item.lon], { radius: 7, color: '#ffffff', weight: 2, fillColor: DOT, fillOpacity: 0.9 })
        .bindTooltip(item.name)
        .addTo(map);
      dot.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        onPick();
      });
      dots.push({ item, onPick });
    };
    for (const p of PLACES) {
      if (sel?.id === p.id) continue;
      addDot(p, () => {
        if (sel?.id) return; // in modifica il tocco serve a spostare il punto
        location.hash = `#/posto/${p.id}`;
      });
    }
    // Località predefinite (non ancora nei tuoi posti): un tocco le sceglie.
    if (!sel?.id) {
      const near = (a, b) => Math.abs(a.lat - b.lat) < 0.03 && Math.abs(a.lon - b.lon) < 0.03;
      for (const pr of PRESETS) {
        if (PLACES.some((p) => near(p, pr))) continue;
        addDot(pr, () => pick({ ...pr }));
      }
    }
    if (sel) placeMarker(sel.lat, sel.lon);
    map.on('click', (e) => {
      // Se il tocco cade vicino a un pallino (entro 30 px) vale come tocco sul pallino.
      const pt = map.latLngToContainerPoint(e.latlng);
      let best = null;
      let bestD = 30;
      for (const d of dots) {
        const dd = pt.distanceTo(map.latLngToContainerPoint([d.item.lat, d.item.lon]));
        if (dd < bestD) {
          bestD = dd;
          best = d;
        }
      }
      if (best && !sel?.id) return best.onPick();
      return pick({
        lat: e.latlng.lat,
        lon: e.latlng.lng,
        id: sel?.id,
        name: sel?.id ? sel.name : undefined,
        single: sel?.id ? sel.single : false,
      });
    });
  } catch {
    if (note) note.textContent = 'La mappa non si carica (sei senza rete?). Puoi comunque cercare per nome.';
  }
}

// ---------- pagina ----------

/**
 * Disegna la pagina. Se è già aperta non la ridisegna (così la ricerca e la mappa
 * non si azzerano quando arrivano le previsioni).
 * callbacks: onSaved(place, isNew), onDeleted(id)
 */
export function renderAddPage(app, params, { onSaved, onDeleted }) {
  const key = location.hash;
  const current = document.getElementById('add-page');
  if (current && current.dataset.key === key) return;

  const editId = params.get('modifica');
  const editing = editId ? getPlace(editId) : null;
  token++;
  sel = editing
    ? {
        id: editing.id,
        name: editing.name,
        lat: editing.lat,
        lon: editing.lon,
        region: editing.region,
        regionName: editing.regionName,
        elevations: { ...editing.elevations },
        single: Boolean(editing.single),
        builtin: !editing.custom,
        override: Boolean(editing.override),
      }
    : null;

  app.innerHTML = `<div id="add-page">
    <p class="back"><a href="${editing ? `#/posto/${esc(editing.id)}` : '#/'}">← ${editing ? esc(editing.name) : 'Località'}</a></p>
    <h1 class="page-title">${editing ? 'Modifica posto' : 'Aggiungi un posto'}</h1>
    ${
      editing
        ? '<p class="place-sub">Tocca la mappa per spostare il punto (le quote vengono ricalcolate).</p>'
        : `<section class="add-search">
      <label class="field" for="place-q"><span>Cerca una località</span></label>
      <input id="place-q" type="search" placeholder="Es. Gressoney, La Thuile, Zermatt" autocomplete="off" enterkeyhint="search">
      <ul id="place-results" class="results"></ul>
    </section>
    <h2 class="section-title">Oppure tocca la mappa</h2>`
    }
    <div id="place-map" class="pick-map" role="application" aria-label="Mappa: tocca per scegliere il punto"></div>
    <p id="map-note" class="muted small"></p>
    <section id="place-pick" class="add-card" ${sel ? '' : 'hidden'}></section>
  </div>`;
  document.getElementById('add-page').dataset.key = key;
  if (sel) showForm(false);
  setupMap(editing ? [editing.lat, editing.lon] : null);

  // Ricerca con piccola attesa mentre si scrive.
  let results = [];
  let timer = null;
  let q = 0;
  const input = document.getElementById('place-q');
  input?.addEventListener('input', () => {
    clearTimeout(timer);
    const text = input.value.trim();
    if (text.length < 2) return showResults([]);
    timer = setTimeout(async () => {
      const mine = ++q;
      showResults([], 'Cerco…');
      try {
        const list = await searchPlaces(text);
        if (mine !== q) return;
        results = list;
        if (list.length) showResults(list);
        else showResults([], 'Nessuna località trovata. Prova con un altro nome o tocca la mappa.');
      } catch {
        if (mine === q) showResults([], 'Ricerca non disponibile (sei senza rete?).');
      }
    }, 300);
  });
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && results[0]) {
      e.preventDefault();
      document.querySelector('[data-result="0"]')?.click();
    }
  });

  const page = document.getElementById('add-page');
  page.addEventListener('click', (e) => {
    const r = e.target.closest('[data-result]');
    if (r) {
      const g = results[+r.dataset.result];
      if (!g) return;
      showResults([]);
      if (input) input.value = g.name;
      const region = regionFromGeocoding(g);
      return pick({
        lat: g.latitude,
        lon: g.longitude,
        name: g.name,
        region,
        regionName: regionName(region) || g.admin1 || g.country,
        baseElevation: g.elevation,
      });
    }
    if (e.target.closest('[data-delete-place]') && sel?.id) {
      const restore = sel.override;
      if (confirm(restore ? `Ripristinare ${sel.name} com'era all'inizio?` : `Eliminare ${sel.name} dai tuoi posti?`)) {
        const id = sel.id;
        deletePlace(id);
        if (restore) onSaved?.(getPlace(id), {});
        else onDeleted?.(id);
      }
    }
  });

  page.addEventListener('change', (e) => {
    if (e.target.name === 'mode') {
      e.target.form.dataset.mode = e.target.value;
      if (sel) sel.single = e.target.value === 'single';
    }
  });

  page.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const action = e.submitter?.value || (sel.id ? 'save' : 'view');
    const val = (n) => f.elements.namedItem(n).value;
    const num = (n) => (val(n) === '' ? NaN : Number(val(n)));
    const single = val('mode') === 'single';
    const q = num('quota');
    const elevations = single ? { valle: q, meta: q, cima: q } : { valle: num('valle'), meta: num('meta'), cima: num('cima') };
    const name = val('placeName').trim();
    const err = !name
      ? 'Dai un nome al posto.'
      : single && !Number.isFinite(q)
        ? 'Inserisci la quota.'
        : checkElevations(elevations);
    const box = f.querySelector('.form-error');
    if (err) {
      box.textContent = err;
      box.hidden = false;
      return;
    }
    const region = val('region');
    const place = savePlace({
      id: sel.id,
      name,
      lat: sel.lat,
      lon: sel.lon,
      elevations,
      region,
      regionName: region === sel.region ? sel.regionName : regionName(region),
      single,
    });
    onSaved?.(place, { fav: action === 'fav' });
  });
}
