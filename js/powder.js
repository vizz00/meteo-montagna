// Qualità della polvere: stima per giorno, dai dati di ogni modello (poi mediana).
// Non è una misura: dice quanto sarà bella la neve fresca, non se si può andare
// (per quello c'è la finestra buona in js/window.js).
//
// Si parte dalla neve caduta nelle ultime 48 ore (oggi pesa di più di ieri) e la si
// riduce se: era neve pesante (nevicata poco fredda), c'è stato vento forte, sole e
// caldo dopo la nevicata, zero termico sopra la quota, pioggia.

export const POWDER = {
  levels: [
    { id: 'ottima', min: 25, label: 'Ottima' },
    { id: 'buona', min: 12, label: 'Buona' },
    { id: 'discreta', min: 5, label: 'Discreta' },
    { id: 'no', min: -Infinity, label: 'Niente polvere' },
  ],
  yesterdayWeight: 0.6,
  windModerate: 25, // km/h in quota: neve lavorata
  windStrong: 40, // km/h: neve battuta o portata via
  rainMm: 1,
};

import { snowRatio } from './snow.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const median = (xs) => {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/** Leggerezza della neve dalla temperatura mentre nevica: 1 sotto −8 °C, 0.4 sopra −1 °C. */
export function lightness(tSnow) {
  if (tSnow == null) return 0.7;
  return clamp(0.4 + ((-1 - tSnow) / 7) * 0.6, 0.4, 1);
}

/** Punteggio (cm "equivalenti" di polvere buona) di un modello per il giorno `i` di `days`. */
export function modelScore(days, i, id, elev) {
  const d = days[i]?.models[id];
  if (!d) return null;
  const y = i > 0 ? days[i - 1].models[id] : null;
  const fresh = d.snow + (y ? y.snow * POWDER.yesterdayWeight : 0);
  if (fresh < 1) return 0;
  // Leggerezza media pesata sui cm caduti.
  const wSum = d.snow + (y ? y.snow * POWDER.yesterdayWeight : 0);
  const light = ((d.snow * lightness(d.tSnow)) + (y ? y.snow * POWDER.yesterdayWeight * lightness(y.tSnow) : 0)) / (wSum || 1);
  let f = light;
  const wind = Math.max(d.windMax ?? 0, y?.windMax ?? 0);
  if (wind >= POWDER.windStrong) f *= 0.4;
  else if (wind >= POWDER.windModerate) f *= 0.7;
  if ((d.rain ?? 0) >= POWDER.rainMm || (y?.rain ?? 0) >= POWDER.rainMm) return 0;
  if (d.freezingMax != null && d.freezingMax > elev + 200) f *= 0.3;
  else if (d.tMax != null && d.tMax > 1) f *= 0.4;
  // Primo sole dopo la nevicata: bella al mattino, poi si appesantisce sui versanti al sole.
  if ((d.cloud ?? 100) < 40 && (d.tMax ?? -10) > -3) f *= 0.8;
  return fresh * f;
}

/** Livello di polvere per ogni giorno di `days` (lista continua: passati + previsione). */
export function powderDays(days, elev, from = 0) {
  const out = days.slice(from).map((day, k) => {
    const i = from + k;
    const scores = Object.keys(day.models).map((id) => modelScore(days, i, id, elev)).filter((v) => v != null);
    const score = median(scores);
    if (score == null) return { date: day.date, level: null, score: null, ratio: null };
    const level = POWDER.levels.find((l) => score >= l.min);
    // Rapporto neve/acqua del giorno (es. 12 = 12:1): mediana dei modelli, dalla temperatura mentre nevica.
    const ratios = Object.values(day.models).filter((m) => m.snow >= 0.5 && m.tSnow != null).map((m) => snowRatio(m.tSnow));
    const ratio = median(ratios);
    return { date: day.date, level: level.id, label: level.label, score, ratio: ratio == null ? null : Math.round(ratio) };
  });
  // Il giorno dopo la nevicata il rapporto vale ancora, se la neve non è stata rovinata (livello diverso da "no").
  for (let k = 1; k < out.length; k++) {
    const d = out[k];
    const prev = out[k - 1];
    if (d.ratio == null && prev.ratio != null && d.level && d.level !== 'no') {
      d.ratio = prev.ratio;
      d.carried = true;
    }
  }
  return out;
}
