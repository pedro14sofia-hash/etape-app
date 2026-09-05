// Étape Navegar · track.js
// Modelo da etapa: projeção no traçado, checkpoints (bornes), curvas, perfil, subidas.
import { haversine, fastDist, bearing, turnAngle } from './geo.js';
import { nearestWay } from './data-mod.js';

export function loadStage(routes, key) {
  const s = routes.stages[key], pts = s.track, cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  const total = cum[cum.length - 1], prof = s.profile;
  const upRem = new Array(prof.length); let acc = 0;
  for (let i = prof.length - 1; i > 0; i--) { upRem[i] = acc; const d = prof[i][1] - prof[i - 1][1]; if (d > 0) acc += d; }
  upRem[0] = acc;
  const stage = { key, name: routes.names[key], type: (routes.types || {})[key] || 'blanc', pts, cum, total, prof, upRem, km: s.km, up: s.up, climbs: s.climbs || [], surfaces: s.surfaces || [] };
  stage.cps = checkpoints(stage, s.wps.map(id => ({ id, ...routes.wps[id] })));
  stage.turns = detectTurns(stage, 35, 25, 60);
  return stage;
}

export function checkpoints(stage, wps) {
  const out = wps.map((w, n) => {
    const pr = project(stage, w.lat, w.lon, -1);
    const isHotel = w.id.startsWith('h_');
    return { id: w.id, name: shortName(w.label), full: w.label, lat: w.lat, lon: w.lon, ele: w.ele, idx: pr.idx, dist: pr.dist, done: false, hotel: isHotel, col: /col|pas de|puy/i.test(w.label) };
  }).sort((a, b) => a.dist - b.dist);
  out.forEach((c, i) => { c.n = i; c.kmLabel = Math.round(c.dist / 1000); });
  return out;
}
export function shortName(label) { return label.split(' (')[0].split(' · ')[0]; }

export function detectTurns(stage, minAngle, window, merge) {
  const { pts, cum } = stage, turns = []; let lastT = -1e9;
  for (let i = 2; i < pts.length - 2; i++) {
    let j = i - 1; while (j > 0 && cum[i] - cum[j] < window) j--;
    let m = i + 1; while (m < pts.length - 1 && cum[m] - cum[i] < window) m++;
    const b1 = bearing(pts[j][0], pts[j][1], pts[i][0], pts[i][1]), b2 = bearing(pts[i][0], pts[i][1], pts[m][0], pts[m][1]);
    const d = turnAngle(b1, b2);
    if (Math.abs(d) >= minAngle && cum[i] - lastT > merge) {
      const a = Math.abs(d);
      turns.push({ i, dist: cum[i], ang: d, dir: d > 0 ? 'direita' : 'esquerda', txt: a > 110 ? 'retorno' : a > 70 ? (d > 0 ? 'direita fechada' : 'esquerda fechada') : (d > 0 ? 'direita' : 'esquerda'), road: '' });
      lastT = cum[i];
    }
  }
  return turns;
}
export function nameTurns(turns, stage, index) {
  for (const t of turns) {
    const k = Math.min(stage.pts.length - 1, t.i + 3), p = stage.pts[k];
    const nw = nearestWay(index, p[0], p[1], 40);
    t.road = nw && nw.way.n ? nw.way.n : '';
  }
  return turns;
}

// projeção da posição no traçado; busca local em torno de hintIdx, global se hintIdx < 0
// índice do traçado para uma distância acumulada
export function idxAtDist(stage, dist) { const c = stage.cum; let lo = 0, hi = c.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (c[m] < dist) lo = m + 1; else hi = m; } return lo; }

