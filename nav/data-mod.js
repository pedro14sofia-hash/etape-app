// Étape Navegar · data.js
// Carga e índice espacial do mapa (window.MAP) e dos traçados (window.ROUTES), gerados pelo build em data.js.
import { bbox, fastDist } from './geo.js';

export function loadMap() {
  const M = window.MAP || { ways: [], polys: [], waters: [], rails: [], pois: [] };
  if (!M._ready) {
    for (const arr of [M.ways, M.polys, M.waters, M.rails]) for (const w of arr) w.b = bbox(w.p);
    M.index = buildIndex(M.ways, 0.01);
    M.poiIndex = buildIndex(M.pois.map(p => (p.b = [p.lat, p.lon, p.lat, p.lon], p)), 0.02);
    M._ready = true;
  }
  return M;
}
export function loadRoutes() { return window.ROUTES; }
export function loadParadas() { return window.PARADAS || { itens: [], regras: [], dias: {} }; }

// grade espacial por caixa: célula -> lista de feições
export function buildIndex(features, cell) {
  const g = new Map();
  features.forEach((f, i) => {
    const [s, w, n, e] = f.b;
    for (let a = Math.floor(s / cell); a <= Math.floor(n / cell); a++)
      for (let b = Math.floor(w / cell); b <= Math.floor(e / cell); b++) {
        const k = a * 100000 + b; let l = g.get(k); if (!l) g.set(k, l = []); l.push(i);
      }
  });
  return { g, cell, features };
}
export function query(index, box) {
  const [s, w, n, e] = box, out = new Set(), c = index.cell;
  for (let a = Math.floor(s / c); a <= Math.floor(n / c); a++)
    for (let b = Math.floor(w / c); b <= Math.floor(e / c); b++) { const l = index.g.get(a * 100000 + b); if (l) for (const i of l) out.add(i); }
  return [...out].map(i => index.features[i]);
}
export function nearestWay(index, lat, lon, maxM = 60) {
  const d = maxM / 111000, cand = query(index, [lat - d, lon - d, lat + d, lon + d]);
  let best = null, bd = maxM;
  for (const w of cand) for (const p of w.p) { const dd = fastDist(lat, lon, p[0], p[1]); if (dd < bd) { bd = dd; best = w; } }
  return best ? { way: best, d: bd } : null;
}
export function poisNear(index, lat, lon, radiusM, kinds) {
  const d = radiusM / 111000, cand = query(index, [lat - d, lon - d, lat + d, lon + d]);
  return cand.filter(p => (!kinds || kinds.includes(p.k)) && fastDist(lat, lon, p.lat, p.lon) <= radiusM)
    .map(p => ({ poi: p, d: fastDist(lat, lon, p.lat, p.lon) })).sort((a, b) => a.d - b.d);
}
