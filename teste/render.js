// Étape Navegar · render.js
// Desenho do mapa (estilo Carte Michelin, dia e noite; satélite IGN opcional) e do perfil no Canvas.
// Três câmeras: 2D (norte fixo ou rumo para cima), 3ª pessoa e 1ª pessoa (perspectiva a partir do ciclista).
// Só desenha quando invalidado. O ciclista tem camada própria (animação sem redesenhar o mapa).
import { mercX, mercY, metersPerPixel } from './geo.js';
import { query } from './data-mod.js';
import { elevationAt, pointAt, bearingAt } from './track.js';
import { icon, ready, KIND_ICON, SIGHT_ICON } from './icons.js';
import * as sat from './sat.js';

export const THEMES = {
  day: { map: '#F4EFE1', forest: '#D9E5C6', res: '#EAE5D8', water: '#A9CDE6', waterLine: '#7FB2D6', waterTxt: '#3E7FAF', rail: '#6C7176',
    r1: '#E63329', r2: '#E63329', r3: '#E8473D', r4: '#F1E2A8', r5: '#FFFFFF', r6: '#FFFFFF', r7: '#B8946A', r8: '#3A9A5A', r9: '#9A9A9A', casing: '#17191C', casingMinor: '#A8A498',
    ribbon: '#FFD100', ribbonCasing: '#17191C', done: '#17191C', other: '#C9C3B4', gravel: '#6B4423', label: '#17191C', halo: '#F4EFE1', borne: '#FFFFFF', forestTxt: '#4A6B3A', contour: '#C9A97A',
    puck: '#FFD100', bike: '#17191C', acc: 'rgba(255,209,0,.18)', scale: '#17191C', poiBg: '#FFFFFF', sky0: '#CFE3F2', sky1: '#F4EFE1', fog: 'rgba(244,239,225,.85)' },
  night: { map: '#1A1C21', forest: '#20271F', res: '#22252A', water: '#213A4C', waterLine: '#2E5A73', waterTxt: '#7FB2D6', rail: '#6C7176',
    r1: '#C8322A', r2: '#C8322A', r3: '#B8362E', r4: '#A08E3C', r5: '#5A5F68', r6: '#4B5058', r7: '#7A6242', r8: '#3A7A4A', r9: '#4B5058', casing: '#0A0B0D', casingMinor: '#0A0B0D',
    ribbon: '#FFD100', ribbonCasing: '#F1EEE6', done: '#B9BCC2', other: '#3A3E45', gravel: '#D9A066', label: '#FFE566', halo: '#1A1C21', borne: '#F1EEE6', forestTxt: '#7FA070', contour: '#4A4033',
    puck: '#FFD100', bike: '#17191C', acc: 'rgba(255,209,0,.16)', scale: '#FFE566', poiBg: '#1D1F23', sky0: '#0B0D14', sky1: '#1A1C21', fog: 'rgba(26,28,33,.85)' }
};
const CLASSW = { 1: 5, 2: 4.6, 3: 3.8, 4: 3.2, 5: 2.4, 6: 1.6, 7: 1.6, 8: 2, 9: 1.2 };
const MINZ = { 1: 9, 2: 10, 3: 11, 4: 12, 5: 13, 6: 14, 7: 14, 8: 13, 9: 15 };
const POI = { water: ['#3E7FAF', 'drop'], bakery: ['#B8720A', 'sq'], shop: ['#B8720A', 'tri'], bike: ['#2F8F46', 'dia'], pharmacy: ['#2F8F46', 'plus'], hospital: ['#D71920', 'H'], pass: ['#17191C', 'pass'], peak: ['#17191C', 'peak'], toilets: ['#3E7FAF', 'WC'], cafe: ['#B8720A', 'C'] };
// câmeras 3D: horizonte (fração da altura), linha do ciclista, distância e altura da câmera (m), alcance (m)
const CAMS = { tp: { yh: 0.30, yr: 0.76, dc: 70, hc: 34, far: 2600, rider: true, riderScale: 1.35 }, fp: { yh: 0.40, yr: 1.06, dc: 22, hc: 7.5, far: 1800, rider: false, riderScale: 1 } };

