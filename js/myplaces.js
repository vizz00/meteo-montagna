// Posti aggiunti dall'utente, salvati nel browser (localStorage).
// All'avvio vengono inseriti nella lista PLACES, così il resto dell'app
// (panoramica, dettaglio, radar, valanghe) li tratta come gli altri.
import { PLACES, REGIONS } from './places.js';
import { regionName, slug } from './geo.js';

const KEY = 'mm.places.v1';
const GENERIC_AVALANCHE = { avalancheUrl: 'https://www.avalanches.org/', avalancheSource: 'EAWS' };

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((p) => p && p.id && Number.isFinite(p.lat) && Number.isFinite(p.lon)) : [];
  } catch {
    return [];
  }
}

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(PLACES.filter((p) => p.custom)));
  } catch {
    /* spazio pieno o navigazione privata */
  }
}

// Le zone fuori dalle 4 iniziali ricevono un link generico ai bollettini europei.
function ensureRegion(place) {
  if (!REGIONS[place.region]) {
    REGIONS[place.region] = {
      name: place.regionName || regionName(place.region) || 'Altra zona',
      ...GENERIC_AVALANCHE,
    };
  }
}

export const customPlaces = () => PLACES.filter((p) => p.custom);

export function getCustomPlace(id) {
  return PLACES.find((p) => p.custom && p.id === id) || null;
}

/** Aggiunge o aggiorna un posto. Restituisce il posto salvato. */
export function savePlace(data) {
  const existing = data.id ? getCustomPlace(data.id) : null;
  const place = {
    id: existing?.id || `${slug(data.name)}-${Date.now().toString(36).slice(-4)}`,
    name: data.name.trim(),
    lat: +data.lat.toFixed(4),
    lon: +data.lon.toFixed(4),
    elevations: { ...data.elevations },
    region: data.region || 'ALTRO',
    regionName: data.regionName || regionName(data.region) || 'Altra zona',
    custom: true,
  };
  ensureRegion(place);
  if (existing) PLACES.splice(PLACES.indexOf(existing), 1, place);
  else PLACES.push(place);
  write();
  return place;
}

export function deletePlace(id) {
  const p = getCustomPlace(id);
  if (!p) return;
  PLACES.splice(PLACES.indexOf(p), 1);
  write();
}

// Avvio: carica i posti salvati.
for (const p of read()) {
  if (PLACES.some((q) => q.id === p.id)) continue;
  const place = { ...p, custom: true };
  ensureRegion(place);
  PLACES.push(place);
}
