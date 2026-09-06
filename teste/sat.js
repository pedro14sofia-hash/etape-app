// Étape Navegar · sat.js
// Camada de satélite: ortofotos do IGN (dados abertos) em tiles z15 guardados no app (sat/15/x/y.jpg).
// Tiles ficam em memória num cache pequeno; o service worker guarda no aparelho o que já foi visto,
// e prefetch() baixa tudo de uma etapa para uso offline.
const Z = 15, MAX = 260;
const cache = new Map(); let index = null, onLoad = null, base = 'sat/';

const listeners = [];
export function setOnLoad(cb) { if (cb && !listeners.includes(cb)) listeners.push(cb); onLoad = () => { for (const f of listeners) f(); }; }   // acumula: o 2D e o 3D ouvem juntos
export function listenerCount() { return listeners.length; }
export async function loadIndex(url = 'sat/index.json') {
  try { const r = await fetch(url); if (!r.ok) return null; index = await r.json(); base = url.replace(/index\.json$/, ''); return index; } catch (e) { return null; }
}
export function available() { return !!index; }
export function hasStage(key) { return !!(index && index.stages[key] && index.stages[key].length); }

// tiles cobrindo a caixa [s,w,n,e] em lat/lon, com o zoom fixo do acervo
export function tilesFor(box, z = Z) {
  const n = 2 ** z, t = (lat, lon) => [(lon + 180) / 360 * n, (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n];
  const [x0, y0] = t(box[2], box[1]), [x1, y1] = t(box[0], box[3]); const out = [];
  for (let x = Math.floor(x0); x <= Math.floor(x1); x++) for (let y = Math.floor(y0); y <= Math.floor(y1); y++) out.push([x, y]);
  return out;
}
export function hasLevel(z) { return !!(index && index['z' + z]); }
// tiles de detalhe existem só perto do traçado: conjunto por etapa para saber se um tile z16 está no acervo
const detailSets = {}; let baseSet = null;
// o tile existe no acervo? (z15: corredor de todas as etapas; níveis de detalhe: hasDetailTile); isBad: tentou carregar e falhou
export function hasTile(x, y, z = Z) { if (!index) return false; if (z !== Z) return hasDetailTile(x, y, z); if (!baseSet) { baseSet = new Set(); for (const k in index.stages) for (const [a, b] of index.stages[k]) baseSet.add(a + '/' + b); if (index.dio) for (const k in index.dio.stages) for (const [a, b] of index.dio.stages[k]) baseSet.add('d' + a + '/' + b); } return baseSet.has(x + '/' + y); }
export function isBad(x, y, z = Z) { const e = cache.get(z + '/' + x + '/' + y); return !!(e && e.bad); }
export function hasDetailTile(x, y, z) { if (!index || !index['z' + z]) return false; let ds = detailSets[z]; if (!ds) { ds = detailSets[z] = new Set(); for (const k in index['z' + z].stages) for (const [a, b] of index['z' + z].stages[k]) ds.add(a + '/' + b); } return ds.has(x + '/' + y); }
// níveis de detalhe disponíveis (16, 17…) em ordem
export function detailLevels() { return [16, 17, 18].filter(z => index && index['z' + z]); }
// aquece o cache de memória com os tiles do trecho à frente (progressivo: decodifica antes de precisar)
export function warmAhead(stage, dist, meters, zView) {
  if (!index) return; const levels = [Z].concat(detailLevels().filter(z => zView >= z + 0.3));
  const pts = []; for (let d = dist; d <= Math.min(stage.total, dist + meters); d += 120) { const i = stage.cum ? idxAt(stage, d) : 0; pts.push(stage.pts[i]); }
  for (const z of levels) { const n = 2 ** z; for (const p of pts) { const x = Math.floor((p[1] + 180) / 360 * n), y = Math.floor((1 - Math.log(Math.tan(p[0] * Math.PI / 180) + 1 / Math.cos(p[0] * Math.PI / 180)) / Math.PI) / 2 * n); if (z === Z || hasDetailTile(x, y, z)) tile(x, y, z); } }
}
function idxAt(stage, d) { const c = stage.cum; let lo = 0, hi = c.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (c[m] < d) lo = m + 1; else hi = m; } return lo; }
export function tile(x, y, z = Z) {
  const k = z + '/' + x + '/' + y; let e = cache.get(k);
  if (e) { cache.delete(k); cache.set(k, e); return e.img.complete && e.img.naturalWidth ? e.img : null; }
  const img = new Image(); img.decoding = 'async'; img.onload = () => { if (onLoad) onLoad(); }; img.onerror = () => { e.bad = true; };
  img.src = base + z + '/' + x + '/' + y + '.jpg'; e = { img };
  cache.set(k, e); if (cache.size > MAX) cache.delete(cache.keys().next().value);
  return null;
}
// canto noroeste do tile em Mercator normalizado [0..1]
export function tileMerc(x, y, z = Z) { const n = 2 ** z; return { mx: x / n, my: y / n, size: 1 / n }; }
export const zoom = Z;
// tiles da maquete (nível baixo cobrindo a caixa inteira da etapa): {z, list}
export function dioTiles(key) { const d = index && index.dio; return d && d.stages[key] ? { z: d.z, list: d.stages[key] } : null; }
export function tileUrl(x, y, z = Z) { return base + z + '/' + x + '/' + y + '.jpg'; }
export function tileMercZ(x, y, z) { const n = 2 ** z; return { mx: x / n, my: y / n, size: 1 / n }; }
// cor média por célula de 8×8 px do tile (32×32 por tile), calculada uma vez; devolve [r,g,b] ou null
const grids = new Map();
export function colorAt(lat, lon) {
  // nível mais fino já em memória: z17 (~1,2 m/px → célula de 5 m) perto do ciclista, senão z15 (célula de 19 m)
  for (const z of (index && index.z17 ? [17, Z] : [Z])) {
    const n = 2 ** z, px = (lon + 180) / 360 * n * 256, py = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n * 256;
    const tx = Math.floor(px / 256), ty = Math.floor(py / 256), k = z + '/' + tx + '/' + ty;
    let g = grids.get(k);
    if (!g) {
      if (z !== Z && !hasDetailTile(tx, ty, z)) continue;
      const im = tile(tx, ty, z); if (!im) continue;
      const c = document.createElement('canvas'); c.width = c.height = 64; const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(im, 0, 0, 64, 64); g = cx.getImageData(0, 0, 64, 64).data; grids.set(k, g); if (grids.size > 400) grids.delete(grids.keys().next().value);
    }
    const i = (Math.min(63, Math.floor((py - ty * 256) / 4)) * 64 + Math.min(63, Math.floor((px - tx * 256) / 4))) * 4;
    return [g[i], g[i + 1], g[i + 2]];
  }
  return null;
}

// baixa todos os tiles de uma etapa para o cache do service worker (uso offline); progress(feitos, total)
export async function prefetch(key, progress) {
  if (!index || !index.stages[key]) return false;
  const dio = index.dio && index.dio.stages[key] ? index.dio.stages[key].map(([x, y]) => [x, y, index.dio.z]) : [];
  const det = []; for (const z of [16, 17, 18]) if (index['z' + z] && index['z' + z].stages[key]) for (const [x, y] of index['z' + z].stages[key]) det.push([x, y, z]);
  const list = index.stages[key].map(([x, y]) => [x, y, Z]).concat(dio, det); let done = 0;
  const c = 'caches' in window ? await caches.open('etape-sat') : null;
  for (let i = 0; i < list.length; i += 8) {
    await Promise.all(list.slice(i, i + 8).map(async ([x, y, z]) => {
      const u = base + z + '/' + x + '/' + y + '.jpg';
      try { if (c) { const hit = await c.match(u); if (!hit) { const r = await fetch(u); if (r.ok) await c.put(u, r); } } else await fetch(u); } catch (e) { }
      done++;
    }));
    if (progress) progress(done, list.length);
  }
  return true;
}
