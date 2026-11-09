// Preferenze salvate nel browser (localStorage): nessun account.
const KEY = 'mm.prefs.v1';

const DEFAULTS = {
  favorites: ['cervinia', 'champoluc', 'alagna'],
  band: 'meta',
  showAll: false,
  aspects: {}, // versanti scelti per posto: { [id]: ['N', 'NE'] }
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
