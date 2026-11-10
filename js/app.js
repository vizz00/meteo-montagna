import { PLACES, BANDS, REGIONS, externalLinks } from './places.js';
import { MODELS, rangeText, roundCm, compass, totalRange } from './snow.js';
import { loadForecast, loadDetail } from './forecast.js';
import { lineChart, precipStrip, scrollCharts } from './charts.js';
import { powderDays } from './powder.js';
import { loadPrefs, savePrefs } from './storage.js';
import { mountRadar, unmountRadar } from './radar.js';
import { renderAddPage } from './addplace.js';
import { keepPlace } from './myplaces.js';
import { loadAvalanche, romeDate } from './avalanche.js';
import { avalPlaceBlock, avalPage } from './avalanche-view.js';
import { evaluateWindows, STATUS_LABEL, SECTORS, RULES } from './window.js';
import { renderSeason } from './season-view.js';

const app = document.getElementById('app');
const ptr = document.getElementById('ptr');

const state = {
  prefs: loadPrefs(),
  forecast: null,
  error: null,
  loading: false,
  aval: null, // bollettini valanghe di oggi/domani
  avalArchive: null, // { day, data } quando si guarda un giorno passato
  reorder: false, // riordino manuale dei preferiti aperto
};

// ---------- utilità ----------

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const WEEKDAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const dayDate = (iso) => new Date(`${iso}T12:00:00`);
const weekday = (iso) => WEEKDAYS[dayDate(iso).getDay()];
const dayNum = (iso) => dayDate(iso).getDate();
const longDay = (iso) =>
  dayDate(iso).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });

function timeAgo(ts) {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'adesso';
  if (min < 60) return `${min} min fa`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ${h === 1 ? 'ora' : 'ore'} fa`;
  return new Date(ts).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const placeById = (id) => PLACES.find((p) => p.id === id);
const isFav = (id) => state.prefs.favorites.includes(id);

function setPrefs(patch) {
  state.prefs = { ...state.prefs, ...patch };
  savePrefs(state.prefs);
  render();
}

function toggleFav(id) {
  if (!isFav(id)) keepPlace(id);
  const favs = isFav(id) ? state.prefs.favorites.filter((f) => f !== id) : [...state.prefs.favorites, id];
  setPrefs({ favorites: favs });
}

// Scala colori neve: dal blu al viola con l'intensità (colori fissi solo per la neve).
function snowColor(cm) {
  if (cm >= 30) return 'var(--snow-5)';
  if (cm >= 20) return 'var(--snow-4)';
  if (cm >= 10) return 'var(--snow-3)';
  if (cm >= 5) return 'var(--snow-2)';
  return 'var(--snow-1)';
}

// Icone delle righe (al posto delle etichette di testo).
const ICON = {
  snow: '<path d="M12 2v20M3.5 7l17 10M20.5 7l-17 10M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  freezing: '<path d="M10 4a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="17" r="1.8" fill="currentColor"/><path d="M16.5 6h3M16.5 9.5h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  window: '<circle cx="7" cy="12" r="3.2" fill="var(--win-closed)"/><circle cx="12" cy="12" r="3.2" fill="var(--win-warn)"/><circle cx="17" cy="12" r="3.2" fill="var(--win-open)"/>',
};
const icon = (name, label) =>
  `<svg class="ico" viewBox="0 0 24 24" role="img" aria-label="${label}"><title>${label}</title>${ICON[name]}</svg>`;

// ---------- finestra buona ----------

const placeAspects = (id) => state.prefs.aspects?.[id] || [];

function bulletinFor(placeId) {
  const a = state.aval;
  const entry = a?.byPlace?.[placeId];
  return (date) => (!entry ? null : date === a.today ? entry.today : date === a.tomorrow ? entry.tomorrow : null);
}

function windowsFor(place, band) {
  const s = state.forecast?.byPlace[place.id]?.[band];
  if (!s) return null;
  return evaluateWindows(s, place.elevations[band], { aspects: placeAspects(place.id), bulletinFor: bulletinFor(place.id) });
}

function windowTitle(w) {
  const lines = [STATUS_LABEL[w.status]];
  for (const s of w.signals) if (s.level !== 'info') lines.push(`${s.certainty === 'possibile' ? 'possibile: ' : ''}${s.text}`);
  if (w.status === 'meteo') lines.push(w.conditions.filter((c) => !c.bonus && !c.ok).map((c) => `no ${c.label} (${c.text})`).join(', '));
  return lines.join('\n');
}

// Pallino colorato: verde aperta, giallo con avvisi, rosso chiusa, grigio meteo non buono.
function windowMark(w) {
  if (!w) return '<span class="win"></span>';
  const t = esc(windowTitle(w));
  return `<span class="win win-${w.status}" role="img" aria-label="${t}" title="${t}"></span>`;
}

// Rosa a 8 settori: i versanti caricati dal vento in arancione, quelli scelti dall'utente bordati.
function aspectRose(loaded, mine = [], size = 64) {
  const r = size / 2;
  const paths = SECTORS.map((name, i) => {
    const a0 = ((i * 45 - 22.5 - 90) * Math.PI) / 180;
    const a1 = ((i * 45 + 22.5 - 90) * Math.PI) / 180;
    const R = r - 2;
    const p = `M${r},${r} L${r + R * Math.cos(a0)},${r + R * Math.sin(a0)} A${R},${R} 0 0 1 ${r + R * Math.cos(a1)},${r + R * Math.sin(a1)} Z`;
    const cls = `${loaded.includes(name) ? 'loaded' : ''} ${mine.includes(name) ? 'mine' : ''}`;
    return `<path class="${cls}" d="${p}"><title>${name}</title></path>`;
  }).join('');
  return `<svg class="rose" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Versanti caricati: ${
    loaded.length ? loaded.join(', ') : 'nessuno'
  }">${paths}<text x="${r}" y="9" text-anchor="middle">N</text></svg>`;
}