export function createRenderer(canvas, overlay) {
  const ctx = canvas.getContext('2d'), octx = overlay ? overlay.getContext('2d') : null;
  let rider = null, riderMoved = false;
  const view = { cx: 0, cy: 0, z: 13, rot: 0, anchorY: 0.5, mode: '2d', sat: false }; // rot em radianos (rumo para cima = -heading)
  let dpr = 1, W = 0, H = 0, dirty = true, theme = THEMES.day, flat = null, fctx = null;
  document.addEventListener('etape:icons', () => { dirty = true; });
  sat.setOnLoad(() => { dirty = true; });
  function resize() { dpr = Math.min(window.devicePixelRatio || 1, 2); W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); if (overlay) { overlay.width = W * dpr; overlay.height = H * dpr; octx.setTransform(dpr, 0, 0, dpr, 0, 0); } dirty = true; riderMoved = true; }
  const scale = () => 256 * Math.pow(2, view.z);
  const is3d = () => view.mode !== '2d';
  // ---------- projeções ----------
  // 2D: rotação em torno da âncora. 3D: câmera atrás/acima do ciclista (âncora), perspectiva pinhole sobre o plano do chão.
  let cam = null;   // parâmetros derivados por quadro: F (focal px), mpp, yh, yr
  function setupCam() {
    if (!is3d()) { cam = null; return; }
    const c = CAMS[view.mode], lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * view.cy))) * 180 / Math.PI);
    const mpp = metersPerPixel(lat, view.z);   // metros por px na projeção plana base (zoom vira "densidade de detalhe")
    const yh = c.yh * H, yr = c.yr * H, F = (yr - yh) * c.dc / c.hc;
    cam = { ...c, yh, yr, F, mpp, sr: F / c.dc };  // sr: px por metro na linha do ciclista
  }
  function flatPx(lat, lon) { // coordenadas planas, rumo para cima, âncora = ciclista (ou centro em 2D)
    const s = scale(), px = (mercX(lon) - view.cx) * s, py = (mercY(lat) - view.cy) * s;
    const c = Math.cos(view.rot), sn = Math.sin(view.rot);
    return [px * c - py * sn, px * sn + py * c];
  }
  // devolve [x, y, escala(px/m), ok]
  function proj(lat, lon) {
    const f = flatPx(lat, lon);
    if (!cam) return [f[0] + W / 2, f[1] + H * view.anchorY, 1 / metersPerPixel(lat, view.z), true];
    const right = f[0] * cam.mpp, ahead = -f[1] * cam.mpp, D = cam.dc + ahead;
    if (D < 1.5) return [W / 2 + right * cam.F / 1.5, cam.yh + cam.F * cam.hc / 1.5, cam.F / 1.5, false];
    return [W / 2 + right * cam.F / D, cam.yh + cam.F * cam.hc / D, cam.F / D, D <= cam.far * 1.4];
  }
  function toPx(lat, lon) { const p = proj(lat, lon); return [p[0], p[1]]; }
  function fromPx(x, y) {
    const s = scale(), dx = x - W / 2, dy = y - H * view.anchorY, c = Math.cos(-view.rot), sn = Math.sin(-view.rot);
    return { mx: view.cx + (dx * c - dy * sn) / s, my: view.cy + (dx * sn + dy * c) / s };
  }
  function visibleBox() {
    const s = scale(); let r = Math.hypot(W, H) / 2 / s * 1.05;
    if (cam) { const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * view.cy))) * 180 / Math.PI); r = cam.far / metersPerPixel(lat, view.z) / s * 1.1; }
    const lat = y => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI), lon = x => x * 360 - 180;
    return [lat(view.cy + r), lon(view.cx - r), lat(view.cy - r), lon(view.cx + r)];
  }
  // caminho projetado; em 3D os segmentos são recortados no plano próximo (não somem ao passar atrás da câmera)
  function projRA(right, ahead) { const D = Math.max(1.6, cam.dc + ahead); return [W / 2 + right * cam.F / D, cam.yh + cam.F * cam.hc / D]; }
  const path = pts => {
    ctx.beginPath();
    if (!cam) { for (let i = 0; i < pts.length; i++) { const q = proj(pts[i][0], pts[i][1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); } return; }
    const NEAR = 1.6; let pen = false, prev = null;
    for (let i = 0; i < pts.length; i++) {
      const f = flatPx(pts[i][0], pts[i][1]); const cur = [f[0] * cam.mpp, -f[1] * cam.mpp]; const D = cam.dc + cur[1];
      if (prev) {
        const Dp = cam.dc + prev[1];
        if (Dp < NEAR && D < NEAR) { pen = false; }
        else {
          let a = prev, b = cur;
          if (Dp < NEAR) { const t = (NEAR - Dp) / (D - Dp); a = [prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]; pen = false; }
          if (D < NEAR) { const t = (NEAR - Dp) / (D - Dp); b = [prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]; }
          const qa = projRA(a[0], a[1]), qb = projRA(b[0], b[1]);
          if (!pen) ctx.moveTo(qa[0], qa[1]); ctx.lineTo(qb[0], qb[1]); pen = D >= NEAR;
        }
      }
      prev = cur;
    }
  };
  function clipFlat(pts) {
    const NEAR = 1.6, out = []; let cur = [], prev = null;
    for (const p of pts) {
      const f = flatPx(p[0], p[1]); const c = [f[0] * cam.mpp, -f[1] * cam.mpp]; const D = cam.dc + c[1];
      if (prev) {
        const Dp = cam.dc + prev[1];
        if (Dp >= NEAR && D >= NEAR) cur.push(c);
        else if (Dp >= NEAR && D < NEAR) { const t = (NEAR - Dp) / (D - Dp); cur.push([prev[0] + (c[0] - prev[0]) * t, prev[1] + (c[1] - prev[1]) * t]); out.push(cur); cur = []; }
        else if (Dp < NEAR && D >= NEAR) { const t = (NEAR - Dp) / (D - Dp); cur = [[prev[0] + (c[0] - prev[0]) * t, prev[1] + (c[1] - prev[1]) * t], c]; }
      } else if (D >= NEAR) cur.push(c);
      prev = c;
    }
    if (cur.length > 1) out.push(cur); return out;
  }
  // fita no chão (3D): polígono com largura em metros, some com a distância como uma estrada de verdade
  function groundStrip(pts, widthM, fill, edge, edgeW) {
    for (const line of clipFlat(pts)) {
      const L = [], Rr = [];
      for (let i = 0; i < line.length; i++) {
        const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)]; let dx = b[0] - a[0], dy = b[1] - a[1]; const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
        const nx = -dy * widthM / 2, ny = dx * widthM / 2;
        L.push(projRA(line[i][0] + nx, line[i][1] + ny)); Rr.push(projRA(line[i][0] - nx, line[i][1] - ny));
      }
      ctx.beginPath(); L.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); for (let i = Rr.length - 1; i >= 0; i--) ctx.lineTo(Rr[i][0], Rr[i][1]); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill(); if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = edgeW || 1.5; ctx.stroke(); }
    }
  }
  const inter = (b, box) => !(b[2] < box[0] || b[0] > box[2] || b[3] < box[1] || b[1] > box[3]);
  function label(txt, x, y, align = 'left', font = '600 13px Archivo, sans-serif', color = theme.label) {
    ctx.font = font; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineWidth = 4; ctx.strokeStyle = theme.halo; ctx.lineJoin = 'round'; ctx.strokeText(txt, x, y); ctx.fillStyle = color; ctx.fillText(txt, x, y); ctx.textAlign = 'left';
  }
  // escala de tamanho para ícones e rótulos em 3D (1 na linha do ciclista), com corte de distância
  function sizeAt(q) { if (!cam) return 1; return Math.max(0.3, Math.min(1.25, q[2] / cam.sr)); }
  function zoomAt(q) { if (!cam) return view.z; const lat = 45.3; return Math.log2(q[2] * 40075016 * Math.cos(lat * Math.PI / 180) / 256); }
  function midOf(pts) { const m = pts[pts.length >> 1]; return proj(m[0], m[1]); }

  // ---------- satélite ----------
  function drawSat(box) {
    if (!view.sat || !sat.available()) return false;
    const s = scale();
    if (!cam) {
      if (view.z < 12.5) return false;
      const tiles = sat.tilesFor(box); if (tiles.length > 400) return false;
      ctx.save(); ctx.translate(W / 2, H * view.anchorY); ctx.rotate(view.rot);
      const size = s / 2 ** sat.zoom + 0.6;
      for (const [x, y] of tiles) { const im = sat.tile(x, y); if (!im) continue; const m = sat.tileMerc(x, y); ctx.drawImage(im, (m.mx - view.cx) * s, (m.my - view.cy) * s, size, size); }
      ctx.restore(); return true;
    }
    // 3D: desenha o chão plano numa tela auxiliar e deforma faixa a faixa (perspectiva)
    const k = 0.55;                                   // px por metro na tela auxiliar
    const FW = 1400, FH = 2200, FA = FH - 120;         // âncora (ciclista) perto da base
    if (!flat) { flat = document.createElement('canvas'); fctx = flat.getContext('2d'); }
    if (flat.width !== FW) { flat.width = FW; flat.height = FH; }
    fctx.setTransform(1, 0, 0, 1, 0, 0); fctx.fillStyle = theme.map; fctx.fillRect(0, 0, FW, FH);
    const s2 = 256 * Math.pow(2, sat.zoom) * (k * metersPerPixel(45.3, sat.zoom));  // escala mercator→px na auxiliar
    fctx.save(); fctx.translate(FW / 2, FA); fctx.rotate(view.rot);
    const tsz = s2 / 2 ** sat.zoom + 0.6;
    for (const [x, y] of sat.tilesFor(box)) { const im = sat.tile(x, y); if (!im) continue; const m = sat.tileMerc(x, y); fctx.drawImage(im, (m.mx - view.cx) * s2, (m.my - view.cy) * s2, tsz, tsz); }
    fctx.restore();
    // faixas: linha y da tela → distância D no chão → linha e largura na auxiliar
    const c = cam, step = 2;
    for (let y = Math.ceil(c.yh) + 1; y < H; y += step) {
      const D0 = c.F * c.hc / (y - c.yh), D1 = c.F * c.hc / (y + step - c.yh);   // longe → perto
      const sy1 = FA - (D0 - c.dc) * k, sy2 = FA - (D1 - c.dc) * k;
      const wg = W * D0 / c.F * k;                    // largura do chão visível nessa linha, em px da auxiliar
      const sx = FW / 2 - wg / 2;
      if (sy2 < 0 || sy1 > FH || wg > FW * 1.3) continue;
      ctx.drawImage(flat, Math.max(0, sx), Math.max(0, sy1), Math.min(FW, wg), Math.max(1, sy2 - sy1), 0, y, W, step);
    }
    return true;
  }

  function draw(S) {
    if (!dirty) return; dirty = false;
    setupCam();
    const M = S.map, st = S.stage, z = view.z, box = visibleBox(), th = theme;
    ctx.fillStyle = th.map; ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const satOn = drawSat(box);
    if (cam) { ctx.save(); ctx.beginPath(); ctx.rect(0, cam.yh, W, H - cam.yh); ctx.clip(); }
    if (!satOn && z >= 10.5) for (const p of M.polys) if (inter(p.b, box)) { path(p.p); ctx.closePath(); ctx.fillStyle = p.t === 'wood' ? th.forest : th.res; ctx.fill(); }
    for (const w of M.waters) if (inter(w.b, box)) { path(w.p); if (w.t === 'a') { if (satOn) continue; ctx.closePath(); ctx.fillStyle = th.water; ctx.fill(); } else { ctx.strokeStyle = th.water; ctx.lineWidth = z >= 13 ? 3 : 1.5; ctx.globalAlpha = satOn ? .7 : 1; ctx.stroke(); ctx.globalAlpha = 1; } }
    if (z >= 11 && !satOn) for (const r of M.rails) if (inter(r.b, box)) { path(r.p); ctx.strokeStyle = th.rail; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]); }
    // estradas: classe mínima e largura pela escala local (em 3D, pela distância)
    const zBase = cam ? Math.min(19, zoomAt([0, 0, cam.sr])) : z;
    const ways = query(M.index, box).filter(w => zBase >= MINZ[w.c]);
    ways.sort((a, b) => b.c - a.c);
    const wz = w => { if (!cam) return z; const q = midOf(w.p); return zoomAt(q); };
    const zf = zz => Math.max(0.6, Math.min(2.6, (zz - 11) / 4 + 0.6));
    for (const w of ways) { if (w.c >= 7) continue; const zz = wz(w); if (zz < MINZ[w.c] - 1) continue; path(w.p); ctx.strokeStyle = w.c <= 4 ? th.casing : th.casingMinor; ctx.lineWidth = CLASSW[w.c] * zf(zz) + 1.8; ctx.globalAlpha = satOn ? .85 : 1; ctx.stroke(); }
    for (const w of ways) { const zz = wz(w); if (zz < MINZ[w.c] - 1) continue; path(w.p); ctx.strokeStyle = th['r' + w.c]; ctx.lineWidth = CLASSW[w.c] * zf(zz); if (w.c === 7 || w.c === 9) ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]); }
    ctx.globalAlpha = 1;
    // outras etapas
    ctx.lineWidth = 2; ctx.strokeStyle = th.other;
    for (const k in S.routes.stages) if (k !== st.key) { path(S.routes.stages[k].track); ctx.stroke(); }
    // fita da etapa: feito (tracejado) e restante (amarela com casaco)
    const ci = S.proj.idx || 0;
    if (cam) { groundStrip(st.pts.slice(ci), 5.2, th.ribbonCasing); groundStrip(st.pts.slice(ci), 3.4, th.ribbon); }
    else { ctx.lineWidth = 10; ctx.strokeStyle = th.ribbonCasing; path(st.pts.slice(ci)); ctx.stroke(); ctx.lineWidth = 6; ctx.strokeStyle = th.ribbon; ctx.stroke(); }
    for (const sf of st.surfaces) if (sf.kind !== 'asfalto' && sf.to > S.proj.dist) { path(sliceByDist(st, Math.max(sf.from, S.proj.dist), sf.to)); ctx.strokeStyle = th.gravel; ctx.lineWidth = 2.4; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]); }
    ctx.lineWidth = 3; ctx.strokeStyle = th.done; ctx.setLineDash([7, 6]); path(st.pts.slice(0, ci + 1)); ctx.stroke(); ctx.setLineDash([]);
    if (cam) { ctx.restore(); drawSky(); }
    // curvas
    if (zBase >= 14) for (const t of st.turns) { if (t.dist < S.proj.dist - 200) continue; const q = proj(st.pts[t.i][0], st.pts[t.i][1]); if (!q[3]) continue; const r = 7 * sizeAt(q); ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.fillStyle = th.borne; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = th.casing; ctx.stroke(); }
    // rótulos de estradas
    if (zBase >= 14) { const seen = new Set(); for (const w of ways) { if (!w.n || w.c > (zBase >= 16 ? 5 : 4) || seen.has(w.n) || (zBase < 15.5 && !/^[A-Z] ?\d/.test(w.n))) continue; const q = midOf(w.p); if (!q[3] || q[0] < 0 || q[0] > W || q[1] < 60 || q[1] > H) continue; const sz = sizeAt(q); if (sz < 0.45) continue; seen.add(w.n); label(w.n, q[0], q[1], 'center', '600 ' + Math.round(12 * Math.max(.8, sz)) + 'px "Archivo Narrow", Archivo, sans-serif'); } }
    // POIs
    if (zBase >= 13) for (const p of query(M.poiIndex, box)) { if (p.k.startsWith('place') || (zBase < 15 && (p.k === 'shop' || p.k === 'bakery' || p.k === 'pharmacy' || p.k === 'cafe' || p.k === 'toilets'))) continue; const q = proj(p.lat, p.lon); if (!q[3] || q[0] < -20 || q[0] > W + 20 || q[1] < -20 || q[1] > H + 20) continue; poiIcon(p, q, zBase); }
    // paradas (foto/visita/compras)
    if (zBase >= 12) for (const p of S.paradas) { const q = proj(p.lat, p.lon); if (!q[3] || q[0] < -30 || q[0] > W + 30 || q[1] < -30 || q[1] > H + 30) continue; sightIcon(p, q, zBase); }
    // lugares
    for (const p of query(M.poiIndex, box)) { if (!p.k.startsWith('place')) continue; const t = p.k.slice(6), minz = t === 'city' ? 9 : t === 'town' ? 10 : t === 'village' ? 12 : 14.5; if (zBase < minz) continue; const q = proj(p.lat, p.lon); if (!q[3] || q[0] < -60 || q[0] > W + 60 || q[1] < 50 || q[1] > H) continue; const sz = Math.max(.75, sizeAt(q)); label(p.n.toUpperCase(), q[0], q[1], 'center', (t === 'city' || t === 'town' ? '800 ' + Math.round(16 * sz) + 'px' : t === 'village' ? '700 ' + Math.round(14 * sz) + 'px' : '600 ' + Math.round(12 * sz) + 'px') + ' "Archivo Narrow", Archivo, sans-serif'); }
    // bornes
    for (const c of st.cps) { const q = proj(c.lat, c.lon); if (!q[3] || q[0] < -40 || q[0] > W + 40 || q[1] < -40 || q[1] > H + 40) continue; borne(c, q, zBase); }
    // posição
    if (!S.fix && S.stage.cps.length) {
      for (const c of (S.showStart !== false && (S.proj.dist || 0) < 300 ? [S.stage.cps[S.stage.cps.length - 1]] : [S.stage.cps[0], S.stage.cps[S.stage.cps.length - 1]])) { const q = proj(c.lat, c.lon); if (!q[3]) continue; const im = icon('hotel', 30); const sz = 30 * sizeAt(q); if (ready(im)) ctx.drawImage(im, q[0] - sz / 2, q[1] - sz * .87, sz, sz); }
      if (S.showStart !== false) { const p = pointAt(S.stage, S.proj.dist || 0), q = proj(p[0], p[1]); placeRider(q, bearingAt(S.stage, S.proj.dist || 0) * Math.PI / 180 + view.rot); }
    }
    if (S.fix) { const q = proj(S.fix.lat, S.fix.lon); const mpp = metersPerPixel(S.fix.lat, view.z); const accPx = Math.min(200, (S.fix.acc || 0) / mpp); if (!cam && accPx > 40) { ctx.beginPath(); ctx.arc(q[0], q[1], accPx, 0, 7); ctx.fillStyle = th.acc; ctx.fill(); } placeRider(q, ((S.fix.head || 0) * Math.PI / 180) + view.rot); }
    // escala (só em 2D)
    if (!cam) {
      const mpp = metersPerPixel(S.fix ? S.fix.lat : 45.3, view.z), bar = [100, 200, 500, 1000, 2000, 5000].find(v => v / mpp > 60) || 5000;
      const sx = S.mode === 'resumo' ? 156 : 12;
      ctx.fillStyle = th.scale; ctx.fillRect(sx, H - S.scaleBottom - 4, bar / mpp, 4); ctx.fillStyle = th.borne; ctx.fillRect(sx, H - S.scaleBottom - 4, bar / mpp / 2, 4); ctx.strokeStyle = th.scale; ctx.lineWidth = 0.8; ctx.strokeRect(sx, H - S.scaleBottom - 4, bar / mpp, 4);
      label(bar >= 1000 ? (bar / 1000) + ' km' : bar + ' m', sx, H - S.scaleBottom - 12, 'left', '600 11px Archivo, sans-serif');
    }
  }
  function drawSky() {
    const c = cam, g = ctx.createLinearGradient(0, 0, 0, c.yh); g.addColorStop(0, theme.sky0); g.addColorStop(1, theme.sky1);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, c.yh);
    // névoa de distância: esconde o corte do alcance
    const f = ctx.createLinearGradient(0, c.yh, 0, c.yh + H * 0.10); f.addColorStop(0, theme.fog); f.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = f; ctx.fillRect(0, c.yh, W, H * 0.10);
    ctx.fillStyle = theme.casing; ctx.globalAlpha = .35; ctx.fillRect(0, c.yh - 1, W, 1.5); ctx.globalAlpha = 1;
  }
  function sliceByDist(st, a, b) { const out = []; for (let i = 0; i < st.pts.length; i++) if (st.cum[i] >= a && st.cum[i] <= b) out.push(st.pts[i]); return out.length > 1 ? out : []; }
  function borne(c, q, z) {
    const sz = sizeAt(q), w = 26 * sz, h = 30 * sz, x = q[0] - w / 2, y = q[1] - h;
    ctx.beginPath(); rr(x, y, w, h, 4 * sz); ctx.fillStyle = c.done ? theme.res : theme.borne; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = theme.casing; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + 4 * sz); ctx.arc(q[0], y + 13 * sz, 13 * sz, Math.PI, 0); ctx.lineTo(x + w, y + 10 * sz); ctx.lineTo(x, y + 10 * sz); ctx.closePath(); ctx.fillStyle = (c.col || c.hotel) ? '#D71920' : '#FFD100'; ctx.fill();
    ctx.fillStyle = '#17191C'; ctx.font = '800 ' + Math.round(13 * sz) + 'px "Big Shoulders Display", "Arial Narrow", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(c.kmLabel), q[0], y + 22 * sz); ctx.textAlign = 'left';
    if (z >= 12 && sz > .5) label(c.name + (c.ele ? ' ' + c.ele + ' m' : ''), q[0] + 17 * sz, q[1] - 8 * sz, 'left', '600 ' + Math.round(13 * Math.max(.8, sz)) + 'px "Archivo Narrow", Archivo, sans-serif');
  }
  function sightIcon(p, q, z) {
    const sz = sizeAt(q); if (sz < .35) return;
    const im = icon(SIGHT_ICON[p.kind] || 'camera', z >= 14.5 ? 34 : 26);
    if (ready(im)) { const s = (z >= 14.5 ? 34 : 26) * sz; ctx.globalAlpha = p.done ? .45 : 1; ctx.drawImage(im, q[0] - s / 2, q[1] - s * .78, s, s); ctx.globalAlpha = 1; if (z >= 14 && sz > .55) label(p.nome.split(' · ')[0], q[0], q[1] + 12 * sz, 'center', '600 12px "Archivo Narrow", Archivo, sans-serif'); return; }
    const col = p.kind === 'compras' ? '#B8720A' : p.kind === 'opcional' ? theme.label : '#D71920';
    ctx.beginPath(); ctx.arc(q[0], q[1], 9, 0, 7); ctx.fillStyle = theme.borne; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = col; if (p.kind === 'opcional') ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]);
  }
  function poiIcon(p, q, z) {
    const s = POI[p.k]; if (!s) return;
    const sz = sizeAt(q); if (sz < .35) return;
    const nm = KIND_ICON[p.k], im = nm ? icon(nm, z >= 15 ? 28 : 22) : null;
    if (ready(im)) { const s2 = (z >= 15 ? 28 : 22) * sz; ctx.drawImage(im, q[0] - s2 / 2, q[1] - s2 * .78, s2, s2); if (sz > .6 && (z >= 16 || ((p.k === 'peak' || p.k === 'pass' || p.k === 'water' || p.k === 'toilets' || p.k === 'bike') && z >= 14.5)) && p.n) label(p.n + (p.k === 'peak' || p.k === 'pass' ? (p.e ? ' ' + p.e : '') : ''), q[0] + s2 / 2 + 1, q[1] - 3, 'left', '600 11px "Archivo Narrow", Archivo, sans-serif'); return; }
    ctx.beginPath(); ctx.arc(q[0], q[1], 7.5 * sz, 0, 7); ctx.fillStyle = theme.poiBg; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = s[0]; ctx.stroke();
  }
  function placeRider(q, rot) {
    const c = cam; const show = !c || c.rider;
    const r = { x: q[0], y: q[1], rot: c ? 0 : rot, scale: c ? c.riderScale : 1, show };
    if (octx) { rider = r; riderMoved = true; } else if (show) bike(ctx, r, 0);
  }
  // camada do ciclista: só ela é redesenhada a cada quadro da pedalada
  function drawRider(frame) {
    if (!octx) return; octx.clearRect(0, 0, W, H); riderMoved = false;
    if (rider && rider.show) bike(octx, rider, frame);
  }
  function bike(c, r, frame) {
    c.save(); c.translate(r.x, r.y); c.rotate(r.rot); const s = 84 * (r.scale || 1);
    const im = icon('bikeTop' + (frame || 0), 84) || icon('bikeTop', 84);
    if (ready(im)) c.drawImage(im, -s / 2, -s * .55, s, s);
    else { c.beginPath(); c.moveTo(0, -18); c.lineTo(10, 12); c.lineTo(0, 6); c.lineTo(-10, 12); c.closePath(); c.fillStyle = theme.puck; c.fill(); c.lineWidth = 2; c.strokeStyle = theme.bike; c.stroke(); }
    c.restore();
  }
  function rr(x, y, w, h, r) { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  return {
    view, resize, toPx, fromPx, invalidate() { dirty = true; }, draw, drawRider, riderMoved() { return riderMoved; }, size() { return { W, H }; },
    setTheme(name) { theme = THEMES[name] || THEMES.day; dirty = true; },
    setMode(m) { view.mode = m; if (m !== '2d') view.anchorY = CAMS[m].yr; dirty = true; },
    setSat(on) { view.sat = !!on; dirty = true; },
    setView(cx, cy, z, rot) { if (cx != null) view.cx = cx; if (cy != null) view.cy = cy; if (z != null) view.z = Math.max(9, Math.min(19, z)); if (rot != null) view.rot = rot; dirty = true; },
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
