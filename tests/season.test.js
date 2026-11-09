import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentSeasonYear, seasonRange, dayRange, dailyFromHourly, avalDay, runs, weatherFacts, avalancheFacts, archiveUrl,
} from '../js/season.js';

test('stagione in corso e intervallo di date', () => {
  assert.equal(currentSeasonYear('2026-11-09'), 2026);
  assert.equal(currentSeasonYear('2027-03-01'), 2026);
  assert.equal(currentSeasonYear('2026-10-15'), 2026);
  assert.equal(currentSeasonYear('2026-09-30'), 2025);
  assert.deepEqual(seasonRange(2026, '2026-11-09'), { year: 2026, from: '2026-11-01', to: '2026-11-09', label: '2026-27', current: true });
  const past = seasonRange(2025, '2026-11-09');
  assert.equal(past.to, '2026-06-30');
  assert.equal(past.current, false);
  // a ottobre la nuova stagione non è ancora iniziata: un giorno solo, senza errori
  assert.equal(seasonRange(2026, '2026-10-10').to, '2026-11-01');
  assert.equal(dayRange('2026-02-27', '2026-03-02').join(','), '2026-02-27,2026-02-28,2026-03-01,2026-03-02');
});

test('indirizzo dell\'archivio Open-Meteo', () => {
  const u = new URL(archiveUrl({ lat: 45.936, lon: 7.631 }, 2800, '2025-11-01', '2026-06-30'));
  assert.equal(u.host, 'historical-forecast-api.open-meteo.com');
  assert.equal(u.searchParams.get('elevation'), '2800');
  assert.equal(u.searchParams.get('start_date'), '2025-11-01');
  assert.match(u.searchParams.get('hourly'), /snow_depth/);
});

// Estratto reale (Cervinia, 2800 m, 10/2/2026) ridotto a poche ore + un giorno caldo inventato.
function hourly() {
  const time = [];
  const temperature_2m = [];
  const precipitation = [];
  const freezing_level_height = [];
  const snow_depth = [];
  for (let h = 0; h < 24; h++) {
    time.push(`2026-02-10T${String(h).padStart(2, '0')}:00`);
    temperature_2m.push(-8);
    precipitation.push(h >= 18 ? 1 : 0); // 6 mm a −8 °C → circa 9 cm
    freezing_level_height.push(2100);
    snow_depth.push(h <= 12 ? 1.1 : 1.2);
  }
  for (let h = 0; h < 24; h++) {
    time.push(`2026-02-11T${String(h).padStart(2, '0')}:00`);
    temperature_2m.push(4);
    precipitation.push(h < 4 ? 1 : 0); // 4 mm di pioggia
    freezing_level_height.push(3400);
    snow_depth.push(1.15);
  }
  return { hourly: { time, temperature_2m, precipitation, freezing_level_height, snow_depth } };
}

test('da orario a giornaliero', () => {
  const [a, b] = dailyFromHourly(hourly(), 2800);
  assert.equal(a.date, '2026-02-10');
  assert.ok(a.newSnow > 8 && a.newSnow < 10, `neve ${a.newSnow}`);
  assert.equal(a.rain, 0);
  assert.equal(a.depth, 110); // alle 12
  assert.equal(a.freezingMax, 2100);
  assert.equal(b.newSnow, 0);
  assert.equal(b.rain, 4);
  assert.equal(b.tMax, 4);
  assert.equal(dailyFromHourly(null, 2800).length, 0);
});

test('valanghe di un giorno per micro-zona (file ratings + problems)', () => {
  const ratings = { maxDangerRatings: { 'IT-23-AO-07': 3, 'IT-23-AO-07:high': 3, 'IT-23-AO-07:low': 2 } };
  const problems = {
    avalancheProblems: {
      'IT-23-AO-07': ['wind_slab', 'persistent_weak_layers'],
      'IT-23-AO-07:high': ['wind_slab', 'persistent_weak_layers'],
      'IT-23-AO-07:low': [],
    },
  };
  assert.deepEqual(avalDay(ratings, problems, 'IT-23-AO-07'), {
    max: 3, high: 3, low: 2,
    problems: ['wind_slab', 'persistent_weak_layers'],
    problemsHigh: ['wind_slab', 'persistent_weak_layers'],
    problemsLow: [],
  });
  assert.equal(avalDay(ratings, problems, 'IT-23-AO-20'), null);
  assert.equal(avalDay(null, null, 'IT-23-AO-07'), null);
});

const mk = (list) => list.map((v, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, ...v }));

test('sequenze di giorni', () => {
  const d = mk([{ x: 1 }, { x: 1 }, { x: 0 }, { x: 1 }, { x: 1 }, { x: 1 }]);
  const r = runs(d, (v) => v.x === 1, 3);
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].from, r[0].to, r[0].length], ['2026-01-04', '2026-01-06', 3]);
});

test('fatti meteo: totale, nevicate, periodi secchi e caldi, pioggia', () => {
  const base = { rain: 0, freezingMax: 2000, depth: 50 };
  const list = [20, 15, 0, 0, 0, 0, 0, 0, 0, 0, 5].map((n) => ({ ...base, newSnow: n }));
  list[4] = { ...list[4], freezingMax: 3000 };
  list[5] = { ...list[5], freezingMax: 3100 };
  list[6] = { ...list[6], freezingMax: 3200, rain: 3 };
  list[1] = { ...list[1], depth: 80 };
  const f = weatherFacts(mk(list), 2800);
  assert.equal(f.total, 40);
  assert.equal(f.snowDays, 3);
  assert.equal(f.biggest[0].cm, 35);
  assert.equal(f.biggest[0].from, '2026-01-01');
  assert.equal(f.dry.length, 1);
  assert.equal(f.dry[0].length, 8);
  assert.equal(f.warm.length, 1);
  assert.deepEqual([f.warm[0].from, f.warm[0].to], ['2026-01-05', '2026-01-07']);
  assert.equal(f.rainDays.length, 1);
  assert.equal(f.maxDepth.depth, 80);
  assert.equal(f.last.date, '2026-01-11');
});

test('fatti valanghe: strati deboli persistenti, quando compaiono e quanto restano', () => {
  const days = mk(Array(6).fill({}));
  const p = (list, low = list) => ({ max: 3, high: 3, low: 2, problems: list, problemsHigh: list, problemsLow: low });
  const byDay = {
    '2026-01-01': p(['new_snow']),
    '2026-01-02': p(['wind_slab', 'persistent_weak_layers'], []),
    '2026-01-03': p(['persistent_weak_layers'], []),
    '2026-01-04': null, // nessun bollettino
    '2026-01-05': { ...p(['persistent_weak_layers']), max: 4 },
  };
  const f = avalancheFacts(days, byDay);
  assert.equal(f.nBulletins, 4);
  assert.equal(f.pwlDays, 3);
  assert.equal(f.pwl.length, 2);
  assert.deepEqual([f.pwl[0].from, f.pwl[0].to, f.pwl[0].length, f.pwl[0].onlyHigh], ['2026-01-02', '2026-01-03', 2, true]);
  assert.equal(f.pwl[1].onlyHigh, false);
  assert.equal(f.top.date, '2026-01-05');
  assert.equal(f.firstBulletin, '2026-01-01');
  assert.equal(f.count.new_snow, 1);
});