// janela local: ~2 km para trás e ~8 km para a frente, para não pular para a volta nos trechos de ida e volta
export function project(stage, lat, lon, hintIdx) {
  const { pts, cum } = stage; let lo = 0, hi = pts.length - 1;
  if (hintIdx >= 0) {
    lo = hintIdx; while (lo > 0 && cum[hintIdx] - cum[lo] < 2000) lo--;
    hi = hintIdx; while (hi < pts.length - 1 && cum[hi] - cum[hintIdx] < 8000) hi++;
  }
  // empate entre ida e volta na mesma estrada: penaliza andar para trás (0,2 m por metro), sem impedir um retorno real
  let best = 1e12, bi = Math.max(0, hintIdx); const ref = hintIdx >= 0 ? cum[hintIdx] : 0;
  for (let i = lo; i <= hi; i++) {
    const d = fastDist(lat, lon, pts[i][0], pts[i][1]), score = hintIdx >= 0 ? d + Math.max(0, ref - cum[i]) * 0.2 : d;
    if (score < best) { best = score; bi = i; }
  }
  best = fastDist(lat, lon, pts[bi][0], pts[bi][1]);
  // refina entre o vértice e os vizinhos
  let dist = cum[bi], off = best;
  for (const j of [bi - 1, bi + 1]) {
    if (j < 0 || j >= pts.length) continue;
    const a = pts[Math.min(bi, j)], b = pts[Math.max(bi, j)];
    const seg = segProj([lat, lon], a, b);
    if (seg.d < off) { off = seg.d; dist = cum[Math.min(bi, j)] + seg.t * (cum[Math.max(bi, j)] - cum[Math.min(bi, j)]); }
  }
  return { idx: bi, dist, off };
}
function segProj(p, a, b) {
  const k = Math.cos(p[0] * Math.PI / 180);
  const ax = (a[1] - p[1]) * k, ay = a[0] - p[0], bx = (b[1] - p[1]) * k, by = b[0] - p[0];
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? -(ax * dx + ay * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx, qy = ay + t * dy;
  return { d: Math.sqrt(qx * qx + qy * qy) * 6371000 * Math.PI / 180, t };
}
export function elevationAt(stage, dist) {
  const p = stage.prof, km = dist / 1000; let lo = 0, hi = p.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (p[mid][0] < km) lo = mid + 1; else hi = mid; }
  const i = Math.max(1, lo), a = p[i - 1], b = p[i], t = Math.min(1, Math.max(0, (km - a[0]) / Math.max(1e-6, b[0] - a[0])));
  return a[1] + (b[1] - a[1]) * t;
}
export function climbRemaining(stage, dist) {
  const p = stage.prof, km = dist / 1000; let i = 0;
  while (i < p.length - 1 && p[i + 1][0] < km) i++;
  return stage.upRem[i + 1] !== undefined ? stage.upRem[i + 1] : 0;
}
export function nextCheckpoint(stage, dist) { return stage.cps.find(c => !c.done && c.dist > dist - 50) || stage.cps[stage.cps.length - 1]; }
export function nextTurn(stage, dist) { return stage.turns.find(t => t.dist > dist); }
export function pointAt(stage, dist) {
  const { pts, cum } = stage; let lo = 0, hi = cum.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < dist) lo = mid + 1; else hi = mid; }
  const i = Math.max(1, lo), t = Math.min(1, Math.max(0, (dist - cum[i - 1]) / Math.max(1, cum[i] - cum[i - 1])));
  return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
}
export function bearingAt(stage, dist) {
  const a = pointAt(stage, Math.max(0, dist - 30)), b = pointAt(stage, Math.min(stage.total, dist + 30));
  return bearing(a[0], a[1], b[0], b[1]);
}
// inclinação média nos próximos windowM metros
// rampa à frente (próximos windowM), para previsão
export function gradeAhead(stage, dist, windowM = 200) {
  const d2 = Math.min(stage.total, dist + windowM), d1 = Math.max(0, Math.min(dist, d2 - 50));
  return (elevationAt(stage, d2) - elevationAt(stage, d1)) / Math.max(50, d2 - d1) * 100;
}
// rampa onde se está: janela centrada (metade atrás, metade à frente) sobre o perfil suavizado, sem os degraus
// do perfil em passos de 40–50 m com metros inteiros
export function gradeAt(stage, dist, windowM = 120) {
  const d1 = Math.max(0, dist - windowM / 2), d2 = Math.min(stage.total, dist + windowM / 2); if (d2 - d1 < 30) return 0;
  return (elevationSmoothAt(stage, d2) - elevationSmoothAt(stage, d1)) / (d2 - d1) * 100;
}
export function elevationSmoothAt(stage, dist) {
  if (!stage.profS) { const p = stage.prof, n = p.length; stage.profS = p.map((q, i) => { let s = 0, c = 0; for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) { s += p[j][1]; c++; } return [q[0], s / c]; }); }
  const saved = stage.prof; stage.prof = stage.profS; try { return elevationAt(stage, dist); } finally { stage.prof = saved; }
}
export function climbAt(stage, dist) { return stage.climbs.find(c => dist >= c.from - 100 && dist < c.to); }
export function surfaceAt(stage, dist) { const s = stage.surfaces.find(x => dist >= x.from && dist < x.to); return s ? s.kind : ''; }
export function nextSurfaceChange(stage, dist) { const cur = surfaceAt(stage, dist); return stage.surfaces.find(x => x.from > dist && x.kind !== cur) || null; }
