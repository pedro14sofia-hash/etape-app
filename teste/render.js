// Étape Navegar · render.js
// Desenho do mapa (estilo Carte Michelin, dia e noite) e do perfil no Canvas. Só desenha quando invalidado.
import { mercX, mercY, metersPerPixel } from './geo.js';
import { query } from './data-mod.js';
import { elevationAt } from './track.js';

export const THEMES = {
  day: { map: '#F4EFE1', forest: '#D9E5C6', res: '#EAE5D8', water: '#A9CDE6', waterLine: '#7FB2D6', waterTxt: '#3E7FAF', rail: '#6C7176',
    r1: '#E63329', r2: '#E63329', r3: '#E8473D', r4: '#F5D96B', r5: '#FFFFFF', r6: '#FFFFFF', r7: '#B8946A', r8: '#3A9A5A', r9: '#9A9A9A', casing: '#17191C', casingMinor: '#A8A498',
    ribbon: '#FFD100', ribbonCasing: '#17191C', done: '#17191C', other: '#C9C3B4', gravel: '#6B4423', label: '#17191C', halo: '#F4EFE1', borne: '#FFFFFF', forestTxt: '#4A6B3A', contour: '#C9A97A',
    puck: '#FFD100', bike: '#17191C', acc: 'rgba(255,209,0,.18)', scale: '#17191C', poiBg: '#FFFFFF' },
  night: { map: '#1A1C21', forest: '#20271F', res: '#22252A', water: '#213A4C', waterLine: '#2E5A73', waterTxt: '#7FB2D6', rail: '#6C7176',
    r1: '#C8322A', r2: '#C8322A', r3: '#B8362E', r4: '#A08E3C', r5: '#5A5F68', r6: '#4B5058', r7: '#7A6242', r8: '#3A7A4A', r9: '#4B5058', casing: '#0A0B0D', casingMinor: '#0A0B0D',
    ribbon: '#FFD100', ribbonCasing: '#F1EEE6', done: '#B9BCC2', other: '#3A3E45', gravel: '#D9A066', label: '#E6E2D8', halo: '#1A1C21', borne: '#F1EEE6', forestTxt: '#7FA070', contour: '#4A4033',
    puck: '#FFD100', bike: '#17191C', acc: 'rgba(255,209,0,.16)', scale: '#E6E2D8', poiBg: '#1D1F23' }
};
const CLASSW = { 1: 5, 2: 4.6, 3: 3.8, 4: 3.2, 5: 2.4, 6: 1.6, 7: 1.6, 8: 2, 9: 1.2 };
const MINZ = { 1: 9, 2: 10, 3: 11, 4: 12, 5: 13, 6: 14, 7: 14, 8: 13, 9: 15 };
const POI = { water: ['#3E7FAF', 'drop'], bakery: ['#B8720A', 'sq'], shop: ['#B8720A', 'tri'], bike: ['#2F8F46', 'dia'], pharmacy: ['#2F8F46', 'plus'], hospital: ['#D71920', 'H'], pass: ['#17191C', 'pass'], peak: ['#17191C', 'peak'], toilets: ['#3E7FAF', 'WC'], cafe: ['#B8720A', 'C'] };

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { cx: 0, cy: 0, z: 13, rot: 0, anchorY: 0.5 }; // rot em radianos (rumo para cima = -heading)
  let dpr = 1, W = 0, H = 0, dirty = true, theme = THEMES.day;
  function resize() { dpr = Math.min(window.devicePixelRatio || 1, 2); W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); dirty = true; }
  const scale = () => 256 * Math.pow(2, view.z);
  function toPx(lat, lon) {
    const s = scale(), px = (mercX(lon) - view.cx) * s, py = (mercY(lat) - view.cy) * s;
    const c = Math.cos(view.rot), sn = Math.sin(view.rot);
    return [px * c - py * sn + W / 2, px * sn + py * c + H * view.anchorY];
  }
  function fromPx(x, y) {
    const s = scale(), dx = x - W / 2, dy = y - H * view.anchorY, c = Math.cos(-view.rot), sn = Math.sin(-view.rot);
    return { mx: view.cx + (dx * c - dy * sn) / s, my: view.cy + (dx * sn + dy * c) / s };
  }
  function visibleBox() { // caixa lat/lon que cobre o círculo da tela (rotação)
    const s = scale(), r = Math.hypot(W, H) / 2 / s * 1.05;
    const lat = y => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI), lon = x => x * 360 - 180;
    return [lat(view.cy + r), lon(view.cx - r), lat(view.cy - r), lon(view.cx + r)];
  }
  const path = pts => { ctx.beginPath(); for (let i = 0; i < pts.length; i++) { const q = toPx(pts[i][0], pts[i][1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); } };
  const inter = (b, box) => !(b[2] < box[0] || b[0] > box[2] || b[3] < box[1] || b[1] > box[3]);
  function label(txt, x, y, align = 'left', font = '600 13px Archivo, sans-serif', color = theme.label) {
    ctx.font = font; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineWidth = 4; ctx.strokeStyle = theme.halo; ctx.lineJoin = 'round'; ctx.strokeText(txt, x, y); ctx.fillStyle = color; ctx.fillText(txt, x, y); ctx.textAlign = 'left';
  }
  function draw(S) {
    if (!dirty) return; dirty = false;
    const M = S.map, st = S.stage, z = view.z, box = visibleBox(), th = theme;
    ctx.fillStyle = th.map; ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (z >= 10.5) for (const p of M.polys) if (inter(p.b, box)) { path(p.p); ctx.closePath(); ctx.fillStyle = p.t === 'wood' ? th.forest : th.res; ctx.fill(); }
    for (const w of M.waters) if (inter(w.b, box)) { path(w.p); if (w.t === 'a') { ctx.closePath(); ctx.fillStyle = th.water; ctx.fill(); } else { ctx.strokeStyle = th.water; ctx.lineWidth = z >= 13 ? 3 : 1.5; ctx.stroke(); } }
    if (z >= 11) for (const r of M.rails) if (inter(r.b, box)) { path(r.p); ctx.strokeStyle = th.rail; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]); }
    // estradas: por classe, casing e depois preenchimento
    const zf = Math.max(0.6, Math.min(1.7, (z - 11) / 4 + 0.6));
    const ways = query(M.index, box).filter(w => z >= MINZ[w.c]);
    ways.sort((a, b) => b.c - a.c);
    for (const w of ways) { if (w.c >= 7) continue; path(w.p); ctx.strokeStyle = w.c <= 4 ? th.casing : th.casingMinor; ctx.lineWidth = CLASSW[w.c] * zf + 1.8; ctx.stroke(); }
    for (const w of ways) { path(w.p); ctx.strokeStyle = th['r' + w.c]; ctx.lineWidth = CLASSW[w.c] * zf; if (w.c === 7 || w.c === 9) ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]); }
    // outras etapas
    ctx.lineWidth = 2; ctx.strokeStyle = th.other;
    for (const k in S.routes.stages) if (k !== st.key) { path(S.routes.stages[k].track); ctx.stroke(); }
    // fita da etapa: feito (tracejado) e restante (amarela com casaco)
    const ci = S.proj.idx || 0;
    ctx.lineWidth = 10; ctx.strokeStyle = th.ribbonCasing; path(st.pts.slice(ci)); ctx.stroke();
    ctx.lineWidth = 6; ctx.strokeStyle = th.ribbon; ctx.stroke();
    for (const sf of st.surfaces) if (sf.kind !== 'asfalto' && sf.to > S.proj.dist) { path(sliceByDist(st, Math.max(sf.from, S.proj.dist), sf.to)); ctx.strokeStyle = th.gravel; ctx.lineWidth = 2.4; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]); }
    ctx.lineWidth = 3; ctx.strokeStyle = th.done; ctx.setLineDash([7, 6]); path(st.pts.slice(0, ci + 1)); ctx.stroke(); ctx.setLineDash([]);
    // curvas
    if (z >= 14) for (const t of st.turns) { if (t.dist < S.proj.dist - 200) continue; const q = toPx(st.pts[t.i][0], st.pts[t.i][1]); ctx.beginPath(); ctx.arc(q[0], q[1], 7, 0, 7); ctx.fillStyle = th.borne; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = th.casing; ctx.stroke(); }
    // rótulos de estradas
    if (z >= 14) { ctx.font = '600 12px "Archivo Narrow", Archivo, sans-serif'; const seen = new Set(); for (const w of ways) { if (!w.n || w.c > (z >= 16 ? 5 : 4) || seen.has(w.n) || (z < 15.5 && !/^[A-Z] ?\d/.test(w.n))) continue; const mid = w.p[w.p.length >> 1]; const q = toPx(mid[0], mid[1]); if (q[0] < 0 || q[0] > W || q[1] < 60 || q[1] > H) continue; seen.add(w.n); label(w.n, q[0], q[1], 'center', '600 12px "Archivo Narrow", Archivo, sans-serif'); } }
    // POIs
    if (z >= 13) for (const p of query(M.poiIndex, box)) { if (p.k.startsWith('place') || (z < 15 && (p.k === 'shop' || p.k === 'bakery' || p.k === 'pharmacy' || p.k === 'cafe' || p.k === 'toilets'))) continue; const q = toPx(p.lat, p.lon); if (q[0] < -20 || q[0] > W + 20 || q[1] < -20 || q[1] > H + 20) continue; poiIcon(p, q, z); }
    // paradas (foto/visita/compras)
    if (z >= 12) for (const p of S.paradas) { const q = toPx(p.lat, p.lon); if (q[0] < -30 || q[0] > W + 30 || q[1] < -30 || q[1] > H + 30) continue; sightIcon(p, q, z); }
    // lugares
    for (const p of query(M.poiIndex, box)) { if (!p.k.startsWith('place')) continue; const t = p.k.slice(6), minz = t === 'city' ? 9 : t === 'town' ? 10 : t === 'village' ? 12 : 14.5; if (z < minz) continue; const q = toPx(p.lat, p.lon); if (q[0] < -60 || q[0] > W + 60 || q[1] < 50 || q[1] > H) continue; label(p.n.toUpperCase(), q[0], q[1], 'center', (t === 'city' || t === 'town' ? '800 16px' : t === 'village' ? '700 14px' : '600 12px') + ' "Archivo Narrow", Archivo, sans-serif'); }
    // bornes
    for (const c of st.cps) { const q = toPx(c.lat, c.lon); if (q[0] < -40 || q[0] > W + 40 || q[1] < -40 || q[1] > H + 40) continue; borne(c, q, z); }
    // posição
    if (S.fix) { const q = toPx(S.fix.lat, S.fix.lon); const mpp = metersPerPixel(S.fix.lat, view.z); const accPx = Math.min(200, (S.fix.acc || 0) / mpp); if (accPx > 12) { ctx.beginPath(); ctx.arc(q[0], q[1], accPx, 0, 7); ctx.fillStyle = th.acc; ctx.fill(); } bike(q, ((S.fix.head || 0) * Math.PI / 180) + view.rot); }
    // escala
    const mpp = metersPerPixel(S.fix ? S.fix.lat : 45.3, view.z), bar = [100, 200, 500, 1000, 2000, 5000].find(v => v / mpp > 60) || 5000;
    const sx = S.mode === 'resumo' ? 156 : 12;
    ctx.fillStyle = th.scale; ctx.fillRect(sx, H - S.scaleBottom - 4, bar / mpp, 4); ctx.fillStyle = th.borne; ctx.fillRect(sx, H - S.scaleBottom - 4, bar / mpp / 2, 4); ctx.strokeStyle = th.scale; ctx.lineWidth = 0.8; ctx.strokeRect(sx, H - S.scaleBottom - 4, bar / mpp, 4);
    label(bar >= 1000 ? (bar / 1000) + ' km' : bar + ' m', sx, H - S.scaleBottom - 12, 'left', '600 11px Archivo, sans-serif');
  }
  function sliceByDist(st, a, b) { const out = []; for (let i = 0; i < st.pts.length; i++) if (st.cum[i] >= a && st.cum[i] <= b) out.push(st.pts[i]); return out.length > 1 ? out : []; }
  function borne(c, q, z) {
    const w = 26, h = 30, x = q[0] - w / 2, y = q[1] - h;
    ctx.beginPath(); rr(x, y, w, h, 4); ctx.fillStyle = c.done ? theme.res : theme.borne; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = theme.casing; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.arc(q[0], y + 13, 13, Math.PI, 0); ctx.lineTo(x + w, y + 10); ctx.lineTo(x, y + 10); ctx.closePath(); ctx.fillStyle = (c.col || c.hotel) ? '#D71920' : '#FFD100'; ctx.fill();
    ctx.fillStyle = '#17191C'; ctx.font = '800 13px "Big Shoulders Display", "Arial Narrow", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(c.kmLabel), q[0], y + 22); ctx.textAlign = 'left';
    if (z >= 12) label(c.name + (c.ele ? ' ' + c.ele + ' m' : ''), q[0] + 17, q[1] - 8, 'left', '600 13px "Archivo Narrow", Archivo, sans-serif');
  }
  function sightIcon(p, q, z) {
    const col = p.kind === 'compras' ? '#B8720A' : p.kind === 'opcional' ? theme.label : '#D71920';
    ctx.beginPath(); ctx.arc(q[0], q[1], 9, 0, 7); ctx.fillStyle = theme.borne; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = col; if (p.kind === 'opcional') ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath();
    if (p.kind === 'compras') { ctx.rect(q[0] - 4, q[1] - 2, 8, 6); ctx.moveTo(q[0] - 2.5, q[1] - 2); ctx.arc(q[0], q[1] - 2, 2.5, Math.PI, 0); }
    else { ctx.rect(q[0] - 5, q[1] - 3, 10, 7); ctx.moveTo(q[0] + 2.5, q[1] + 0.5); ctx.arc(q[0], q[1] + 0.5, 2.2, 0, 7); }
    ctx.stroke();
    if (z >= 14) label(p.nome.split(' · ')[0], q[0] + 12, q[1], 'left', '600 12px "Archivo Narrow", Archivo, sans-serif');
  }
  function poiIcon(p, q, z) {
    const s = POI[p.k]; if (!s) return;
    ctx.beginPath(); ctx.arc(q[0], q[1], 7.5, 0, 7); ctx.fillStyle = theme.poiBg; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = s[0]; ctx.stroke();
    ctx.fillStyle = s[0]; ctx.strokeStyle = s[0]; ctx.beginPath();
    switch (s[1]) {
      case 'drop': ctx.moveTo(q[0], q[1] - 4); ctx.bezierCurveTo(q[0] + 3, q[1], q[0] + 3, q[1] + 2, q[0], q[1] + 4); ctx.bezierCurveTo(q[0] - 3, q[1] + 2, q[0] - 3, q[1], q[0], q[1] - 4); ctx.fill(); break;
      case 'sq': ctx.fillRect(q[0] - 3, q[1] - 3, 6, 6); break;
      case 'tri': ctx.moveTo(q[0], q[1] - 4); ctx.lineTo(q[0] + 4, q[1] + 3); ctx.lineTo(q[0] - 4, q[1] + 3); ctx.fill(); break;
      case 'dia': ctx.moveTo(q[0], q[1] - 4); ctx.lineTo(q[0] + 4, q[1]); ctx.lineTo(q[0], q[1] + 4); ctx.lineTo(q[0] - 4, q[1]); ctx.fill(); break;
      case 'plus': ctx.fillRect(q[0] - 1, q[1] - 4, 2, 8); ctx.fillRect(q[0] - 4, q[1] - 1, 8, 2); break;
      case 'H': case 'WC': case 'C': ctx.font = (s[1] === 'WC' ? '800 7px' : '800 10px') + ' Archivo'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s[1], q[0], q[1] + 0.5); ctx.textAlign = 'left'; break;
      case 'pass': ctx.moveTo(q[0] - 4, q[1] - 3); ctx.lineTo(q[0], q[1] + 2); ctx.lineTo(q[0] + 4, q[1] - 3); ctx.lineWidth = 1.8; ctx.stroke(); break;
      case 'peak': ctx.moveTo(q[0], q[1] - 4); ctx.lineTo(q[0] + 4, q[1] + 3); ctx.lineTo(q[0] - 4, q[1] + 3); ctx.closePath(); ctx.fill(); break;
    }
    if ((z >= 16 || ((p.k === 'peak' || p.k === 'pass' || p.k === 'water') && z >= 14.5)) && p.n) label(p.n + (p.k === 'peak' || p.k === 'pass' ? (p.e ? ' ' + p.e : '') : ''), q[0] + 10, q[1], 'left', '600 11px "Archivo Narrow", Archivo, sans-serif');
  }
  function bike(q, rot) {
    ctx.save(); ctx.translate(q[0], q[1]);
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, 7); ctx.fillStyle = theme.acc; ctx.fill();
    ctx.save(); ctx.rotate(rot); ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(9, -20); ctx.lineTo(-9, -20); ctx.closePath(); ctx.fillStyle = theme.bike; ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, 19, 0, 7); ctx.fillStyle = theme.puck; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = theme.ribbonCasing; ctx.stroke();
    ctx.strokeStyle = theme.bike; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.translate(0, 1.5); ctx.scale(.95, .95);
    ctx.beginPath(); ctx.arc(-8, 4, 6, 0, 7); ctx.moveTo(14, 4); ctx.arc(8, 4, 6, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-8, 4); ctx.lineTo(-3, -5); ctx.lineTo(6, -5); ctx.lineTo(8, 4); ctx.lineTo(2, 4); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-3, -5); ctx.lineTo(-5, -8); ctx.moveTo(6, -5); ctx.lineTo(8, -9); ctx.lineTo(10, -9); ctx.moveTo(-6, -8); ctx.lineTo(-3, -8); ctx.stroke();
    ctx.restore();
  }
  function rr(x, y, w, h, r) { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  return {
    view, resize, toPx, fromPx, invalidate() { dirty = true; }, draw, size() { return { W, H }; },
    setTheme(name) { theme = THEMES[name] || THEMES.day; dirty = true; },
    setView(cx, cy, z, rot) { if (cx != null) view.cx = cx; if (cy != null) view.cy = cy; if (z != null) view.z = Math.max(9, Math.min(17.5, z)); if (rot != null) view.rot = rot; dirty = true; },
    centerOn(lat, lon) { view.cx = mercX(lon); view.cy = mercY(lat); dirty = true; }
  };
}

