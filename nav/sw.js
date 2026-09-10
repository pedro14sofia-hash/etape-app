// Étape Navegar · service worker: cache-first dos arquivos do app e do mapa. Versão trocada pelo build.
const C = 'etape-nav-1bc1a92c';
// [...new Set(...)] NAO e enfeite: cache.addAll rejeita a lista INTEIRA se houver URL repetida
// (InvalidStateError), o install falha, o worker vira redundant e o app fica SEM OFFLINE NENHUM,
// calado. Foi o que aconteceu: './fonts/fonts.css' esta na lista fixa e o build a repunha pelo
// './fonts/SofiaSans-400-normal-latin-ext.woff2', './fonts/SofiaSans-400-normal-latin.woff2', './fonts/SofiaSans-500-normal-latin-ext.woff2', './fonts/SofiaSans-500-normal-latin.woff2', './fonts/SofiaSans-600-normal-latin-ext.woff2', './fonts/SofiaSans-600-normal-latin.woff2', './fonts/SofiaSans-700-italic-latin-ext.woff2', './fonts/SofiaSans-700-italic-latin.woff2', './fonts/SofiaSans-700-normal-latin-ext.woff2', './fonts/SofiaSans-700-normal-latin.woff2', './fonts/SofiaSansSemiCondensed-600-normal-latin-ext.woff2', './fonts/SofiaSansSemiCondensed-600-normal-latin.woff2', './fonts/SofiaSansSemiCondensed-700-normal-latin-ext.woff2', './fonts/SofiaSansSemiCondensed-700-normal-latin.woff2', './fonts/SofiaSansSemiCondensed-800-italic-latin-ext.woff2', './fonts/SofiaSansSemiCondensed-800-italic-latin.woff2', './fonts/SofiaSansSemiCondensed-800-normal-latin-ext.woff2', './fonts/SofiaSansSemiCondensed-800-normal-latin.woff2', './fonts/fonts.css'. Medido no S23 em 08/09: tres caches etape-nav-* vazios, um por build que tentou.
const A = [...new Set(['./', './index.html', './icon-192.png', './icon-512.png', './styles.css', './data.js', './app.js', './geo.js', './data-mod.js', './render.js', './basemap.js', './gps.js', './guide.js', './voice.js', './ui.js', './store.js', './session.js', './telemetry.js', './fuel.js', './report.js', './weather.js', './sensors.js', './compass.js', './router.js', './icons.js', './sat.js', './dem.js', './terrain3d.js', './icons3d.js', './diorama.js', './rider3d.js', './models/avatar.glb', './vendor/three.module.min.js', './vendor/GLTFLoader.js', './vendor/BufferGeometryUtils.js', './track.js', './free.js', './match.js', './plan.js', './diario.js', './outing.js', './native.js', './sidecar.js', './cinema.js', './solar.js', './music.js', './cinema-ui.js', './auto.js', './passeio.js', './manifest.webmanifest', './icon.svg', './fonts/fonts.css', './tokens.js', './tokens.css', './shade.js', './contours.json', './vendor/maplibre-gl.js', './vendor/maplibre-gl.css', './vendor/pmtiles.js', './chao/estilo-asfalto.json', './chao/estilo-noite.json', './chao/glyphs/SofiaSansSemiCondensed-Bold/0-255.pbf', './chao/glyphs/SofiaSansSemiCondensed-Bold/256-511.pbf', './chao/glyphs/SofiaSansSemiCondensed-SemiBold/0-255.pbf', './chao/glyphs/SofiaSansSemiCondensed-SemiBold/256-511.pbf',  './fonts/SofiaSans-400-normal-latin-ext.woff2', './fonts/SofiaSans-400-normal-latin.woff2', './fonts/SofiaSans-500-normal-latin-ext.woff2', './fonts/SofiaSans-500-normal-latin.woff2', './fonts/SofiaSans-600-normal-latin-ext.woff2', './fonts/SofiaSans-600-normal-latin.woff2', './fonts/SofiaSans-700-italic-latin-ext.woff2', './fonts/SofiaSans-700-italic-latin.woff2', './fonts/SofiaSans-700-normal-latin-ext.woff2', './fonts/SofiaSans-700-normal-latin.woff2', './fonts/SofiaSansSemiCondensed-600-normal-latin-ext.woff2', './fonts/SofiaSansSemiCondensed-600-normal-latin.woff2', './fonts/SofiaSansSemiCondensed-700-normal-latin-ext.woff2', './fonts/SofiaSansSemiCondensed-700-normal-latin.woff2', './fonts/SofiaSansSemiCondensed-800-italic-latin-ext.woff2', './fonts/SofiaSansSemiCondensed-800-italic-latin.woff2', './fonts/SofiaSansSemiCondensed-800-normal-latin-ext.woff2', './fonts/SofiaSansSemiCondensed-800-normal-latin.woff2', './fonts/fonts.css'])];
// e se falhar, que NAO falhe calado: sem isto a unica pista era um cache vazio no aparelho
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(A)).then(() => self.skipWaiting())
  .catch(async err => { const ruins = []; for (const u of A) { try { const r = await fetch(u); if (!r.ok) ruins.push(u + ' -> ' + r.status); } catch (x) { ruins.push(u + ' -> ' + x.message); } }
    console.error('service worker: o pre-cache falhou (' + err.message + ')', ruins.length ? ruins : 'todas as URLs respondem: procure URL repetida em A'); throw err; })); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C && k !== 'etape-sat' && k !== 'etape-chao').map(k => caches.delete(k)))).then(() => self.clients.claim()).then(() => fillSat('./'))); });
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
    try { const si = await (await fetch(base + 'shade/index.json')).json(); for (const [x, y] of si.tiles) list.push(base + 'shade/12/' + x + '/' + y + '.png'); if (si.z14) for (const [x, y] of si.z14.tiles) list.push(base + 'shade/14/' + x + '/' + y + '.png'); } catch (e) { }   // sombra do relevo (mapa 2D)
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
// o chão pronto é um arquivo só, grande: baixa em segundo plano e avisa a tela, como o satélite
let enchendoChao = null;
async function fillChao(base, regiao) {
  if (enchendoChao) return enchendoChao;
  enchendoChao = (async () => {
    const u = base + 'chao/' + regiao + '.pmtiles';
    const c = await caches.open('etape-chao');
    const diz = async (done, total, final) => {
      const cs = await self.clients.matchAll({ includeUncontrolled: true });
      for (const cl of cs) cl.postMessage({ type: 'chaoProgress', done, total, final: !!final });
    };
    try {
      if (await c.match(u)) { await diz(1, 1, true); enchendoChao = null; return; }
      const r = await fetch(u);
      if (!r.ok) { enchendoChao = null; return; }
      const total = +(r.headers.get('content-length') || 0);
      await diz(0, total, false);
      await c.put(u, r);
      await diz(total, total, true);
    } catch (e) { }
    enchendoChao = null;
  })();
  return enchendoChao;
}
self.addEventListener('message', e => { const m = e.data || {};
  if (m.type === 'fillSat') e.waitUntil(fillSat(m.base || './'));
  if (m.type === 'fillChao') e.waitUntil(fillChao(m.base || './', m.regiao || 'sp')); });

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = e.request.url, big = /\/(sat|dem|shade)\//.test(u);   // tiles: só no cache 'etape-sat' (grande); o resto: só no cache do app
  // PMTiles: o arquivo inteiro fica num cache próprio ('etape-chao') e as leituras por faixa são servidas dele.
  // Sem isto, offline o pmtiles.js pede Range, o cache devolve o arquivo todo com status 200 e a
  // biblioteca lê o cabeçalho no lugar errado.
  const faixa = e.request.headers.get('range');
  if (u.endsWith('.pmtiles') && faixa) {
    e.respondWith((async () => {
      const c = await caches.open('etape-chao');
      let r = await c.match(u);
      if (!r) { const rede = await fetch(e.request); if (rede.ok || rede.status === 206) return rede; return new Response('', { status: 504 }); }
      // blob().slice() e NAO arrayBuffer(): o arquivo tem 85 MB e o pmtiles.js pede dezenas de
      // faixas por tela. arrayBuffer traria os 85 MB para a memoria a CADA pedido - a mesma classe
      // do achado que ja custou 9 s por arquivo aqui. O slice de um Blob nao materializa o resto.
      const b = await r.blob();
      const m = /bytes=(\d*)-(\d*)/.exec(faixa);
      if (!m) return new Response('', { status: 416 });
      let ini = m[1] ? +m[1] : Math.max(0, b.size - (+m[2] || 0));
      let fim = m[1] ? (m[2] ? +m[2] : b.size - 1) : b.size - 1;
      fim = Math.min(fim, b.size - 1);
      if (ini > fim || ini >= b.size) return new Response('', { status: 416, headers: { 'Content-Range': 'bytes */' + b.size } });
      return new Response(b.slice(ini, fim + 1), { status: 206, headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Range': `bytes ${ini}-${fim}/${b.size}`,
        'Content-Length': String(fim - ini + 1) } });
    })());
    return;
  }
  // busca direta pela URL (indexada); ignoreSearch varria o cache inteiro e, com dezenas de milhares de tiles, levava segundos por arquivo
  const look = async () => {
    const c = await caches.open(big ? 'etape-sat' : C); let r = await c.match(e.request);
    if (!r && u.includes('?')) r = await c.match(u.split('?')[0]);
    if (!r && big) r = await (await caches.open(C)).match(e.request);
    return r;
  };
  e.respondWith(look().then(r => r || fetch(e.request).then(x => {
    if (x.ok && u.startsWith(self.location.origin)) { const cl = x.clone(); caches.open(big ? 'etape-sat' : C).then(c => c.put(e.request, cl)); }
    return x;
  }).catch(() => e.request.mode === 'navigate' ? caches.match('./index.html') : new Response('', { status: 504, statusText: 'offline' }))));
});
