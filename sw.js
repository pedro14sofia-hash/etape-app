// Étape Navegar · service worker: cache-first dos arquivos do app e do mapa. Versão trocada pelo build.
const C = 'etape-nav-3057bf1e';
const A = ['./', './index.html', './styles.css', './data.js', './app.js', './geo.js', './data-mod.js', './render.js', './track.js', './gps.js', './guide.js', './voice.js', './ui.js', './store.js', './session.js', './telemetry.js', './fuel.js', './report.js', './weather.js', './sensors.js', './manifest.webmanifest', './icon.svg', './fonts/fonts.css', './fonts/Archivo-400-normal-latin-ext.woff2', './fonts/Archivo-400-normal-latin.woff2', './fonts/Archivo-600-normal-latin-ext.woff2', './fonts/Archivo-600-normal-latin.woff2', './fonts/Archivo-700-normal-latin-ext.woff2', './fonts/Archivo-700-normal-latin.woff2', './fonts/ArchivoNarrow-400-italic-latin-ext.woff2', './fonts/ArchivoNarrow-400-italic-latin.woff2', './fonts/ArchivoNarrow-400-normal-latin-ext.woff2', './fonts/ArchivoNarrow-400-normal-latin.woff2', './fonts/ArchivoNarrow-600-normal-latin-ext.woff2', './fonts/ArchivoNarrow-600-normal-latin.woff2', './fonts/BigShouldersDisplay-700-normal-latin-ext.woff2', './fonts/BigShouldersDisplay-700-normal-latin.woff2', './fonts/BigShouldersDisplay-800-normal-latin-ext.woff2', './fonts/BigShouldersDisplay-800-normal-latin.woff2', './fonts/BigShouldersDisplay-900-normal-latin-ext.woff2', './fonts/BigShouldersDisplay-900-normal-latin.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(A)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = e.request.url;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(x => {
    if (x.ok && (u.includes('fonts.g') || u.startsWith(self.location.origin))) { const cl = x.clone(); caches.open(C).then(c => c.put(e.request, cl)); }
    return x;
  }).catch(() => caches.match('./index.html'))));
});
