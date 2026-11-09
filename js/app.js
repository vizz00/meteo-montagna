import { PLACES, BANDS, REGIONS, externalLinks } from './places.js';
import { MODELS, rangeText, roundCm, compass, nextSnowfall } from './snow.js';
import { loadForecast } from './forecast.js';
import { loadPrefs, savePrefs } from './storage.js';
import { renderAddPage } from './addplace.js';
import { keepPlace } from './myplaces.js';
import { loadAvalanche, romeDate } from './avalanche.js';
import { avalBadge, avalPlaceBlock, avalPage } from './avalanche-view.js';
import { evaluateWindows, STATUS_LABEL, SECTORS, RULES } from './window.js';
import { renderSeason } from './season-view.js';

const app = document.getElementById('app');
const refreshBtn = document.getElementById('refresh');

const state = {
  prefs: loadPrefs(),
  forecast: null,
  error: null,
  loading: false,
  aval: null, // bollettini valanghe di oggi/domani
  avalArchive: null, // { day, data } quando si guarda un giorno passato
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

function windowSection(place, band) {
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
      return `<li class="win-day">
        <div class="win-head"><span class="cap">${longDay(d.date)}</span><span class="win-pill win-${w.status}">${STATUS_LABEL[w.status]}</span></div>
        <div class="win-body"><div><ul class="win-conds">${conds}</ul>${sigs ? `<ul class="win-sigs">${sigs}</ul>` : ''}</div>${rose}</div>
      </li>`;
    })
    .join('');
  const picker = SECTORS.map(
    (a) => `<button type="button" class="aspect" data-aspect="${a}" data-place-aspect="${place.id}" aria-pressed="${mine.includes(a)}">${a}</button>`,
  ).join('');
  return `<section class="windows">
    <h2>Finestra buona a ${place.elevations[band]} m</h2>
    <p class="muted small">Regole SLF ed EAWS. Il bollettino ha l'ultima parola.</p>
    <div class="aspect-pick"><span>I tuoi versanti</span><div class="aspects">${picker}</div></div>
    <ol class="win-list">${items}</ol>
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

function dayCell(place, day, win) {
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
    ${windowMark(win)}
  </a>`;
}