// Giorni della finestra buona aperti dall'utente: restano aperti quando la pagina si ridisegna.
const openDays = new Set();
document.addEventListener(
  'toggle',
  (e) => {
    const k = e.target.dataset?.openKey;
    if (!k) return;
    if (e.target.open) openDays.add(k);
    else openDays.delete(k);
  },
  true,
);

function windowSection(place, band, selDay = null) {
  const s = state.forecast?.byPlace[place.id]?.[band];
  if (!s) return '';
  const ws = windowsFor(place, band);
  const mine = placeAspects(place.id);
  const items = s.days
    .map((d, i) => {
      const w = ws[i];
      const conds = w.conditions
        .map((c) => `<li class="${c.ok ? 'ok' : 'ko'}${c.bonus ? ' bonus' : ''}">${c.ok ? '✓' : c.bonus ? '·' : '✗'} ${esc(c.label)} <span class="muted">${esc(c.text)}</span></li>`)
        .join('');
      const sigs = w.signals
        .map(
          (x) =>
            `<li class="sig sig-${x.level}">${x.level === 'chiusa' ? '⛔' : x.level === 'info' ? 'ℹ' : '⚠'} ${
              x.certainty === 'possibile' ? '<b>possibile</b>: ' : ''
            }${esc(x.text)} <span class="muted">(${esc(x.source)})</span></li>`,
        )
        .join('');
      const rose = w.loaded.length
        ? `<div class="win-rose">${aspectRose(w.loaded, mine)}<span class="muted">${
            w.slabSource === 'bollettino' ? 'dal bollettino' : 'stima dal vento in quota'
          }</span></div>`
        : '';
      // Una riga per giorno: si apre per vedere condizioni e segnali.
      const main = w.signals.find((x) => x.level === 'chiusa') || w.signals.find((x) => x.level === 'avviso' || x.level === 'versanti');
      const why = w.status === 'meteo'
        ? w.conditions.filter((c) => !c.bonus && !c.ok).map((c) => ({ sun: 'nuvoloso', calm: 'ventoso', freezing: 'zero termico alto' })[c.id] || c.label).join(', ')
        : main ? main.text.split(':')[0] : '';
      const open = openDays.has(`${place.id}|${d.date}`);
      return `<li class="win-day" id="win-${d.date}"><details data-open-key="${place.id}|${d.date}" ${open ? 'open' : ''}>
        <summary><span class="win win-${w.status}"></span><span class="cap">${weekday(d.date)} ${dayNum(d.date)}</span><span class="win-why">${esc(why)}</span></summary>
        <div class="win-body"><div><ul class="win-conds">${conds}</ul>${sigs ? `<ul class="win-sigs">${sigs}</ul>` : ''}</div>${rose}</div>
      </details></li>`;
    })
    .join('');
  const picker = SECTORS.map(
    (a) => `<button type="button" class="aspect" data-aspect="${a}" data-place-aspect="${place.id}" aria-pressed="${mine.includes(a)}">${a}</button>`,
  ).join('');
  return `<section class="windows">
    <h2>Finestra buona <span class="muted small">a ${place.elevations[band]} m · regole SLF ed EAWS</span></h2>
    <ol class="win-list">${items}</ol>
    <div class="aspect-pick"><span class="muted small">I tuoi versanti</span><div class="aspects">${picker}</div></div>
  </section>`;
}

function toggleAspect(placeId, aspect) {
  const cur = placeAspects(placeId);
  const next = cur.includes(aspect) ? cur.filter((a) => a !== aspect) : [...cur, aspect];
  setPrefs({ aspects: { ...(state.prefs.aspects || {}), [placeId]: SECTORS.filter((a) => next.includes(a)) } });
}

// ---------- caricamento dati ----------

async function refreshAvalanche(force = false) {
  try {
    state.aval = await loadAvalanche(PLACES, { force });
  } catch (err) {
    console.error(err);
  }
  render();
}

async function loadAvalancheArchive(day) {
  state.avalArchive = { day, n: PLACES.length, data: null };
  render();
  try {
    const data = await loadAvalanche(PLACES, { day });
    if (state.avalArchive?.day === day) state.avalArchive = { ...state.avalArchive, data };
  } catch (err) {
    console.error(err);
  }
  render();
}

async function refresh(force = false) {
  refreshAvalanche(force);
  const r = route();
  if (force && r.tab === 'posto') {
    const p = placeById(r.id);
    if (p) ensureDetail(p, p.single ? 'valle' : state.prefs.band, true);
  }
  state.loading = true;
  state.error = null;
  ptr.classList.add('spinning');
  render();
  try {
    state.forecast = await loadForecast(PLACES, { force });
  } catch (err) {
    console.error(err);
    state.error = 'Non riesco a scaricare le previsioni. Controlla la connessione e riprova.';
  } finally {
    state.loading = false;
    ptr.classList.remove('spinning');
    setPull(0);
    render();
  }
}

