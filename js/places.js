// Posti iniziali e quote (dal brief di progetto, 9/11/2026).
// Per aggiungere un posto basta aggiungere un oggetto a questa lista.
// avalancheZone: micro-zona EAWS del bollettino valanghe (ricavata dai confini ufficiali
// regions.avalanches.org nel punto lat/lon). Se manca, l'app la calcola da lat/lon.
export const PLACES = [
  {
    id: 'cervinia',
    name: 'Cervinia',
    lat: 45.936,
    lon: 7.631,
    elevations: { valle: 2050, meta: 2800, cima: 3480 },
    cimaLabel: 'Plateau Rosa',
    region: 'IT-23',
    avalancheZone: 'IT-23-AO-20',
    avalancheZoneName: 'D - Cervinia e alta Valpelline',
    wepowder: 'breuil-cervinia#testa-grigia',
  },
  {
    id: 'champoluc',
    name: 'Champoluc',
    lat: 45.83,
    lon: 7.727,
    elevations: { valle: 1570, meta: 2400, cima: 3000 },
    region: 'IT-23',
    avalancheZone: 'IT-23-AO-07',
    avalancheZoneName: "B - Media Val d'Ayas Brusson",
    wepowder: 'champoluc#bettaforca',
  },
  {
    id: 'alagna',
    name: 'Alagna',
    lat: 45.854,
    lon: 7.938,
    elevations: { valle: 1190, meta: 2200, cima: 3275 },
    cimaLabel: 'Punta Indren',
    region: 'IT-21',
    avalancheZone: 'IT-21-VB-01',
    avalancheZoneName: 'Alpi Pennine di confine',
    wepowder: 'alagna-valsesia#punta-indren',
  },
];

export const BANDS = [
  { id: 'valle', label: 'Valle' },
  { id: 'meta', label: 'Metà' },
  { id: 'cima', label: 'Cima' },
];

export const REGIONS = {
  'IT-23': { name: "Valle d'Aosta", avalancheUrl: 'https://bollettini.aineva.it/', avalancheSource: 'AINEVA' },
  'IT-21': { name: 'Piemonte', avalancheUrl: 'https://bollettini.aineva.it/', avalancheSource: 'AINEVA' },
  'IT-25': { name: 'Lombardia', avalancheUrl: 'https://bollettini.aineva.it/', avalancheSource: 'AINEVA' },
  CH: { name: 'Svizzera', avalancheUrl: 'https://www.slf.ch/it/bollettino-valanghe-e-situazione-nivologica/', avalancheSource: 'SLF' },
};

// Link esterni centrati sul posto (siti senza dati aperti).
export function externalLinks(place) {
  const { lat, lon } = place;
  return [
    { label: 'Meteoblue', url: `https://www.meteoblue.com/it/tempo/settimana/${lat.toFixed(3)}N${lon.toFixed(3)}E` },
    { label: 'Windy', url: `https://www.windy.com/${lat}/${lon}?${lat},${lon},11` },
    // Pagina WePowder della località se nota, altrimenti la mappa delle previsioni.
    { label: 'WePowder', url: place.wepowder ? `https://wepowder.com/en/villages/${place.wepowder}` : 'https://wepowder.com/en/forecast' },
  ];
}

// Pagine webcam verificate per i posti principali; per gli altri si cerca "webcam <nome>".
const WEBCAMS = {
  cervinia: 'https://it.bergfex.com/breuil-cervinia/webcams/',
  champoluc: 'https://it.bergfex.com/champoluc/webcams/',
  alagna: 'https://monterosaski.eu/webcam',
};
export function webcamUrl(place) {
  return place.webcam || WEBCAMS[place.id] || `https://www.google.com/search?q=${encodeURIComponent(`webcam ${place.name} neve`)}`;
}

export const WEBCAM_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="6.5"/><circle cx="12" cy="9" r="2.4"/><path d="M12 15.5V19M7.5 20h9"/></svg>';
