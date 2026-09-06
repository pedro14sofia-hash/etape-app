// Étape Navegar · match.js
// Casador de mapa (map matching) para a navegação livre: a cada fix escolhe a via mais provável pela distância, pelo rumo
// (com a mão da via) e pela continuidade com a via anterior, devolve a posição encaixada, a rua (nome, classe, superfície,
// ciclovia) e o próximo cruzamento à frente no sentido do movimento. Trabalha sobre o índice espacial de window.MAP
// (data.js), sem grafo: cruzamentos são vias com outro nome que passam a menos de 12 m da via atual.
import { query } from './data-mod.js';
import { bearing } from './geo.js';

const CLASS_TXT = { 1: 'rodovia', 2: 'avenida', 3: 'avenida', 4: 'via coletora', 5: 'rua', 6: 'via de serviço', 7: 'estrada de terra', 8: 'ciclovia', 9: 'caminho' };
const SURF_TXT = { asphalt: 'asfalto', paved: 'pavimento', concrete: 'concreto', paving_stones: 'paralelepípedo', sett: 'paralelepípedo', cobblestone: 'pedra', unpaved: 'terra', gravel: 'cascalho', fine_gravel: 'saibro', dirt: 'terra', ground: 'terra', compacted: 'saibro', sand: 'areia', wood: 'madeira' };
export function classLabel(w) { return w.k === 2 ? 'ciclovia' : (CLASS_TXT[w.c] || 'via'); }
export function surfaceLabel(w) { return SURF_TXT[w.s] || (w.s ? w.s : (w.c <= 6 ? 'asfalto' : '')); }
export function bikewayLabel(w) { return w.k === 2 ? 'ciclovia' : w.k === 1 ? 'ciclofaixa' : ''; }

// ponto mais próximo de p num segmento a-b (metros locais); devolve {d, t, x, y}
function segNearest(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2)) : 0;
  const x = ax + vx * t, y = ay + vy * t; return { d: Math.hypot(px - x, py - y), t, x, y };
}
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

// candidato mais provável. prev = resultado anterior (continuidade), fix = {lat, lon, head (graus), v (m/s)}
export function locate(map, fix, prev, maxM = 45) {
  const lat = fix.lat, lon = fix.lon, kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 111320;
  const d = maxM / 111000, cand = query(map.index, [lat - d, lon - d, lat + d, lon + d]);
  const moving = (fix.v || 0) > 1.5 && fix.head != null;
  let best = null;
  for (const w of cand) {
    const P = w.p; if (P.length < 2 || w.c === 1 && !w.k) continue;   // rodovias sem ciclovia ficam de fora
    for (let i = 1; i < P.length; i++) {
      const ax = (P[i - 1][1] - lon) * kx, ay = (P[i - 1][0] - lat) * ky, bx = (P[i][1] - lon) * kx, by = (P[i][0] - lat) * ky;
      const n = segNearest(0, 0, ax, ay, bx, by); if (n.d > maxM) continue;
      let score = n.d / 12;
      let dir = 1;   // +1: andando no sentido dos pontos da via; -1: contrário
      if (moving) {
        const bAB = bearing(P[i - 1][0], P[i - 1][1], P[i][0], P[i][1]);
        const dF = angDiff(fix.head, bAB), dB = angDiff(fix.head, (bAB + 180) % 360);
        dir = dF <= dB ? 1 : -1; const dh = Math.min(dF, dB);
        score += dh / 30;
        if (w.o === 1 && dir === -1 || w.o === -1 && dir === 1) score += 2.5;   // contramão: só se não houver alternativa
      } else if (prev && prev.way === w) dir = prev.dir;
      if (w.c === 9 && w.k !== 2) score += 1.2;                                  // caminhos e calçadas só na falta de rua
      if (w.k === 2) score -= 0.3;                                               // ciclovia leva vantagem no empate
      if (prev && prev.way !== w) score += prev.stable ? 1.0 : 0.4;              // continuidade
      if (!best || score < best.score) best = { way: w, seg: i, t: n.t, score, dist: n.d, dir, x: n.x, y: n.y };
    }
  }
  if (!best) return null;
  const P = best.way.p, a = P[best.seg - 1], b = P[best.seg];
  const slat = a[0] + (b[0] - a[0]) * best.t, slon = a[1] + (b[1] - a[1]) * best.t;
  const same = prev && prev.way === best.way;
  return { way: best.way, seg: best.seg, t: best.t, dir: best.dir, off: best.dist, lat: slat, lon: slon, name: best.way.n || '', stable: same ? Math.min(9, (prev.stable || 0) + 1) : 0,
    head: (bearing(a[0], a[1], b[0], b[1]) + (best.dir < 0 ? 180 : 0)) % 360 };
}

