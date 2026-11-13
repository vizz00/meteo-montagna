// Località scialpinistiche/freeride proposte a tutti sulla mappa "Aggiungi un posto".
// Un tocco sul pallino le porta nel modulo con le quote già compilate (modificabili).
// Quote indicative (valle = paese, metà = zona di salita/impianti, cima = punto alto di riferimento):
// da controllare. Per aggiungerne una basta una riga: [nome, lat, lon, regione, valle, metà, cima].
const RAW = [
  // Valle d'Aosta
  ['Cheneil', 45.8643, 7.6437, 'IT-23', 2105, 2600, 3000],
  ['Crévacol', 45.8302, 7.151, 'IT-23', 1650, 2000, 2900],
  ['Courmayeur', 45.797, 6.969, 'IT-23', 1220, 2200, 3466],
  ['La Thuile', 45.713, 6.95, 'IT-23', 1440, 2200, 2642],
  ['Pila', 45.685, 7.311, 'IT-23', 1800, 2400, 2700],
  ['Gressoney', 45.8296, 7.8241, 'IT-23', 1640, 2400, 3000],
  ['Cogne', 45.608, 7.356, 'IT-23', 1530, 2400, 3300],
  ['Valgrisenche', 45.634, 7.063, 'IT-23', 1660, 2500, 3100],
  ['Rhêmes-Notre-Dame', 45.572, 7.116, 'IT-23', 1700, 2500, 3200],
  ['Colle del Gran San Bernardo', 45.869, 7.17, 'IT-23', 1500, 2500, 3000],
  ['Torgnon', 45.8235, 7.57, 'IT-23', 1500, 2200, 2700],
  // Piemonte
  ['Macugnaga', 45.97, 7.97, 'IT-21', 1330, 2200, 2800],
  ['Formazza / Riale', 46.4215, 8.415, 'IT-21', 1730, 2400, 3000],
  ['Devero', 46.3146, 8.2595, 'IT-21', 1630, 2300, 2900],
  ['Bardonecchia', 45.08, 6.7, 'IT-21', 1300, 2200, 2800],
  ['Sestriere', 44.96, 6.88, 'IT-21', 2035, 2500, 2800],
  ['Prali', 44.9, 7.05, 'IT-21', 1450, 2300, 2900],
  ['Cesana / Claviere', 44.95, 6.8, 'IT-21', 1350, 2200, 2700],
  ['Ceresole Reale', 45.43, 7.23, 'IT-21', 1500, 2400, 3100],
  ['Limone Piemonte', 44.2006, 7.5755, 'IT-21', 1010, 1700, 2050],
  ['Colle di Tenda', 44.1495, 7.56, 'IT-21', 1870, 2100, 2400],
  ['Prato Nevoso', 44.2467, 7.7733, 'IT-21', 1500, 1800, 2100],
  // Lombardia
  ['Livigno', 46.538, 10.136, 'IT-25', 1816, 2500, 3000],
  ['Bormio', 46.468, 10.37, 'IT-25', 1225, 2300, 3000],
  ['Santa Caterina Valfurva', 46.4, 10.5, 'IT-25', 1740, 2600, 3300],
  ['Passo dello Stelvio', 46.529, 10.453, 'IT-25', 2760, 3000, 3400],
  ['Madesimo', 46.4337, 9.3516, 'IT-25', 1550, 2300, 2900],
  ['Chiesa in Valmalenco', 46.259, 9.84, 'IT-25', 1000, 2000, 2800],
  ['Ponte di Legno / Tonale', 46.26, 10.5, 'IT-25', 1260, 2300, 3000],
  // Mete scialpinistiche entro ~3 ore da Legnano
  ['Val Bedretto (Ossasco)', 46.5, 8.51, 'CH', 1315, 2300, 2900],
  ['Passo del Sempione', 46.251, 8.033, 'CH', 2005, 2500, 3100],
  ['Passo del San Gottardo', 46.559, 8.561, 'CH', 2091, 2600, 2900],
  ['Passo San Giacomo', 46.45, 8.4, 'IT-21', 2000, 2500, 2900],
  ['Passo del Nufenen / Gries', 46.4729, 8.3893, 'CH', 2478, 2800, 3100],
  ['San Domenico', 46.2497, 8.1925, 'IT-21', 1420, 2000, 2600],
  ['Alpe Cheggio', 46.0864, 8.1166, 'IT-21', 1500, 2000, 2800],
  ['Rifugio San Bernardo (Bognanco)', 46.1517, 8.1933, 'IT-21', 1300, 2100, 2700],
  ['San Bernardino', 46.46, 9.18, 'CH', 1630, 2300, 3000],
  ['Spluga / Montespluga', 46.5, 9.33, 'IT-25', 1900, 2500, 3000],
  ['Maloja / Val Bregaglia', 46.4, 9.69, 'CH', 1800, 2500, 3000],
  ['Foppolo / Carona (Orobie)', 46.0437, 9.7512, 'IT-25', 1500, 2100, 2500],
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
