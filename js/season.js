// Storico della stagione per un posto: solo fatti.
//
// Meteo: archivio Open-Meteo delle previsioni passate (historical-forecast-api), ora per ora,
// alla quota scelta. La neve fresca usa lo stesso calcolo della Panoramica (js/snow.js);
// la neve al suolo è quella del modello (non misurata).
// Valanghe: archivio EAWS giorno per giorno, file leggeri per servizio:
//   <giorno>-<regione>.ratings.json  (grado massimo per micro-zona, :high/:low = sopra/sotto quota limite)
//   <giorno>-<regione>.problems.json (problemi valanghivi per micro-zona)
import { hourlySnowCm, snowFraction } from './snow.js';
import { romeDate, providerCode, zoneForPoint } from './avalanche.js';

const ARCHIVE_API = 'https://historical-forecast-api.open-meteo.com/v1/forecast';
const BULLETIN_BASE = 'https://static.avalanche.report/eaws_bulletins/eaws_bulletins';
const WX_CACHE_KEY = 'mm.season-wx.v1';
const AV_CACHE_KEY = 'mm.season-aval.v1';
const WX_MAX_AGE_MS = 3 * 60 * 60 * 1000; // stagione in corso: si riscarica dopo 3 ore

// Soglie usate per i "periodi": scritte anche nella pagina, così si sa cosa si sta guardando.
export const RULES = {
  snowDay: 1, // cm: giorno con neve fresca
  dryMinDays: 7, // giorni di fila senza neve fresca
  warmMinDays: 3, // giorni di fila con zero termico sopra la quota
  rainMm: 2, // mm di pioggia alla quota per contare un giorno di pioggia
};

// Problemi mostrati nella linea del tempo, nell'ordine EAWS.
export const PROBLEM_ROWS = ['new_snow', 'wind_slab', 'persistent_weak_layers', 'wet_snow', 'gliding_snow', 'cornices'];

// ---------- date ----------

const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function dayRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// Anno di inizio della stagione in corso: da ottobre si guarda la nuova stagione.
export function currentSeasonYear(today = romeDate()) {
  const [y, m] = today.split('-').map(Number);
  return m >= 10 ? y : y - 1;
}

// Stagione = dal 1° novembre al 30 giugno (o fino a oggi, se è quella in corso).
export function seasonRange(year, today = romeDate()) {
  const from = `${year}-11-01`;
  const end = `${year + 1}-06-30`;
  const to = today < end ? today : end;
  return { year, from, to: to < from ? from : to, label: `${year}-${String(year + 1).slice(2)}`, current: today <= end };
}

// ---------- meteo: da orario a giornaliero ----------

export function archiveUrl(place, elev, from, to) {
  const q = new URLSearchParams({
    latitude: String(place.lat),
    longitude: String(place.lon),
    elevation: String(elev),
    start_date: from,
    end_date: to,
    hourly: 'temperature_2m,precipitation,freezing_level_height,snow_depth',
    timezone: 'Europe/Rome',
  });
  return `${ARCHIVE_API}?${q}`;
}

/**
 * Riduce la risposta oraria a una riga per giorno:
 * { date, newSnow (cm), rain (mm), precip (mm), freezingMax (m), tMin, tMax, depth (cm, modello, alle 12) }
 */
export function dailyFromHourly(json, elev) {
  const h = json?.hourly;
  if (!h?.time) return [];
  const days = new Map();
  h.time.forEach((t, i) => {
    const date = t.slice(0, 10);
    if (!days.has(date)) days.set(date, { date, newSnow: 0, rain: 0, precip: 0, freezingMax: null, tMin: null, tMax: null, depth: null, hours: 0 });
    const d = days.get(date);
    const p = h.precipitation?.[i];
    const temp = h.temperature_2m?.[i];
    const fl = h.freezing_level_height?.[i];
    const sd = h.snow_depth?.[i];
    if (p != null) {
      d.hours += 1;
      d.precip += p;
      d.newSnow += hourlySnowCm(elev, p, temp, fl);
      d.rain += p * (1 - snowFraction(elev, temp, fl));
    }
    if (fl != null) d.freezingMax = d.freezingMax == null ? fl : Math.max(d.freezingMax, fl);
    if (temp != null) {
      d.tMin = d.tMin == null ? temp : Math.min(d.tMin, temp);
      d.tMax = d.tMax == null ? temp : Math.max(d.tMax, temp);
    }
    // Neve al suolo: valore delle 12, oppure l'ultimo disponibile del giorno.
    if (sd != null && (d.depth == null || t.slice(11, 13) <= '12')) d.depth = Math.round(sd * 100);
  });
  return [...days.values()]
    .filter((d) => d.hours > 0 || d.depth != null)
    .map(({ hours, ...d }) => ({
      ...d,
      newSnow: Math.round(d.newSnow * 10) / 10,
      rain: Math.round(d.rain * 10) / 10,
      precip: Math.round(d.precip * 10) / 10,
    }));
}

