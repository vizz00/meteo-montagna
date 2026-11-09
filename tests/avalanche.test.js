import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  romeDate, bulletinUrl, findBulletin, summarizeBulletin, elevationText, zoneInGeojson,
} from '../js/avalanche.js';

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
// Estratti reali dei bollettini EAWS del 15/2/2026.
const vda = load('eaws-2026-02-15-IT-23.it.json');
const piemonte = load('eaws-2026-02-15-IT-21.it.json');
const svizzera = load('eaws-2026-02-15-CH.it.json');

test('giorno del bollettino in ora italiana', () => {
  // 23:30 UTC del 14/2 è già il 15/2 in Italia
  assert.equal(romeDate(new Date('2026-02-14T23:30:00Z')), '2026-02-15');
  assert.equal(romeDate(new Date('2026-02-14T22:30:00Z')), '2026-02-14');
  assert.equal(romeDate(new Date('2026-02-14T12:00:00Z'), 1), '2026-02-15');
  // estate (UTC+2)
  assert.equal(romeDate(new Date('2026-07-01T22:30:00Z')), '2026-07-02');
});

test('indirizzo del file EAWS', () => {
  assert.equal(
    bulletinUrl('2026-02-15', 'IT-23'),
    'https://static.avalanche.report/eaws_bulletins/eaws_bulletins/2026-02-15/2026-02-15-IT-23.it.json',
  );
});

test('testo della quota limite', () => {
  assert.equal(elevationText({ lowerBound: '2400' }), 'sopra 2400 m');
  assert.equal(elevationText({ upperBound: '2400' }), 'sotto 2400 m');
  assert.equal(elevationText({ lowerBound: 'treeline' }), 'sopra il limite del bosco');
  assert.equal(elevationText({ upperBound: 'treeline' }), 'sotto il limite del bosco');
  assert.equal(elevationText({ lowerBound: '1800', upperBound: '2400' }), 'tra 1800 e 2400 m');
  assert.equal(elevationText(undefined), 'tutte le quote');
});

test('Cervinia (IT-23-AO-20): 4 Forte sopra 2400 m, 3 Marcato sotto', () => {
  const s = summarizeBulletin(vda, 'IT-23-AO-20');
  assert.equal(s.zoneName, 'D - CERVINIA E ALTA VALPELLINE');
  assert.equal(s.max, 4);
  assert.equal(s.periods.length, 1);
  assert.equal(s.periods[0].id, 'all_day');
  assert.deepEqual(
    s.periods[0].rows.map((r) => [r.level, r.label, r.where]),
    [
      [4, 'Forte', 'sopra 2400 m'],
      [3, 'Marcato', 'sotto 2400 m'],
    ],
  );
  assert.equal(s.provider, "AINEVA Valle d'Aosta");
  assert.equal(s.day, '2026-02-15');
  assert.equal(s.publicationTime, '2026-02-14T16:00:00+00:00');
  assert.deepEqual(s.problems.map((p) => [p.label, p.where, p.aspects]), [
    ['Neve ventata', 'sopra 2400 m', 'tutte le esposizioni'],
    ['Neve fresca', 'tutte le quote', 'tutte le esposizioni'],
  ]);
});

test('Champoluc (IT-23-AO-07): 3 sopra 2100 m, 2 sotto', () => {
  const s = summarizeBulletin(vda, 'IT-23-AO-07');
  assert.equal(s.max, 3);
  assert.deepEqual(s.periods[0].rows.map((r) => [r.level, r.where]), [
    [3, 'sopra 2100 m'],
    [2, 'sotto 2100 m'],
  ]);
});

test('Alagna (IT-21-VB-01): un solo grado per tutte le quote', () => {
  const s = summarizeBulletin(piemonte, 'IT-21-VB-01');
  assert.equal(s.zoneName, 'Alpi Pennine di confine');
  assert.deepEqual(s.periods[0].rows.map((r) => [r.level, r.label, r.where]), [[3, 'Marcato', 'tutte le quote']]);
});

test('limite del bosco e nome zona mancante', () => {
  const s = summarizeBulletin(piemonte, 'IT-21-TO-05');
  assert.equal(s.zoneName, null); // nel file il nome è uguale al codice
  assert.deepEqual(s.periods[0].rows.map((r) => r.where), ['sopra il limite del bosco', 'sotto il limite del bosco']);
  assert.equal(s.problems[1].aspects, 'N NE E NO');
});

test('SLF: sottolivello ufficiale (3+)', () => {
  const s = summarizeBulletin(svizzera, 'CH-4222');
  assert.equal(s.periods[0].rows[0].level, 3);
  assert.equal(s.periods[0].rows[0].sub, '+');
  assert.equal(s.provider, 'SLF');
});

test('mattino e pomeriggio separati', () => {
  const json = {
    bulletins: [
      {
        regions: [{ regionID: 'X-1', name: 'Zona' }],
        dangerRatings: [
          { mainValue: 'moderate', validTimePeriod: 'earlier' },
          { mainValue: 'considerable', validTimePeriod: 'later' },
        ],
      },
    ],
  };
  const s = summarizeBulletin(json, 'X-1');
  assert.deepEqual(s.periods.map((p) => [p.label, p.rows[0].level]), [
    ['Mattino', 2],
    ['Pomeriggio', 3],
  ]);
  assert.equal(s.max, 3);
});

test('zona assente o bollettino più recente', () => {
  assert.equal(summarizeBulletin(vda, 'IT-23-AO-99'), null);
  assert.equal(summarizeBulletin(null, 'IT-23-AO-20'), null);
  const json = {
    bulletins: [
      { bulletinID: 'sera', publicationTime: '2026-02-14T16:00:00+00:00', regions: [{ regionID: 'CH-1' }] },
      { bulletinID: 'mattino', publicationTime: '2026-02-15T07:00:00+00:00', regions: [{ regionID: 'CH-1' }] },
    ],
  };
  assert.equal(findBulletin(json, 'CH-1').bulletinID, 'mattino');
});

test('micro-zona da coordinate, con zone scadute ignorate', () => {
  const square = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
  const geo = {
    features: [
      { properties: { id: 'OLD', start_date: null, end_date: '2022-03-04' }, geometry: { type: 'MultiPolygon', coordinates: [square(7, 45, 8, 46)] } },
      { properties: { id: 'A', start_date: '2022-03-04', end_date: null }, geometry: { type: 'MultiPolygon', coordinates: [square(7, 45, 7.7, 46)] } },
      { properties: { id: 'B', start_date: '2022-03-04', end_date: null }, geometry: { type: 'Polygon', coordinates: square(7.7, 45, 8, 46) } },
    ],
  };
  assert.equal(zoneInGeojson(geo, 45.936, 7.631, '2026-11-09'), 'A'); // Cervinia
  assert.equal(zoneInGeojson(geo, 45.854, 7.938, '2026-11-09'), 'B'); // Alagna
  assert.equal(zoneInGeojson(geo, 47, 9, '2026-11-09'), null);
  assert.equal(zoneInGeojson(geo, 45.936, 7.631, '2020-01-01'), 'OLD');
});
