// Étape Navegar · router.js
// Recálculo de rota offline: A* sobre o grafo de bike (graph.json, corredor de 3 km das etapas). Custo = comprimento ×
// fator da via (ciclovias e vicinais preferidas, nacionais penalizadas, autoestradas fora, gravel aceito). Ponto de
// partida e chegada são encaixados na aresta mais próxima. Devolve a polilinha e o comprimento.
import { haversine } from './geo.js';
let G = null, adj = null, gridE = null; const CELL = 0.01;
const FACTOR = { 2: 1.6, 3: 1.25, 4: 1.0, 5: 0.95, 6: 1.1, 7: 1.15, 8: 0.85, 9: 1.6, 10: 5 };
export function available() { return !!G; }
export async function load(url = 'graph.json') {
  if (G) return G;
  try { const r = await fetch(url); if (!r.ok) return null; G = await r.json(); } catch (e) { return null; }
  adj = new Array(G.nodes.length).fill(null).map(() => []); gridE = new Map();
  G.edges.forEach((e, i) => {
    const [a, b, L, cl, ow] = e; const w = L * (FACTOR[cl] || 1.2);
    adj[a].push([b, w, i, 1]); if (!ow) adj[b].push([a, w, i, -1]);
    for (const p of edgePts(i)) { const k = cellKey(p[0], p[1]); let s = gridE.get(k); if (!s) gridE.set(k, s = new Set()); s.add(i); }
  });
  return G;
}
function cellKey(lat, lon) { return Math.floor(lat / CELL) + ':' + Math.floor(lon / CELL); }
function edgePts(i) { const e = G.edges[i]; return [G.nodes[e[0]]].concat(e[6] || [], [G.nodes[e[1]]]); }
// aresta mais próxima de um ponto: {i, t (fração ao longo), p (ponto na aresta), d (m), segIdx}
function nearestEdge(lat, lon) {
  const ci = Math.floor(lat / CELL), cj = Math.floor(lon / CELL); let best = null;
  for (let r = 0; r <= 3 && !best; r++) {
    for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const s = gridE.get((ci + di) + ':' + (cj + dj)); if (!s) continue;
      for (const i of s) {
        const pts = edgePts(i), cosL = Math.cos(lat * Math.PI / 180);
        for (let k = 0; k < pts.length - 1; k++) {
          const a = pts[k], b = pts[k + 1]; const ax = (a[1] - lon) * cosL * 111320, ay = (a[0] - lat) * 111320, bx = (b[1] - lon) * cosL * 111320, by = (b[0] - lat) * 111320;
          const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy; const t = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
          const px = ax + t * dx, py = ay + t * dy, d = Math.hypot(px, py);
          if (!best || d < best.d) best = { i, k, t, d, p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] };
        }
      }
    }
  }
  return best;
}
// comprimento de uma aresta do início até (segmento k, fração t) e do ponto até o fim
function splitLengths(i, k, t) {
  const pts = edgePts(i); let before = 0, after = 0;
  for (let j = 0; j < pts.length - 1; j++) { const L = haversine(pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1]); if (j < k) before += L; else if (j > k) after += L; else { before += L * t; after += L * (1 - t); } }
  return [before, after];
}
// rota de (lat,lon) a (lat,lon): { pts: [[lat,lon]...], len: m } ou null
export function route(fromLat, fromLon, toLat, toLon, maxM = 20000) {
  if (!G) return null;
  const A = nearestEdge(fromLat, fromLon), B = nearestEdge(toLat, toLon); if (!A || !B || A.d > 400 || B.d > 400) return null;
  const N = G.nodes.length, start = N, goal = N + 1;                       // nós virtuais
  const ea = G.edges[A.i], eb = G.edges[B.i], [aBefore, aAfter] = splitLengths(A.i, A.k, A.t), [bBefore, bAfter] = splitLengths(B.i, B.k, B.t);
  const extra = new Map();                                                   // arestas virtuais: nó → [[para, custo, edgeIdx, dir]]
  const fa = FACTOR[ea[3]] || 1.2, fb = FACTOR[eb[3]] || 1.2;
  extra.set(start, [[ea[1], aAfter * fa, A.i, 1]].concat(ea[4] ? [] : [[ea[0], aBefore * fa, A.i, -1]]));
  const intoGoal = n => (extra.get(n) || []).concat([]);
  const goalLinks = { [eb[0]]: bBefore * fb, [eb[1]]: eb[4] ? Infinity : bAfter * fb };
  if (A.i === B.i) {                                                         // mesma aresta: caminho direto se o sentido permite
    const direct = (B.k > A.k || (B.k === A.k && B.t >= A.t)) || !ea[4];
    if (direct) { const pts = sliceEdge(A.i, A.k, A.t, B.k, B.t); return { pts, len: pathLen(pts) }; }
  }
  const h = n => { const p = n === start ? [fromLat, fromLon] : n === goal ? [toLat, toLon] : G.nodes[n]; return haversine(p[0], p[1], toLat, toLon) * 0.8; };
  const dist = new Map([[start, 0]]), prev = new Map(); const open = [[h(start), start]];
  const push = (f, n) => { open.push([f, n]); let i = open.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (open[p][0] <= open[i][0]) break; [open[p], open[i]] = [open[i], open[p]]; i = p; } };
  const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === i) break; [open[m], open[i]] = [open[i], open[m]]; i = m; } } return top; };
  const closed = new Set();
  while (open.length) {
    const [, n] = pop(); if (closed.has(n)) continue; closed.add(n);
    if (n === goal) break;
    const dn = dist.get(n); if (dn > maxM * 2) break;
    const links = n === start ? extra.get(start) : adj[n].slice();
    if (n !== start && goalLinks[n] != null && isFinite(goalLinks[n])) links.push([goal, goalLinks[n], B.i, 0]);
    for (const [m, w, ei, dir] of links) {
      const nd = dn + w; if (nd < (dist.get(m) ?? Infinity)) { dist.set(m, nd); prev.set(m, [n, ei, dir]); push(nd + h(m), m); }
    }
  }
  if (!prev.has(goal)) return null;
  // reconstrói a geometria
  const chain = []; let cur = goal; while (cur !== start) { const [p, ei, dir] = prev.get(cur); chain.push([p, cur, ei, dir]); cur = p; } chain.reverse();
  let pts = [];
  for (const [p, c, ei, dir] of chain) {
    let seg;
    if (p === start) { const e = G.edges[ei]; seg = c === e[1] ? sliceEdge(ei, A.k, A.t, null, null) : sliceEdge(ei, A.k, A.t, 0, 0).reverse(); if (c !== e[1]) seg = sliceEdgeRev(ei, A.k, A.t); }
    else if (c === goal) { const e = G.edges[ei]; seg = p === e[0] ? sliceEdge(ei, 0, 0, B.k, B.t) : sliceEdgeRev2(ei, B.k, B.t); }
    else { seg = edgePts(ei); if (dir === -1) seg = seg.slice().reverse(); }
    if (pts.length && seg.length && pts[pts.length - 1][0] === seg[0][0] && pts[pts.length - 1][1] === seg[0][1]) seg = seg.slice(1);
    pts = pts.concat(seg);
  }
  return { pts, len: pathLen(pts) };
}
function pathLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += haversine(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]); return L; }
// trecho da aresta de (k0,t0) até (k1,t1) (k1 null = fim)
function sliceEdge(i, k0, t0, k1, t1) {
  const pts = edgePts(i); const out = []; const kEnd = k1 == null ? pts.length - 2 : k1;
  const at = (k, t) => [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t];
  out.push(at(k0, t0)); for (let k = k0 + 1; k <= kEnd; k++) out.push(pts[k]); out.push(k1 == null ? pts[pts.length - 1] : at(k1, t1)); return out;
}
// da posição (k,t) para trás até o início da aresta
function sliceEdgeRev(i, k, t) { const pts = edgePts(i); const at = [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t]; const out = [at]; for (let j = k; j >= 0; j--) out.push(pts[j]); return out; }
// do fim da aresta para trás até a posição (k,t)
function sliceEdgeRev2(i, k, t) { const pts = edgePts(i); const at = [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t]; const out = []; for (let j = pts.length - 1; j > k; j--) out.push(pts[j]); out.push(at); return out; }
