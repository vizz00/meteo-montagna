// Carica Leaflet (mappe) solo quando serve, da unpkg, versione fissa 1.9.4.
// File condiviso tra radar e ricerca posti: tenerlo identico nei due rami.
const BASE = 'https://unpkg.com/leaflet@1.9.4/dist/';
let promise = null;

export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (promise) return promise;
  promise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = `${BASE}leaflet.css`;
      css.crossOrigin = '';
      css.dataset.leaflet = '';
      document.head.appendChild(css);
    }
    const script = document.createElement('script');
    script.src = `${BASE}leaflet.js`;
    script.crossOrigin = '';
    script.onload = () => resolve(window.L);
    script.onerror = () => {
      promise = null;
      script.remove();
      reject(new Error('Leaflet non caricato'));
    };
    document.head.appendChild(script);
  });
  return promise;
}
