// Étape Navegar · sat.js
// Camada de satélite: ortofotos do IGN (dados abertos) em tiles z15 guardados no app (sat/15/x/y.jpg).
// Tiles ficam em memória num cache pequeno; o service worker guarda no aparelho o que já foi visto,
// e prefetch() baixa tudo de uma etapa para uso offline.
const Z = 15, MAX = 260;
const cache = new Map(); let index = null, onLoad = null, base = 'sat/';

export function setOnLoad(cb) { onLoad = cb; }
export async function loadIndex(url = 'sat/index.json') {
  try { const r = await fetch(url); if (!r.ok) return null; index = await r.json(); base = url.replace(/index\.json$/, ''); return index; } catch (e) { return null; }
}
export function available() { return !!index; }
export function hasStage(key) { return !!(index && index.stages[key] && index.stages[key].length); }

// tiles cobrindo a caixa [s,w,n,e] em lat/lon, com o zoom fixo do acervo
export function tilesFor(box) {
  const n = 2 ** Z, t = (lat, lon) => [(lon + 180) / 360 * n, (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n];
  const [x0, y0] = t(box[2], box[1]), [x1, y1] = t(box[0], box[3]); const out = [];
  for (let x = Math.floor(x0); x <= Math.floor(x1); x++) for (let y = Math.floor(y0); y <= Math.floor(y1); y++) out.push([x, y]);
  return out;
}
export function tile(x, y) {
  const k = x + '/' + y; let e = cache.get(k);
  if (e) { cache.delete(k); cache.set(k, e); return e.img.complete && e.img.naturalWidth ? e.img : null; }
  const img = new Image(); img.decoding = 'async'; img.onload = () => { if (onLoad) onLoad(); }; img.onerror = () => { e.bad = true; };
  img.src = base + Z + '/' + x + '/' + y + '.jpg'; e = { img };
  cache.set(k, e); if (cache.size > MAX) cache.delete(cache.keys().next().value);
  return null;
}
// canto noroeste do tile em Mercator normalizado [0..1]
export function tileMerc(x, y) { const n = 2 ** Z; return { mx: x / n, my: y / n, size: 1 / n }; }
export const zoom = Z;
// tiles da maquete (nível baixo cobrindo a caixa inteira da etapa): {z, list}
export function dioTiles(key) { const d = index && index.dio; return d && d.stages[key] ? { z: d.z, list: d.stages[key] } : null; }
export function tileUrl(x, y, z = Z) { return base + z + '/' + x + '/' + y + '.jpg'; }
export function tileMercZ(x, y, z) { const n = 2 ** z; return { mx: x / n, my: y / n, size: 1 / n }; }
// cor média por célula de 8×8 px do tile (32×32 por tile), calculada uma vez; devolve [r,g,b] ou null
const grids = new Map();
export function colorAt(lat, lon) {
  const n = 2 ** Z, px = (lon + 180) / 360 * n * 256, py = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n * 256;
  const tx = Math.floor(px / 256), ty = Math.floor(py / 256), k = tx + '/' + ty;
  let g = grids.get(k);
  if (!g) {
    const im = tile(tx, ty); if (!im) return null;
    const c = document.createElement('canvas'); c.width = c.height = 32; const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(im, 0, 0, 32, 32); g = cx.getImageData(0, 0, 32, 32).data; grids.set(k, g); if (grids.size > 300) grids.delete(grids.keys().next().value);
  }
  const i = (Math.min(31, Math.floor((py - ty * 256) / 8)) * 32 + Math.min(31, Math.floor((px - tx * 256) / 8))) * 4;
  return [g[i], g[i + 1], g[i + 2]];
}

// baixa todos os tiles de uma etapa para o cache do service worker (uso offline); progress(feitos, total)
export async function prefetch(key, progress) {
  if (!index || !index.stages[key]) return false;
  const dio = index.dio && index.dio.stages[key] ? index.dio.stages[key].map(([x, y]) => [x, y, index.dio.z]) : [];
  const list = index.stages[key].map(([x, y]) => [x, y, Z]).concat(dio); let done = 0;
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
