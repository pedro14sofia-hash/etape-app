// Étape Navegar · service worker: cache-first dos arquivos do app e do mapa. Versão trocada pelo build.
const C = 'etape-nav-7db5dbea';
const A = ['./', './styles.css', './data.js', './app.js', './geo.js', './data-mod.js', './render.js', './gps.js', './guide.js', './voice.js', './ui.js', './store.js', './session.js', './telemetry.js', './fuel.js', './report.js', './weather.js', './sensors.js', './compass.js', './router.js', './icons.js', './sat.js', './dem.js', './terrain3d.js', './diorama.js', './rider3d.js', './models/avatar.glb', './vendor/three.module.min.js', './vendor/GLTFLoader.js', './vendor/BufferGeometryUtils.js', './track.js', './manifest.webmanifest', './icon.svg', './fonts/fonts.css', './fonts/Barlow-400-normal-latin-ext.woff2', './fonts/Barlow-400-normal-latin.woff2', './fonts/Barlow-600-normal-latin-ext.woff2', './fonts/Barlow-600-normal-latin.woff2', './fonts/Barlow-700-normal-latin-ext.woff2', './fonts/Barlow-700-normal-latin.woff2', './fonts/BarlowCondensed-600-normal-latin-ext.woff2', './fonts/BarlowCondensed-600-normal-latin.woff2', './fonts/BarlowCondensed-700-italic-latin-ext.woff2', './fonts/BarlowCondensed-700-italic-latin.woff2', './fonts/BarlowCondensed-700-normal-latin-ext.woff2', './fonts/BarlowCondensed-700-normal-latin.woff2', './fonts/BarlowCondensed-800-normal-latin-ext.woff2', './fonts/BarlowCondensed-800-normal-latin.woff2', './fonts/BarlowCondensed-900-italic-latin-ext.woff2', './fonts/BarlowCondensed-900-italic-latin.woff2', './fonts/BarlowCondensed-900-normal-latin-ext.woff2', './fonts/BarlowCondensed-900-normal-latin.woff2', './fonts/OpenSans-400-normal-latin-ext.woff2', './fonts/OpenSans-400-normal-latin.woff2', './fonts/OpenSans-600-normal-latin-ext.woff2', './fonts/OpenSans-600-normal-latin.woff2', './fonts/OpenSans-700-normal-latin-ext.woff2', './fonts/OpenSans-700-normal-latin.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(A)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C && k !== 'etape-sat').map(k => caches.delete(k)))).then(() => self.clients.claim()).then(() => fillSat('./'))); });
// satélite inteiro (z15 do corredor + z12 da maquete) no cache 'etape-sat', em segundo plano, em lotes de 6;
// começa ao ativar e quando a página pede ({type:'fillSat'}); avisa o progresso às páginas ({type:'satProgress'})
let filling = null;
async function fillSat(base) {
  if (filling) return filling;
  filling = (async () => {
    const c = await caches.open('etape-sat'); let list = [];
    try { const idx = await (await fetch(base + 'sat/index.json')).json();
      for (const k in idx.stages) for (const [x, y] of idx.stages[k]) list.push(base + 'sat/' + idx.z + '/' + x + '/' + y + '.jpg');
      if (idx.dio) for (const k in idx.dio.stages) for (const [x, y] of idx.dio.stages[k]) list.push(base + 'sat/' + idx.dio.z + '/' + x + '/' + y + '.jpg');
      for (const z of [16, 17, 18]) if (idx['z' + z]) for (const k in idx['z' + z].stages) for (const [x, y] of idx['z' + z].stages[k]) list.push(base + 'sat/' + z + '/' + x + '/' + y + '.jpg');
    } catch (e) { filling = null; return; }
    try { const di = await (await fetch(base + 'dem/index.json')).json(); if (di.z14) for (const [x, y] of di.z14.tiles) list.push(base + 'dem/14/' + x + '/' + y + '.png'); } catch (e) { }   // relevo z14 (vista 3D) também em segundo plano
    list = [...new Set(list)]; let done = 0; const total = list.length;
    const say = async (final) => { const cs = await self.clients.matchAll({ includeUncontrolled: true }); for (const cl of cs) cl.postMessage({ type: 'satProgress', done, total, final: !!final }); };
    for (let i = 0; i < list.length; i += 6) {
      await Promise.all(list.slice(i, i + 6).map(async u => { try { if (!(await c.match(u))) { const r = await fetch(u); if (r.ok) await c.put(u, r); } } catch (e) { } done++; }));
      if (done % 60 === 0) await say(false);
    }
    await say(true); filling = null;
  })();
  return filling;
}
self.addEventListener('message', e => { const m = e.data || {}; if (m.type === 'fillSat') e.waitUntil(fillSat(m.base || './')); });

self.addEventListener('fetch', e => {
  const u = e.request.url;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(x => {
    if (x.ok && (u.includes('fonts.g') || u.startsWith(self.location.origin))) { const cl = x.clone(); caches.open(C).then(c => c.put(e.request, cl)); }
    return x;
  }).catch(() => caches.match('./index.html'))));
});