function placeCard(place) {
  const band = state.prefs.band;
  const s = state.forecast?.byPlace[place.id]?.[band];
  const region = REGIONS[place.region];
  const elev = place.elevations[band];
  const fav = isFav(place.id);
  const total = s?.total;
  const wins = windowsFor(place, band);
  return `<article class="place" data-place="${place.id}">
    <header class="place-head">
      <button type="button" class="star" data-fav="${place.id}" aria-pressed="${fav}" aria-label="${fav ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'}">${fav ? '★' : '☆'}</button>
      <div class="place-title">
        <h2><a href="#/posto/${place.id}">${esc(place.name)}</a></h2>
        <p class="place-sub">${place.single ? 'Quota' : BANDS.find((b) => b.id === band).label} ${elev} m · ${esc(region.name)}</p>
      </div>
      <div class="place-total" title="Totale 7 giorni: intervallo tra i modelli che coprono tutta la settimana">
        <span class="total-num">${total ? rangeText(total) : 'n.d.'}</span><span class="total-unit">cm</span>
        <span class="total-label">7 giorni</span>
      </div>
    </header>
    <div class="days" role="list">
      <div class="row-labels" aria-hidden="true">
        <span class="day-name">&nbsp;</span><span class="sky-sp"></span><span class="bar-sp"></span>
        <span class="snow">${icon('snow', 'Neve (cm)')}</span><span class="fl">${icon('freezing', 'Zero termico (m)')}</span><span class="wind">${icon('wind', 'Vento in quota (km/h)')}</span><span class="win-l">${icon('window', 'Finestra buona')}</span>
      </div>
      ${s ? s.days.map((d, i) => dayCell(place, d, wins?.[i])).join('') : '<p class="muted">Dati non disponibili</p>'}
    </div>
    <footer class="place-foot">
      ${avalBadge(place, state.aval)}
      <span class="links">${externalLinks(place)
        .map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`)
        .join('')}</span>
    </footer>
  </article>`;
}

function renderOverview() {
  const favs = PLACES.filter((p) => isFav(p.id));
  // I posti solo "visti" (provvisori) non entrano nella panoramica finché non sono preferiti.
  const others = PLACES.filter((p) => !isFav(p.id) && !p.temp);
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
      <a class="btn ghost add-place" href="#/aggiungi">+ Aggiungi posto</a>
      <label class="toggle"><input type="checkbox" data-showall ${showAll ? 'checked' : ''} ${favs.length ? '' : 'disabled'}> Mostra anche i non preferiti</label>
    </div>
    ${status}
    ${state.error && state.forecast ? `<div class="notice">${esc(state.error)}</div>` : ''}
    ${body}
    <details class="explain">
      <summary>Come leggere</summary>
      <p>${icon('snow', 'Neve')} neve stimata in cm, intervallo tra i modelli (${MODELS.map((m) => m.label).join(', ')}). Barra piena = mediana, chiara = modello più nevoso.</p>
      <p>${icon('freezing', 'Zero termico')} zero termico massimo in metri. ${icon('wind', 'Vento')} vento massimo in quota (circa 3000 m), km/h e provenienza.</p>
      <p>${icon('window', 'Finestra buona')} finestra buona: <span class="win win-aperta legend"></span> sì · <span class="win win-avvisi legend"></span> con avvisi · <span class="win win-chiusa legend"></span> chiusa · <span class="win win-meteo legend"></span> meteo non buono. Tocca un giorno per il perché.</p>
    </details>`;
}

function favButton(place) {
  const fav = isFav(place.id);
  return `<button type="button" class="btn ${fav ? 'ghost' : ''} fav-btn" data-fav="${place.id}" aria-pressed="${fav}">${
    fav ? '★ Nei preferiti' : '☆ Aggiungi ai preferiti'
  }</button>`;
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
    <div class="detail-head">
      <h1 class="page-title">${esc(place.name)}</h1>
      ${favButton(place)}
    </div>
    <p class="place-sub">${
      place.single
        ? `Quota ${place.elevations.valle} m`
        : `Valle ${place.elevations.valle} m · Metà ${place.elevations.meta} m · Cima ${place.elevations.cima} m${
            place.cimaLabel ? ` (${esc(place.cimaLabel)})` : ''
          }`
    }${place.custom ? ` · <a href="#/aggiungi?modifica=${place.id}">Modifica</a>` : ''}</p>
    ${place.single ? '' : `<div class="toolbar">${bandSwitch()}</div>`}
    ${table}
    ${windowSection(place, band)}
    <div class="notice placeholder">
      <p><b>In arrivo</b>: grafico orario per modello con zero termico, vento e raffiche, nuvolosità; le tre quote affiancate; neve misurata e al suolo.</p>
    </div>
    ${avalPlaceBlock(place, state.aval)}
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
    const active = a.dataset.tab === (r.tab === 'posto' || r.tab === 'aggiungi' ? 'panoramica' : r.tab);
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  switch (r.tab) {
    case 'panoramica':
      return renderOverview();
    case 'posto':
      return renderDetail(r.id, r.params);
    case 'aggiungi':
      return renderAddPage(app, r.params, { onSaved: placeSaved, onDeleted: placeDeleted });
    case 'radar':
      return renderPlaceholder('Radar', 'In arrivo: radar animato RainViewer con i posti preferiti sulla mappa e barra del tempo.', [
        { label: 'Radar MeteoSwiss', url: 'https://www.meteosvizzera.admin.ch/' },
        { label: 'RainViewer', url: 'https://www.rainviewer.com/map.html' },
      ]);
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
