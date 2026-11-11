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

/** Un posto qualsiasi (aggiunto da te o predefinito), per poterlo modificare. */
export function getPlace(id) {
  return PLACES.find((p) => p.id === id) || null;
}

/** Aggiunge o aggiorna un posto. Restituisce il posto salvato. */
export function savePlace(data) {
  const existing = data.id ? getPlace(data.id) : null;
  const builtin = existing && !existing.custom ? existing : null;
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
  if (data.single) place.single = true;
  if (builtin) {
    // Posto predefinito modificato: resta una tua copia al posto dell'originale (che si può ripristinare).
    const moved = Math.abs(builtin.lat - place.lat) > 1e-4 || Math.abs(builtin.lon - place.lon) > 1e-4;
    const keep = { ...builtin };
    if (moved) {
      delete keep.avalancheZone;
      delete keep.avalancheZoneName;
      delete keep.wepowder;
    } else {
      place.region = builtin.region;
    }
    Object.assign(place, { ...keep, name: place.name, lat: place.lat, lon: place.lon, elevations: place.elevations, region: place.region, custom: true, override: true, original: builtin });
    if (!data.single) delete place.single;
  } else if (existing?.override) {
    place.override = true;
    place.original = existing.original;
    for (const k of ['avalancheZone', 'avalancheZoneName', 'wepowder', 'cimaLabel']) if (existing[k] !== undefined && Math.abs(existing.lat - place.lat) <= 1e-4 && Math.abs(existing.lon - place.lon) <= 1e-4) place[k] = existing[k];
    if (existing.cimaLabel === undefined) delete place.cimaLabel;
  }
  // Provvisorio: visto senza salvarlo nei preferiti. Ne resta uno solo alla volta.
  if (existing ? existing.temp : data.temp) {
    place.temp = true;
    for (const p of PLACES.filter((q) => q.temp && q !== existing)) PLACES.splice(PLACES.indexOf(p), 1);
  }
  ensureRegion(place);
  if (existing) PLACES.splice(PLACES.indexOf(existing), 1, place);
  else PLACES.push(place);
  write();
  return place;
}

/** Un posto provvisorio messo nei preferiti diventa definitivo. */
export function keepPlace(id) {
  const p = getCustomPlace(id);
  if (!p?.temp) return;
  delete p.temp;
  write();
}

export function deletePlace(id) {
  const p = getCustomPlace(id);
  if (!p) return;
  // Una copia modificata di un posto predefinito: si torna all'originale.
  if (p.override && p.original) PLACES.splice(PLACES.indexOf(p), 1, p.original);
  else PLACES.splice(PLACES.indexOf(p), 1);
  write();
}

/** Aggiunge i posti arrivati da un altro dispositivo che qui mancano. Restituisce quanti ne ha aggiunti. */
export function importPlaces(list) {
  let added = 0;
  for (const p of list) {
    const existing = PLACES.find((q) => q.id === p.id);
    if (existing && !existing.temp) continue;
    const place = { ...p, custom: true };
    delete place.temp;
    ensureRegion(place);
    if (existing) PLACES.splice(PLACES.indexOf(existing), 1, place);
    else PLACES.push(place);
    added++;
  }
  if (added) write();
  return added;
}

// Avvio: carica i posti salvati.
for (const p of read()) {
  const same = PLACES.find((q) => q.id === p.id);
  if (same && !same.custom && p.override && p.original) {
    PLACES.splice(PLACES.indexOf(same), 1, { ...p, custom: true, original: same });
    continue;
  }
  if (same) continue;
  const place = { ...p, custom: true };
  ensureRegion(place);
  PLACES.push(place);
}
