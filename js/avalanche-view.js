// Pezzi di pagina per il pericolo valanghe (badge nella Panoramica, blocco nel dettaglio,
// schermata Valanghe). Mostrano solo i valori ufficiali del bollettino.
import { DANGER, romeDate, isAineva, ainevaMapUrl, ainevaBulletinMapUrl } from './avalanche.js';
import { REGIONS } from './places.js';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const EAWS_MAP = 'https://avalanches.org/';

const longDay = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
const when = (ts) =>
  ts
    ? new Date(ts).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'n.d.';

function regionInfo(place) {
  return (
    REGIONS[place.region] || { name: place.region || 'n.d.', avalancheUrl: EAWS_MAP, avalancheSource: 'EAWS' }
  );
}

// Quadratino colorato con il numero del grado (colori ufficiali della scala europea).
export function chip(row, size = '') {
  const lvl = row.level;
  const cls = lvl == null ? 'dl-na' : `dl-${lvl}`;
  const txt = lvl == null ? '–' : lvl === 0 ? '0' : `${lvl}${row.sub || ''}`;
  return `<span class="dl ${cls} ${size}" aria-hidden="true">${esc(txt)}</span>`;
}

function rowsText(s) {
  return s.periods
    .map((p) => `${s.periods.length > 1 ? `${p.label}: ` : ''}${p.rows.map((r) => `${r.level ?? ''}${r.sub} ${r.label} ${r.where}`).join(', ')}`)
    .join('; ');
}

function compactRows(s) {
  return s.periods
    .map(
      (p) =>
        `${s.periods.length > 1 ? `<small>${p.id === 'earlier' ? 'mat.' : 'pom.'}</small>` : ''}${p.rows
          .map((r) => `${chip(r)}${s.periods.length === 1 && p.rows.length > 1 ? `<small>${esc(r.where)}</small>` : ''}`)
          .join('')}`,
    )
    .join('');
}

// Badge nel piede della scheda posto in Panoramica.
export function avalBadge(place, aval) {
  const entry = aval?.byPlace?.[place.id];
  const href = `#/valanghe?posto=${encodeURIComponent(place.id)}`;
  if (!aval) return `<a class="badge-aval" href="${href}"><span class="aval-k">Valanghe</span><span class="muted">…</span></a>`;
  if (!entry || entry.error || !entry.zone) {
    const msg = entry?.error ? 'bollettino non disponibile' : 'micro-zona non trovata';
    return `<a class="badge-aval" href="${href}"><span class="aval-k">Valanghe</span><span class="muted">${msg}</span></a>`;
  }
  const t = entry.today;
  const d = entry.tomorrow;
  const isToday = aval.today === romeDate();
  const label = [
    t ? `Pericolo valanghe ${isToday ? 'oggi' : shortDay(aval.today)}: ${rowsText(t)}` : 'Nessun bollettino valanghe per oggi',
    d ? `domani: ${rowsText(d)}` : '',
  ]
    .filter(Boolean)
    .join('. ');
  return `<a class="badge-aval" href="${href}" aria-label="${esc(label)}" title="${esc(label)}">
    <span class="aval-k">Valanghe ${isToday ? 'oggi' : esc(shortDay(aval.today))}</span>${t ? compactRows(t) : '<span class="muted">nessun bollettino</span>'}${
      d ? `<span class="aval-k aval-sep">domani</span>${compactRows(d)}` : ''
    }
  </a>`;
}

const metaLine = (s) =>
  `<p class="aval-meta">Pubblicato ${esc(when(s.publicationTime))}${s.provider ? ` da ${esc(s.provider)}` : ''}${
    s.unscheduled ? ' (aggiornamento straordinario)' : ''
  } · valido fino a ${esc(when(s.validTo))}</p>`;
const sameMeta = (a, b) =>
  a.publicationTime === b.publicationTime && a.validTo === b.validTo && a.provider === b.provider && !!a.unscheduled === !!b.unscheduled;

