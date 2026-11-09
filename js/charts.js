// Grafici SVG del dettaglio posto: una linea spessa con la mediana dei modelli
// e linee sottili per ogni modello. Nessuna libreria esterna.

const W = 400;
const PAD = { l: 38, r: 8, t: 10, b: 34 };
const WEEK = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function niceStep(range, target = 4) {
  const raw = range / target;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

function path(values, x, y) {
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v == null || Number.isNaN(v)) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

// Righe verticali a mezzanotte ed etichette dei giorni a mezzogiorno.
function dayAxis(times, x, top, bottom, labels = true) {
  let out = '';
  times.forEach((t, i) => {
    const hh = t.slice(11, 13);
    if (hh === '00') out += `<line class="grid-day" x1="${x(i)}" x2="${x(i)}" y1="${top}" y2="${bottom}"/>`;
    if (labels && hh === '12') {
      const d = new Date(`${t.slice(0, 10)}T12:00:00`);
      const we = d.getDay() === 0 || d.getDay() === 6;
      out += `<text class="ax-day${we ? ' we' : ''}" x="${x(i)}" y="${bottom + 14}" text-anchor="middle">${WEEK[d.getDay()]}</text>`;
      out += `<text class="ax-num${we ? ' we' : ''}" x="${x(i)}" y="${bottom + 28}" text-anchor="middle">${d.getDate()}</text>`;
    }
  });
  return out;
}

/**
 * Grafico a linee.
 * opts: { key, unit, min, max, ref: {value, label}, bands: [{from,to,label,cls}], arrows: [deg], highlight, labels }
 */
export function lineChart(series, opts) {
  const H = opts.height || 200;
  const { times, byModel, median } = series;
  const n = times.length;
  const ids = Object.keys(byModel);
  const all = [...ids.flatMap((id) => byModel[id][opts.key]), ...median[opts.key]].filter((v) => v != null);
  if (!all.length) return '<p class="muted">Dato non disponibile per questi modelli.</p>';
  let lo = opts.min ?? Math.min(...all);
  let hi = opts.max ?? Math.max(...all);
  if (opts.ref) {
    lo = Math.min(lo, opts.ref.value);
    hi = Math.max(hi, opts.ref.value);
  }
  if (opts.minSpan && hi - lo < opts.minSpan) hi = lo + opts.minSpan;
  const st = niceStep(hi - lo || 1);
  lo = opts.min ?? Math.floor(lo / st) * st;
  hi = Math.ceil(hi / st) * st;
  if (hi === lo) hi = lo + st;
  const bottom = H - PAD.b;
  const top = opts.arrows ? PAD.t + 14 : PAD.t; // spazio per le frecce del vento sopra il grafico
  const x = (i) => PAD.l + (i / Math.max(1, n - 1)) * (W - PAD.l - PAD.r);
  const y = (v) => top + (1 - (v - lo) / (hi - lo)) * (bottom - top);

  let svg = '';
  for (const b of opts.bands || []) {
    const y1 = y(Math.min(hi, b.to));
    const y2 = y(Math.max(lo, b.from));
    if (y2 <= y1) continue;
    svg += `<rect class="band ${b.cls}" x="${PAD.l}" y="${y1}" width="${W - PAD.l - PAD.r}" height="${y2 - y1}"/>`;
    if (y2 - y1 > 12) svg += `<text class="band-l" x="${PAD.l + 4}" y="${y1 + 11}">${b.label}</text>`;
  }
  for (let v = lo; v <= hi + 1e-9; v += st) {
    svg += `<line class="grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text class="ax-y" x="${PAD.l - 4}" y="${y(v) + 3}" text-anchor="end">${opts.fmt ? opts.fmt(v) : Math.round(v)}</text>`;
  }
  svg += dayAxis(times, x, top, bottom);
  if (opts.ref) {
    svg += `<line class="ref" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(opts.ref.value)}" y2="${y(opts.ref.value)}"/>`;
    svg += `<text class="ref-l" x="${W - PAD.r - 2}" y="${y(opts.ref.value) - 4}" text-anchor="end">${esc(opts.ref.label)}</text>`;
  }
  for (const id of ids) {
    if (id === opts.highlight) continue;
    svg += `<path class="ln-model" d="${path(byModel[id][opts.key], x, y)}"/>`;
  }
  if (opts.highlight && byModel[opts.highlight]) {
    svg += `<path class="ln-median dim" d="${path(median[opts.key], x, y)}"/>`;
    svg += `<path class="ln-hl" d="${path(byModel[opts.highlight][opts.key], x, y)}"/>`;
  } else {
    svg += `<path class="ln-median" d="${path(median[opts.key], x, y)}"/>`;
  }
  if (opts.arrows) {
    opts.arrows.forEach((deg, i) => {
      if (deg == null || times[i].slice(11, 13) % 12 !== 0) return;
      // La freccia indica dove va il vento (provenienza + 180°).
      svg += `<g transform="translate(${x(i)},${PAD.t + 4}) rotate(${deg + 180})"><path class="arrow" d="M0,-5 L3,2 L0,0.5 L-3,2 Z"/></g>`;
    });
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || '')}">${svg}</svg>`;
}

/** Striscia sotto ai grafici: precipitazione (neve / pioggia) a barre e nuvolosità come area. */
export function precipStrip(series, { highlight } = {}) {
  const H = 70;
  const { times, byModel, median } = series;
  const src = highlight && byModel[highlight] ? byModel[highlight] : median;
  const n = times.length;
  const bottom = H - 6;
  const top = 4;
  const x = (i) => PAD.l + (i / Math.max(1, n - 1)) * (W - PAD.l - PAD.r);
  const maxP = Math.max(4, ...src.snow.map((s, i) => (s ?? 0) / 1 + (src.rain[i] ?? 0)));
  const yP = (v) => bottom - (v / maxP) * (bottom - top);
  const yC = (v) => bottom - (v / 100) * (bottom - top);
  const bw = Math.max(1.5, (W - PAD.l - PAD.r) / n - 0.8);
  let svg = '';
  // nuvolosità
  const cl = src.cloud;
  let area = '';
  cl.forEach((v, i) => {
    if (v == null) return;
    area += `${area ? 'L' : 'M'}${x(i).toFixed(1)},${yC(v).toFixed(1)}`;
  });
  const lastI = cl.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0);
  if (area && lastI.length) svg += `<path class="cloud-area" d="${area}L${x(lastI.at(-1))},${bottom}L${x(lastI[0])},${bottom}Z"/>`;
  src.snow.forEach((s, i) => {
    const sn = s ?? 0; // cm di neve
    const rn = src.rain[i] ?? 0; // mm di pioggia
    if (sn > 0.05) svg += `<rect class="bar-snow" x="${x(i) - bw / 2}" y="${yP(sn)}" width="${bw}" height="${bottom - yP(sn)}"/>`;
    if (rn > 0.1) svg += `<rect class="bar-rain" x="${x(i) - bw / 2}" y="${yP(sn + rn)}" width="${bw}" height="${yP(sn) - yP(sn + rn)}"/>`;
  });
  svg += dayAxis(times, x, top, bottom, false);
  return `<svg class="chart strip" viewBox="0 0 ${W} ${H}" role="img" aria-label="Precipitazioni e nuvolosità">${svg}</svg>`;
}