// próximo cruzamento à frente (≤ lookM) no sentido do movimento: {name, dist, way, lat, lon} ou null
export function nextCross(map, m, lookM = 400) {
  if (!m) return null;
  const P = m.way.p, kx = 111320 * Math.cos(m.lat * Math.PI / 180), ky = 111320;
  let acc = 0, i = m.seg, t = m.t; const seen = new Set([m.way]);
  const step = m.dir > 0 ? 1 : -1;
  for (let guard = 0; guard < 200 && acc < lookM; guard++) {
    // segmento atual do ponto de partida até o vértice seguinte no sentido do movimento
    const a = m.dir > 0 ? [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * t, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t] : [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * t, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t];
    const b = m.dir > 0 ? P[i] : P[i - 1];
    const segLen = Math.hypot((b[1] - a[1]) * kx, (b[0] - a[0]) * ky);
    if (segLen > 0.5) {
      const box = [Math.min(a[0], b[0]) - 0.00015, Math.min(a[1], b[1]) - 0.00015, Math.max(a[0], b[0]) + 0.00015, Math.max(a[1], b[1]) + 0.00015];
      let hit = null;
      for (const w of query(map.index, box)) {
        if (seen.has(w) || !w.n || w.n === m.way.n || (w.c === 9 && w.k !== 2)) continue;
        const Q = w.p, bAB = bearing(a[0], a[1], b[0], b[1]);
        for (let j = 1; j < Q.length; j++) {
          // vias paralelas (ciclovia ao lado, pista contrária) não são cruzamento: só segmentos com ângulo > 30°
          const bQ = bearing(Q[j - 1][0], Q[j - 1][1], Q[j][0], Q[j][1]); if (Math.min(angDiff(bAB, bQ), angDiff(bAB, (bQ + 180) % 360)) < 30) continue;
          // distância entre os segmentos a-b e Q[j-1]-Q[j]: aproximada pelos extremos de um contra o outro
          const ax = 0, ay = 0, bx = (b[1] - a[1]) * kx, by = (b[0] - a[0]) * ky;
          const c = [(Q[j - 1][1] - a[1]) * kx, (Q[j - 1][0] - a[0]) * ky], dd = [(Q[j][1] - a[1]) * kx, (Q[j][0] - a[0]) * ky];
          const n1 = segNearest(c[0], c[1], ax, ay, bx, by), n2 = segNearest(dd[0], dd[1], ax, ay, bx, by);
          const n3 = segNearest(ax, ay, c[0], c[1], dd[0], dd[1]), n4 = segNearest(bx, by, c[0], c[1], dd[0], dd[1]);
          let along = null, dmin = 1e9;
          if (n1.d < dmin) { dmin = n1.d; along = n1.t * segLen; }
          if (n2.d < dmin) { dmin = n2.d; along = n2.t * segLen; }
          if (n3.d < dmin) { dmin = n3.d; along = 0; }
          if (n4.d < dmin) { dmin = n4.d; along = segLen; }
          // cruzamento de verdade: os segmentos se interceptam (produtos vetoriais com sinais opostos)
          const cr = (ux, uy, vx, vy) => ux * vy - uy * vx;
          const s1 = cr(bx - ax, by - ay, c[0] - ax, c[1] - ay), s2 = cr(bx - ax, by - ay, dd[0] - ax, dd[1] - ay);
          const s3 = cr(dd[0] - c[0], dd[1] - c[1], ax - c[0], ay - c[1]), s4 = cr(dd[0] - c[0], dd[1] - c[1], bx - c[0], by - c[1]);
          if (s1 * s2 < 0 && s3 * s4 < 0) { const u = s1 / (s1 - s2); dmin = 0; along = u * segLen; }
          if (dmin <= 12 && along != null && acc + along > 8 && (!hit || acc + along < hit.dist)) hit = { name: w.n, dist: acc + along, way: w, lat: a[0] + (b[0] - a[0]) * along / segLen, lon: a[1] + (b[1] - a[1]) * along / segLen };
        }
      }
      if (hit) return hit;
    }
    acc += segLen; i += step; t = m.dir > 0 ? 0 : 1;
    if (i < 1 || i >= P.length) break;
  }
  return null;
}