// Trascina giù dall'inizio della pagina per aggiornare (non sulle mappe).
const PULL_MAX = 90;
const PULL_GO = 64;
let pull = null;
function setPull(d, dragging = false) {
  ptr.style.setProperty('--pull', `${d}px`);
  ptr.style.setProperty('--rot', `${d * 3}deg`);
  ptr.classList.toggle('show', d > 6);
  ptr.classList.toggle('dragging', dragging);
}
window.addEventListener(
  'touchstart',
  (e) => {
    if (window.scrollY > 0 || state.loading || e.touches.length !== 1) return;
    if (e.target.closest?.('.leaflet-container, .chart-scroll, input, select')) return;
    pull = { y0: e.touches[0].clientY, d: 0 };
  },
  { passive: true },
);
window.addEventListener(
  'touchmove',
  (e) => {
    if (!pull) return;
    pull.d = Math.max(0, Math.min(PULL_MAX, (e.touches[0].clientY - pull.y0) * 0.6));
    if (window.scrollY > 0) pull.d = 0;
    setPull(pull.d, true);
    ptr.classList.toggle('ready', pull.d >= PULL_GO);
  },
  { passive: true },
);
window.addEventListener('touchend', () => {
  if (!pull) return;
  const go = pull.d >= PULL_GO;
  pull = null;
  ptr.classList.remove('ready');
  if (go) {
    setPull(PULL_GO);
    refresh(true);
  } else setPull(0);
});

// ---------- schermate ----------

function bandSwitch(place) {
  return `<div class="segmented bands" role="radiogroup" aria-label="Quota">
    ${BANDS.map((b) => {
      const label = b.id === 'cima' && place.cimaLabel ? esc(place.cimaLabel) : b.label;
      return `<button type="button" role="radio" aria-checked="${state.prefs.band === b.id}" data-band="${b.id}"><span>${label}</span><small>${place.elevations[b.id]} m</small></button>`;
    }).join('')}
  </div>`;
}

// ---------- panoramica (preferiti) ----------

// Nei preferiti si usa sempre la quota di metà (o l'unica quota); la scelta resta nella pagina del posto.
const overviewBand = (place) => (place.single ? 'valle' : 'meta');

const sumMedian = (days, from, to) => {
  const r = totalRange(days.slice(from, to));
  return r ? { median: r.median, min: r.min, max: r.max } : null;
};
const cmText = (x) => (x == null ? '–' : `${roundCm(x)}`);

// Totali neve per l'ordinamento e per la scheda: prossimi 1-5 e 6-10 giorni (mediana tra i modelli).
function snowTotals(s) {
  return { d1_5: sumMedian(s.days, 0, 5), d6_10: sumMedian(s.days, 5, 10) };
}

