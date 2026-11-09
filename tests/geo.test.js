import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gridPoints,
  proposeElevations,
  checkElevations,
  regionFromGeocoding,
  regionFromNominatim,
  nameFromNominatim,
  slug,
} from '../js/geo.js';

test('griglia: centro per primo, 49 punti entro il raggio', () => {
  const pts = gridPoints(45.8, 7.8, 4);
  assert.equal(pts.length, 49);
  assert.deepEqual(pts[0], { lat: 45.8, lon: 7.8 });
  for (const p of pts) {
    const dy = (p.lat - 45.8) * 111.32;
    const dx = (p.lon - 7.8) * 111.32 * Math.cos((45.8 * Math.PI) / 180);
    assert.ok(Math.hypot(dx, dy) <= 4.01);
  }
});

test('quote proposte: valle = punto, cima = massimo, metà nel mezzo', () => {
  assert.deepEqual(proposeElevations(1637, [1637, 1900, 2950, 2420]), { valle: 1640, meta: 2300, cima: 2950 });
  // senza griglia: tutte uguali alla quota del paese
  assert.deepEqual(proposeElevations(1200, []), { valle: 1200, meta: 1200, cima: 1200 });
  assert.equal(proposeElevations(undefined, []), null);
  const p = proposeElevations(2000, [2010]);
  assert.ok(p.valle <= p.meta && p.meta <= p.cima);
});

test('controllo quote', () => {
  assert.equal(checkElevations({ valle: 1500, meta: 2200, cima: 3000 }), null);
  assert.match(checkElevations({ valle: 2500, meta: 2200, cima: 3000 }), /crescere/);
  assert.match(checkElevations({ valle: NaN, meta: 2200, cima: 3000 }), /tutte/);
  assert.match(checkElevations({ valle: 100, meta: 2200, cima: 5000 }), /4810/);
});

test('zona dalla ricerca per nome', () => {
  assert.equal(regionFromGeocoding({ country_code: 'IT', admin1: "Valle d'Aosta" }), 'IT-23');
  assert.equal(regionFromGeocoding({ country_code: 'IT', admin1: 'Piemonte' }), 'IT-21');
  assert.equal(regionFromGeocoding({ country_code: 'IT', admin1: 'Lombardia' }), 'IT-25');
  assert.equal(regionFromGeocoding({ country_code: 'IT', admin1: 'Trentino-Alto Adige', admin2: 'Bolzano' }), 'IT-32-BZ');
  assert.equal(regionFromGeocoding({ country_code: 'IT', admin1: 'Trentino-Alto Adige', admin2: 'Trento' }), 'IT-32-TN');
  assert.equal(regionFromGeocoding({ country_code: 'CH', admin1: 'Vallese' }), 'CH');
  assert.equal(regionFromGeocoding({ country_code: 'US' }), 'ALTRO');
});

test('zona e nome dalla mappa (Nominatim)', () => {
  assert.equal(regionFromNominatim({ 'ISO3166-2-lvl4': 'IT-23', country_code: 'it' }), 'IT-23');
  assert.equal(regionFromNominatim({ 'ISO3166-2-lvl4': 'IT-32', 'ISO3166-2-lvl6': 'IT-BZ', country_code: 'it' }), 'IT-32-BZ');
  assert.equal(regionFromNominatim({ 'ISO3166-2-lvl4': 'CH-VS', country_code: 'ch' }), 'CH');
  assert.equal(regionFromNominatim({ 'ISO3166-2-lvl4': 'AT-7', country_code: 'at' }), 'AT-07');
  assert.equal(regionFromNominatim({ 'ISO3166-2-lvl4': 'FR-ARA', country_code: 'fr' }), 'FR');
  assert.equal(regionFromNominatim({}), 'ALTRO');
  assert.equal(nameFromNominatim({ address: { village: 'Gressoney-La-Trinité' } }), 'Gressoney-La-Trinité');
});

test('slug', () => {
  assert.equal(slug("La Thuile d'Aosta"), 'la-thuile-d-aosta');
  assert.equal(slug('!!!'), 'posto');
});