// ---------- valanghe: un giorno per micro-zona ----------

/**
 * Dai due file del giorno (ratings + problems) estrae la micro-zona.
 * Restituisce null se il bollettino non c'è o non copre la zona, altrimenti
 * { max, high, low, problems, problemsHigh, problemsLow } (high/low = sopra/sotto la quota limite).
 */
export function avalDay(ratings, problems, zoneId) {
  const r = ratings?.maxDangerRatings;
  if (!r || r[zoneId] == null) return null;
  const p = problems?.avalancheProblems || {};
  const uniq = (list) => [...new Set(list || [])];
  return {
    max: r[zoneId],
    high: r[`${zoneId}:high`] ?? r[zoneId],
    low: r[`${zoneId}:low`] ?? r[zoneId],
    problems: uniq(p[zoneId]),
    problemsHigh: uniq(p[`${zoneId}:high`] ?? p[zoneId]),
    problemsLow: uniq(p[`${zoneId}:low`] ?? p[zoneId]),
  };
}

// ---------- fatti: periodi ed episodi ----------

// Sequenze di giorni consecutivi che rispettano `test`, lunghe almeno `minDays`.
export function runs(days, test, minDays = 1) {
  const out = [];
  let cur = null;
  days.forEach((d, i) => {
    if (test(d, i)) {
      if (!cur) cur = { start: i, end: i };
      else cur.end = i;
    } else if (cur) {
      out.push(cur);
      cur = null;
    }
  });
  if (cur) out.push(cur);
  return out
    .filter((r) => r.end - r.start + 1 >= minDays)
    .map((r) => ({ ...r, from: days[r.start].date, to: days[r.end].date, length: r.end - r.start + 1 }));
}

/** Fatti meteo della stagione alla quota `elev`. */
export function weatherFacts(days, elev) {
  const valid = days.filter((d) => d.newSnow != null);
  const total = valid.reduce((s, d) => s + d.newSnow, 0);
  const snowDays = valid.filter((d) => d.newSnow >= RULES.snowDay).length;
  const episodes = runs(days, (d) => d.newSnow >= RULES.snowDay).map((r) => ({
    ...r,
    cm: Math.round(days.slice(r.start, r.end + 1).reduce((s, d) => s + d.newSnow, 0)),
  }));
  const biggest = [...episodes].sort((a, b) => b.cm - a.cm || a.start - b.start).slice(0, 3);
  const dry = runs(days, (d) => d.newSnow < RULES.snowDay, RULES.dryMinDays);
  const warm = runs(days, (d) => d.freezingMax != null && d.freezingMax > elev, RULES.warmMinDays);
  const rainDays = days.filter((d) => d.rain >= RULES.rainMm);
  const withDepth = days.filter((d) => d.depth != null);
  const last = withDepth.at(-1) || null;
  const maxDepth = withDepth.reduce((m, d) => (!m || d.depth > m.depth ? d : m), null);
  const flDays = days.filter((d) => d.freezingMax != null);
  const maxFl = flDays.reduce((m, d) => (!m || d.freezingMax > m.freezingMax ? d : m), null);
  return { total: Math.round(total), snowDays, biggest, dry, warm, rainDays, last, maxDepth, maxFl, nDays: days.length };
}

/** Fatti valanghivi della stagione: giorni con bollettino, problemi, strati deboli persistenti. */
export function avalancheFacts(days, avalByDay) {
  const rows = days.map((d) => ({ date: d.date ?? d, a: avalByDay[d.date ?? d] || null }));
  const withBulletin = rows.filter((r) => r.a);
  const count = {};
  for (const r of withBulletin) for (const p of r.a.problems) count[p] = (count[p] || 0) + 1;
  const pwl = runs(rows, (r) => !!r.a?.problems.includes('persistent_weak_layers')).map((run) => {
    const slice = rows.slice(run.start, run.end + 1);
    return {
      ...run,
      onlyHigh: slice.every((r) => !r.a.problemsLow.includes('persistent_weak_layers')),
    };
  });
  const top = withBulletin.reduce((m, r) => (!m || r.a.max > m.a.max ? r : m), null);
  const firstBulletin = withBulletin[0]?.date || null;
  return { nBulletins: withBulletin.length, count, pwl, pwlDays: count.persistent_weak_layers || 0, top, firstBulletin };
}

