// "Finestra buona": i giorni in cui il meteo è buono per uscire (sole, poco vento,
// limite neve sotto la quota) e nessun segnale d'allarme di nivologia è scattato.
//
// Calcoli puri (nessun DOM, nessuna rete), provati con `node --test`.
// Le regole e le soglie vengono da:
// - SLF, "Achtung Lawinen!" (2022): neve fresca critica in 3 giorni, vento forte > 40 km/h,
//   lastroni da vento critici per 1-3 giorni, pioggia, riscaldamento, rigelo.
// - EAWS, problemi valanghivi tipici; avalanche.report, i 10 Gefahrenmuster (gm.3, gm.6, gm.10).
// L'app non dà un voto: dice quali condizioni sono rispettate e quali segnali sono scattati.
// Il bollettino ufficiale, quando c'è, ha sempre l'ultima parola.

import { TRANSPORT_WIND_KMH } from './snow.js';

export const RULES = {
  lookbackDays: 3, // neve fresca sommata su 3 giorni (oggi compreso)
  // Neve fresca critica SLF (cm): limite basso di ogni intervallo, per prudenza.
  critical: { sfavorevoli: 10, medie: 20, favorevoli: 30 },
  strongWind: 40, // km/h: "vento forte" SLF, condizioni sfavorevoli
  moderateWind: 20, // km/h: sotto questo il vento è debole (condizioni favorevoli)
  coldUnfavorable: -7, // °C mentre nevica: freddo che rende sfavorevole la nevicata (SLF: −5/−10)
  transportWind: TRANSPORT_WIND_KMH, // km/h: vento che sposta la neve soffice
  softSnow: 5, // cm in 3 giorni: c'è neve soffice da spostare
  rainMm: 2, // mm di pioggia alla quota in un giorno
  warmingSnow: 10, // cm caduti nei 2 giorni prima del primo sole
  sunnyCloud: 40, // % nuvolosità diurna sotto cui il giorno è "sereno"
  okWind: 30, // km/h: vento in quota accettabile per uscire
  agree: 0.5, // quota di modelli perché un segnale sia "sì"
  maybe: 0.25, // quota di modelli perché un segnale sia "possibile"
};

export const SECTORS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

const sectorIndex = (deg) => Math.round((((deg % 360) + 360) % 360) / 45) % 8;

/** Versanti sottovento (caricati) per un vento che arriva da `deg`: il settore opposto e i due accanto. */
export function leeSectors(deg) {
  if (deg == null) return [];
  const c = sectorIndex(deg + 180);
  return [c - 1, c, c + 1].map((i) => SECTORS[(i + 8) % 8]);
}

/** Media circolare di direzioni in gradi. */
export function meanDirection(degs) {
  const v = degs.filter((d) => d != null);
  if (!v.length) return null;
  let x = 0;
  let y = 0;
  for (const d of v) {
    x += Math.sin((d * Math.PI) / 180);
    y += Math.cos((d * Math.PI) / 180);
  }
  return (((Math.atan2(x, y) * 180) / Math.PI) + 360) % 360;
}

// Esposizioni del bollettino (inglese EAWS) → settori italiani.
const EN_TO_IT = { N: 'N', NE: 'NE', E: 'E', SE: 'SE', S: 'S', SW: 'SO', W: 'O', NW: 'NO' };

const boundM = (v) => (v === 'treeline' ? 2000 : v == null || v === '' ? null : Number(v));

