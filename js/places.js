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
  cervinia: 'https://www.cervinia.it/webcam',
  champoluc: 'https://it.bergfex.com/champoluc/webcams/',
  alagna: 'https://monterosaski.eu/webcam',
};
// Pagine webcam delle località predefinite sulla mappa (da ricerca, per nome in minuscolo).
const WEBCAMS_BY_NAME = {
  "passo del nufenen / gries": "https://en.swisswebcams.ch/webcams/nufenen-pass",
  "passo san giacomo": "https://www.meteoblue.com/it/tempo/webcams/passo-san-giacomo_svizzera_2658833",
  "courmayeur": "https://www.courmayeur-montblanc.com/meteo-cam/",
  "la thuile": "https://www.lathuile.it/it/webcam",
  "pila": "https://pila.it/en/real-time/webcams/",
  "gressoney": "https://www.gressoneymonterosa.it/en/webcam",
  "cogne": "https://it.bergfex.com/cogne-gran-paradiso/webcams/c4735/",
  "valgrisenche": "https://www.bergfex.com/valgrisenche/webcams/",
  "rhêmes-notre-dame": "https://www.valdirhemes.net/webcam.htm",
  "colle del gran san bernardo": "https://letunnel.com/meteo/webcam/",
  "torgnon": "https://www.torgnon.org/en/web-cams/",
  "macugnaga": "https://macugnaga-monterosa.com/contenuti/325814/webcam",
  "formazza / riale": "https://www.distrettolaghi.it/en/webcams/riale-centro-fondo-valle-formazza",
  "devero": "https://www.meteoblue.com/it/tempo/webcams/alpe-devero_italia_3183231",
  "bardonecchia": "https://www.bardonecchiaski.com/en/live-info/webcam-in-bardonecchia",
  "sestriere": "https://www.vialattea.it/webcam/",
  "prali": "https://www.skiresort.com/en/ski-resort/prali/webcams/",
  "cesana / claviere": "https://www.webcamvialattea.it/",
  "ceresole reale": "https://www.pngp.it/webcam",
  "livigno": "https://www.livigno.eu/en/webcam",
  "bormio": "https://www.bormio.eu/en/live-info/webcams",
  "santa caterina valfurva": "https://www.santacaterina.it/webcam/",
  "passo dello stelvio": "https://passostelvio.eu/webcam/",
  "madesimo": "https://www.madesimo.eu/en/webcam/",
  "chiesa in valmalenco": "https://www.sondrioevalmalenco.it/it/webcam",
  "ponte di legno / tonale": "https://www.pontedilegnotonale.com/it/webcam/",
  "val bedretto (ossasco)": "https://www.meteoblue.com/it/tempo/webcams/bedretto_svizzera_2661582",
  "passo del sempione": "https://www.meteoblue.com/it/tempo/webcams/passo-del-sempione_svizzera_2658580",
  "passo del san gottardo": "https://www.meteoblue.com/it/tempo/webcams/passo-del-san-gottardo_svizzera_2658828",
  "antrona / cheggio": "https://www.distrettolaghi.it/it/webcams/cheggio-valle-antrona",
  "san bernardino": "https://sanbernardino-swissalps.com/live",
  "spluga / montespluga": "https://montespluga.panomax.com/",
  "maloja / val bregaglia": "https://www.skiresort.com/en/ski-holiday-in/maloja-796/webcams/",
  "foppolo / carona (orobie)": "https://foppolowebcam.it/",
  "val masino": "https://webcam.valtline.it/webcam-sasso-remenno",
  "zermatt": "https://www.matterhornparadise.ch/it/informazioni/webcams",
  "saas-fee": "https://www.saas-fee.ch/en/webcams",
  "verbier": "https://www.verbier.ch/en/practice/live/webcams/",
  "arolla": "https://www.myswitzerland.com/it-it/destinazioni/panoramas/arolla/",
  "fiesch / aletsch": "https://www.aletscharena.ch/en/here-now/live/webcams",
};
export function webcamUrl(place) {
  return place.webcam || WEBCAMS[place.id] || WEBCAMS_BY_NAME[place.name.toLowerCase()] || `https://www.google.com/search?q=${encodeURIComponent(`webcam ${place.name} neve`)}`;
}

export const WEBCAM_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="6.5"/><circle cx="12" cy="9" r="2.4"/><path d="M12 15.5V19M7.5 20h9"/></svg>';
