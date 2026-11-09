// Pezzi di pagina per il pericolo valanghe (badge nella Panoramica, blocco nel dettaglio,
// schermata Valanghe). Mostrano solo i valori ufficiali del bollettino.
import { DANGER, romeDate } from './avalanche.js';
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

function dayBlock(title, s) {
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
  return `<div class="aval-day">
    <p class="aval-title">${title}</p>
    ${periods}
    ${problems}
    <p class="aval-meta">Pubblicato ${esc(when(s.publicationTime))}${s.provider ? ` da ${esc(s.provider)}` : ''}${
      s.unscheduled ? ' (aggiornamento straordinario)' : ''
    } · valido fino a ${esc(when(s.validTo))}</p>
  </div>`;
}

// Blocco completo per un posto (schermata Valanghe e dettaglio posto).
export function avalPlaceBlock(place, aval, { archive = false } = {}) {
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
    const today = entry.today
      ? dayBlock(`${prefix}${esc(longDay(aval.today))}`, entry.today)
      : `<div class="aval-day"><p class="aval-title">${prefix}${esc(longDay(aval.today))}</p>
         <p class="muted">Nessun bollettino pubblicato per questa zona${archive ? ' in quel giorno' : ' oggi (fuori stagione o non ancora uscito)'}.</p></div>`;
    const tomorrow = entry.tomorrow ? dayBlock(`Domani, ${esc(longDay(aval.tomorrow))}`, entry.tomorrow) : '';
    body = today + tomorrow;
  }
  const zone = entry?.zone;
  return `<section class="aval-place" id="valanghe-${esc(place.id)}">
    <header class="aval-head">
      <h2>${esc(place.name)}</h2>
      <p class="place-sub">${zone ? `Micro-zona ${esc(zone.name || zone.id)}${zone.name ? ` (${esc(zone.id)})` : ''} · ` : ''}${esc(region.name)}</p>
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
    ${places.map((p) => avalPlaceBlock(p, aval, { archive })).join('')}
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
