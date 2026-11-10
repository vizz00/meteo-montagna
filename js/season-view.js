// Schermata Stagione: linea del tempo per posto, da novembre a oggi. Solo fatti, nessun giudizio.
import { BANDS, REGIONS } from './places.js';
import { DANGER, PROBLEMS, romeDate } from './avalanche.js';
import {
  RULES, PROBLEM_ROWS, currentSeasonYear, seasonRange, loadSeasonWeather, loadSeasonAvalanche,
  weatherFacts, avalancheFacts,
} from './season.js';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const dt = (iso) => new Date(`${iso}T12:00:00`);
const short = (iso) => dt(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
const long = (iso) => dt(iso).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const span = (r) => (r.from === r.to ? short(r.from) : `${short(r.from)} – ${short(r.to)}`);
const days = (n) => `${n} ${n === 1 ? 'giorno' : 'giorni'}`;
// Al massimo `n` periodi, i più lunghi, in ordine di data; gli altri si contano.
const listRuns = (list, n = 4) => {
  const keep = [...list].sort((a, b) => b.length - a.length).slice(0, n).sort((a, b) => a.start - b.start);
  const rest = list.length - keep.length;
  return keep.map((r) => `${span(r)} (${days(r.length)})`).join(' · ') + (rest ? ` e altri ${rest} più brevi` : '');
};
const round100 = (m) => Math.round(m / 100) * 100;
const levelLabel = (l) => Object.values(DANGER).find((d) => d.level === l)?.label || 'n.d.';
const DL_COLORS = { 0: '#e8eefc', 1: '#ccff66', 2: '#ffff00', 3: '#ff9900', 4: '#ff0000', 5: '#b30000' };

// Dati caricati: chiave posto|quota|stagione. Restano in memoria mentre l'app è aperta.
const loads = new Map();
const ui = { sel: null }; // giorno selezionato (chiave → giorno)

function ensureLoaded(place, elev, season, rerender) {
  const key = `${place.id}|${elev}|${season.year}`;
  if (loads.has(key)) return loads.get(key);
  const entry = { wx: null, wxError: null, av: null, avError: null, progress: [0, 0] };
  loads.set(key, entry);
  loadSeasonWeather(place, elev, season)
    .then((wx) => (entry.wx = wx))
    .catch((err) => {
      console.error(err);
      entry.wxError = "Non riesco a scaricare l'archivio meteo.";
    })
    .finally(rerender);
  // Le valanghe non dipendono dalla quota: si riusa il caricamento di un'altra quota se c'è.
  const shared = [...loads.entries()].find(([k, v]) => k !== key && k.startsWith(`${place.id}|`) && k.endsWith(`|${season.year}`) && v.avPromise);
  entry.avPromise = shared
    ? shared[1].avPromise
    : loadSeasonAvalanche(place, season, {
        onProgress: (a, b) => {
          entry.progress = [a, b];
          if (b > 20 && a % 15 === 0) rerender();
        },
      });
  entry.avPromise
    .then((av) => (entry.av = av))
    .catch((err) => {
      console.error(err);
      entry.avError = 'Non riesco a scaricare i bollettini.';
    })
    .finally(rerender);
  return entry;
}

// ---------- grafici (SVG che si allarga alla pagina; le scritte stanno fuori, in HTML) ----------

function monthTicks(list) {
  return list
    .map((d, i) => (d.date.endsWith('-01') ? { i, label: dt(d.date).toLocaleDateString('it-IT', { month: 'short' }) } : null))
    .filter(Boolean);
}

function chartFrame({ title, unit, max, n, body, ticks, height = 70, sel }) {
  const grid = ticks.map((t) => `<line x1="${t.i}" x2="${t.i}" y1="0" y2="100" class="sg-grid" vector-effect="non-scaling-stroke"/>`).join('');
  const selLine = sel != null ? `<rect x="${sel}" width="1" y="0" height="100" class="sg-sel"/>` : '';
  return `<figure class="sg">
    <figcaption><span>${title}</span>${max != null ? `<span class="muted">max scala ${max}${unit ? ` ${unit}` : ''}</span>` : ''}</figcaption>
    <div class="sg-plot" data-sg-plot data-n="${n}" style="height:${height}px">
      <svg viewBox="0 0 ${n} 100" preserveAspectRatio="none" aria-hidden="true">${grid}${body}${selLine}</svg>
    </div>
  </figure>`;
}

function axis(ticks, n) {
  return `<div class="sg-axis" aria-hidden="true">${ticks
    .map((t) => `<span style="left:${(t.i / n) * 100}%">${esc(t.label)}</span>`)
    .join('')}</div>`;
}

function charts(list, elev, avByDay, selIndex, facts) {
  const n = list.length;
  const ticks = monthTicks(list);
  const y = (v, max) => 100 - Math.min(100, (v / max) * 100);

  // Neve fresca: barre; in grigio i periodi secchi.
  const maxNew = Math.max(30, ...list.map((d) => d.newSnow || 0));
  const scaleNew = Math.ceil(maxNew / 10) * 10;
  const dry = facts.dry.map((r) => `<rect x="${r.start}" width="${r.length}" y="0" height="100" class="sg-dry"/>`).join('');
  const newBars = list
    .map((d, i) => (d.newSnow >= 0.5 ? `<rect x="${i + 0.1}" width="0.8" y="${y(d.newSnow, scaleNew)}" height="${100 - y(d.newSnow, scaleNew)}" class="sg-snow"/>` : ''))
    .join('');

  // Neve al suolo (modello): area.
  const depthDays = list.map((d, i) => [i, d.depth]).filter(([, v]) => v != null);
  const maxDepth = Math.max(50, ...depthDays.map(([, v]) => v));
  const scaleDepth = Math.ceil(maxDepth / 50) * 50;
  const area = depthDays.length
    ? `<path class="sg-depth" d="M${depthDays[0][0]},100 ${depthDays.map(([i, v]) => `L${i + 0.5},${y(v, scaleDepth).toFixed(1)}`).join(' ')} L${depthDays.at(-1)[0] + 1},100 Z"/>`
    : '';

  // Zero termico massimo, con la quota del posto.
  const flMax = 5000;
  const warm = facts.warm.map((r) => `<rect x="${r.start}" width="${r.length}" y="0" height="100" class="sg-warm"/>`).join('');
  const flPts = list.map((d, i) => (d.freezingMax != null ? `${i + 0.5},${y(d.freezingMax, flMax).toFixed(1)}` : null));
  const flPath = flPts.reduce((s, p, i) => (p ? `${s}${s && flPts[i - 1] ? ' L' : ' M'}${p}` : s), '');
  const quota = `<line x1="0" x2="${n}" y1="${y(elev, flMax)}" y2="${y(elev, flMax)}" class="sg-quota" vector-effect="non-scaling-stroke"/>`;
  const rain = list
    .map((d, i) => (d.rain >= RULES.rainMm ? `<rect x="${i + 0.15}" width="0.7" y="92" height="8" class="sg-rain"/>` : ''))
    .join('');

  // Pericolo valanghe: grado massimo del giorno con i colori ufficiali.
  const dangerStrip = list
    .map((d, i) => {
      const a = avByDay?.[d.date];
      return a ? `<rect x="${i}" width="1" y="0" height="100" fill="${DL_COLORS[a.max] || '#24314f'}"/>` : '';
    })
    .join('');

  const problemRows = PROBLEM_ROWS.map((p) => {
    const cells = list
      .map((d, i) => {
        const a = avByDay?.[d.date];
        if (!a?.problems.includes(p)) return '';
        const cls = p === 'persistent_weak_layers' ? 'sg-pwl' : 'sg-prob';
        return `<rect x="${i}" width="1" y="15" height="70" class="${cls}"/>`;
      })
      .join('');
    return { p, cells, used: !!cells };
  }).filter((r) => r.used || r.p === 'persistent_weak_layers');

  const sel = selIndex;
  return `
    ${chartFrame({ title: `Neve fresca a ${elev} m <small class="muted">(cm al giorno, stimata)</small>`, unit: 'cm', max: scaleNew, n, ticks, body: dry + newBars, sel })}
    ${chartFrame({ title: 'Neve al suolo <small class="muted">(cm, modello)</small>', unit: 'cm', max: scaleDepth, n, ticks, body: area, sel })}
    ${chartFrame({ title: `Zero termico massimo <small class="muted">(linea tratteggiata: ${elev} m)</small>`, unit: 'm', max: flMax, n, ticks, body: warm + quota + `<path class="sg-fl" d="${flPath}" vector-effect="non-scaling-stroke"/>` + rain, sel })}
    ${avByDay ? chartFrame({ title: 'Pericolo valanghe <small class="muted">(grado massimo del bollettino)</small>', max: null, n, ticks, body: dangerStrip, height: 22, sel }) : ''}
    ${
      avByDay
        ? problemRows
            .map((r) => chartFrame({ title: esc(PROBLEMS[r.p]), max: null, n, ticks, body: r.cells, height: 16, sel }))
            .join('')
        : ''
    }
    ${axis(ticks, n)}`;
}

// ---------- testo ----------

function factsList(wf, af, elev, season, avState) {
  const li = [];
  li.push(`<li><b>${wf.total} cm</b> di neve fresca dal ${short(season.from)} a ${elev} m, in ${days(wf.snowDays)} con almeno ${RULES.snowDay} cm.</li>`);
  if (wf.last) {
    li.push(
      `<li>Neve al suolo ${wf.last.date === romeDate() ? 'oggi' : `il ${short(wf.last.date)}`}: <b>${wf.last.depth} cm</b>${
        wf.maxDepth && wf.maxDepth.depth > 0 ? ` (massimo ${wf.maxDepth.depth} cm il ${short(wf.maxDepth.date)})` : ''
      }.</li>`,
    );
  }
  if (wf.biggest.length) {
    li.push(`<li>Nevicate più abbondanti: ${wf.biggest.map((e) => `${span(e)} <b>${e.cm} cm</b>`).join(' · ')}.</li>`);
  }
  li.push(
    wf.dry.length
      ? `<li>Periodi secchi (${RULES.dryMinDays} giorni o più senza neve fresca): ${listRuns(wf.dry)}.</li>`
      : `<li>Nessun periodo di ${RULES.dryMinDays} giorni o più senza neve fresca.</li>`,
  );
  li.push(
    wf.warm.length
      ? `<li>Periodi caldi (${RULES.warmMinDays} giorni o più con zero termico sopra ${elev} m): ${listRuns(wf.warm)}.</li>`
      : `<li>Nessun periodo di ${RULES.warmMinDays} giorni o più con zero termico sopra ${elev} m.</li>`,
  );
  if (wf.maxFl) li.push(`<li>Zero termico più alto: ${round100(wf.maxFl.freezingMax)} m il ${short(wf.maxFl.date)}.</li>`);
  li.push(
    wf.rainDays.length
      ? `<li>Pioggia a ${elev} m (almeno ${RULES.rainMm} mm): ${days(wf.rainDays.length)}${
          wf.rainDays.length <= 6 ? `, ${wf.rainDays.map((d) => short(d.date)).join(', ')}` : ''
        }.</li>`
      : `<li>Nessun giorno di pioggia a ${elev} m.</li>`,
  );

  if (avState === 'loading') li.push('<li class="muted">Bollettini valanghe: sto scaricando l’archivio…</li>');
  else if (avState === 'nozone') li.push('<li class="muted">Bollettini valanghe: non trovo la micro-zona EAWS di questo posto.</li>');
  else if (avState === 'error')
    li.push('<li class="muted">Bollettini valanghe: archivio non raggiungibile. <button type="button" class="btn small" data-season-retry>Riprova</button></li>');
  else if (af) {
    if (!af.nBulletins) {
      li.push('<li>Bollettini valanghe: nessuno pubblicato finora per questa micro-zona in questa stagione.</li>');
    } else {
      li.push(`<li>Bollettini valanghe: ${days(af.nBulletins)} con bollettino, il primo il ${short(af.firstBulletin)}.${
        af.top ? ` Grado più alto: <b>${af.top.a.max} ${esc(levelLabel(af.top.a.max))}</b> il ${short(af.top.date)}.` : ''
      }</li>`);
      li.push(
        af.pwl.length
          ? `<li><b>Strati deboli persistenti</b> nel bollettino per ${days(af.pwlDays)}: ${af.pwl
              .map((r) => `${span(r)} (${days(r.length)}${r.onlyHigh ? ', solo sopra la quota limite' : ''})`)
              .join(' · ')}.</li>`
          : '<li><b>Strati deboli persistenti</b>: mai indicati nel bollettino finora.</li>',
      );
      const others = PROBLEM_ROWS.filter((p) => p !== 'persistent_weak_layers' && af.count[p]);
      if (others.length) li.push(`<li>Altri problemi indicati: ${others.map((p) => `${esc(PROBLEMS[p])} ${days(af.count[p])}`).join(' · ')}.</li>`);
    }
  }
  return `<ul class="season-facts">${li.join('')}</ul>`;
}

function dayPanel(d, a, elev, index, n) {
  if (!d) return '';
  const rows = [
    ['Neve fresca', `${Math.round(d.newSnow)} cm${d.rain >= 0.5 ? ` · pioggia ${d.rain} mm` : ''}`],
    ['Neve al suolo (modello)', d.depth != null ? `${d.depth} cm` : 'n.d.'],
    ['Zero termico max', d.freezingMax != null ? `${round100(d.freezingMax)} m${d.freezingMax > elev ? ` (sopra ${elev} m)` : ''}` : 'n.d.'],
    ['Temperatura a ' + elev + ' m', d.tMin != null ? `${Math.round(d.tMin)} / ${Math.round(d.tMax)} °C` : 'n.d.'],
  ];
  const aval = a
    ? `<p class="season-day-aval"><span class="dl dl-${a.high}" aria-hidden="true">${a.high}</span>${
        a.low !== a.high ? `<span class="dl dl-${a.low}" aria-hidden="true">${a.low}</span>` : ''
      } <span>${a.low !== a.high ? `${a.high} ${esc(levelLabel(a.high))} sopra, ${a.low} ${esc(levelLabel(a.low))} sotto la quota limite` : `${a.max} ${esc(levelLabel(a.max))}`}${
        a.problems.length ? ` · ${a.problems.map((p) => esc(PROBLEMS[p] || p)).join(', ')}` : ''
      }</span></p>`
    : '<p class="muted season-day-aval">Nessun bollettino valanghe per questo giorno.</p>';
  return `<section class="season-day" aria-live="polite">
    <div class="season-day-head">
      <button type="button" class="icon-btn" data-season-step="-1" ${index <= 0 ? 'disabled' : ''} aria-label="Giorno prima">‹</button>
      <h3>${esc(long(d.date))}</h3>
      <button type="button" class="icon-btn" data-season-step="1" ${index >= n - 1 ? 'disabled' : ''} aria-label="Giorno dopo">›</button>
    </div>
    <dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    ${aval}
    <p class="season-day-link"><a href="#/valanghe?giorno=${d.date}">Bollettino completo di quel giorno</a></p>
  </section>`;
}

// ---------- pagina ----------

export function renderSeason(app, params, { places, prefs, isFav, rerender }) {
  const today = romeDate();
  const thisYear = currentSeasonYear(today);
  const year = Number(params.get('stagione')) || thisYear;
  const season = seasonRange(year, today);
  const list = [...places.filter((p) => isFav(p.id)), ...places.filter((p) => !isFav(p.id) && !p.temp)];
  const place = places.find((p) => p.id === params.get('posto')) || list[0];
  if (!place) {
    app.innerHTML = '<h1 class="page-title">Stagione</h1><p class="muted">Nessun posto.</p>';
    return;
  }
  const band = place.single ? 'valle' : prefs.band;
  const elev = place.elevations[band];
  const href = (patch) => {
    const q = new URLSearchParams({ posto: place.id, stagione: String(year), ...patch });
    return `#/stagione?${q}`;
  };

  const load = ensureLoaded(place, elev, season, rerender);
  const wxDays = load.wx?.days || [];
  const avByDay = load.av?.byDay || null;
  const avState = load.avError ? 'error' : !load.av ? 'loading' : !load.av.zone ? 'nozone' : 'ok';

  const selKey = `${place.id}|${elev}|${year}`;
  let selIndex = wxDays.findIndex((d) => d.date === (ui.sel?.key === selKey ? ui.sel.date : null));
  if (selIndex < 0) selIndex = wxDays.length - 1;

  const seasons = [thisYear, thisYear - 1, thisYear - 2];
  const placeChips = list
    .map((p) => `<a class="chip" href="${href({ posto: p.id })}" ${p.id === place.id ? 'aria-current="true"' : ''}>${esc(p.name)}</a>`)
    .join('');
  const seasonSwitch = `<div class="segmented" role="group" aria-label="Stagione">${seasons
    .map((y) => {
      const s = seasonRange(y, today);
      return `<a role="button" href="${href({ stagione: String(y) })}" aria-pressed="${y === year}">${s.label}</a>`;
    })
    .join('')}</div>`;
  const bandSwitch = place.single
    ? ''
    : `<div class="segmented" role="radiogroup" aria-label="Quota">${BANDS.map(
        (b) => `<button type="button" role="radio" aria-checked="${band === b.id}" data-band="${b.id}">${b.label} ${place.elevations[b.id]}</button>`,
      ).join('')}</div>`;

  let body;
  if (load.wxError && !wxDays.length) {
    body = `<div class="notice error"><p>${esc(load.wxError)}</p><button type="button" class="btn" data-season-retry>Riprova</button></div>`;
  } else if (!load.wx) {
    body = '<p class="loading">Scarico l’archivio meteo della stagione…</p>';
  } else if (!wxDays.length) {
    body = '<p class="muted">Nessun dato per questa stagione.</p>';
  } else {
    const wf = weatherFacts(wxDays, elev);
    const af = avByDay ? avalancheFacts(wxDays, avByDay) : null;
    const [done, total] = load.progress;
    const progress =
      avState === 'loading' && total > 0
        ? `<p class="status">Bollettini valanghe: ${done} di ${total} giorni scaricati…</p>`
        : '';
    body = `
      ${progress}
      <section class="season-card">
        <h2>In breve</h2>
        ${factsList(wf, af, elev, season, avState)}
      </section>
      <section class="season-card season-charts" data-season-charts>
        <h2>Giorno per giorno <small class="muted">tocca un giorno</small></h2>
        ${charts(wxDays, elev, avState === 'ok' ? avByDay : null, selIndex, wf)}
        <ul class="sg-legend">
          <li><i class="sg-k sg-k-dry"></i> periodo secco</li>
          <li><i class="sg-k sg-k-warm"></i> periodo caldo</li>
          <li><i class="sg-k sg-k-rain"></i> pioggia alla quota</li>
          <li><i class="sg-k sg-k-pwl"></i> strati deboli persistenti</li>
        </ul>
      </section>
      ${dayPanel(wxDays[selIndex], avByDay?.[wxDays[selIndex]?.date], elev, selIndex, wxDays.length)}`;
  }

  const region = REGIONS[place.region];
  app.innerHTML = `
    <h1 class="page-title">Stagione</h1>
    <p class="place-sub">Cosa è successo dal 1° novembre, giorno per giorno. Solo fatti, nessun giudizio.</p>
    <nav class="chips" aria-label="Posto">${placeChips}</nav>
    <div class="toolbar">${seasonSwitch}${bandSwitch}</div>
    <p class="status">${esc(place.name)} · ${elev} m${region ? ` · ${esc(region.name)}` : ''}${load.av?.zone ? ` · micro-zona ${esc(place.avalancheZoneName || load.av.zone)}` : ''} · dal ${short(season.from)} al ${short(season.to)}${
      load.wx?.stale ? ' · <span class="stale">senza rete, dati salvati</span>' : ''
    }</p>
    ${body}
    <section class="explain">
      <h2>Da dove vengono i dati</h2>
      <p><b>Neve fresca</b>: stimata alla quota dalle previsioni a breve termine archiviate da Open-Meteo (pioggia, temperatura e zero termico ora per ora), con lo stesso calcolo della Panoramica. <b>Neve al suolo</b>: quella del modello meteo, non misurata da una stazione. Sono stime: le stazioni nivometriche possono dare valori diversi.</p>
      <p><b>Periodo secco</b>: almeno ${RULES.dryMinDays} giorni di fila con meno di ${RULES.snowDay} cm di neve fresca. <b>Periodo caldo</b>: almeno ${RULES.warmMinDays} giorni di fila con zero termico massimo sopra la quota scelta. <b>Pioggia</b>: almeno ${RULES.rainMm} mm caduti come pioggia alla quota.</p>
      <p><b>Valanghe</b>: grado e problemi valanghivi ufficiali della micro-zona del posto, dall'archivio <a href="https://www.avalanches.org/" target="_blank" rel="noopener">EAWS</a> (AINEVA, SLF; licenza CC BY 4.0). Il grado mostrato nel grafico è il massimo del giorno; i problemi sono quelli scritti nel bollettino, sopra o sotto la quota limite.</p>
    </section>`;

  // Tocco su un grafico: sceglie il giorno.
  const pick = (index) => {
    const d = wxDays[Math.max(0, Math.min(wxDays.length - 1, index))];
    if (!d) return;
    ui.sel = { key: selKey, date: d.date };
    renderSeason(app, params, { places, prefs, isFav, rerender });
  };
  app.querySelectorAll('[data-sg-plot]').forEach((el) =>
    el.addEventListener('click', (e) => {
      const r = el.getBoundingClientRect();
      pick(Math.floor(((e.clientX - r.left) / r.width) * wxDays.length));
    }),
  );
  // Riprova: si dimenticano i download falliti e si riparte.
  app.querySelectorAll('[data-season-retry]').forEach((b) =>
    b.addEventListener('click', () => {
      for (const [k, v] of loads) if (v.wxError || v.avError) loads.delete(k);
      rerender();
    }),
  );
  app.querySelectorAll('[data-season-step]').forEach((b) =>
    b.addEventListener('click', () => {
      pick(selIndex + Number(b.dataset.seasonStep));
      app.querySelector(`[data-season-step="${b.dataset.seasonStep}"]`)?.focus();
    }),
  );
}