// perfil da etapa (aba Perfil e sparkline do resumo) no estilo Tour: silhueta escura sobre amarelo
export function drawProfile(canvas, stage, dist, theme, opts = {}) {
  const ctx = canvas.getContext('2d'), dpr = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return; if (canvas.width !== Math.round(w * dpr)) { canvas.width = w * dpr; canvas.height = h * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const p = stage.prof, km = stage.total / 1000; let lo = 1e9, hi = -1e9; for (const q of p) { if (q[1] < lo) lo = q[1]; if (q[1] > hi) hi = q[1]; }
  lo = Math.floor((lo - 40) / 100) * 100; hi = Math.ceil((hi + 80) / 100) * 100;
  const X = d => d / km * w, Y = e => h - 2 - (e - lo) / (hi - lo) * (h - 6);
  ctx.fillStyle = theme === 'night' ? '#F2C500' : '#FFE566'; ctx.fillRect(0, 0, w, h);
  ctx.beginPath(); ctx.moveTo(0, h); for (const q of p) ctx.lineTo(X(q[0]), Y(q[1])); ctx.lineTo(w, h); ctx.closePath(); ctx.fillStyle = '#17191C'; ctx.fill();
  const xd = X(dist / 1000); ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.fillRect(0, 0, xd, h); ctx.fillStyle = '#D71920'; ctx.fillRect(xd - 1, 0, 2, h);
  if (opts.labels) {
    ctx.fillStyle = '#17191C'; ctx.font = '800 11px "Big Shoulders Display", "Arial Narrow", sans-serif'; ctx.textBaseline = 'middle';
    for (const c of stage.climbs) {
      const txt = c.name + ' · ' + c.cat, tw = ctx.measureText(txt).width; let y = Y(c.topEle) - 4; if (y - tw < 4) y = Math.min(h - 6, tw + 4);
      const x = Math.min(w - 6, Math.max(8, X(c.to / 1000)));
      ctx.save(); ctx.translate(x, y); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'left'; ctx.lineWidth = 3; ctx.strokeStyle = theme === 'night' ? '#F2C500' : '#FFE566'; ctx.lineJoin = 'round'; ctx.strokeText(txt, 2, 0); ctx.fillStyle = '#17191C'; ctx.fillText(txt, 2, 0); ctx.restore();
    }
    ctx.font = '600 10px "Archivo Narrow", Archivo, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#17191C';
    const a = stage.cps[0], b = stage.cps[stage.cps.length - 1]; ctx.fillText(a.name + ' ' + Math.round(elevationAt(stage, 0)), 4, h - 8); ctx.textAlign = 'right'; ctx.fillText(b.name + ' ' + Math.round(elevationAt(stage, stage.total)), w - 4, h - 8); ctx.textAlign = 'left';
    ctx.fillStyle = '#D71920'; for (const c of stage.cps) { ctx.beginPath(); ctx.arc(X(c.dist / 1000), Y(elevationAt(stage, c.dist)), 3, 0, 7); ctx.fill(); }
  }
}
