# Meteo Montagna

PWA per scialpinismo e freeride: in un'unica schermata previsioni di neve in quota, radar e bollettini valanghe dei posti dove vai.

App: https://vizz00.github.io/meteo-montagna/

## Cosa c'è oggi

- **Panoramica 7 giorni** per Cervinia, Champoluc e Alagna, alla quota scelta (valle / metà / cima): neve stimata come intervallo tra i modelli, zero termico massimo, vento in quota (700 hPa, circa 3000 m), totale settimanale e "prossima nevicata".
- **Dettaglio posto**: tabella della neve per modello e per giorno.
- **Preferiti** salvati nel browser (nessun account).
- Installabile su telefono e computer, si apre anche senza rete con l'ultima previsione scaricata.
- Radar, Valanghe e Stagione sono ancora segnaposto con i link ai siti ufficiali.

## Dati

[Open-Meteo](https://open-meteo.com/) (gratuito, senza chiave), una sola chiamata per tutti i posti e le quote, modelli ECMWF, ICON, GFS, Météo-France, MeteoSwiss ICON-CH2, ICON-2I.
La neve alla quota è stimata da precipitazione, temperatura e zero termico (limite neve circa 300 m sotto lo zero termico, rapporto neve/acqua da 10:1 a 15:1). Il calcolo è in `js/snow.js`.

## Struttura

| File | Cosa fa |
|---|---|
| `index.html`, `css/style.css` | pagina e stile |
| `js/app.js` | schermate e navigazione |
| `js/places.js` | posti, quote, regioni, link esterni (qui si aggiungono nuovi posti) |
| `js/forecast.js` | scarica e salva le previsioni |
| `js/snow.js` | calcoli della neve (provati con i test) |
| `sw.js`, `manifest.webmanifest`, `icons/` | app installabile e offline |

Nessuna dipendenza e nessuna compilazione: sono file statici.

## Provarla sul computer

```
python3 -m http.server 8000
```
poi aprire http://localhost:8000. Test dei calcoli: `npm test` (serve Node 20 o più recente).

## Pubblicazione

GitHub Pages dal ramo `main`, cartella principale (`/ (root)`).
