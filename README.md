# Meteo Montagna

PWA per scialpinismo e freeride: in un'unica schermata previsioni di neve in quota, radar e bollettini valanghe dei posti dove vai.

App: https://vizz00.github.io/meteo-montagna/

## Cosa c'è oggi

- **Panoramica 7 giorni** per Cervinia, Champoluc e Alagna, alla quota scelta (valle / metà / cima): neve stimata come intervallo tra i modelli, zero termico massimo, vento in quota (700 hPa, circa 3000 m), totale settimanale e "prossima nevicata".
- **Finestra buona** per ogni giorno e posto: sole, vento in quota debole, zero termico sotto la quota e nessun segnale d'allarme di nivologia (neve fresca critica in 3 giorni, accumuli da vento sui versanti sottovento, pioggia su neve, niente rigelo, primo sole dopo la nevicata, grado e problemi del bollettino). Regole e soglie in `js/window.js`, con le fonti (SLF, EAWS). Nessun voto: si vedono le condizioni rispettate e i segnali scattati.
- **Dettaglio posto**: tabella della neve per modello e per giorno, finestra giorno per giorno con la rosa dei versanti caricati, scelta facoltativa dei propri versanti.
- **Preferiti** salvati nel browser (nessun account).
- **Aggiungi posto**: cerca una località per nome o tocca la mappa; le quote valle / metà / cima vengono proposte dal modello del terreno e si possono correggere. I posti aggiunti restano nel browser e si possono modificare o eliminare.
- Installabile su telefono e computer, si apre anche senza rete con l'ultima previsione scaricata.
- **Stagione**: per ogni posto, dal 1° novembre a oggi (o una stagione passata), alla quota scelta: neve fresca e al suolo, zero termico, periodi secchi e caldi, pioggia, grado e problemi valanghivi ufficiali giorno per giorno, con quando compaiono e quanto restano gli strati deboli persistenti. Solo fatti, con le soglie scritte nella pagina.
- Il radar è ancora un segnaposto con i link ai siti ufficiali.

## Dati

[Open-Meteo](https://open-meteo.com/) (gratuito, senza chiave), una sola chiamata per tutti i posti e le quote, modelli ECMWF, ICON, GFS, Météo-France, MeteoSwiss ICON-CH2, ICON-2I.
**Valanghe**: bollettini ufficiali dall'archivio aperto [EAWS](https://www.avalanches.org/) (AINEVA per Valle d'Aosta, Piemonte e Lombardia, SLF per la Svizzera, licenza CC BY 4.0), letti nel browser da `static.avalanche.report`. Per ogni posto si mostra il grado della sua micro-zona, sopra e sotto la quota limite, mattino/pomeriggio se il bollettino li distingue, e i problemi valanghivi. Nessuna interpretazione: per il resto si apre il bollettino.

La neve alla quota è stimata da precipitazione, temperatura e zero termico (limite neve circa 300 m sotto lo zero termico, rapporto neve/acqua da 10:1 a 15:1). Il calcolo è in `js/snow.js`.

## Struttura

| File | Cosa fa |
|---|---|
| `index.html`, `css/style.css` | pagina e stile |
| `js/app.js` | schermate e navigazione |
| `js/places.js` | posti iniziali, quote, regioni, link esterni |
| `js/addplace.js`, `js/myplaces.js`, `js/geo.js`, `css/addplace.css` | pagina Aggiungi posto, salvataggio dei posti aggiunti, quote proposte e zona valanghe |
| `js/leaflet-loader.js` | carica la mappa Leaflet solo quando serve |
| `js/forecast.js` | scarica e salva le previsioni |
| `js/snow.js` | calcoli della neve (provati con i test) |
| `js/window.js` | regole della finestra buona (provate con i test) |
| `js/avalanche.js`, `js/avalanche-view.js` | grado valanghe ufficiale per micro-zona (EAWS) e come si mostra |
| `js/season.js`, `js/season-view.js`, `css/season.css` | schermata Stagione: archivio Open-Meteo (historical-forecast-api) e archivio EAWS giornaliero (`ratings.json`, `problems.json`) |
| `sw.js`, `manifest.webmanifest`, `icons/` | app installabile e offline |

Nessuna dipendenza e nessuna compilazione: sono file statici.

## Provarla sul computer

```
python3 -m http.server 8000
```
poi aprire http://localhost:8000. Test dei calcoli: `npm test` (serve Node 20 o più recente).

## Pubblicazione

GitHub Pages dal ramo `main`, cartella principale (`/ (root)`).
