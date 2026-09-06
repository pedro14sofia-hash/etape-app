// Étape Navegar · shade.js
// Sombra do relevo (hillshade) em tiles PNG de cinza gerados no build (shade_build.py): L = 255 × iluminação.
// z14 no corredor, z12 na caixa da etapa; índice shade/index.json no formato do dem/index.json.
// O render compõe o cinza sobre o chão: multiply (escurece as encostas à sombra) e, à noite, lighter (clareia as cristas).
const MAX = 240;
const cache = new Map(); let index = null, base = 'shade/'; const sets = {};
const listeners = []; let onLoad = null;
export function setOnLoad(cb) { if (cb && !listeners.includes(cb)) listeners.push(cb); onLoad = () => { for (const f of listeners) f(); }; }
export async function loadIndex(url = 'shade/index.json') {
  try {
    const r = await fetch(url); if (!r.ok) return null; index = await r.json(); base = url.replace(/index\.json$/, '');
    sets[12] = new Set(index.tiles.map(([x, y]) => x + '/' + y));
    if (index.z14) sets[14] = new Set(index.z14.tiles.map(([x, y]) => x + '/' + y));
    return index;
  } catch (e) { return null; }
}
export function available() { return !!index; }
export function hasLevel(z) { return !!sets[z]; }
export function hasTile(x, y, z) { return !!(sets[z] && sets[z].has(x + '/' + y)); }
// tiles [[x,y],...] de um nível cobrindo a caixa [s,w,n,e] e presentes no acervo
export function tilesFor(box, z) {
  const n = 2 ** z, t = (lat, lon) => [(lon + 180) / 360 * n, (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n];
  const [x0, y0] = t(box[2], box[1]), [x1, y1] = t(box[0], box[3]); const out = [];
  for (let x = Math.floor(x0); x <= Math.floor(x1); x++) for (let y = Math.floor(y0); y <= Math.floor(y1); y++) if (hasTile(x, y, z)) out.push([x, y]);
  return out;
}
export function tile(x, y, z) {
  const k = z + '/' + x + '/' + y; let e = cache.get(k);
  if (e) { cache.delete(k); cache.set(k, e); return e.img.complete && e.img.naturalWidth ? e.img : null; }
  if (!hasTile(x, y, z)) return null;
  const img = new Image(); img.decoding = 'async'; img.onload = () => { if (onLoad) onLoad(); }; img.onerror = () => { e.bad = true; };
  img.src = base + z + '/' + x + '/' + y + '.png'; e = { img };
  cache.set(k, e); if (cache.size > MAX) cache.delete(cache.keys().next().value);
  return null;
}
export function tileMerc(x, y, z) { const n = 2 ** z; return { mx: x / n, my: y / n, size: 1 / n }; }
// nível a usar para um zoom de vista: z14 a partir de 12,5 (quando existe), senão z12
export function levelFor(zView) { return sets[14] && zView >= 12.5 ? 14 : (sets[12] ? 12 : 0); }
// lista de URLs de todos os tiles (para o service worker encher o cache em segundo plano)
export function allUrls(prefix = '') { if (!index) return []; const out = []; for (const [x, y] of index.tiles) out.push(prefix + '12/' + x + '/' + y + '.png'); if (index.z14) for (const [x, y] of index.z14.tiles) out.push(prefix + '14/' + x + '/' + y + '.png'); return out; }
