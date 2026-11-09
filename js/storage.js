// Preferenze salvate nel browser (localStorage): nessun account.
const KEY = 'mm.prefs.v1';

const DEFAULTS = {
  favorites: ['cervinia', 'champoluc', 'alagna'],
  band: 'meta',
  showAll: false,
  aspects: {}, // versanti scelti per posto: { [id]: ['N', 'NE'] }
  sort: 'mio', // 'mio' | 'd1_5' | 'd6_10'
  chart: 'snowTotal', // grafico scelto nel dettaglio
  chartModel: '', // '' = tutti (mediana), altrimenti id del modello
};

export function loadPrefs() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ignorato */
  }
}
