// Porta i posti e i preferiti da un dispositivo all'altro, senza account:
// il codice è un link che contiene i posti aggiunti, i preferiti (in ordine) e i versanti scelti.
// Su iPhone l'app sulla schermata Home ha dati separati da Safari, per questo il codice
// si può anche incollare dentro l'app.
import { PLACES } from './places.js';
import { importPlaces } from './myplaces.js';

const PLACE_FIELDS = ['id', 'name', 'lat', 'lon', 'elevations', 'region', 'regionName', 'single'];

const esc = (t) =>
  String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code) {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Il codice da copiare: un link all'app che porta con sé i dati. */
export function exportLink(prefs) {
  const places = PLACES.filter((p) => p.custom && !p.temp).map((p) =>
    Object.fromEntries(PLACE_FIELDS.filter((k) => p[k] !== undefined).map((k) => [k, p[k]]))
  );
  const data = { v: 1, places, list: prefs.places, favorites: prefs.favorites, aspects: prefs.aspects || {} };
  const base = location.href.split('#')[0];
  return `${base}#/trasferisci?d=${toBase64Url(JSON.stringify(data))}`;
}

/** Legge un link o un codice incollato. Restituisce i dati o null se non è valido. */
export function readCode(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const m = raw.match(/[?&]d=([A-Za-z0-9_-]+)/);
  const code = m ? m[1] : raw;
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return null;
  try {
    const data = JSON.parse(fromBase64Url(code));
    if (data?.v !== 1 || !Array.isArray(data.places) || !Array.isArray(data.favorites)) return null;
    data.places = data.places.filter(
      (p) => p && typeof p.id === 'string' && typeof p.name === 'string' && Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.elevations
    );
    data.favorites = data.favorites.filter((f) => typeof f === 'string');
    data.list = (Array.isArray(data.list) ? data.list : [...data.favorites, ...data.places.map((p) => p.id)]).filter((f) => typeof f === 'string');
    return data;
  } catch {
    return null;
  }
}

/**
 * Unisce i dati importati a quelli di questo dispositivo: aggiunge i posti che mancano
 * e le stelle nuove in fondo, senza togliere niente.
 * @returns {{prefs: object, addedPlaces: number, addedFavs: number}}
 */
export function mergeImport(data, prefs) {
  importPlaces(data.places);
  const known = new Set(PLACES.map((p) => p.id));
  const newFavs = data.favorites.filter((f) => known.has(f) && !prefs.favorites.includes(f));
  const newList = [...new Set([...data.list, ...data.favorites])].filter((f) => known.has(f) && !prefs.places.includes(f));
  const aspects = { ...(data.aspects || {}), ...(prefs.aspects || {}) };
  return {
    prefs: { ...prefs, favorites: [...prefs.favorites, ...newFavs], places: [...prefs.places, ...newList], aspects },
    addedPlaces: newList.length,
    addedFavs: newFavs.length,
  };
}

export function transferPage({ prefs, code, result }) {
  const nPlaces = prefs.places.length;
  const nFavs = prefs.favorites.length;
  const done = result
    ? `<div class="notice" role="status"><p>${
        result.addedPlaces || result.addedFavs
          ? `Fatto: ${result.addedPlaces} ${result.addedPlaces === 1 ? 'posto aggiunto' : 'posti aggiunti'}${
              result.addedFavs ? `, ${result.addedFavs} con la stella` : ''
            }.`
          : 'Avevi già tutti questi posti.'
      }</p><p><a class="btn" href="#/">Vai alle località</a></p></div>`
    : '';
  const bad = code && !result && !readCode(code)
    ? '<div class="notice error" role="alert"><p>Il codice non è valido: copialo di nuovo per intero dall\'altro dispositivo.</p></div>'
    : '';
  return `<h1 class="page-title">Altro dispositivo</h1>
    <p class="muted">Per avere gli stessi posti sul Mac e sull'iPhone: copia il codice su un dispositivo e incollalo sull'altro.</p>
    ${done}${bad}
    <section class="transfer">
      <h2>1 · Copia da questo dispositivo</h2>
      <p>${nPlaces} ${nPlaces === 1 ? 'posto' : 'posti'}${nFavs ? `, ${nFavs} con la stella` : ''}.</p>
      <div class="transfer-actions">
        <button type="button" class="btn" data-transfer-copy>Copia codice</button>
        ${navigator.share ? '<button type="button" class="btn ghost" data-transfer-share>Invia…</button>' : ''}
      </div>
      <p class="muted small" data-transfer-copied role="status"></p>
    </section>
    <section class="transfer">
      <h2>2 · Incolla sull'altro dispositivo</h2>
      <p class="muted small">Sull'iPhone incollalo dentro l'app aperta dalla schermata Home: Safari e l'app tengono i dati separati.</p>
      <label for="transfer-code" class="sr-only">Codice</label>
      <textarea id="transfer-code" rows="3" placeholder="Incolla qui il codice" data-transfer-input>${code && !result && readCode(code) ? esc(code) : ''}</textarea>
      <div class="transfer-actions"><button type="button" class="btn" data-transfer-import>Aggiungi questi posti</button></div>
    </section>`;
}
