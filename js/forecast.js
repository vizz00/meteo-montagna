// Scarica le previsioni Open-Meteo per tutti i posti e tutte le quote
// con UNA sola chiamata (Open-Meteo accetta liste di coordinate).
import { MODELS, HOURLY_VARS, summarizePoint, totalRange, pointNow, chartSeries } from './snow.js';
import { BANDS } from './places.js';

const API = 'https://api.open-meteo.com/v1/forecast';
const CACHE_KEY = 'mm.forecast.v1';
const MAX_AGE_MS = 60 * 60 * 1000; // un'ora
export const FORECAST_DAYS = 10; // panoramica: prossimi 1-5 e 6-10 giorni
export const DETAIL_DAYS = 16; // dettaglio del posto: grafici a 15 giorni
// Giorni passati scaricati insieme alla previsione: servono alle regole della finestra buona
// (neve e vento degli ultimi 3 giorni).
export const PAST_DAYS = 3;

function buildPoints(places) {
  const points = [];
  for (const place of places) {
    for (const band of BANDS) {
      points.push({ placeId: place.id, band: band.id, lat: place.lat, lon: place.lon, elev: place.elevations[band.id] });
    }
  }
  return points;
}

export function buildUrl(points, days = FORECAST_DAYS) {
  const q = new URLSearchParams({
    latitude: points.map((p) => p.lat).join(','),
    longitude: points.map((p) => p.lon).join(','),
    elevation: points.map((p) => p.elev).join(','),
    hourly: HOURLY_VARS.join(','),
    models: MODELS.map((m) => m.id).join(','),
    forecast_days: String(days),
    past_days: String(PAST_DAYS),
    timezone: 'Europe/Rome',
  });
  return `${API}?${q}`;
}

// Separa i giorni passati da quelli di previsione: la panoramica mostra solo da oggi.
function splitPast(summary, raw, elev) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
  const past = summary.days.filter((d) => d.date < today);
  const days = summary.days.filter((d) => d.date >= today).slice(0, FORECAST_DAYS);
  return { past, days, total: totalRange(days), ...(pointNow(raw, elev) || {}) };
}

function readCache(key) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return c && c.key === key ? c : null;
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ key, fetchedAt: Date.now(), data }));
  } catch {
    /* spazio pieno o navigazione privata: si va avanti senza cache */
  }
}

/**
 * Restituisce { fetchedAt, stale, byPlace: { [id]: { [band]: summary } } }.
 * `force` ignora la cache recente. Se la rete non risponde usa l'ultima copia.
 */
export async function loadForecast(places, { force = false } = {}) {
  const points = buildPoints(places);
  const url = buildUrl(points);
  const cached = readCache(url);
  let raw = null;
  let fetchedAt = null;
  let stale = false;

  if (!force && cached && Date.now() - cached.fetchedAt < MAX_AGE_MS) {
    raw = cached.data;
    fetchedAt = cached.fetchedAt;
  } else {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Open-Meteo ha risposto ${res.status}`);
      raw = await res.json();
      fetchedAt = Date.now();
      writeCache(url, raw);
    } catch (err) {
      if (!cached) throw err;
      raw = cached.data;
      fetchedAt = cached.fetchedAt;
      stale = true;
    }
  }

  const list = Array.isArray(raw) ? raw : [raw];
  const byPlace = {};
  points.forEach((p, i) => {
    byPlace[p.placeId] ??= {};
    byPlace[p.placeId][p.band] = list[i] ? splitPast(summarizePoint(list[i], p.elev), list[i], p.elev) : null;
  });
  return { fetchedAt, stale, byPlace };
}

// ---------- dettaglio di un posto: 15 giorni, una sola quota ----------

const DETAIL_KEY = 'mm.detail.v1';
const detailMemo = new Map();

/** Serie orarie per i grafici del posto alla quota scelta (cache di un'ora, solo l'ultimo posto). */
export async function loadDetail(place, band, { force = false } = {}) {
  const elev = place.elevations[band];
  const point = { lat: place.lat, lon: place.lon, elev };
  const url = buildUrl([point], DETAIL_DAYS);
  let raw = null;
  const memo = detailMemo.get(url);
  if (!force && memo && Date.now() - memo.fetchedAt < MAX_AGE_MS) raw = memo.data;
  if (!raw) {
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(DETAIL_KEY) || 'null');
    } catch {
      /* ignorato */
    }
    if (!force && stored?.key === url && Date.now() - stored.fetchedAt < MAX_AGE_MS) raw = stored.data;
    else {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Open-Meteo ha risposto ${res.status}`);
        raw = await res.json();
        detailMemo.set(url, { fetchedAt: Date.now(), data: raw });
        try {
          localStorage.setItem(DETAIL_KEY, JSON.stringify({ key: url, fetchedAt: Date.now(), data: raw }));
        } catch {
          /* spazio pieno: resta solo in memoria */
        }
      } catch (err) {
        if (stored?.key !== url) throw err;
        raw = stored.data;
      }
    }
  }
  const one = Array.isArray(raw) ? raw[0] : raw;
  return { elev, series: chartSeries(one, elev, MODELS) };
}
