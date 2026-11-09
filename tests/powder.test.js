import { test } from 'node:test';
import assert from 'node:assert/strict';
import { powderDays, lightness } from '../js/powder.js';

const BASE = { snow: 0, rain: 0, windMax: 10, tSnow: -8, tMax: -5, freezingMax: 1500, cloud: 90 };
const day = (date, over = {}) => ({ date, models: { a: { ...BASE, ...over }, b: { ...BASE, ...over } } });
const ELEV = 2800;

test('neve fredda è più leggera di neve vicino a 0 °C', () => {
  assert.equal(lightness(-10), 1);
  assert.equal(lightness(0), 0.4);
  assert.ok(lightness(-4) > 0.4 && lightness(-4) < 1);
});

test('30 cm freddi senza vento: ottima', () => {
  const p = powderDays([day('d1'), day('d2', { snow: 30 })], ELEV);
  assert.equal(p[1].level, 'ottima');
});

test('stessa neve con vento forte: peggiore', () => {
  const p = powderDays([day('d1'), day('d2', { snow: 30, windMax: 50 })], ELEV);
  assert.equal(p[1].level, 'buona');
});

test('pioggia: niente polvere', () => {
  const p = powderDays([day('d1', { snow: 30 }), day('d2', { rain: 3 })], ELEV);
  assert.equal(p[1].level, 'no');
});

test('neve di ieri conta meno di quella di oggi', () => {
  const today = powderDays([day('d1'), day('d2', { snow: 15 })], ELEV)[1].score;
  const yest = powderDays([day('d1', { snow: 15 }), day('d2')], ELEV)[1].score;
  assert.ok(yest < today);
});

test('zero termico sopra la quota: neve pesante', () => {
  const p = powderDays([day('d1'), day('d2', { snow: 20, freezingMax: 3200 })], ELEV);
  assert.equal(p[1].level, 'discreta');
});