// ---------- caricamento ----------

function readStore(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}
function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* spazio pieno: si va avanti senza cache */
  }
}

// fetch con tempo massimo: sul telefono una richiesta può restare appesa per sempre
// (app in background, rete che cambia) e la pagina resterebbe su "Scarico…".
async function fetchTimeout(url, ms, signal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const stop = () => ctrl.abort();
  signal?.addEventListener('abort', stop);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}

/** Meteo giornaliero della stagione alla quota. Usa la copia salvata se recente. */
export async function loadSeasonWeather(place, elev, season, { force = false } = {}) {
  const url = archiveUrl(place, elev, season.from, season.to);
  const store = readStore(WX_CACHE_KEY) || {};
  const key = `${place.lat},${place.lon},${elev},${season.year}`;
  const c = store[key];
  const fresh = c && c.to === season.to && (!season.current || Date.now() - c.fetchedAt < WX_MAX_AGE_MS);
  if (!force && fresh) return c;
  try {
    // Un secondo tentativo dopo una pausa breve: Open-Meteo ogni tanto risponde 429/5xx.
    let res;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await fetchTimeout(url, 25000);
        if (res.ok || attempt >= 1 || (res.status < 500 && res.status !== 429)) break;
      } catch (err) {
        if (attempt >= 1) throw err;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (!res.ok) throw new Error(`Open-Meteo ha risposto ${res.status}`);
    const days = dailyFromHourly(await res.json(), elev);
    const entry = { to: season.to, fetchedAt: Date.now(), days };
    // Si rilegge la copia salvata adesso: nel frattempo altri posti possono averla aggiornata.
    const now = readStore(WX_CACHE_KEY) || {};
    delete now[key];
    // Si tengono al massimo 12 serie (posto × quota × stagione) per non riempire il browser.
    const keys = Object.keys(now).sort((a, b) => now[a].fetchedAt - now[b].fetchedAt);
    while (keys.length >= 12) delete now[keys.shift()];
    writeStore(WX_CACHE_KEY, { ...now, [key]: entry });
    return entry;
  } catch (err) {
    if (c) return { ...c, stale: true };
    throw err;
  }
}

async function getJson(url, signal) {
  const r = await fetchTimeout(url, 15000, signal);
  if (r.status === 404 || r.status === 403) return null; // nessun bollettino quel giorno
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function placeZone(place) {
  if (place.avalancheZone) return place.avalancheZone;
  if (!place.region || place.lat == null) return null;
  return (await zoneForPoint(place.lat, place.lon, place.region))?.id || null;
}

/**
 * Valanghe giorno per giorno per la micro-zona del posto.
 * `onProgress(fatti, totale)` per la barra di avanzamento. I giorni passati restano salvati nel browser.
 */
export async function loadSeasonAvalanche(place, season, { onProgress, signal } = {}) {
  const zone = await placeZone(place);
  if (!zone) return { zone: null, byDay: {} };
  const region = providerCode(place.region);
  const today = romeDate();
  const store = readStore(AV_CACHE_KEY) || {};
  const saved = store[zone] || {};
  const byDay = {};
  const todo = [];
  for (const day of dayRange(season.from, season.to)) {
    if (day in saved && day < today) byDay[day] = saved[day] || null;
    else todo.push(day);
  }
  let done = 0;
  const total = todo.length;
  onProgress?.(done, total);
  let failed = 0;
  const worker = async () => {
    while (todo.length && !signal?.aborted) {
      const day = todo.shift();
      try {
        const base = `${BULLETIN_BASE}/${day}/${day}-${region}`;
        const [r, p] = await Promise.all([getJson(`${base}.ratings.json`, signal), getJson(`${base}.problems.json`, signal)]);
        byDay[day] = avalDay(r, p, zone);
        // Un giorno passato senza bollettino si salva solo se è vecchio (i bollettini escono la sera prima).
        if (day < addDays(today, -2) || byDay[day]) saved[day] = byDay[day] || 0;
      } catch {
        failed += 1;
        byDay[day] = null;
      }
      done += 1;
      onProgress?.(done, total);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  // Si salva anche se interrotto: i giorni già scaricati non si riscaricano.
  writeStore(AV_CACHE_KEY, { ...(readStore(AV_CACHE_KEY) || {}), [zone]: saved });
  if (signal?.aborted) throw new DOMException('Interrotto', 'AbortError');
  return { zone, byDay, failed };
}