/** Il problema del bollettino riguarda questa quota? */
export function problemAtElevation(problem, elev) {
  const lo = boundM(problem.elevation?.lowerBound);
  const up = boundM(problem.elevation?.upperBound);
  if (lo != null && elev < lo) return false;
  if (up != null && elev > up) return false;
  return true;
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const median = (xs) => {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/** Valuta un modello per il giorno `index` della lista continua `days` (passati + previsione). */
function evaluateModel(days, index, id, elev) {
  const today = days[index].models[id];
  if (!today) return null;
  const from = Math.max(0, index - RULES.lookbackDays + 1);
  const span = days.slice(from, index + 1).map((d) => d.models[id]).filter(Boolean);
  const before = days.slice(Math.max(0, index - 2), index).map((d) => d.models[id]).filter(Boolean);

  const snow3 = sum(span.map((m) => m.snow));
  const wind3 = Math.max(...span.map((m) => m.windMax ?? 0));
  // Freddo durante la nevicata (SLF: sotto −5/−10 °C, soprattutto a inizio nevicata).
  const tSnow3 = Math.min(...span.map((m) => (m.snow > 0 ? m.tSnow ?? m.tMin ?? 99 : 99)));
  const conditions = wind3 >= RULES.strongWind || tSnow3 <= RULES.coldUnfavorable
    ? 'sfavorevoli'
    : wind3 >= RULES.moderateWind ? 'medie' : 'favorevoli';
  const threshold = RULES.critical[conditions];

  // Lastroni: neve soffice negli ultimi 3 giorni e vento che la sposta.
  const windy = span.filter((m) => (m.windMax ?? 0) >= RULES.transportWind && m.transportDir != null);
  const transport = windy.sort((a, b) => b.windMax - a.windMax)[0] || null;
  const windSlab = snow3 >= RULES.softSnow && !!transport;

  const snowBefore = sum(before.map((m) => m.snow));
  const sunny = today.cloud != null && today.cloud < RULES.sunnyCloud;
  const freezingOk = today.freezingMax != null ? today.freezingMax < elev : today.tMax != null && today.tMax <= 1;

  return {
    snow3,
    wind3,
    conditions,
    threshold,
    critical: snow3 >= threshold,
    windSlab,
    transportDir: transport?.transportDir ?? null,
    transportSpeed: transport?.windMax ?? null,
    rain: (today.rain ?? 0) >= RULES.rainMm,
    firstSun: snowBefore >= RULES.warmingSnow && sunny && (today.tMax ?? -99) >= 0,
    noRefreeze:
      today.tNightMin != null && (today.tNightMin > 2 || (today.tNightMin > 0 && (today.nightCloud ?? 0) >= 60)),
    sunny,
    calm: today.windMax != null && today.windMax < RULES.okWind,
    freezingOk,
    cloud: today.cloud,
    windMax: today.windMax,
    freezingMax: today.freezingMax,
  };
}

function share(evals, key) {
  const n = evals.length;
  const k = evals.filter((e) => e[key]).length;
  if (!n || !k) return null;
  const f = k / n;
  if (f >= RULES.agree) return 'sì';
  if (f >= RULES.maybe) return 'possibile';
  return null;
}

const round5 = (x) => Math.round(x / 5) * 5;
const cm = (x) => (x < 10 ? Math.round(x) : round5(x));

/**
 * Finestra per il giorno `index` di `days` (lista continua: giorni passati + previsione).
 * opzioni:
 *  - aspects: versanti scelti dall'utente per il posto (es. ['N','NE']); se vuoto vale per versante
 *  - bulletin: riassunto del bollettino di quel giorno (summarizeBulletin) o null
 * Restituisce { status, conditions, signals, loaded, closedOn, snow3 }.
 * status: 'aperta' | 'avvisi' | 'chiusa' | 'meteo' (meteo non buono) | 'nd'
 */
export function evaluateDay(days, index, elev, { aspects = [], bulletin = null } = {}) {
  const ids = Object.keys(days[index]?.models || {});
  const evals = ids.map((id) => evaluateModel(days, index, id, elev)).filter(Boolean);
  if (!evals.length) return { status: 'nd', conditions: [], signals: [], loaded: [], closedOn: [], snow3: null };

  const snow3 = median(evals.map((e) => e.snow3));
  const signals = [];
  const add = (id, level, certainty, text, source) => certainty && signals.push({ id, level, certainty, text, source });

  // 1. Neve fresca critica (SLF).
  const crit = share(evals, 'critical');
  if (crit) {
    const cond = median(evals.filter((e) => e.critical).map((e) => e.threshold));
    const condName = Object.keys(RULES.critical).find((k) => RULES.critical[k] === cond) || '';
    add('critical', 'chiusa', crit, `${cm(snow3)} cm di neve fresca in 3 giorni: oltre la soglia critica (${cond} cm con condizioni ${condName})`, 'SLF');
  }

  // 2. Lastroni da vento: versanti sottovento.
  let loaded = [];
  let slabSource = null;
  const slabProblem = bulletin?.problems?.find((p) => p.type === 'wind_slab' && problemAtElevation(p, elev));
  if (slabProblem) {
    loaded = slabProblem.aspectList.length ? slabProblem.aspectList.map((a) => EN_TO_IT[a] || a) : [...SECTORS];
    slabSource = 'bollettino';
  }
  const slab = share(evals, 'windSlab');
  if (slab && !slabSource) {
    const dir = meanDirection(evals.filter((e) => e.windSlab).map((e) => e.transportDir));
    loaded = leeSectors(dir);
    slabSource = 'modelli';
    const speed = median(evals.filter((e) => e.windSlab).map((e) => e.transportSpeed));
    const from = SECTORS[sectorIndex(dir)];
    add('windSlab', 'versanti', slab, `neve soffice e vento da ${from} fino a ${Math.round(speed)} km/h negli ultimi 3 giorni: accumuli probabili sui versanti ${loaded.join(', ')}`, 'SLF, gm.6');
  } else if (slabSource) {
    add('windSlab', 'versanti', 'sì', `bollettino: neve ventata ${slabProblem.where}${loaded.length < 8 ? `, versanti ${loaded.join(', ')}` : ', tutte le esposizioni'}`, 'bollettino');
  }

  // 3. Pioggia su neve.
  add('rain', 'chiusa', share(evals, 'rain'), 'pioggia alla quota: la neve si appesantisce e perde coesione', 'SLF, gm.3');

  // 4. Niente rigelo notturno.
  add('noRefreeze', 'chiusa', share(evals, 'noRefreeze'), 'notte sopra 0 °C: niente rigelo, neve molle già dal mattino', 'SLF, gm.10');

  // 5. Primo sole forte dopo una nevicata.
  add('firstSun', 'avviso', share(evals, 'firstSun'), 'primo giorno di sole dopo la nevicata: meglio il mattino, attenzione ai versanti al sole', 'SLF');

  // 6. Bollettino ufficiale.
  if (bulletin?.max != null) {
    if (bulletin.max >= 4) add('danger', 'chiusa', 'sì', `bollettino: pericolo ${bulletin.max}`, 'bollettino');
    else if (bulletin.max === 3) add('danger', 'avviso', 'sì', 'bollettino: pericolo 3 marcato', 'bollettino');
    const pwl = bulletin.problems?.find((p) => p.type === 'persistent_weak_layers' && problemAtElevation(p, elev));
    if (pwl) add('pwl', 'avviso', 'sì', `bollettino: strati deboli persistenti ${pwl.where}${pwl.aspects ? `, ${pwl.aspects}` : ''}`, 'bollettino');
    const wet = bulletin.problems?.find((p) => p.type === 'wet_snow' && problemAtElevation(p, elev));
    if (wet) add('wet', 'avviso', 'sì', `bollettino: neve bagnata ${wet.where}${wet.period ? `, ${wet.period.toLowerCase()}` : ''}`, 'bollettino');
  }

  // Condizioni meteo per uscire.
  const med = (k) => median(evals.map((e) => e[k]));
  const conditions = [
    { id: 'sun', label: 'sole', ok: share(evals, 'sunny') === 'sì', text: `nuvole ${Math.round(med('cloud') ?? 0)}%` },
    { id: 'calm', label: 'vento debole', ok: share(evals, 'calm') === 'sì', text: `vento in quota ${Math.round(med('windMax') ?? 0)} km/h` },
    {
      id: 'freezing',
      label: 'zero termico sotto la quota',
      ok: share(evals, 'freezingOk') === 'sì',
      text: med('freezingMax') != null ? `zero termico ${Math.round(med('freezingMax') / 100) * 100} m` : 'zero termico n.d.',
    },
    { id: 'fresh', label: 'neve recente', ok: snow3 >= RULES.softSnow, bonus: true, text: `${cm(snow3)} cm in 3 giorni` },
  ];

  // Versanti chiusi dai lastroni: se l'utente ha scelto i suoi versanti, contano solo quelli.
  const closedOn = loaded.filter((s) => !aspects.length || aspects.includes(s));
  const slabSignal = signals.find((s) => s.id === 'windSlab');
  if (slabSignal) {
    if (aspects.length && closedOn.length) slabSignal.level = slabSignal.certainty === 'sì' ? 'chiusa' : 'avviso';
    else if (aspects.length) slabSignal.level = 'info';
    else slabSignal.level = 'avviso';
  }

  const weatherOk = conditions.filter((c) => !c.bonus).every((c) => c.ok);
  let status;
  if (signals.some((s) => s.level === 'chiusa' && s.certainty === 'sì')) status = 'chiusa';
  else if (!weatherOk) status = 'meteo';
  else if (signals.some((s) => s.level === 'chiusa' || s.level === 'avviso')) status = 'avvisi';
  else status = 'aperta';

  return { status, conditions, signals, loaded, slabSource, closedOn, snow3 };
}

export const STATUS_LABEL = {
  aperta: 'Finestra buona',
  avvisi: 'Buona, con avvisi',
  chiusa: 'Chiusa',
  meteo: 'Meteo non buono',
  nd: 'n.d.',
};

/** Finestre per tutti i giorni di previsione di un riassunto { past, days }. */
export function evaluateWindows(summary, elev, { aspects = [], bulletinFor = () => null } = {}) {
  const all = [...(summary.past || []), ...summary.days];
  const offset = (summary.past || []).length;
  return summary.days.map((d, i) => evaluateDay(all, offset + i, elev, { aspects, bulletin: bulletinFor(d.date) }));
}
