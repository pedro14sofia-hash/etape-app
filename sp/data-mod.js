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
// curvas de nível (contours.json, geradas no build por contours_build.py): índice espacial em M.contours quando o arquivo existe
export async function loadContours(M, url = 'contours.json') {
  try {
    const r = await fetch(url); if (!r.ok) return null; const d = await r.json();
    const lines = d.lines.filter(l => l.p.length > 1); for (const l of lines) l.b = bbox(l.p);
    M.contours = buildIndex(lines, 0.01); M.contourStep = d.step; return M.contours;
  } catch (e) { return null; }
}
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
  // distância ao segmento (não só aos vértices): vias longas e retas simplificadas têm poucos pontos
  const kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 111320; let best = null, bd = maxM;
  for (const w of cand) {
    const P = w.p;
    for (let i = 0; i < P.length; i++) {
      let dd;
      if (i) { const ax = (P[i - 1][1] - lon) * kx, ay = (P[i - 1][0] - lat) * ky, bx = (P[i][1] - lon) * kx, by = (P[i][0] - lat) * ky, vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
        const t = L2 > 0 ? Math.max(0, Math.min(1, -(ax * vx + ay * vy) / L2)) : 0; dd = Math.hypot(ax + vx * t, ay + vy * t); }
      else dd = Math.hypot((P[0][1] - lon) * kx, (P[0][0] - lat) * ky);
      if (dd < bd) { bd = dd; best = w; }
    }
  }
  return best ? { way: best, d: bd } : null;
}
export function poisNear(index, lat, lon, radiusM, kinds) {
  const d = radiusM / 111000, cand = query(index, [lat - d, lon - d, lat + d, lon + d]);
  return cand.filter(p => (!kinds || kinds.includes(p.k)) && fastDist(lat, lon, p.lat, p.lon) <= radiusM)
    .map(p => ({ poi: p, d: fastDist(lat, lon, p.lat, p.lon) })).sort((a, b) => a.d - b.d);
}
