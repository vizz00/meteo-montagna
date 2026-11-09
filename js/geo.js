// Calcoli per i posti aggiunti dall'utente: quote proposte e zona valanghe.
// Funzioni pure (niente rete), provate in tests/geo.test.js.

// Zone note, con il codice usato dai bollettini EAWS.
export const REGION_OPTIONS = [
  { code: 'IT-23', name: "Valle d'Aosta" },
  { code: 'IT-21', name: 'Piemonte' },
  { code: 'IT-25', name: 'Lombardia' },
  { code: 'IT-32-BZ', name: 'Alto Adige' },
  { code: 'IT-32-TN', name: 'Trentino' },
  { code: 'IT-34', name: 'Veneto' },
  { code: 'IT-36', name: 'Friuli Venezia Giulia' },
  { code: 'IT-42', name: 'Liguria' },
  { code: 'CH', name: 'Svizzera' },
  { code: 'FR', name: 'Francia' },
  { code: 'AT', name: 'Austria' },
  { code: 'DE', name: 'Germania' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'ALTRO', name: 'Altra zona' },
];

export const regionName = (code) => REGION_OPTIONS.find((r) => r.code === code)?.name;

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'")
    .trim();

const ADMIN1 = {
  "valle d'aosta": 'IT-23',
  "vallee d'aoste": 'IT-23',
  'aosta valley': 'IT-23',
  piemonte: 'IT-21',
  piedmont: 'IT-21',
  lombardia: 'IT-25',
  lombardy: 'IT-25',
  veneto: 'IT-34',
  'friuli venezia giulia': 'IT-36',
  'friuli-venezia giulia': 'IT-36',
  liguria: 'IT-42',
};

/** Zona da un risultato della ricerca Open-Meteo (admin1/admin2/country_code). */
export function regionFromGeocoding(r) {
  const cc = String(r?.country_code || '').toUpperCase();
  if (cc === 'IT') {
    const a1 = norm(r.admin1);
    if (ADMIN1[a1]) return ADMIN1[a1];
    if (a1.startsWith('trentino')) {
      const a2 = norm(r.admin2);
      return /bolzano|bozen|alto adige|sudtirol/.test(a2) ? 'IT-32-BZ' : 'IT-32-TN';
    }
    return 'ALTRO';
  }
  return REGION_OPTIONS.some((o) => o.code === cc) ? cc : 'ALTRO';
}

/** Zona dalla risposta "reverse" di Nominatim (codici ISO 3166-2). */
export function regionFromNominatim(address = {}) {
  const lvl4 = String(address['ISO3166-2-lvl4'] || '').toUpperCase();
  const lvl6 = String(address['ISO3166-2-lvl6'] || '').toUpperCase();
  const cc = String(address.country_code || '').toUpperCase();
  if (lvl4 === 'IT-32') return lvl6 === 'IT-BZ' ? 'IT-32-BZ' : 'IT-32-TN';
  if (lvl4.startsWith('IT-')) return REGION_OPTIONS.some((o) => o.code === lvl4) ? lvl4 : 'ALTRO';
  // Austria: EAWS usa AT-07 (Tirolo), AT-08 (Vorarlberg)…
  const at = lvl4.match(/^AT-(\d)$/);
  if (at) return `AT-0${at[1]}`;
  return REGION_OPTIONS.some((o) => o.code === cc) ? cc : 'ALTRO';
}

/** Nome leggibile del punto dalla risposta di Nominatim. */
export function nameFromNominatim(data) {
  const a = data?.address || {};
  return a.hamlet || a.village || a.town || a.city || a.municipality || a.county || data?.name || '';
}

/**
 * Griglia di punti attorno a (lat, lon) entro `radiusKm`, centro per primo.
 * Con steps = 4 sono 49 punti (l'API delle quote ne accetta fino a 100).
 */
export function gridPoints(lat, lon, radiusKm = 4, steps = 4) {
  const kmLat = 111.32;
  const kmLon = 111.32 * Math.cos((lat * Math.PI) / 180);
  const pts = [{ lat, lon }];
  for (let i = -steps; i <= steps; i++) {
    for (let j = -steps; j <= steps; j++) {
      if ((i === 0 && j === 0) || i * i + j * j > steps * steps) continue;
      const dy = (radiusKm * i) / steps;
      const dx = (radiusKm * j) / steps;
      pts.push({ lat: +(lat + dy / kmLat).toFixed(5), lon: +(lon + dx / kmLon).toFixed(5) });
    }
  }
  return pts;
}

const round = (m, step = 10) => Math.round(m / step) * step;

/**
 * Quote proposte: valle = quota del punto scelto, cima = punto più alto entro il raggio,
 * metà = a metà strada. Arrotondate a 10 m. `samples` sono le quote della griglia.
 */
export function proposeElevations(base, samples = []) {
  const valid = samples.filter((v) => Number.isFinite(v));
  if (!Number.isFinite(base)) base = valid[0];
  if (!Number.isFinite(base)) return null;
  const top = Math.max(base, ...valid);
  const valle = round(base);
  const cima = round(top);
  const meta = Math.min(cima, Math.max(valle, round((valle + cima) / 2, 50)));
  return { valle, meta, cima };
}

/** Controlla le quote inserite. Restituisce un messaggio d'errore o null. */
export function checkElevations({ valle, meta, cima }) {
  const all = [valle, meta, cima];
  if (all.some((v) => !Number.isFinite(v))) return 'Inserisci tutte e tre le quote.';
  if (all.some((v) => v < 0 || v > 4810)) return 'Le quote devono essere tra 0 e 4810 m.';
  if (!(valle <= meta && meta <= cima)) return 'Le quote devono crescere: valle ≤ metà ≤ cima.';
  return null;
}

export function slug(s) {
  return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'posto';
}