function dayBlock(title, s, place, day, { meta = true } = {}) {
  const periods = s.periods
    .map(
      (p) => `${s.periods.length > 1 ? `<p class="aval-period">${esc(p.label)}</p>` : ''}
      <ul class="aval-rows">${p.rows
        .map((r) => `<li>${chip(r, 'big')}<span><b>${r.level ?? ''}${esc(r.sub)} ${esc(r.label)}</b><br><span class="muted">${esc(r.where)}</span></span></li>`)
        .join('')}</ul>`,
    )
    .join('');
  const problems = s.problems.length
    ? `<p class="aval-sub">Problemi valanghivi</p><ul class="aval-problems">${s.problems
        .map(
          (p) =>
            `<li><b>${esc(p.label)}</b> <span class="muted">· ${esc(p.where)}${p.aspects ? ` · ${esc(p.aspects)}` : ''}${p.period ? ` · ${esc(p.period)}` : ''}</span></li>`,
        )
        .join('')}</ul>`
    : '';
  // Cartina AINEVA dell'area di questo bollettino; se non c'è (es. SLF) si nasconde.
  const img =
    isAineva(place.region) && s.bulletinId && day
      ? `<figure class="aval-bmap"><a href="${esc(ainevaBulletinMapUrl(day, place.region, s.bulletinId, 'jpg'))}" target="_blank" rel="noopener">
          <img src="${esc(ainevaBulletinMapUrl(day, place.region, s.bulletinId))}" alt="Cartina AINEVA: area del bollettino che comprende ${esc(place.name)}" loading="lazy" onerror="this.closest('figure').remove()"></a>
          <figcaption>Area del bollettino · AINEVA</figcaption></figure>`
      : '';
  return `<div class="aval-day">
    <p class="aval-title">${title}</p>
    <div class="aval-day-body"><div>
    ${periods}
    ${problems}
    </div>${img}</div>
    ${meta ? metaLine(s) : ''}
  </div>`;
}

// Blocco completo per un posto (schermata Valanghe e dettaglio posto).
export function avalPlaceBlock(place, aval, { archive = false, heading = null } = {}) {
  const entry = aval?.byPlace?.[place.id];
  const region = regionInfo(place);
  const official = entry?.today?.providerUrl || entry?.tomorrow?.providerUrl || region.avalancheUrl;
  const source = entry?.today?.provider || entry?.tomorrow?.provider || region.avalancheSource;
  let body;
  if (!aval) body = '<p class="loading">Scarico il bollettino…</p>';
  else if (entry?.error) body = `<p class="muted">${esc(entry.error)}</p>`;
  else if (!entry?.zone) body = '<p class="muted">Non trovo la micro-zona EAWS di questo posto.</p>';
  else {
    const prefix = !archive && aval.today === romeDate() ? 'Oggi, ' : '';
    // Oggi e domani vengono quasi sempre dallo stesso bollettino: pubblicazione e validità una volta sola.
    const once = entry.today && entry.tomorrow && sameMeta(entry.today, entry.tomorrow);
    const today = entry.today
      ? dayBlock(`${prefix}${esc(longDay(aval.today))}`, entry.today, place, aval.today, { meta: !once })
      : `<div class="aval-day"><p class="aval-title">${prefix}${esc(longDay(aval.today))}</p>
         <p class="muted">Nessun bollettino pubblicato per questa zona${archive ? ' in quel giorno' : ' oggi (fuori stagione o non ancora uscito)'}.</p></div>`;
    const tomorrow = entry.tomorrow
      ? dayBlock(`Domani, ${esc(longDay(aval.tomorrow))}`, entry.tomorrow, place, aval.tomorrow, { meta: !once })
      : '';
    body = today + tomorrow + (once ? metaLine(entry.today) : '');
  }
  const zone = entry?.zone;
  return `<section class="aval-place" id="valanghe-${esc(place.id)}">
    <header class="aval-head">
      <h2>${esc(heading || place.name)}</h2>
      ${heading ? '' : `<p class="place-sub">${zone ? `Micro-zona ${esc(zone.name || zone.id)}${zone.name ? ` (${esc(zone.id)})` : ''} · ` : ''}${esc(region.name)}</p>`}
    </header>
    ${body}
    <p class="links-row"><a class="btn ghost" href="${esc(official)}" target="_blank" rel="noopener">Bollettino ${esc(source)} ↗</a></p>
  </section>`;
}

function legend() {
  return `<ul class="aval-legend" aria-label="Scala europea del pericolo valanghe">${[1, 2, 3, 4, 5]
    .map((l) => {
      const d = Object.values(DANGER).find((x) => x.level === l);
      return `<li>${chip({ level: l, sub: '' })} ${d.label}</li>`;
    })
    .join('')}</ul>`;
}

