import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateDay, evaluateWindows, leeSectors, meanDirection, problemAtElevation } from '../js/window.js';
import { summarizePoint } from '../js/snow.js';

// Giorno sintetico con gli stessi valori per 3 modelli.
const BASE = {
  snow: 0, precip: 0, rain: 0, windMax: 10, windDir: 0, transportDir: null, transportHours: 0,
  cloud: 10, nightCloud: 10, tMin: -8, tMax: -2, tNightMin: -8, freezingMax: 1800,
};
function day(date, over = {}) {
  const m = { ...BASE, ...over };
  return { date, models: { a: { ...m }, b: { ...m }, c: { ...m } } };
}
const ELEV = 2800;

test('versanti sottovento: vento da NO carica SE e i settori accanto', () => {
  assert.deepEqual(leeSectors(315), ['E', 'SE', 'S']);
  assert.deepEqual(leeSectors(0), ['SE', 'S', 'SO']);
  assert.deepEqual(leeSectors(null), []);
});

test('media circolare delle direzioni attraversa il nord', () => {
  assert.ok(Math.abs(meanDirection([350, 10]) - 0) < 1e-6 || Math.abs(meanDirection([350, 10]) - 360) < 1e-6);
});

test('giorno sereno, calmo e freddo senza neve: finestra buona', () => {
  const days = [day('2026-01-01'), day('2026-01-02'), day('2026-01-03')];
  const w = evaluateDay(days, 2, ELEV);
  assert.equal(w.status, 'aperta');
  assert.equal(w.signals.length, 0);
});

test('due giorni di neve con vento forte: chiusa (esempio di Riccardo)', () => {
  const days = [
    day('2026-01-01', { snow: 15, windMax: 50, transportDir: 315, transportHours: 10, cloud: 100 }),
    day('2026-01-02', { snow: 15, windMax: 45, transportDir: 315, transportHours: 10, cloud: 100 }),
    day('2026-01-03', { snow: 0, windMax: 15 }),
  ];
  const w = evaluateDay(days, 2, ELEV);
  assert.equal(w.status, 'chiusa');
  assert.ok(w.signals.some((s) => s.id === 'critical'));
  assert.deepEqual(w.loaded, ['E', 'SE', 'S']);
});

test('poca neve con vento: avviso sui versanti sottovento, chiusa se è il mio versante', () => {
  const days = [
    day('2026-01-01', { snow: 6, windMax: 30, transportDir: 0, transportHours: 6, tMin: -3 }),
    day('2026-01-02', { windMax: 15, tMin: -3 }),
    day('2026-01-03', { windMax: 15, tMin: -3 }),
  ];
  // condizioni "medie" (vento 30) → soglia 20 cm: 6 cm non bastano per la neve critica
  const any = evaluateDay(days, 2, ELEV);
  assert.equal(any.status, 'avvisi');
  assert.deepEqual(any.loaded, ['SE', 'S', 'SO']);
  const mine = evaluateDay(days, 2, ELEV, { aspects: ['S'] });
  assert.equal(mine.status, 'chiusa');
  const north = evaluateDay(days, 2, ELEV, { aspects: ['N'] });
  assert.equal(north.status, 'aperta');
});

test('neve fresca critica: la soglia dipende dalle condizioni (SLF)', () => {
  const calm = [day('d1', { snow: 25, tMin: -3, windMax: 10, cloud: 90 }), day('d2', { tMin: -3 }), day('d3', { tMin: -3 })];
  // favorevoli → soglia 30: 25 cm non è critica
  assert.ok(!evaluateDay(calm, 2, ELEV).signals.some((s) => s.id === 'critical'));
  const cold = [day('d1', { snow: 12, tMin: -12, tSnow: -12, cloud: 90 }), day('d2'), day('d3')];
  // sfavorevoli (freddo) → soglia 10
  assert.ok(evaluateDay(cold, 2, ELEV).signals.some((s) => s.id === 'critical'));
});

test('pioggia e notte senza rigelo chiudono la finestra', () => {
  const rain = [day('d1'), day('d2'), day('d3', { rain: 5, cloud: 10 })];
  assert.equal(evaluateDay(rain, 2, ELEV).status, 'chiusa');
  const warm = [day('d1'), day('d2'), day('d3', { tNightMin: 3, tMin: 3, tMax: 8, freezingMax: 2000 })];
  assert.ok(evaluateDay(warm, 2, ELEV).signals.some((s) => s.id === 'noRefreeze'));
});

test('meteo non buono senza segnali: nuvole o zero termico sopra la quota', () => {
  const cloudy = [day('d1'), day('d2'), day('d3', { cloud: 90 })];
  assert.equal(evaluateDay(cloudy, 2, ELEV).status, 'meteo');
  const warm = [day('d1'), day('d2'), day('d3', { freezingMax: 3200 })];
  assert.equal(evaluateDay(warm, 2, ELEV).status, 'meteo');
});

test('se metà dei modelli non è d\'accordo il segnale è "possibile"', () => {
  const days = [day('d1'), day('d2'), day('d3')];
  days[2].models.a.rain = 5;
  const w = evaluateDay(days, 2, ELEV);
  const s = w.signals.find((x) => x.id === 'rain');
  assert.equal(s.certainty, 'possibile');
  assert.equal(w.status, 'avvisi');
});

test('il bollettino ha la precedenza: grado 4 chiude, neve ventata dà i versanti', () => {
  const days = [day('d1'), day('d2'), day('d3')];
  const b4 = { max: 4, problems: [] };
  assert.equal(evaluateDay(days, 2, ELEV, { bulletin: b4 }).status, 'chiusa');
  const slab = {
    max: 2,
    problems: [{ type: 'wind_slab', where: 'sopra 2400 m', aspectList: ['N', 'NW'], elevation: { lowerBound: '2400' } }],
  };
  const w = evaluateDay(days, 2, ELEV, { bulletin: slab });
  assert.deepEqual(w.loaded, ['N', 'NO']);
  assert.equal(w.slabSource, 'bollettino');
  // sotto la quota del problema non vale
  assert.deepEqual(evaluateDay(days, 2, 2000, { bulletin: slab }).loaded, []);
});

test('quota del problema: limite del bosco = 2000 m', () => {
  assert.equal(problemAtElevation({ elevation: { upperBound: 'treeline' } }, 1800), true);
  assert.equal(problemAtElevation({ elevation: { upperBound: 'treeline' } }, 2500), false);
  assert.equal(problemAtElevation({ elevation: null }, 2500), true);
});

test('risposta reale Open-Meteo: una finestra per ogni giorno, senza errori', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/open-meteo-cervinia.json', import.meta.url)));
  const list = Array.isArray(fixture) ? fixture : [fixture];
  const s = summarizePoint(list[0], 2050);
  const ws = evaluateWindows({ past: [], days: s.days }, 2050);
  assert.equal(ws.length, s.days.length);
  for (const w of ws) assert.ok(['aperta', 'avvisi', 'chiusa', 'meteo', 'nd'].includes(w.status));
});
