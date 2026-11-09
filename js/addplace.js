// Pagina "Aggiungi un posto": ricerca per nome (Open-Meteo geocoding)
// oppure tocco sulla mappa (Leaflet), quote proposte in automatico e modificabili.
import { PLACES } from './places.js';
import { savePlace, deletePlace, getCustomPlace } from './myplaces.js';
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
  const input = (id, label) =>
    `<label class="elev-field"><span>${label}</span><input type="number" inputmode="numeric" name="${id}" min="0" max="4810" step="10" value="${e[id] ?? ''}" ${loading ? 'disabled' : ''} required><small>m</small></label>`;
  return `<form id="place-form" class="add-form" novalidate>
    <label class="field"><span>Nome</span>
      <input type="text" name="placeName" maxlength="40" required value="${esc(sel.name)}" placeholder="Nome del posto">
    </label>
    <p class="muted coords">${sel.lat.toFixed(4)}, ${sel.lon.toFixed(4)}</p>
    <label class="field"><span>Zona per il bollettino valanghe</span>
      <select name="region">${regionSelect(sel.region)}</select>
    </label>
    <fieldset class="elevs">
      <legend>Quote</legend>
      ${input('valle', 'Valle')}${input('meta', 'Metà')}${input('cima', 'Cima')}
    </fieldset>
    <p class="hint">${
      loading
        ? 'Calcolo le quote dal modello del terreno…'
        : sel.elevNote ||
          `Proposte in automatico: valle è la quota del punto scelto, cima il punto più alto entro ${RADIUS_KM} km, metà sta in mezzo. Correggile se il tuo itinerario è diverso.`
    }</p>
    <p class="form-error" role="alert" hidden></p>
    <div class="form-actions">
      <button class="btn" type="submit" ${loading ? 'disabled' : ''}>${edit ? 'Salva modifiche' : '★ Salva nei preferiti'}</button>
      ${edit ? '<button class="btn ghost danger" type="button" data-delete-place>Elimina posto</button>' : ''}
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

async function pick({ lat, lon, name, region, regionName: rName, baseElevation, id }) {
  const my = ++token;
  sel = { id, name: name || '', lat, lon, region, regionName: rName, elevations: null };
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
  else marker = window.L.marker([lat, lon]).addTo(map);
  map.setView([lat, lon], Math.max(map.getZoom(), 12));
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
    L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution:
        'Mappa © <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA), dati © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(map);
    for (const p of PLACES) {
      if (sel?.id === p.id) continue;
      L.circleMarker([p.lat, p.lon], { radius: 6, color: '#7aa2ff', weight: 2, fillOpacity: 0.6 })
        .bindTooltip(p.name)
        .addTo(map);
    }
    if (sel) placeMarker(sel.lat, sel.lon);
    map.on('click', (e) =>
      pick({ lat: e.latlng.lat, lon: e.latlng.lng, id: sel?.id, name: sel?.id ? sel.name : undefined }),
    );
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
  const editing = editId ? getCustomPlace(editId) : null;
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
      }
    : null;

  app.innerHTML = `<div id="add-page">
    <p class="back"><a href="${editing ? `#/posto/${esc(editing.id)}` : '#/'}">← ${editing ? esc(editing.name) : 'Panoramica'}</a></p>
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
      if (confirm(`Eliminare ${sel.name} dai tuoi posti?`)) {
        const id = sel.id;
        deletePlace(id);
        onDeleted?.(id);
      }
    }
  });

  page.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const val = (n) => f.elements.namedItem(n).value;
    const num = (n) => (val(n) === '' ? NaN : Number(val(n)));
    const elevations = { valle: num('valle'), meta: num('meta'), cima: num('cima') };
    const name = val('placeName').trim();
    const err = !name ? 'Dai un nome al posto.' : checkElevations(elevations);
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
    });
    onSaved?.(place, !sel.id);
  });
}