function sortSwitch() {
  const opts = [
    ['mio', 'I miei'],
    ['d1_5', '1-5 gg'],
    ['d6_10', '6-10 gg'],
  ];
  const snowIco = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICON.snow}</svg>`;
  return `<div class="chips sortbar" role="radiogroup" aria-label="Ordina">
    ${opts.map(([id, l]) => `<button type="button" class="chip" role="radio" aria-checked="${state.prefs.sort === id}" data-sort="${id}">${id === 'mio' ? '' : snowIco}${l}</button>`).join('')}
    <button type="button" class="chip reorder-btn" data-reorder aria-label="Riordina i preferiti" title="Riordina i preferiti">
      <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4v16M8 4 4.5 7.5M8 4l3.5 3.5M16 20V4M16 20l-3.5-3.5M16 20l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>`;
}

// Riordino manuale: elenco semplice dei preferiti con frecce su/giù.
function reorderList(favs) {
  const arrow = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const rows = favs
    .map(
      (p, i) => `<li class="ro-row">
        <span class="ro-name"><b>${esc(p.name)}</b><small>${p.elevations[overviewBand(p)]} m</small></span>
        <button type="button" class="ro-btn" data-move="${p.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Sposta su ${esc(p.name)}">${arrow('M6 15l6-6 6 6')}</button>
        <button type="button" class="ro-btn" data-move="${p.id}" data-dir="1" ${i === favs.length - 1 ? 'disabled' : ''} aria-label="Sposta giù ${esc(p.name)}">${arrow('M6 9l6 6 6-6')}</button>
      </li>`,
    )
    .join('');
  return `<section class="reorder">
    <ul class="ro-list">${rows}</ul>
    <button type="button" class="btn ro-done" data-reorder-done>Fatto</button>
  </section>`;
}

function moveFav(id, dir) {
  const favs = [...state.prefs.favorites];
  const i = favs.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= favs.length) return;
  [favs[i], favs[j]] = [favs[j], favs[i]];
  setPrefs({ favorites: favs, sort: 'mio' });
}

function placeHead(place, band = overviewBand(place)) {
  const region = REGIONS[place.region];
  const fav = isFav(place.id);
  return `<header class="place-head">
    <button type="button" class="star" data-fav="${place.id}" aria-pressed="${fav}" aria-label="${fav ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'}">${fav ? '★' : '☆'}</button>
    <a class="place-title" href="#/posto/${place.id}">
      <h2>${esc(place.name)}</h2>
      <p class="place-sub">${place.elevations[band]} m · ${esc(region?.name || '')}</p>
    </a>
    <a class="go" href="#/posto/${place.id}" aria-label="Apri ${esc(place.name)}">›</a>
  </header>`;
}


const DAY_LETTER = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];
const isWeekend = (iso) => [0, 6].includes(dayDate(iso).getDay());

const POWDER_SHORT = { ottima: 'Ottima', buona: 'Buona', discreta: 'Discreta', no: '' };

// Scheda Neve: ultime 24 ore, poi barre dei prossimi 10 giorni con i totali 1-5 e 6-10.
// Nel dettaglio (detail) usa la quota scelta e aggiunge la qualità della polvere.
function snowCard(place, { detail = false } = {}) {
  const band = detail && !place.single ? state.prefs.band : overviewBand(place);
  const s = state.forecast?.byPlace[place.id]?.[band];
  if (!s) return `<article class="place">${placeHead(place, band)}<p class="muted pad">Dati non disponibili</p></article>`;
  const t = snowTotals(s);
  const days = s.days.slice(0, 10);
  const maxCm = Math.max(10, ...days.map((d) => d.snow?.median ?? 0));
  const pw = detail ? powderDays([...(s.past || []), ...s.days], place.elevations[band], (s.past || []).length) : [];
  const cols = days
    .map((d, i) => {
      const cm = d.snow?.median ?? 0;
      const h = Math.max(cm >= 0.5 ? 3 : 2, (cm / maxCm) * (detail ? 56 : 40));
      const title = `${longDay(d.date)}: ${d.snow ? rangeText(d.snow) : 'n.d.'} cm tra i modelli`;
      const p = pw[i];
      return `<a class="sc-day${i === 5 ? ' sep' : ''}" href="#/posto/${place.id}?giorno=${d.date}" title="${esc(title)}">
        <span class="sc-cm ${roundCm(cm) ? 'on' : ''}">${roundCm(cm)}</span>
        <span class="sc-bar" style="height:${h}px;background:${cm >= 0.5 ? snowColor(cm) : 'var(--line)'}"></span>
        <span class="sc-wd ${isWeekend(d.date) ? 'we' : ''}">${DAY_LETTER[dayDate(d.date).getDay()]}</span>
        <span class="sc-dn ${isWeekend(d.date) ? 'we' : ''}">${dayNum(d.date)}</span>
        ${detail ? `<span class="pw ${p && p.level !== 'no' ? `pw-${p.level}` : 'pw-vuota'}"${p && p.level !== 'no' ? ` title="Polvere: ${p.label}"` : ''}></span>` : ''}
      </a>`;
    })
    .join('');
  return `<article class="place${detail ? '' : ' compact'}" data-place="${place.id}">
    ${placeHead(place, band)}
    <div class="sc">
      <div class="sc-last">
        <span class="sc-k">Ultime 24 h</span>
        <span class="sc-big">${cmText(s.last24)}<small>cm</small></span>
      </div>
      <div class="sc-next">
        <div class="sc-tot">
          <span><span class="sc-k">1-5 giorni</span><b class="${(t.d1_5?.median ?? 0) >= 0.5 ? 'hot' : ''}" title="${t.d1_5 ? `${rangeText(t.d1_5)} cm tra i modelli` : ''}">${cmText(t.d1_5?.median)} cm</b></span>
          <span><span class="sc-k">6-10 giorni</span><b title="${t.d6_10 ? `${rangeText(t.d6_10)} cm tra i modelli` : ''}">${cmText(t.d6_10?.median)} cm</b></span>
        </div>
        <div class="sc-days">${cols}</div>
        ${detail ? `<p class="pw-legend"><span class="pw-k">Polvere</span><span class="pw pw-ottima"></span>ottima <span class="pw pw-buona"></span>buona <span class="pw pw-discreta"></span>discreta</p>` : ''}
      </div>
    </div>
  </article>`;
}

// Icona del giorno per la scheda Previsione: neve, pioggia, sole, nuvole, più il vento se forte.
function dayIcon(day) {
  const snow = (day.snow?.median ?? 0) >= 1;
  const rain = (day.rain ?? 0) >= 1;
  const windy = (day.wind?.speed ?? 0) >= 40;
  const c = day.cloud;
  const k = snow ? 'neve' : rain ? 'pioggia' : c == null ? 'nd' : c < 30 ? 'sereno' : c < 70 ? 'variabile' : 'coperto';
  const cloud = (fill, dy = 0) => `<path d="M6 ${16 + dy}h12a4 4 0 0 0 0-8 6 6 0 0 0-11.5 2A3 3 0 0 0 6 ${16 + dy}z" fill="${fill}"/>`;
  const shapes = {
    sereno: '<circle cx="12" cy="12" r="4" fill="#ffd166"/><path d="M18.8 12.0L22.0 12.0M16.8 16.8L19.1 19.1M12.0 18.8L12.0 22.0M7.2 16.8L4.9 19.1M5.2 12.0L2.0 12.0M7.2 7.2L4.9 4.9M12.0 5.2L12.0 2.0M16.8 7.2L19.1 4.9" stroke="#ffd166" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
    variabile: '<circle cx="8.5" cy="8.5" r="3" fill="#ffd166"/><path d="M13.5 8.5L15.7 8.5M12.0 12.0L13.6 13.6M8.5 13.5L8.5 15.7M5.0 12.0L3.4 13.6M3.5 8.5L1.3 8.5M5.0 5.0L3.4 3.4M8.5 3.5L8.5 1.3M12.0 5.0L13.6 3.4" stroke="#ffd166" stroke-width="1.8" stroke-linecap="round" fill="none"/><path d="M7 19h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1.5A3.3 3.3 0 0 0 7 19z" fill="#c7d2ea"/>',
    coperto: cloud('#8b98b8', 2),
    neve: `<g style="color:#9fd0ff">${ICON.snow}</g>`,
    pioggia: '<path d="M12 3c3.5 4.6 6 8 6 11a6 6 0 0 1-12 0c0-3 2.5-6.4 6-11z" fill="#7fd6a4"/>',
    nd: '',
  };
  const label = `${k}${windy ? ', vento forte' : ''}`;
  return `<span class="fc-ico" title="${label}"><svg viewBox="0 0 24 24" role="img" aria-label="${label}">${shapes[k]}</svg>${
    windy ? `<svg class="fc-wind" viewBox="0 0 24 24" aria-hidden="true">${ICON.wind}</svg>` : ''
  }</span>`;
}

// Freccia del vento: punta dove va il vento (come nei grafici), così il numero resta da solo.
const windArrow = (deg) =>
  deg == null
    ? ''
    : `<svg class="w-arrow" viewBox="-6 -6 12 12" aria-hidden="true"><path transform="rotate(${Math.round(deg + 180)})" d="M0,-5 L3.2,3 L0,1.2 L-3.2,3 Z" fill="currentColor"/></svg>`;

// Neve del giorno sotto l'icona: cm (mediana) solo se c'è, in colore neve.
function snowDay(d) {
  const cm = roundCm(d.snow?.median ?? 0);
  return cm
    ? `<span class="fc-cm" style="color:${snowColor(cm)}" title="${d.snow ? `${rangeText(d.snow)} cm tra i modelli` : ''}">${cm}<small>cm</small></span>`
    : '<span class="fc-cm none" aria-hidden="true">·</span>';
}

// Striscia neve della scheda: ultime 24 ore, prossimi 1-5 e 6-10 giorni.
function snowStrip(s) {
  const t = snowTotals(s);
  const cell = (k, v, range) => {
    const on = (v ?? 0) >= 0.5;
    return `<span class="ss-cell${on ? ' on' : ''}"${range ? ` title="${rangeText(range)} cm tra i modelli"` : ''}><span class="ss-k">${k}</span><b>${cmText(v)}<small>cm</small></b></span>`;
  };
  return `<div class="ss">
    <svg class="ss-ico" viewBox="0 0 24 24" role="img" aria-label="Neve">${ICON.snow}</svg>
    ${cell('24 h', s.last24)}
    ${cell('1-5 gg', t.d1_5?.median, t.d1_5)}
    ${cell('6-10 gg', t.d6_10?.median, t.d6_10)}
  </div>`;
}

// Scheda unica dei Preferiti: adesso (temperatura, vento, raffiche) e 7 giorni con massima/minima.
function forecastCard(place) {
  const band = overviewBand(place);
  const s = state.forecast?.byPlace[place.id]?.[band];
  if (!s) return `<article class="place">${placeHead(place)}<p class="muted pad">Dati non disponibili</p></article>`;
  const n = s.now;
  const wins = windowsFor(place, band) || [];
  const nowDay = { snow: { median: n?.snowing ? 1 : 0 }, rain: n && !n.snowing && n.precip > 0.1 ? 1 : 0, cloud: n?.cloud, wind: { speed: n?.wind } };
  const now = n
    ? `<div class="fc-now">
        <div class="fc-now-l">${dayIcon(nowDay)}<span class="fc-temp">${Math.round(n.temp)}<small>°C</small></span></div>
        <div class="fc-now-r"><span class="fc-wind-now">${icon('wind', 'Vento in quota')} <b>${Math.round(n.wind ?? 0)}</b> km/h ${compass(n.windDir)}</span>
        ${n.gust != null ? `<span class="muted">raffiche ${Math.round(n.gust)} km/h</span>` : ''}</div>
      </div>`
    : '';
  const cols = s.days
    .slice(0, 7)
    .map(
      (d, i) => `<a class="fc-day" href="#/posto/${place.id}?giorno=${d.date}">
        <span class="fc-wd ${isWeekend(d.date) ? 'we' : ''}">${i === 0 ? 'Oggi' : `${weekday(d.date)} ${dayNum(d.date)}`}</span>
        <span class="fc-max">${d.tMax != null ? Math.round(d.tMax) : '–'}°</span>
        <span class="fc-min">${d.tMin != null ? Math.round(d.tMin) : '–'}°</span>
        ${dayIcon(d)}
        ${snowDay(d)}
        <span class="fc-w" title="${d.wind ? `Vento massimo in quota: ${Math.round(d.wind.speed)} km/h da ${compass(d.wind.dir)}` : ''}">${d.wind ? `${windArrow(d.wind.dir)}${Math.round(d.wind.speed)}` : '–'}</span>
        ${windowMark(wins[i])}
      </a>`,
    )
    .join('');
  return `<article class="place" data-place="${place.id}">
    ${placeHead(place)}
    ${now}
    ${snowStrip(s)}
    <div class="fc-days">${cols}</div>
  </article>`;
}

function renderOverview() {
  // Preferiti nell'ordine scelto (state.prefs.favorites).
  const favs = state.prefs.favorites.map(placeById).filter(Boolean);
  // I posti solo "visti" (provvisori) non entrano nella panoramica finché non sono preferiti.
  const others = PLACES.filter((p) => !isFav(p.id) && !p.temp);
  const showAll = state.prefs.showAll || favs.length === 0;
  let visible = showAll ? [...favs, ...others] : favs;
  const sort = state.prefs.sort;
  if (state.forecast && sort !== 'mio') {
    const val = (p) => {
      const s = state.forecast.byPlace[p.id]?.[overviewBand(p)];
      return s ? snowTotals(s)[sort]?.median ?? -1 : -1;
    };
    visible = [...visible].sort((a, b) => val(b) - val(a));
  }

  let body = '';
  if (state.error && !state.forecast) {
    body = `<div class="notice error"><p>${esc(state.error)}</p><button type="button" class="btn" data-retry>Riprova</button></div>`;
  } else if (!state.forecast) {
    body = `<p class="loading">Scarico le previsioni dei modelli…</p>`;
  } else {
    body = visible.map(forecastCard).join('');
  }

  const status = state.forecast
    ? `<p class="status ${state.forecast.stale ? 'stale' : ''}">${
        state.forecast.stale ? 'Senza rete: dati di ' : 'Aggiornato '
      }${timeAgo(state.forecast.fetchedAt)} · Open-Meteo</p>`
    : '';

  app.innerHTML = `
    ${state.reorder && favs.length > 1 ? reorderList(favs) : sortSwitch()}
    ${status}
    ${state.error && state.forecast ? `<div class="notice">${esc(state.error)}</div>` : ''}
    ${body}
    <div class="toolbar end">
      <a class="btn ghost add-place" href="#/aggiungi">+ Aggiungi posto</a>
      <label class="toggle"><input type="checkbox" data-showall ${showAll ? 'checked' : ''} ${favs.length ? '' : 'disabled'}> Anche i non preferiti</label>
    </div>
    <details class="explain">
      <summary>Come leggere</summary>
      <p>Riga neve: ultime 24 ore e totali dei prossimi 1-5 e 6-10 giorni; sotto ogni giorno i cm previsti. Con le frecce in alto riordini i preferiti, oppure ordini per neve prevista.</p>
      <p>Neve stimata: mediana tra i modelli (${MODELS.map((m) => m.label).join(', ')}). Tieni il dito su un numero per l'intervallo tra i modelli. Dal 6° giorno restano solo ECMWF e GFS.</p>
      <p>Finestra buona: <span class="win win-aperta legend"></span> sì · <span class="win win-avvisi legend"></span> con avvisi · <span class="win win-chiusa legend"></span> chiusa · <span class="win win-meteo legend"></span> meteo non buono.</p>
      <p>Quota di metà per tutti i posti; nella pagina del posto si sceglie valle, metà o cima. Vento: in quota (circa 3000 m), km/h e provenienza. Raffiche: vicino al suolo.</p>
    </details>`;
}

function favButton(place) {
  const fav = isFav(place.id);
  const label = fav ? 'Togli dai preferiti' : 'Aggiungi ai preferiti';
  return `<button type="button" class="fav-btn" data-fav="${place.id}" aria-pressed="${fav}" aria-label="${label}" title="${label}">${fav ? '★' : '☆'}</button>`;
}

// ---------- dettaglio del posto: grafici per modello ----------

const CHARTS = [
  { id: 'snowTotal', label: 'Neve totale', unit: 'cm', min: 0, minSpan: 10 },
  { id: 'snowLine', label: 'Quota neve', unit: 'm', min: 0, ref: 'elev' },
  { id: 'temp', label: 'Temperatura', unit: '°C', ref: 0 },
  { id: 'wind', label: 'Vento in quota', unit: 'km/h', min: 0, minSpan: 40, bands: true, arrows: true },
  { id: 'gust', label: 'Raffiche', unit: 'km/h', min: 0, minSpan: 40, bands: true },
  { id: 'cloud', label: 'Nuvole', unit: '%', min: 0, max: 100 },
];
const WIND_BANDS = [
  { from: 0, to: 20, label: 'debole', cls: 'b-light' },
  { from: 20, to: 40, label: 'moderato', cls: 'b-mod' },
  { from: 40, to: 60, label: 'forte', cls: 'b-strong' },
  { from: 60, to: 999, label: 'molto forte', cls: 'b-vstrong' },
];

async function ensureDetail(place, band, force = false) {
  const key = `${place.id}|${band}|${place.elevations[band]}`;
  if (!force && state.detail?.key === key && (state.detail.data || state.detail.loading)) return;
  // Aggiornando si tengono i grafici vecchi a schermo finché arrivano i nuovi.
  const old = state.detail?.key === key ? state.detail.data : null;
  state.detail = { key, loading: !old, data: old, error: null };
  try {
    const data = await loadDetail(place, band, { force });
    if (state.detail.key === key) state.detail = { key, loading: false, data, error: null };
  } catch (err) {
    console.error(err);
    if (state.detail.key === key) state.detail = { key, loading: false, data: null, error: 'Non riesco a scaricare i grafici.' };
  }
  if (route().tab === 'posto') render();
}

function chartBlock(place, band) {
  const d = state.detail;
  if (!d || d.loading) return '<p class="loading">Scarico i grafici a 15 giorni…</p>';
  if (d.error) return `<p class="muted">${esc(d.error)}</p>`;
  const series = d.data.series;
  const cur = CHARTS.find((c) => c.id === state.prefs.chart) || CHARTS[0];
  const hl = state.prefs.chartModel && series.byModel[state.prefs.chartModel] ? state.prefs.chartModel : '';
  const elev = d.data.elev;
  const ref = cur.ref === 'elev' ? { value: elev, label: `quota ${elev} m` } : cur.ref === 0 ? { value: 0, label: '0 °C' } : null;
  const chart = lineChart(series, {
    key: cur.id,
    label: cur.label,
    min: cur.min,
    max: cur.max,
    minSpan: cur.minSpan,
    ref,
    bands: cur.bands ? WIND_BANDS : null,
    arrows: cur.arrows ? series.median.windDir : null,
    highlight: hl,
    fmt: cur.id === 'snowLine' ? (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)) : null,
  });
  // Valore "in fondo" della linea mediana (o del modello scelto) per la legenda.
  const src = hl ? series.byModel[hl][cur.id] : series.median[cur.id];
  const lastVal = [...src].reverse().find((v) => v != null);
  const tabs = CHARTS.map(
    (c) => `<button type="button" class="chip" role="tab" aria-selected="${c.id === cur.id}" data-chart="${c.id}">${c.label}</button>`,
  ).join('');
  const models = MODELS.filter((m) => series.byModel[m.id]);
  const pick = `<label class="model-pick">Modello <select data-chart-model>
      <option value="">Tutti (mediana)</option>
      ${models.map((m) => `<option value="${m.id}" ${m.id === hl ? 'selected' : ''}>${m.label}</option>`).join('')}
    </select></label>`;
  return `<section class="charts">
    <div class="chips scroll" role="tablist" aria-label="Grafico" data-keep-scroll="chart-tabs">${tabs}</div>
    <div class="chart-bar">${pick}<span class="chart-legend"><span class="lg-med${hl ? ' lg-hl' : ''}"></span>${
      hl ? esc(MODELS.find((m) => m.id === hl).label) : 'mediana'
    } · <span class="lg-model"></span> singoli modelli</span></div>
    ${scrollCharts(chart, precipStrip(series, { highlight: hl }))}
    <p class="chart-foot"><span class="lg-snow"></span> neve <span class="lg-rain"></span> pioggia <span class="lg-cloud"></span> nuvole${
      cur.id === 'snowTotal' && lastVal != null ? ` · <b>${roundCm(lastVal)} cm</b> in 15 giorni (${hl ? 'modello scelto' : 'mediana'})` : ''
    }</p>
  </section>`;
}

function renderDetail(id, params) {
  const place = placeById(id);
  if (!place) return renderNotFound();
  const band = place.single ? 'valle' : state.prefs.band;
  // Il giorno toccato nei preferiti si apre una volta; poi lo chiude o apre l'utente.
  const sel0 = params.get('giorno');
  if (sel0 && state.scrolledDay !== location.hash) openDays.add(`${place.id}|${sel0}`);
  ensureDetail(place, band);
  const s = state.forecast?.byPlace[place.id]?.[band];
  const card = s ? snowCard(place, { detail: true }) : '';

  app.innerHTML = `
    <p class="back"><a href="${esc(state.backHref || '#/')}" data-back>← ${esc(state.backLabel || 'Preferiti')}</a></p>
    <div class="detail-head">
      <h1 class="page-title">${esc(place.name)}</h1>
      ${favButton(place)}
    </div>
    ${place.single || place.custom ? `<p class="place-sub">${place.single ? `Quota ${place.elevations.valle} m` : ''}${
      place.custom ? `${place.single ? ' · ' : ''}<a href="#/aggiungi?modifica=${place.id}">Modifica</a>` : ''
    }</p>` : ''}
    ${place.single ? '' : `<div class="toolbar">${bandSwitch(place)}</div>`}
    <div class="detail-card">${card.replace(/<header[\s\S]*?<\/header>/, '').replace(/<footer[\s\S]*<\/footer>/, '')}</div>
    ${chartBlock(place, band)}
    ${windowSection(place, band, params.get('giorno'))}
    ${avalPlaceBlock(place, state.aval)}
    <p class="links-row">${externalLinks(place)
      .map((l) => `<a class="btn ghost" href="${l.url}" target="_blank" rel="noopener">${l.label} ↗</a>`)
      .join('')}</p>`;
  const sel = params.get('giorno');
  if (sel && state.scrolledDay !== location.hash) {
    state.scrolledDay = location.hash;
    requestAnimationFrame(() => document.getElementById(`win-${sel}`)?.scrollIntoView({ block: 'center' }));
  }
}

function renderPlaceholder(title, text, links = []) {
  app.innerHTML = `
    <h1 class="page-title">${title}</h1>
    <div class="notice placeholder"><p>${text}</p></div>
    <p class="links-row">${links
      .map((l) => `<a class="btn ghost" href="${l.url}" target="_blank" rel="noopener">${l.label} ↗</a>`)
      .join('')}</p>`;
}

function renderAvalanche(params) {
  const today = romeDate();
  const asked = params.get('giorno');
  const archiveDay = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked !== today ? asked : null;
  if (archiveDay && (state.avalArchive?.day !== archiveDay || state.avalArchive?.n !== PLACES.length)) loadAvalancheArchive(archiveDay);
  const aval = archiveDay ? state.avalArchive?.data : state.aval;
  const favs = PLACES.filter((p) => isFav(p.id));
  const places = [...favs, ...PLACES.filter((p) => !isFav(p.id))];
  app.innerHTML = avalPage({ places, aval, archiveDay, today });
  // Dal badge della Panoramica: porta alla scheda del posto (una volta sola per indirizzo).
  const focus = params.get('posto');
  if (focus && aval && state.avalScrolled !== location.hash) {
    state.avalScrolled = location.hash;
    requestAnimationFrame(() => document.getElementById(`valanghe-${focus}`)?.scrollIntoView());
  }
}

function renderNotFound() {
  app.innerHTML = `<h1 class="page-title">Pagina non trovata</h1><p><a href="#/">Torna alla panoramica</a></p>`;
}

// Posti aggiunti dall'utente (js/myplaces.js li inserisce in PLACES).
function placeSaved(place, { fav = false } = {}) {
  if (fav && !isFav(place.id)) {
    state.prefs = { ...state.prefs, favorites: [...state.prefs.favorites, place.id] };
    savePrefs(state.prefs);
  }
  location.hash = `#/posto/${place.id}`;
  refresh(false);
}

