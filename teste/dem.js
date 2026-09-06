// Étape Navegar · dem.js
// Elevação do terreno a partir dos tiles Terrarium guardados no app: z12 (~27 m/px a 45° N) na caixa inteira de cada
// etapa e, quando existe, z14 (~6,8 m/px) no corredor de 1,5 km do traçado (dem/14, índice "z14"). Cada tile é
// decodificado uma vez para Float32 (altura = R*256 + G + B/256 − 32768) e consultado com interpolação bilinear.
// elevation(): só z12 (maquete, vista 2D). elevationHi(): z14 se o tile já estiver na memória, senão z12 (relevo 3D).
const Z = 12, MAX = 200;
const tiles = new Map(); let index = null, base = 'dem/', onLoad = null; const sets = {};

export function setOnLoad(cb) { onLoad = cb; }
export async function loadIndex(url = 'dem/index.json') {
  try {
    const r = await fetch(url); if (!r.ok) return null; index = await r.json(); base = url.replace(/index\.json$/, '');
    sets[12] = new Set(index.tiles.map(([x, y]) => x + '/' + y));
    if (index.z14) sets[14] = new Set(index.z14.tiles.map(([x, y]) => x + '/' + y));
    return index;
  } catch (e) { return null; }
}
export function available() { return !!index; }
export function hasLevel(z) { return !!sets[z]; }
export function hasTile(x, y, z = Z) { return !!(sets[z] && sets[z].has(x + '/' + y)); }

function decode(img) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, 256, 256).data, out = new Float32Array(256 * 256);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = d[j] * 256 + d[j + 1] + d[j + 2] / 256 - 32768;
  return out;
}
function tile(x, y, z = Z) {
  const k = z + '/' + x + '/' + y; let e = tiles.get(k);
  if (e) { tiles.delete(k); tiles.set(k, e); return e.h; }
  if (!hasTile(x, y, z)) return null;
  const img = new Image(); e = { img, h: null };
  img.onload = () => { try { e.h = decode(img); } catch (err) { } if (onLoad) onLoad(); };
  img.src = base + z + '/' + x + '/' + y + '.png'; tiles.set(k, e);
  if (tiles.size > MAX) tiles.delete(tiles.keys().next().value);
  return null;
}
// tiles [[x,y],...] de um nível que cobrem a caixa [s,w,n,e] e existem no acervo
export function tilesFor(box, z = Z) {
  const n = 2 ** z, t = (lat, lon) => [(lon + 180) / 360 * n, (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n];
  const [x0, y0] = t(box[2], box[1]), [x1, y1] = t(box[0], box[3]); const out = [];
  for (let x = Math.floor(x0); x <= Math.floor(x1); x++) for (let y = Math.floor(y0); y <= Math.floor(y1); y++) if (hasTile(x, y, z)) out.push([x, y]);
  return out;
}
// garante uma lista de tiles [[x,y],...] carregados (os que existem no acervo)
export function ensure(list, z = Z) {
  return Promise.all(list.map(([x, y]) => new Promise(res => {
    const k = z + '/' + x + '/' + y; if (!hasTile(x, y, z)) return res();
    tile(x, y, z); const e = tiles.get(k); if (!e) return res(); if (e.h) return res();
    e.img.addEventListener('load', () => res(), { once: true }); e.img.addEventListener('error', () => res(), { once: true });
  })));
}
function sample(lat, lon, z) {
  const n = 2 ** z, px = (lon + 180) / 360 * n * 256, py = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n * 256;
  const tx = Math.floor(px / 256), ty = Math.floor(py / 256); const h = tile(tx, ty, z); if (!h) return null;
  let u = px - tx * 256 - 0.5, v = py - ty * 256 - 0.5; u = Math.max(0, Math.min(254.999, u)); v = Math.max(0, Math.min(254.999, v));
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, o = j * 256 + i;
  return (h[o] * (1 - fu) + h[o + 1] * fu) * (1 - fv) + (h[o + 256] * (1 - fu) + h[o + 257] * fu) * fv;
}
// altitude (m) em lat/lon pelo z12, ou null se o tile ainda não carregou / não existe
export function elevation(lat, lon) { return sample(lat, lon, Z); }
// altitude pelo nível mais fino disponível (z14 no corredor, senão z12)
let lowRes = 0;   // amostras que caíram para o z12 dentro do corredor z14 (tile ainda carregando)
export function elevationHi(lat, lon) { if (sets[14]) { const e = sample(lat, lon, 14); if (e != null) return e; const n = 2 ** 14, tx = Math.floor((lon + 180) / 360 * n), ty = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n); if (hasTile(tx, ty, 14)) lowRes++; } return sample(lat, lon, Z); }
export function takeLowRes() { const n = lowRes; lowRes = 0; return n; }
// pré-carrega os tiles em volta de um ponto (raio em m) para o quadro seguinte
export function warm(lat, lon, radiusM) {
  const dlat = radiusM / 111320, dlon = radiusM / (111320 * Math.cos(lat * Math.PI / 180));
  for (const [a, b] of [[lat + dlat, lon - dlon], [lat + dlat, lon + dlon], [lat - dlat, lon - dlon], [lat - dlat, lon + dlon], [lat, lon]]) elevation(a, b);
}
export const zoom = Z;
