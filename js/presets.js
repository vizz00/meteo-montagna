// Località scialpinistiche/freeride proposte a tutti sulla mappa "Aggiungi un posto".
// Un tocco sul pallino le porta nel modulo con le quote già compilate (modificabili).
// Quote indicative (valle = paese, metà = zona di salita/impianti, cima = punto alto di riferimento):
// da controllare. Per aggiungerne una basta una riga: [nome, lat, lon, regione, valle, metà, cima].
const RAW = [
  // Valle d'Aosta
  ['Courmayeur', 45.797, 6.969, 'IT-23', 1220, 2200, 3466],
  ['La Thuile', 45.713, 6.95, 'IT-23', 1440, 2200, 2642],
  ['Pila', 45.685, 7.311, 'IT-23', 1800, 2400, 2700],
  ['Gressoney', 45.82, 7.82, 'IT-23', 1640, 2400, 3000],
  ['Cogne', 45.608, 7.356, 'IT-23', 1530, 2400, 3300],
  ['Valgrisenche', 45.6, 7.08, 'IT-23', 1660, 2500, 3100],
  ['Rhêmes-Notre-Dame', 45.5, 7.1, 'IT-23', 1700, 2500, 3200],
  ['Colle del Gran San Bernardo', 45.869, 7.17, 'IT-23', 1500, 2500, 3000],
  ['Torgnon', 45.8, 7.6, 'IT-23', 1500, 2200, 2700],
  // Piemonte
  ['Macugnaga', 45.97, 7.97, 'IT-21', 1330, 2200, 2800],
  ['Formazza / Riale', 46.4, 8.42, 'IT-21', 1730, 2400, 3000],
  ['Devero', 46.31, 8.26, 'IT-21', 1630, 2300, 2900],
  ['Bardonecchia', 45.08, 6.7, 'IT-21', 1300, 2200, 2800],
  ['Sestriere', 44.96, 6.88, 'IT-21', 2035, 2500, 2800],
  ['Prali', 44.9, 7.05, 'IT-21', 1450, 2300, 2900],
  ['Cesana / Claviere', 44.95, 6.8, 'IT-21', 1350, 2200, 2700],
  ['Ceresole Reale', 45.43, 7.23, 'IT-21', 1500, 2400, 3100],
  // Lombardia
  ['Livigno', 46.538, 10.136, 'IT-25', 1816, 2500, 3000],
  ['Bormio', 46.468, 10.37, 'IT-25', 1225, 2300, 3000],
  ['Santa Caterina Valfurva', 46.4, 10.5, 'IT-25', 1740, 2600, 3300],
  ['Passo dello Stelvio', 46.529, 10.453, 'IT-25', 2760, 3000, 3400],
  ['Madesimo', 46.43, 9.35, 'IT-25', 1550, 2300, 2900],
  ['Chiesa in Valmalenco', 46.26, 9.84, 'IT-25', 1000, 2000, 2800],
  ['Ponte di Legno / Tonale', 46.26, 10.5, 'IT-25', 1260, 2300, 3000],
  // Mete scialpinistiche entro ~3 ore da Legnano
  ['Val Bedretto (Ossasco)', 46.5, 8.51, 'CH', 1315, 2300, 2900],
  ['Passo del Sempione', 46.251, 8.033, 'CH', 2005, 2500, 3100],
  ['Passo del San Gottardo', 46.559, 8.561, 'CH', 2091, 2600, 2900],
  ['Passo San Giacomo', 46.45, 8.4, 'IT-21', 2000, 2500, 2900],
  ['Passo del Nufenen / Gries', 46.478, 8.386, 'CH', 2478, 2800, 3100],
  ['Alpe Veglia', 46.27, 8.2, 'IT-21', 1750, 2300, 2900],
  ['Antrona / Cheggio', 46.05, 8.17, 'IT-21', 1500, 2200, 2800],
  ['San Bernardino', 46.46, 9.18, 'CH', 1630, 2300, 3000],
  ['Spluga / Montespluga', 46.5, 9.33, 'IT-25', 1900, 2500, 3000],
  ['Maloja / Val Bregaglia', 46.4, 9.69, 'CH', 1800, 2500, 3000],
  ['Foppolo / Carona (Orobie)', 45.99, 9.74, 'IT-25', 1500, 2100, 2500],
  ['Val Masino', 46.25, 9.6, 'IT-25', 1000, 2000, 2800],
  // Vallese (Svizzera)
  ['Zermatt', 46.02, 7.749, 'CH', 1600, 2900, 3800],
  ['Saas-Fee', 46.11, 7.93, 'CH', 1800, 2900, 3500],
  ['Verbier', 46.096, 7.228, 'CH', 1500, 2500, 3300],
  ['Arolla', 46.02, 7.48, 'CH', 2000, 2800, 3200],
  ['Fiesch / Aletsch', 46.4, 8.13, 'CH', 1050, 2200, 2900],
];

export const PRESETS = RAW.map(([name, lat, lon, region, valle, meta, cima]) => ({
  name,
  lat,
  lon,
  region,
  elevations: { valle, meta, cima },
}));
