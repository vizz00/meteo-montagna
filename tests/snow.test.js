import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  snowRatio, snowFraction, hourlySnowCm, summarizePoint, rangeText, compass, nextSnowfall, median,
} from '../js/snow.js';

// Risposta reale Open-Meteo del 9/11/2026: Cervinia a 2050 m e 3480 m, 6 modelli, 7 giorni.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/open-meteo-cervinia.json', import.meta.url)));

test('rapporto neve/acqua: 10:1 a 0 °C, 15:1 sotto −8 °C', () => {
  assert.equal(snowRatio(0), 10);
  assert.equal(snowRatio(3), 10);
  assert.equal(snowRatio(-8), 15);
  assert.equal(snowRatio(-20), 15);
  assert.equal(snowRatio(-4), 12.5);
});

test('frazione neve con zero termico: neve sopra il limite, pioggia sotto', () => {
  // zero termico 2500 → limite neve 2200
  assert.equal(snowFraction(2500, 0, 2500), 1);
  assert.equal(snowFraction(1800, 5, 2500), 0);
  assert.ok(snowFraction(2200, 1, 2500) > 0 && snowFraction(2200, 1, 2500) < 1);
});

test('frazione neve senza zero termico usa la temperatura', () => {
  assert.equal(snowFraction(3000, -3, null), 1);
  assert.equal(snowFraction(1000, 6, null), 0);
});

test('1 mm a −8 °C sopra il limite = 1,5 cm', () => {
  assert.equal(hourlySnowCm(3000, 1, -8, 1500), 1.5);
  assert.equal(hourlySnowCm(3000, 0, -8, 1500), 0);
  assert.equal(hourlySnowCm(3000, null, -8, 1500), 0);
});

test('riassunto giornaliero sui dati reali', () => {
  const low = summarizePoint(fixture[0], 2050);
  const high = summarizePoint(fixture[1], 3480);
  assert.equal(high.days.length, 7);
  // ICON-2I copre circa 3 giorni, MeteoSwiss CH2 circa 5: non devono comparire oltre.
  assert.ok(high.days[0].models.italia_meteo_arpae_icon_2i);
  assert.ok(!high.days[6].models.italia_meteo_arpae_icon_2i);
  // Il totale usa solo i modelli che coprono tutti i 7 giorni.
  assert.ok(!high.total.models.includes('italia_meteo_arpae_icon_2i'));
  assert.ok(high.total.min <= high.total.median && high.total.median <= high.total.max);
  // In cima nevica più che in valle.
  assert.ok(high.total.median > low.total.median);
  // ECMWF non dà lo zero termico, ma il giorno ha comunque un valore dagli altri modelli.
  assert.equal(high.days[0].models.ecmwf_ifs025.freezingMax, null);
  assert.ok(high.days[0].freezingMax > 0);
  assert.ok(high.days[0].wind.speed > 0);
});

test('prossima nevicata', () => {
  const s = summarizePoint(fixture[1], 3480);
  const next = nextSnowfall([{ place: { name: 'Cervinia' }, summary: s }]);
  assert.ok(next);
  assert.ok(next.best.max >= next.best.min);
});

test('testi', () => {
  assert.equal(rangeText({ min: 2.2, max: 13 }), '2–15');
  assert.equal(rangeText({ min: 0.1, max: 0.3 }), '0');
  assert.equal(rangeText(null), 'n.d.');
  assert.equal(compass(0), 'N');
  assert.equal(compass(315), 'NO');
  assert.equal(compass(200), 'S');
  assert.equal(median([3, 1, 2, null]), 2);
});
