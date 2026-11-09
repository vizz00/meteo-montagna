// Scarica le previsioni Open-Meteo per tutti i posti e tutte le quote
// con UNA sola chiamata (Open-Meteo accetta liste di coordinate).
import { MODELS, HOURLY_VARS, summarizePoint } from './snow.js';
import { BANDS } from './places.js';

const API = 'https://api.open-meteo.com/v1/forecast';
const CACHE_KEY = 'mm.forecast.v1';
const MAX_AGE_MS = 60 * 60 * 1000; // un'ora
export const FORECAST_DAYS = 7;

function buildPoints(places) {
  const points = [];
  for (const place of places) {
    for (const band of BANDS) {
      points.push({ placeId: place.id, band: band.id, lat: place.lat, lon: place.lon, elev: place.elevations[band.id] });
    }
  }
  return points;
}

export function buildUrl(points) {
  const q = new URLSearchParams({
    latitude: points.map((p) => p.lat).join(','),
    longitude: points.map((p) => p.lon).join(','),
    elevation: points.map((p) => p.elev).join(','),
    hourly: HOURLY_VARS.join(','),
    models: MODELS.map((m) => m.id).join(','),
    forecast_days: String(FORECAST_DAYS),
    timezone: 'Europe/Rome',
  });
  return `${API}?${q}`;
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
    byPlace[p.placeId][p.band] = list[i] ? summarizePoint(list[i], p.elev) : null;
  });
  return { fetchedAt, stale, byPlace };
}