function placeDeleted(id) {
  state.prefs = { ...state.prefs, favorites: state.prefs.favorites.filter((f) => f !== id) };
  savePrefs(state.prefs);
  location.hash = '#/';
  refresh(false);
}

// ---------- router ----------

function route(h = location.hash) {
  const hash = (h || '').replace(/^#/, '') || '/';
  const [path, query = ''] = hash.split('?');
  const params = new URLSearchParams(query);
  const parts = path.split('/').filter(Boolean);
  return { tab: parts[0] || 'panoramica', id: parts[1], params };
}

// Le file che scorrono in orizzontale (categorie dei grafici, grafici) restano dove sono
// quando la pagina viene ridisegnata, invece di tornare all'inizio.
function keepScroll() {
  const saved = [...app.querySelectorAll('[data-keep-scroll]')].map((el) => [el.dataset.keepScroll, el.scrollLeft]);
  return () => {
    for (const [k, x] of saved) {
      const el = app.querySelector(`[data-keep-scroll="${k}"]`);
      if (el) el.scrollLeft = x;
    }
  };
}

let lastHash = null;
function render() {
  // Su un'altra pagina si riparte dall'inizio; sulla stessa si resta fermi.
  const restore = location.hash === lastHash ? keepScroll() : () => {};
  lastHash = location.hash;
  renderRoute();
  restore();
}

function renderRoute() {
  const r = route();
  document.querySelectorAll('.tabbar a').forEach((a) => {
    const active = a.dataset.tab === (r.tab === 'posto' || r.tab === 'aggiungi' ? 'panoramica' : r.tab);
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  // Il radar occupa tutto lo schermo; quando si cambia scheda la mappa viene chiusa.
  document.body.classList.toggle('radar-mode', r.tab === 'radar');
  if (r.tab !== 'radar') unmountRadar();

  switch (r.tab) {
    case 'panoramica':
      return renderOverview();
    case 'posto':
      return renderDetail(r.id, r.params);
    case 'aggiungi':
      return renderAddPage(app, r.params, { onSaved: placeSaved, onDeleted: placeDeleted });
    case 'radar':
      return mountRadar(app, { places: PLACES, favorites: state.prefs.favorites });
    case 'valanghe':
      return renderAvalanche(r.params);
    case 'stagione':
      return renderSeason(app, r.params, { places: PLACES, prefs: state.prefs, isFav, rerender: render });
    default:
      return renderNotFound();
  }
}

// Eventi delegati (i contenuti vengono ridisegnati a ogni cambio).
app.addEventListener('click', (e) => {
  if (e.target.closest('[data-reorder]')) {
    state.reorder = true;
    return render();
  }
  if (e.target.closest('[data-reorder-done]')) {
    state.reorder = false;
    return setPrefs({ sort: 'mio' });
  }
  const mv = e.target.closest('[data-move]');
  if (mv) return moveFav(mv.dataset.move, Number(mv.dataset.dir));
  const sortBtn = e.target.closest('[data-sort]');
  if (sortBtn) return setPrefs({ sort: sortBtn.dataset.sort });
  const chartBtn = e.target.closest('[data-chart]');
  if (chartBtn) return setPrefs({ chart: chartBtn.dataset.chart });
  const bandBtn = e.target.closest('[data-band]');
  if (bandBtn) return setPrefs({ band: bandBtn.dataset.band });
  const fav = e.target.closest('[data-fav]');
  if (fav) return toggleFav(fav.dataset.fav);
  const asp = e.target.closest('[data-aspect]');
  if (asp) return toggleAspect(asp.dataset.placeAspect, asp.dataset.aspect);
  if (e.target.closest('[data-retry]')) return refresh(true);
});
app.addEventListener('submit', (e) => {
  if (!e.target.matches('[data-aval-archive]')) return;
  e.preventDefault();
  const day = new FormData(e.target).get('giorno');
  location.hash = day && day !== romeDate() ? `#/valanghe?giorno=${day}` : '#/valanghe';
});
app.addEventListener('change', (e) => {
  if (e.target.matches('[data-showall]')) setPrefs({ showAll: e.target.checked });
  if (e.target.matches('[data-chart-model]')) setPrefs({ chartModel: e.target.value });
});

// Da quale scheda si è arrivati al posto, per il link "indietro".
const BACK_LABEL = { panoramica: 'Preferiti', valanghe: 'Valanghe', radar: 'Radar', stagione: 'Stagione' };
let prevHash = location.hash;
window.addEventListener('hashchange', () => {
  const from = route(prevHash);
  if (route().tab === 'posto' && from.tab !== 'posto' && BACK_LABEL[from.tab]) {
    state.backHref = prevHash || '#/';
    state.backLabel = BACK_LABEL[from.tab];
  } else if (route().tab !== 'posto') {
    state.backHref = null;
    state.backLabel = null;
  }
  prevHash = location.hash;
  render();
  window.scrollTo(0, 0);
});

// Aggiorna quando si torna sull'app dopo un po' (cache di un'ora).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !state.loading) refresh(false);
});

render();
refresh(false);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
