// Étape Navegar · dem.js
// Elevação do terreno a partir dos tiles Terrarium (z12, ~38 m/px) guardados no app em dem/12/x/y.png.
// Cada tile é decodificado uma vez para Float32 (altura = R*256 + G + B/256 − 32768) e consultado com interpolação bilinear.
const Z = 12, N = 2 ** Z, MAX = 48;
const tiles = new Map(); let index = null, base = 'dem/', onLoad = null;

export function setOnLoad(cb) { onLoad = cb; }
export async function loadIndex(url = 'dem/index.json') {
  try { const r = await fetch(url); if (!r.ok) return null; index = await r.json(); base = url.replace(/index\.json$/, ''); index.set = new Set(index.tiles.map(([x, y]) => x + '/' + y)); return index; } catch (e) { return null; }
}
export function available() { return !!index; }

function decode(img) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, 256, 256).data, out = new Float32Array(256 * 256);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = d[j] * 256 + d[j + 1] + d[j + 2] / 256 - 32768;
  return out;
}
function tile(x, y) {
  const k = x + '/' + y; let e = tiles.get(k);
  if (e) { tiles.delete(k); tiles.set(k, e); return e.h; }
  if (!index || !index.set.has(k)) return null;
  const img = new Image(); e = { img, h: null };
  img.onload = () => { try { e.h = decode(img); } catch (err) { } if (onLoad) onLoad(); };
  img.src = base + Z + '/' + x + '/' + y + '.png'; tiles.set(k, e);
  if (tiles.size > MAX) tiles.delete(tiles.keys().next().value);
  return null;
}
// altitude (m) em lat/lon, ou null se o tile ainda não carregou / não existe
export function elevation(lat, lon) {
  const px = (lon + 180) / 360 * N * 256, py = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * N * 256;
  const tx = Math.floor(px / 256), ty = Math.floor(py / 256); const h = tile(tx, ty); if (!h) return null;
  let u = px - tx * 256 - 0.5, v = py - ty * 256 - 0.5; u = Math.max(0, Math.min(254.999, u)); v = Math.max(0, Math.min(254.999, v));
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, o = j * 256 + i;
  return (h[o] * (1 - fu) + h[o + 1] * fu) * (1 - fv) + (h[o + 256] * (1 - fu) + h[o + 257] * fu) * fv;
}
// pré-carrega os tiles em volta de um ponto (raio em m) para o quadro seguinte
export function warm(lat, lon, radiusM) {
  const dlat = radiusM / 111320, dlon = radiusM / (111320 * Math.cos(lat * Math.PI / 180));
  for (const [a, b] of [[lat + dlat, lon - dlon], [lat + dlat, lon + dlon], [lat - dlat, lon - dlon], [lat - dlat, lon + dlon], [lat, lon]]) elevation(a, b);
}
export const zoom = Z;