// Cartine AINEVA delle regioni dei posti mostrati, per un giorno (oggi, domani o archivio).
function regionMaps(places, aval, which) {
  const day = aval?.[which];
  if (!day) return '';
  const regions = [...new Set(places.map((p) => p.region).filter(isAineva))];
  if (!regions.length) return '';
  const figs = regions
    .map((region) => {
      const inRegion = places.filter((p) => p.region === region);
      const entries = inRegion.map((p) => aval.byPlace?.[p.id]?.[which]).filter(Boolean);
      if (!entries.length) return ''; // nessun bollettino per i posti di questa regione
      const split = entries.some((e) => e.periods.length > 1);
      const name = REGIONS[region]?.name || region;
      return (split ? [['am', 'mattino'], ['pm', 'pomeriggio']] : [['fd', '']])
        .map(
          ([period, label]) => `<figure class="aval-map">
          <a href="${esc(ainevaMapUrl(day, region, period, 'jpg'))}" target="_blank" rel="noopener">
            <img src="${esc(ainevaMapUrl(day, region, period))}" alt="Cartina AINEVA del pericolo valanghe, ${esc(name)}${label ? `, ${label}` : ''}, ${esc(longDay(day))}" loading="lazy"
              onerror="this.closest('figure').classList.add('missing')">
          </a>
          <p class="muted aval-nomap">Cartina non disponibile.</p>
          <figcaption>${esc(name)}${label ? ` · ${label}` : ''}</figcaption>
        </figure>`,
        )
        .join('');
    })
    .join('');
  return figs;
}

function mapsSection(places, aval, archive) {
  if (!aval) return '';
  const today = regionMaps(places, aval, 'today');
  if (!today) return '';
  const tomorrow = archive ? '' : regionMaps(places, aval, 'tomorrow');
  const prefix = !archive && aval.today === romeDate() ? 'Oggi, ' : '';
  return `<section class="aval-maps">
    <h2>Cartina AINEVA</h2>
    <p class="aval-title">${prefix}${esc(longDay(aval.today))}</p>
    <div class="aval-map-grid">${today}</div>
    ${tomorrow ? `<details class="aval-tomorrow"><summary>Cartina di domani, ${esc(longDay(aval.tomorrow))}</summary><div class="aval-map-grid">${tomorrow}</div></details>` : ''}
    <p class="aval-meta">Tocca la cartina per ingrandirla. Immagini ufficiali di <a href="https://bollettini.aineva.it/bulletin/latest" target="_blank" rel="noopener">AINEVA</a>, le stesse del sito dei bollettini.</p>
  </section>`;
}

// Schermata Valanghe.
export function avalPage({ places, aval, archiveDay, today }) {
  const archive = !!archiveDay;
  const status = aval
    ? `<p class="status ${aval.stale ? 'stale' : ''}">${
        archive ? `Archivio: ${esc(shortDay(archiveDay))}` : `${aval.stale ? 'Senza rete: dati di ' : 'Aggiornato '}${esc(when(aval.fetchedAt))}`
      } · EAWS</p>`
    : '';
  return `
    <h1 class="page-title">Valanghe</h1>
    <p class="place-sub">Grado di pericolo ufficiale per la micro-zona di ogni posto, sopra e sotto la quota limite indicata dal bollettino.</p>
    ${status}
    <form class="aval-archive" data-aval-archive>
      <label>Un altro giorno <input type="date" name="giorno" value="${esc(archiveDay || today)}" max="${esc(today)}" min="2018-11-01"></label>
      <button class="btn ghost" type="submit">Vedi</button>
      ${archive ? '<a class="btn ghost" href="#/valanghe">Torna a oggi</a>' : ''}
    </form>
    ${mapsSection(places, aval, archive)}
    ${places.map((p) => avalPlaceBlock(p, aval, { archive })).join('')}
    ${places.length ? '' : '<div class="empty"><p class="empty-title">Nessun posto, per ora</p><p>I posti che cerchi compaiono anche qui, con il loro bollettino.</p><a class="btn" href="#/aggiungi">Cerca un posto</a></div>'}
    <section class="explain">
      <h3>Come leggere</h3>
      ${legend()}
      <p>Il numero è il grado della scala europea a 5 livelli scritto nel bollettino ufficiale. Quando il bollettino indica una quota limite,
      ci sono due gradi: uno sopra e uno sotto quella quota. I simboli +, = o − accanto al numero sono il sottolivello pubblicato dall'SLF.</p>
      <p>La micro-zona è quella che contiene il paese del posto, secondo i confini ufficiali EAWS. Per la zona esatta della gita, e per tutto il testo dei previsori, apri il bollettino.</p>
      <p>Dati: <a href="https://www.avalanches.org/" target="_blank" rel="noopener">EAWS</a> con AINEVA e
      <a href="https://www.slf.ch/it/bollettino-valanghe-e-situazione-nivologica/" target="_blank" rel="noopener">SLF</a>, licenza CC BY 4.0.</p>
    </section>`;
}
