import { PLACES, BANDS, REGIONS, externalLinks } from './places.js';
import { MODELS, rangeText, roundCm, compass, nextSnowfall } from './snow.js';
import { loadForecast } from './forecast.js';
import { loadPrefs, savePrefs } from './storage.js';

const app = document.getElementById('app');
const refreshBtn = document.getElementById('refresh');

const state = {
  prefs: loadPrefs(),
  forecast: null,
  error: null,
  loading: false,
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

function skyIcon(day) {
  const snowing = (day.snow?.median ?? 0) >= 1;
  const c = day.cloud;
  let kind = 'n.d.';
  if (snowing) kind = 'neve';
  else if (c == null) kind = 'n.d.';
  else if (c < 30) kind = 'sereno';
  else if (c < 70) kind = 'variabile';
  else kind = 'coperto';
  const icons = {
    sereno: '<circle cx="12" cy="12" r="5" fill="#ffd166"/>',
    variabile:
      '<circle cx="9" cy="9" r="4" fill="#ffd166"/><path d="M7 19h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1.5A3.3 3.3 0 0 0 7 19z" fill="#c7d2ea"/>',
    coperto: '<path d="M6 18h12a4 4 0 0 0 0-8 6 6 0 0 0-11.5 2A3 3 0 0 0 6 18z" fill="#8b98b8"/>',
    neve:
      '<path d="M6 14h12a4 4 0 0 0 0-8 6 6 0 0 0-11.5 2A3 3 0 0 0 6 14z" fill="#8b98b8"/><g fill="#e8eefc"><circle cx="8" cy="18" r="1.4"/><circle cx="12" cy="20" r="1.4"/><circle cx="16" cy="18" r="1.4"/></g>',
    'n.d.': '',
  };
  return `<svg class="sky" viewBox="0 0 24 24" role="img" aria-label="${kind}"><title>${kind}</title>${icons[kind]}</svg>`;
}

// ---------- caricamento dati ----------

async function refresh(force = false) {
  state.loading = true;
  state.error = null;
  refreshBtn.classList.add('spinning');
  render();
  try {
    state.forecast = await loadForecast(PLACES, { force });
  } catch (err) {
    console.error(err);
    state.error = 'Non riesco a scaricare le previsioni. Controlla la connessione e riprova.';
  } finally {
    state.loading = false;
    refreshBtn.classList.remove('spinning');
    render();
  }
}

refreshBtn.addEventListener('click', () => refresh(true));

// ---------- schermate ----------

function bandSwitch() {
  return `<div class="segmented" role="radiogroup" aria-label="Quota">
    ${BANDS.map(
      (b) =>
        `<button type="button" role="radio" aria-checked="${state.prefs.band === b.id}" data-band="${b.id}">${b.label}</button>`,
    ).join('')}
  </div>`;
}

function summaryCard(visible) {
  const band = state.prefs.band;
  const summaries = visible
    .map((p) => ({ place: p, summary: state.forecast.byPlace[p.id]?.[band] }))
    .filter((s) => s.summary);
  if (!summaries.length) return '';
  const next = nextSnowfall(summaries);
  const bandLabel = BANDS.find((b) => b.id === band).label.toLowerCase();
  if (!next) {
    return `<section class="summary"><p class="summary-main">Nessuna nevicata di rilievo nei prossimi 7 giorni</p>
      <p class="summary-sub">quota ${bandLabel}, posti mostrati</p></section>`;
  }
  const days = summaries[0].summary.days;
  const a = days[next.startIndex].date;
  const b = days[next.endIndex].date;
  const when = a === b ? weekday(a) + ' ' + dayNum(a) : `${weekday(a)} ${dayNum(a)} – ${weekday(b)} ${dayNum(b)}`;
  const elev = next.best.place.elevations[band];
  return `<section class="summary">
    <p class="summary-label">Prossima nevicata</p>
    <p class="summary-main"><span class="cap">${esc(when)}</span>: ${rangeText(next.best)} cm a ${esc(next.best.place.name)}</p>
    <p class="summary-sub">quota ${bandLabel} (${elev} m), intervallo tra i modelli</p>
  </section>`;
}

function dayCell(place, day) {
  const med = day.snow ? roundCm(day.snow.median) : null;
  const max = day.snow ? day.snow.max : 0;
  const scale = 40; // cm a cui la barra è piena
  const hMax = Math.min(100, (max / scale) * 100);
  const hMed = Math.min(100, ((day.snow?.median ?? 0) / scale) * 100);
  const fl = day.freezingMax != null ? `${Math.round(day.freezingMax / 100) * 100}` : 'n.d.';
  const wind = day.wind ? `${Math.round(day.wind.speed)}<small> ${compass(day.wind.dir)}</small>` : 'n.d.';
  const title = day.snow
    ? `${longDay(day.date)}: neve ${rangeText(day.snow)} cm (${day.nModels} modelli)`
    : `${longDay(day.date)}: nessun dato`;
  return `<a class="day" href="#/posto/${place.id}?giorno=${day.date}" title="${esc(title)}">
    <span class="day-name">${weekday(day.date)} <b>${dayNum(day.date)}</b></span>
    ${skyIcon(day)}
    <span class="bar" aria-hidden="true">
      <span class="bar-max" style="height:${hMax}%;background:${snowColor(max)}"></span>
      <span class="bar-med" style="height:${hMed}%;background:${snowColor(day.snow?.median ?? 0)}"></span>
    </span>
    <span class="snow ${med ? 'has-snow' : ''}">${day.snow ? rangeText(day.snow) : 'n.d.'}</span>
    <span class="fl" title="Zero termico massimo">${fl}</span>
    <span class="wind" title="Vento massimo in quota (700 hPa, circa 3000 m), km/h">${wind}</span>
  </a>`;
}

function placeCard(place) {
  const band = state.prefs.band;
  const s = state.forecast?.byPlace[place.id]?.[band];
  const region = REGIONS[place.region];
  const elev = place.elevations[band];
  const fav = isFav(place.id);
  const total = s?.total;
  return `<article class="place" data-place="${place.id}">
    <header class="place-head">
      <button type="button" class="star" data-fav="${place.id}" aria-pressed="${fav}" aria-label="${fav ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'}">${fav ? '★' : '☆'}</button>
      <div class="place-title">
        <h2><a href="#/posto/${place.id}">${esc(place.name)}</a></h2>
        <p class="place-sub">${BANDS.find((b) => b.id === band).label} ${elev} m · ${esc(region.name)}</p>
      </div>
      <div class="place-total" title="Totale 7 giorni: intervallo tra i modelli che coprono tutta la settimana">
        <span class="total-num">${total ? rangeText(total) : 'n.d.'}</span><span class="total-unit">cm</span>
        <span class="total-label">7 giorni</span>
      </div>
    </header>
    <div class="days" role="list">
      <div class="row-labels" aria-hidden="true">
        <span class="day-name">&nbsp;</span><span class="sky-sp"></span><span class="bar-sp"></span>
        <span class="snow">cm</span><span class="fl">0°C</span><span class="wind">vento</span>
      </div>
      ${s ? s.days.map((d) => dayCell(place, d)).join('') : '<p class="muted">Dati non disponibili</p>'}
    </div>
    <footer class="place-foot">
      <a class="badge-aval" href="${region.avalancheUrl}" target="_blank" rel="noopener">Valanghe: bollettino ${region.avalancheSource} ↗</a>
      <span class="links">${externalLinks(place)
        .map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`)
        .join('')}</span>
    </footer>
  </article>`;
}

function renderOverview() {
  const favs = PLACES.filter((p) => isFav(p.id));
  const others = PLACES.filter((p) => !isFav(p.id));
  const showAll = state.prefs.showAll || favs.length === 0;
  const visible = showAll ? [...favs, ...others] : favs;

  let body = '';
  if (state.error && !state.forecast) {
    body = `<div class="notice error"><p>${esc(state.error)}</p><button type="button" class="btn" data-retry>Riprova</button></div>`;
  } else if (!state.forecast) {
    body = `<p class="loading">Scarico le previsioni dei modelli…</p>`;
  } else {
    body = `${summaryCard(visible)}${visible.map(placeCard).join('')}`;
  }

  const status = state.forecast
    ? `<p class="status ${state.forecast.stale ? 'stale' : ''}">${
        state.forecast.stale ? 'Senza rete: dati di ' : 'Aggiornato '
      }${timeAgo(state.forecast.fetchedAt)} · Open-Meteo</p>`
    : '';

  app.innerHTML = `
    <div class="toolbar">
      ${bandSwitch()}
      <label class="toggle"><input type="checkbox" data-showall ${showAll ? 'checked' : ''} ${favs.length ? '' : 'disabled'}> Mostra anche i non preferiti</label>
    </div>
    ${status}
    ${state.error && state.forecast ? `<div class="notice">${esc(state.error)}</div>` : ''}
    ${body}
    <section class="explain">
      <h3>Come leggere i numeri</h3>
      <p><b>Neve (cm)</b>: stimata alla quota scelta da precipitazione, temperatura e zero termico di ogni modello
      (limite neve circa 300 m sotto lo zero termico; rapporto neve/acqua da 10:1 vicino a 0 °C fino a 15:1 sotto −8 °C).
      Il numero è l'<b>intervallo tra i modelli</b> (${MODELS.map((m) => m.label).join(', ')}); la barra chiara arriva al modello più nevoso, quella piena alla mediana.</p>
      <p><b>0°C</b>: zero termico massimo del giorno in metri (ECMWF e Météo-France non lo forniscono). <b>Vento</b>: massimo del giorno in quota (700 hPa, circa 3000 m), in km/h, con la direzione di provenienza.</p>
      <p>I modelli ad alta risoluzione coprono solo i primi giorni (MeteoSwiss CH2 circa 5, ICON-2I circa 3): il totale a 7 giorni usa solo i modelli che coprono tutta la settimana.</p>
    </section>`;
}

function renderDetail(id, params) {
  const place = placeById(id);
  if (!place) return renderNotFound();
  const band = state.prefs.band;
  const s = state.forecast?.byPlace[place.id]?.[band];
  const selDay = params.get('giorno');
  const elev = place.elevations[band];

  let table = '<p class="loading">Scarico le previsioni…</p>';
  if (s) {
    const days = s.days;
    const header = days
      .map((d) => `<th class="${d.date === selDay ? 'sel' : ''}">${weekday(d.date)} ${dayNum(d.date)}</th>`)
      .join('');
    const rows = MODELS.map((m) => {
      const cells = days
        .map((d) => {
          const v = d.models[m.id];
          return `<td class="${d.date === selDay ? 'sel' : ''}">${v ? roundCm(v.snow) : '<span class="muted">–</span>'}</td>`;
        })
        .join('');
      return `<tr><th scope="row">${m.label}</th>${cells}</tr>`;
    }).join('');
    const fl = days
      .map((d) => `<td class="${d.date === selDay ? 'sel' : ''}">${d.freezingMax != null ? Math.round(d.freezingMax / 100) * 100 : 'n.d.'}</td>`)
      .join('');
    const temps = days
      .map(
        (d) =>
          `<td class="${d.date === selDay ? 'sel' : ''}">${d.tMin != null ? `${Math.round(d.tMin)}/${Math.round(d.tMax)}` : 'n.d.'}</td>`,
      )
      .join('');
    table = `<div class="table-wrap"><table class="models">
      <caption>Neve stimata a ${elev} m per modello (cm)</caption>
      <thead><tr><th></th>${header}</tr></thead>
      <tbody>${rows}
        <tr class="sep"><th scope="row">Zero termico max (m)</th>${fl}</tr>
        <tr><th scope="row">Temp. min/max (°C)</th>${temps}</tr>
      </tbody></table></div>`;
  }

  app.innerHTML = `
    <p class="back"><a href="#/">← Panoramica</a></p>
    <h1 class="page-title">${esc(place.name)}</h1>
    <p class="place-sub">Valle ${place.elevations.valle} m · Metà ${place.elevations.meta} m · Cima ${place.elevations.cima} m${
      place.cimaLabel ? ` (${esc(place.cimaLabel)})` : ''
    }</p>
    <div class="toolbar">${bandSwitch()}</div>
    ${table}
    <div class="notice placeholder">
      <p><b>In arrivo</b>: grafico orario per modello con zero termico, vento e raffiche, nuvolosità; le tre quote affiancate; neve misurata e al suolo; grado valanghe della micro-zona sopra e sotto la quota limite.</p>
    </div>
    <p class="links-row">${externalLinks(place)
      .map((l) => `<a class="btn ghost" href="${l.url}" target="_blank" rel="noopener">${l.label} ↗</a>`)
      .join('')}</p>`;
}

function renderPlaceholder(title, text, links = []) {
  app.innerHTML = `
    <h1 class="page-title">${title}</h1>
    <div class="notice placeholder"><p>${text}</p></div>
    <p class="links-row">${links
      .map((l) => `<a class="btn ghost" href="${l.url}" target="_blank" rel="noopener">${l.label} ↗</a>`)
      .join('')}</p>`;
}

function renderNotFound() {
  app.innerHTML = `<h1 class="page-title">Pagina non trovata</h1><p><a href="#/">Torna alla panoramica</a></p>`;
}

// ---------- router ----------

function route() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = hash.split('?');
  const params = new URLSearchParams(query);
  const parts = path.split('/').filter(Boolean);
  return { tab: parts[0] || 'panoramica', id: parts[1], params };
}

function render() {
  const r = route();
  document.querySelectorAll('.tabbar a').forEach((a) => {
    const active = a.dataset.tab === (r.tab === 'posto' ? 'panoramica' : r.tab);
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  switch (r.tab) {
    case 'panoramica':
      return renderOverview();
    case 'posto':
      return renderDetail(r.id, r.params);
    case 'radar':
      return renderPlaceholder('Radar', 'In arrivo: radar animato RainViewer con i posti preferiti sulla mappa e barra del tempo.', [
        { label: 'Radar MeteoSwiss', url: 'https://www.meteosvizzera.admin.ch/' },
        { label: 'RainViewer', url: 'https://www.rainviewer.com/map.html' },
      ]);
    case 'valanghe':
      return renderPlaceholder(
        'Valanghe',
        'In arrivo: grado di pericolo ufficiale per micro-zona (sopra e sotto la quota limite) da EAWS per Valle d’Aosta, Piemonte, Lombardia e Svizzera, con link al bollettino. Nessuna interpretazione.',
        [
          { label: 'AINEVA', url: 'https://bollettini.aineva.it/' },
          { label: 'SLF', url: 'https://www.slf.ch/it/bollettino-valanghe-e-situazione-nivologica/' },
        ],
      );
    case 'stagione':
      return renderPlaceholder(
        'Stagione',
        'In arrivo: storico della stagione per posto, da novembre a oggi: neve fresca e al suolo, zero termico, periodi caldi o secchi, problemi valanghivi ufficiali giorno per giorno. Solo fatti.',
      );
    default:
      return renderNotFound();
  }
}

// Eventi delegati (i contenuti vengono ridisegnati a ogni cambio).
app.addEventListener('click', (e) => {
  const bandBtn = e.target.closest('[data-band]');
  if (bandBtn) return setPrefs({ band: bandBtn.dataset.band });
  const fav = e.target.closest('[data-fav]');
  if (fav) return toggleFav(fav.dataset.fav);
  if (e.target.closest('[data-retry]')) return refresh(true);
});
app.addEventListener('change', (e) => {
  if (e.target.matches('[data-showall]')) setPrefs({ showAll: e.target.checked });
});

window.addEventListener('hashchange', () => {
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
