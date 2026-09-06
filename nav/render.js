// Étape Navegar · render.js
// Desenho do mapa (estilo Carte Michelin, dia e noite; satélite IGN opcional) e do perfil no Canvas.
// Três câmeras: 2D (norte fixo ou rumo para cima), 3ª pessoa e 1ª pessoa (perspectiva a partir do ciclista).
// Só desenha quando invalidado. O ciclista tem camada própria (animação sem redesenhar o mapa).
import { mercX, mercY, metersPerPixel } from './geo.js';
import { query } from './data-mod.js';
import { elevationAt, pointAt, bearingAt } from './track.js';
import { icon, ready, KIND_ICON, SIGHT_ICON } from './icons.js';
import * as sat from './sat.js';
import * as dem from './dem.js';

export const THEMES = {
  day: { map: '#F0F0F0', forest: '#E1E6DA', res: '#E6E6E6', water: '#BFD8F0', waterLine: '#3969B7', waterTxt: '#3969B7', rail: '#777777',
    r1: '#FFFFFF', r2: '#FFFFFF', r3: '#FFFFFF', r4: '#FFFFFF', r5: '#FFFFFF', r6: '#FFFFFF', r7: '#B08968', r8: '#1DAE50', r9: '#9A9A9A', casing: '#555555', casingMinor: '#C4C4C4',
    ribbon: '#FFFF00', ribbonCasing: '#000000', done: '#000000', other: '#BDBDBD', gravel: '#6B4423', label: '#000000', halo: '#F0F0F0', borne: '#FFFFFF', forestTxt: '#3D7A34', contour: '#CCCCCC',
    puck: '#FFFF00', bike: '#000000', acc: 'rgba(255,255,0,.2)', scale: '#000000', poiBg: '#FFFFFF', sky0: '#A9CFF0', sky1: '#F0F0F0', fog: 'rgba(240,240,240,.85)' },
  night: { map: '#151515', forest: '#1E241C', res: '#1A1A1A', water: '#1D3A5E', waterLine: '#3969B7', waterTxt: '#6FA3E0', rail: '#666666',
    r1: '#3A3A3A', r2: '#3A3A3A', r3: '#383838', r4: '#333333', r5: '#2E2E2E', r6: '#2A2A2A', r7: '#4A3A2A', r8: '#1F5A33', r9: '#333333', casing: '#000000', casingMinor: '#000000',
    ribbon: '#FFFF00', ribbonCasing: '#FFFFFF', done: '#BBBBBB', other: '#333333', gravel: '#D9A066', label: '#FFFF00', halo: '#151515', borne: '#FFFFFF', forestTxt: '#7FA070', contour: '#333333',
    puck: '#FFFF00', bike: '#000000', acc: 'rgba(255,255,0,.16)', scale: '#FFFF00', poiBg: '#0A0A0A', sky0: '#05070C', sky1: '#151515', fog: 'rgba(21,21,21,.85)' }
};
const CLASSW = { 1: 5, 2: 4.6, 3: 3.8, 4: 3.2, 5: 2.4, 6: 1.6, 7: 1.6, 8: 2, 9: 1.2 };
const MINZ = { 1: 9, 2: 10, 3: 11, 4: 12, 5: 13, 6: 14, 7: 14, 8: 13, 9: 15 };
const POI = { toilets: ['#3969B7', 'WC'], cafe: ['#B8720A', 'C'], church: ['#000000', 'ch'], castle: ['#000000', 'ca'], viewpoint: ['#1DAE50', 'vp'], picnic: ['#1DAE50', 'pi'], water: ['#3E7FAF', 'drop'], bakery: ['#B8720A', 'sq'], shop: ['#B8720A', 'tri'], bike: ['#1DAE50', 'dia'], pharmacy: ['#1DAE50', 'plus'], hospital: ['#E10D0D', 'H'], pass: ['#000000', 'pass'], peak: ['#000000', 'peak'], toilets: ['#3E7FAF', 'WC'], cafe: ['#B8720A', 'C'] };
// câmeras 3D: horizonte (fração da altura), linha do ciclista, distância e altura da câmera (m), alcance (m)
const CAMS = { tp: { yh: 0.30, yr: 0.76, dc: 70, hc: 34, far: 2600, rider: true, riderScale: 1.35 }, fp: { yh: 0.40, yr: 1.06, dc: 22, hc: 7.5, far: 1800, rider: false, riderScale: 1 } };

// bandeirinhas estilo Tour: haste e bandeira. kind: start | cat (HC,1..4) | sprint | feed | sight | flamme | finish
export const FLAG = { start: '#FFFFFF', cat: '#E10D0D', sprint: '#1DAE50', feed: '#8A8F96', sight: '#1DAE50', flamme: '#E10D0D', finish: '#FFFFFF' };
export function flagAt(ctx, x, yTop, yBase, kind, text, sz = 1) {
  const col = FLAG[kind] || '#E10D0D', fw = 26 * sz, fh = 16 * sz, pw = Math.max(1.5, 2.6 * sz);
  ctx.save(); ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = pw + 1.4; ctx.beginPath(); ctx.moveTo(x, yBase); ctx.lineTo(x, yTop); ctx.stroke();
  ctx.strokeStyle = kind === 'feed' ? '#8A8F96' : col; ctx.lineWidth = pw; ctx.beginPath(); ctx.moveTo(x, yBase); ctx.lineTo(x, yTop); ctx.stroke();
  const fx = x, fy = yTop - fh; ctx.fillStyle = col; ctx.strokeStyle = '#000000'; ctx.lineWidth = 1;
  if (kind === 'finish') {
    const n = 4, cw = fw / n, ch = fh / 3;
    for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) { ctx.fillStyle = (i + j) % 2 ? '#000000' : '#FFFFFF'; ctx.fillRect(fx + i * cw, fy + j * ch, cw + .3, ch + .3); }
    ctx.strokeRect(fx, fy, fw, fh);
  } else if (kind === 'feed') {
    ctx.fillStyle = '#BBBBBB'; ctx.beginPath(); ctx.moveTo(fx, fy + fh); ctx.lineTo(fx + fw * .15, fy); ctx.lineTo(fx + fw, fy); ctx.lineTo(fx + fw * .85, fy + fh); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.moveTo(fx + fw * .42, fy + fh * .28); ctx.lineTo(fx + fw * .62, fy + fh * .28); ctx.lineTo(fx + fw * .7, fy + fh * .82); ctx.lineTo(fx + fw * .34, fy + fh * .82); ctx.closePath(); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + fw, fy); ctx.lineTo(fx + fw, fy + fh); ctx.lineTo(fx + fw * .12, fy + fh); ctx.lineTo(fx, fy + fh * .55); ctx.closePath(); ctx.fill(); if (kind === 'start') ctx.stroke();
    if (kind === 'start') { ctx.fillStyle = '#000000'; ctx.beginPath(); ctx.moveTo(fx + fw * .32, fy + fh * .2); ctx.lineTo(fx + fw * .32, fy + fh * .8); ctx.lineTo(fx + fw * .78, fy + fh * .5); ctx.closePath(); ctx.fill(); }
    else if (kind === 'sight') { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(fx + fw * .3, fy + fh * .3, fw * .42, fh * .42); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(fx + fw * .51, fy + fh * .51, fh * .13, 0, 7); ctx.fill(); }
    else if (text) { ctx.fillStyle = '#FFFFFF'; ctx.font = '800 ' + Math.round(11 * sz) + 'px "Barlow Condensed", "Arial Narrow", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, fx + fw * .55, fy + fh * .55); }
  }
  ctx.restore();
}
// pontos com bandeira ao longo da etapa: largada, cols, paradas (verde), abastecimento (musette), flamme rouge, chegada
export function stageFlags(stage, paradas) {
  const out = [{ dist: 0, kind: 'start' }];
  for (const c of stage.climbs) out.push({ dist: c.to, kind: 'cat', text: c.cat, name: c.name });
  for (const p of paradas || []) { if (p.kind === 'compras') out.push({ dist: p.km * 1000, kind: 'feed', name: p.nome }); else if (p.kind === 'visita' || p.kind === 'foto') out.push({ dist: p.km * 1000, kind: 'sight', name: p.nome }); }
  out.push({ dist: Math.max(0, stage.total - 1000), kind: 'flamme', text: '1' }); out.push({ dist: stage.total, kind: 'finish' });
  return out.sort((a, b) => a.dist - b.dist);
}

export function createRenderer(canvas, overlay) {
  let ctx = canvas.getContext('2d'); const octx = overlay ? overlay.getContext('2d') : null;
  // cache do mapa estático (2D): bitmap maior que a tela, redesenhado só quando precisa; cada quadro é um drawImage
  let base = null, dirtyBase = true, lastViewChange = 0, anim = null, baseCount = 0;
  let rider = null, riderMoved = false, riderExternal = false; const S3 = { noOcclude: false };
  const view = { cx: 0, cy: 0, z: 13, rot: 0, anchorY: 0.5, mode: '2d', sat: false }; // rot em radianos (rumo para cima = -heading)
  let dpr = 1, W = 0, H = 0, dirty = true, theme = THEMES.day, flat = null, fctx = null;
  document.addEventListener('etape:icons', () => { dirty = true; });
  for (let i = 0; i < 4; i++) icon('bikeTop' + i, 84);   // quadros da pedalada prontos antes do primeiro fix
  sat.setOnLoad(() => { dirty = true; }); dem.setOnLoad(() => { dirty = true; });
  function resize() { W = canvas.clientWidth; H = canvas.clientHeight; dpr = Math.min(window.devicePixelRatio || 1, W < 500 ? 1.5 : 2); base = null; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); if (overlay) { overlay.width = W * dpr; overlay.height = H * dpr; octx.setTransform(dpr, 0, 0, dpr, 0, 0); } dirty = true; riderMoved = true; }
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
    // terreno: altitude do ciclista como referência (0); só quando o tile já está no aparelho
    const clat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * view.cy))) * 180 / Math.PI), clon = view.cx * 360 - 180;
    cam.z0 = dem.available() ? dem.elevation(clat, clon) : null; cam.terrain = cam.z0 != null;
    if (dem.available()) dem.warm(clat, clon, c.far);
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
    let up = 0; if (cam.terrain) { const e = dem.elevation(lat, lon); if (e != null) up = e - cam.z0; }
    if (D < 1.5) return [W / 2 + right * cam.F / 1.5, cam.yh + cam.F * (cam.hc - up) / 1.5, cam.F / 1.5, false];
    const qx = W / 2 + right * cam.F / D, qy = cam.yh + cam.F * (cam.hc - up) / D;
    return [qx, qy, cam.F / D, D <= cam.far * 1.4 && !occluded(qx, qy, D)];
  }
  function toPx(lat, lon) { const p = proj(lat, lon); return [p[0], p[1]]; }
  function fromPx(x, y) {
    // 3D: inverte a câmera pinhole sobre o plano do chão (sem relevo): D = F·hc/(y − yh); acima do horizonte, fica no limite
    if (cam) {
      const dyh = Math.max(cam.F * cam.hc / (cam.far * 0.6), y - cam.yh), D = cam.F * cam.hc / dyh, right = (x - W / 2) * D / cam.F;
      const s = scale(), px = right / cam.mpp, py = -(D - cam.dc) / cam.mpp, c = Math.cos(-view.rot), sn = Math.sin(-view.rot);
      return { mx: view.cx + (px * c - py * sn) / s, my: view.cy + (px * sn + py * c) / s };
    }
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
  // inverso: (right, ahead) em metros → lat/lon
  function raToLL(right, ahead) {
    const s = scale(), px = right / cam.mpp, py = -ahead / cam.mpp, c = Math.cos(-view.rot), sn = Math.sin(-view.rot);
    const mx = view.cx + (px * c - py * sn) / s, my = view.cy + (px * sn + py * c) / s;
    return [Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180 / Math.PI, mx * 360 - 180];
  }
  // ponto (x,y) à distância D fica escondido se está abaixo da crista do terreno mais próximo naquela coluna
  function occluded(x, y, D) {
    if (!cam || !cam.ridge) return false;
    let i = 0; while (i < cam.rows && cam.Dof(i) < D) i++;
    const xb = Math.max(0, Math.min(cam.BINS - 1, Math.floor(x / W * cam.BINS)));
    return y > cam.ridge[i][xb] + 3;
  }
  function projRA(right, ahead) {
    const D = Math.max(1.6, cam.dc + ahead); let up = 0;
    if (cam.terrain) { const ll = raToLL(right, ahead); const e = dem.elevation(ll[0], ll[1]); if (e != null) up = e - cam.z0; }
    return [W / 2 + right * cam.F / D, cam.yh + cam.F * (cam.hc - up) / D];
  }
  // malha do terreno em 3D: leque de células (linhas por distância, colunas pela largura visível), pintadas de longe para perto
  function drawTerrain(satOn) {
    const c = cam, rows = 34, cols = 22, light = [-0.45, 0.35, 0.82];
    const Dof = i => c.dc * 0.35 * Math.pow(c.far / (c.dc * 0.35), i / rows);           // distâncias geométricas
    const half = D => (W / 2) * D / c.F * 1.15;                                          // meia largura visível (m)
    const P = new Array(rows + 1);
    for (let i = 0; i <= rows; i++) {
      const D = Dof(i), ahead = D - c.dc, hw = half(D); P[i] = new Array(cols + 1);
      for (let j = 0; j <= cols; j++) {
        const right = -hw + 2 * hw * j / cols, ll = raToLL(right, ahead); let e = dem.elevation(ll[0], ll[1]); if (e == null) e = c.z0;
        const up = e - c.z0; P[i][j] = { x: W / 2 + right * c.F / D, y: c.yh + c.F * (c.hc - up) / D, e, ll, D, right, ahead };
      }
    }
    // cristas: para cada linha i, o menor y (mais alto na tela) do terreno mais próximo que ela, por faixa de x
    const BINS = 96, ridge = new Array(rows + 1); ridge[0] = new Float32Array(BINS).fill(1e9);
    for (let i = 1; i <= rows; i++) {
      const r = new Float32Array(ridge[i - 1]);
      for (let j = 0; j < cols; j++) {
        const a = P[i - 1][j], b = P[i - 1][j + 1], d = P[i][j + 1], e2 = P[i][j];
        const x0 = Math.max(0, Math.min(BINS - 1, Math.floor(Math.min(a.x, b.x, d.x, e2.x) / W * BINS))), x1 = Math.max(0, Math.min(BINS - 1, Math.floor(Math.max(a.x, b.x, d.x, e2.x) / W * BINS)));
        const ymin = Math.min(a.y, b.y, d.y, e2.y);
        for (let xb = x0; xb <= x1; xb++) if (ymin < r[xb]) r[xb] = ymin;
      }
      ridge[i] = r;
    }
    cam.ridge = ridge; cam.Dof = Dof; cam.BINS = BINS; cam.rows = rows;
    for (let i = rows - 1; i >= 0; i--) for (let j = 0; j < cols; j++) {
      const a = P[i][j], b = P[i][j + 1], d = P[i + 1][j + 1], e2 = P[i + 1][j];
      // normal aproximada (right, ahead, up) → sombreado
      const dx = (b.e - a.e) / Math.max(1, b.right - a.right), dy = (e2.e - a.e) / Math.max(1, e2.ahead - a.ahead);
      let nx = -dx, ny = -dy, nz = 1; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const sh = Math.max(0.35, Math.min(1.15, 0.55 + 0.6 * (nx * light[0] + ny * light[1] + nz * light[2])));
      let r, g, bl;
      const col = satOn ? sat.colorAt((a.ll[0] + d.ll[0]) / 2, (a.ll[1] + d.ll[1]) / 2) : null;
      if (col) { r = col[0] * sh; g = col[1] * sh; bl = col[2] * sh; }
      else { const t = Math.max(0, Math.min(1, (a.e - 400) / 1300)); const base = theme === THEMES.night ? [46, 52, 44] : [190 - 40 * t, 200 - 70 * t, 150 - 40 * t]; r = base[0] * sh; g = base[1] * sh; bl = base[2] * sh; }
      const fog = Math.min(1, Math.max(0, (a.D - c.far * 0.55) / (c.far * 0.5))), fc = theme === THEMES.night ? [26, 28, 33] : [235, 232, 222];
      r = r + (fc[0] - r) * fog; g = g + (fc[1] - g) * fog; bl = bl + (fc[2] - bl) * fog;
      ctx.fillStyle = 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (bl | 0) + ')';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(d.x, d.y); ctx.lineTo(e2.x, e2.y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.6; ctx.stroke();   // fecha as frestas entre células
    }
  }
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
          const hid = cam.terrain && !S3.noOcclude && (occluded(qa[0], qa[1], cam.dc + a[1]) || occluded(qb[0], qb[1], cam.dc + b[1]));
          if (hid) { pen = false; }
          else { if (!pen) ctx.moveTo(qa[0], qa[1]); ctx.lineTo(qb[0], qb[1]); pen = D >= NEAR; }
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
    S3.noOcclude = true;
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
    S3.noOcclude = false;
  }
  const inter = (b, box) => !(b[2] < box[0] || b[0] > box[2] || b[3] < box[1] || b[1] > box[3]);
  function label(txt, x, y, align = 'left', font = '600 13px Barlow, sans-serif', color = theme.label) {
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
    if (anim) stepAnim();
    if (!dirty) return;
    if (!W || !H) { if (canvas.clientWidth && canvas.clientHeight) resize(); else return; }   // canvas sem tamanho (iframe ainda oculto): espera
    dirty = false;
    setupCam();
    if (cam) { drawStatic(S); drawDynamic(S); return; }
    ensureBase(S);
    ctx.fillStyle = theme.map; ctx.fillRect(0, 0, W, H);
    if (base) {
      ctx.save(); ctx.imageSmoothingQuality = 'medium'; ctx.translate(W / 2, H * view.anchorY); ctx.rotate(view.rot);
      const sv = scale(); ctx.translate((base.cx - view.cx) * sv, (base.cy - view.cy) * sv); ctx.rotate(-base.rot);
      const kk = Math.pow(2, view.z - base.z); ctx.scale(kk, kk);
      ctx.drawImage(base.canvas, -base.W / 2, -base.H / 2, base.W, base.H); ctx.restore();
    }
    drawDynamic(S);
  }
  // animação de câmera (voar até um ponto/zoom/rumo), ease-out cúbico
  function stepAnim() {
    const t = Math.min(1, (performance.now() - anim.t0) / anim.ms), e = 1 - Math.pow(1 - t, 3), f = anim.from, to = anim.to;
    view.cx = f.cx + (to.cx - f.cx) * e; view.cy = f.cy + (to.cy - f.cy) * e; view.z = f.z + (to.z - f.z) * e;
    let dr = to.rot - f.rot; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); view.rot = f.rot + dr * e;
    dirty = true; riderMoved = true; if (t >= 1) anim = null;
  }
  // base: precisa redesenhar? (etapa/tema/satélite mudou, zoom ou rotação longe demais, tela saiu da área, progresso a ~1 s, ou zoom parou de mudar)
  function ensureBase(S) {
    const now = performance.now(), diag = Math.hypot(W, H);
    let need = !base || base.stage !== S.stage.key || base.theme !== theme || base.sat !== view.sat || base.W < diag * 1.6;
    if (!need) {
      const kk = Math.pow(2, view.z - base.z), sb = 256 * Math.pow(2, base.z);
      const dx = (view.cx - base.cx) * sb, dy = (view.cy - base.cy) * sb, r = diag / 2 / kk + 8;
      let dr = view.rot - base.rot; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      need = Math.abs(dx) + r > base.W / 2 || Math.abs(dy) + r > base.H / 2 || kk > 1.6 || kk < 0.62 || Math.abs(dr) > 0.35
        || (dirtyBase && now - base.stamp > 900) || (base.z !== view.z && now - lastViewChange > 250 && now - base.stamp > 250);
    }
    if (need) renderBase(S, now);
  }
  function renderBase(S, now) {
    const diag = Math.hypot(W, H), BW = Math.ceil(diag * 1.7), bdpr = Math.min(dpr, 1.5);
    if (!base || base.W !== BW) { const c = document.createElement('canvas'); c.width = c.height = Math.round(BW * bdpr); base = { canvas: c, ctx: c.getContext('2d'), W: BW, H: BW }; }
    const saved = { ctx, W, H, anchorY: view.anchorY };
    ctx = base.ctx; W = BW; H = BW; view.anchorY = 0.5;
    ctx.setTransform(bdpr, 0, 0, bdpr, 0, 0); ctx.fillStyle = theme.map; ctx.fillRect(0, 0, W, H); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    try { drawStatic(S); } finally { ctx = saved.ctx; W = saved.W; H = saved.H; view.anchorY = saved.anchorY; }
    Object.assign(base, { cx: view.cx, cy: view.cy, z: view.z, rot: view.rot, stamp: now, stage: S.stage.key, theme, sat: view.sat }); dirtyBase = false; baseCount++;
  }
  // camadas estáticas: fundo, satélite, polígonos, água, ferrovias, estradas, outras etapas, fita, curvas, rótulos, POIs, paradas, lugares, bandeiras, bornes
  function drawStatic(S) {
    placed = [];
    const M = S.map, st = S.stage, z = view.z, box = visibleBox(), th = theme;
    if (cam) { ctx.fillStyle = th.map; ctx.fillRect(0, 0, W, H); }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    let satOn = false;
    if (cam && cam.terrain) { drawSkyFull(); drawTerrain(view.sat && sat.available()); satOn = view.sat && sat.available(); }
    else satOn = drawSat(box);
    if (cam && !cam.terrain) { ctx.save(); ctx.beginPath(); ctx.rect(0, cam.yh, W, H - cam.yh); ctx.clip(); }
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
    for (const w of ways) { const zz = wz(w); if (zz < MINZ[w.c] - 1) continue; path(w.p); ctx.strokeStyle = th['r' + w.c]; ctx.lineWidth = CLASSW[w.c] * zf(zz); if (cam) { const q = midOf(w.p); ctx.globalAlpha = Math.max(.25, Math.min(1, 1.3 - (cam.F / q[2]) / cam.far)); } if (w.c === 7 || w.c === 9) ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
    ctx.globalAlpha = 1;
    // outras etapas
    ctx.lineWidth = 2; ctx.strokeStyle = th.other;
    for (const k in S.routes.stages) if (k !== st.key) { path(S.routes.stages[k].track); ctx.stroke(); }
    // fita da etapa: feito (tracejado) e restante (amarela com casaco)
    const ci = S.proj.idx || 0;
    if (cam) { const rem = [pointAt(st, S.proj.dist || 0)].concat(st.pts.slice(ci + (st.cum[ci] < (S.proj.dist || 0) ? 1 : 0))); groundStrip(rem, 5.2, th.ribbonCasing); groundStrip(rem, 3.4, th.ribbon); }
    else { ctx.lineWidth = 10; ctx.strokeStyle = th.ribbonCasing; path(st.pts.slice(ci)); ctx.stroke(); ctx.lineWidth = 6; ctx.strokeStyle = th.ribbon; ctx.stroke(); }
    for (const sf of st.surfaces) if (sf.kind !== 'asfalto' && sf.to > S.proj.dist) { path(sliceByDist(st, Math.max(sf.from, S.proj.dist), sf.to)); ctx.strokeStyle = th.gravel; ctx.lineWidth = 2.4; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]); }
    ctx.lineWidth = 3; ctx.strokeStyle = th.done; ctx.setLineDash([7, 6]); path(st.pts.slice(0, ci + 1)); ctx.stroke(); ctx.setLineDash([]);
    if (cam && !cam.terrain) { ctx.restore(); drawSky(); }
    // curvas
    if (zBase >= 14) for (const t of st.turns) { if (t.dist < S.proj.dist - 200) continue; const q = proj(st.pts[t.i][0], st.pts[t.i][1]); if (!q[3]) continue; const r = 7 * sizeAt(q); ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.fillStyle = th.borne; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = th.casing; ctx.stroke(); }
    // rótulos de estradas
    if (zBase >= 14) { const seen = new Set(); for (const w of ways) { if (!w.n || w.c > (zBase >= 16 ? 5 : 4) || seen.has(w.n) || (zBase < 15.5 && !/^[A-Z] ?\d/.test(w.n))) continue; const q = midOf(w.p); if (!q[3] || q[0] < 0 || q[0] > W || q[1] < 60 || q[1] > H) continue; const sz = sizeAt(q); if (sz < 0.45) continue; seen.add(w.n); label(w.n, q[0], q[1], 'center', '600 ' + Math.round(12 * Math.max(.8, sz)) + 'px "Barlow Condensed", Barlow, sans-serif'); } }
    // POIs
    if (zBase >= 13) for (const p of query(M.poiIndex, box)) { if (p.k.startsWith('place') || (zBase < 15 && (p.k === 'shop' || p.k === 'bakery' || p.k === 'pharmacy' || p.k === 'cafe' || p.k === 'toilets')) || (zBase < 14 && (p.k === 'church' || p.k === 'castle' || p.k === 'viewpoint' || p.k === 'picnic'))) continue; const q = proj(p.lat, p.lon); if (!q[3] || q[0] < -20 || q[0] > W + 20 || q[1] < -20 || q[1] > H + 20) continue; poiIcon(p, q, zBase); }
    // paradas (foto/visita/compras)
    if (zBase >= 12) for (const p of S.paradas) { const q = proj(p.lat, p.lon); if (!q[3] || q[0] < -30 || q[0] > W + 30 || q[1] < -30 || q[1] > H + 30) continue; sightIcon(p, q, zBase); }
    // lugares
    for (const p of query(M.poiIndex, box)) { if (!p.k.startsWith('place')) continue; const t = p.k.slice(6), minz = t === 'city' ? 9 : t === 'town' ? 10 : t === 'village' ? 12 : 14.5; if (zBase < minz) continue; const q = proj(p.lat, p.lon); if (!q[3] || q[0] < -60 || q[0] > W + 60 || q[1] < 50 || q[1] > H) continue; const sz = Math.max(.75, sizeAt(q)); label(p.n.toUpperCase(), q[0], q[1], 'center', (t === 'city' || t === 'town' ? '800 ' + Math.round(16 * sz) + 'px' : t === 'village' ? '700 ' + Math.round(14 * sz) + 'px' : '600 ' + Math.round(12 * sz) + 'px') + ' "Barlow Condensed", Barlow, sans-serif'); }
    // bandeirinhas no chão (3D): cols, largada, chegada, paradas, abastecimento
    if (cam) for (const f of stageFlags(st, S.paradas)) {
      if (f.dist < S.proj.dist - 150) continue; const p = pointAt(st, f.dist), q = proj(p[0], p[1]); if (!q[3]) continue;
      const sz = sizeAt(q); if (sz < .3) continue; const hgt = 62 * sz;
      flagAt(ctx, q[0], q[1] - hgt, q[1], f.kind, f.text, Math.max(.6, sz));
      if (f.name && sz > .6) label(f.name.split(' · ')[0], q[0] + 30 * sz, q[1] - hgt + 8 * sz, 'left', '600 ' + Math.round(12 * Math.max(.8, sz)) + 'px "Barlow Condensed", Barlow, sans-serif');
    }
    // bornes
    for (const c of st.cps) { const q = proj(c.lat, c.lon); if (!q[3] || q[0] < -40 || q[0] > W + 40 || q[1] < -40 || q[1] > H + 40) continue; borne(c, q, zBase); }
  }
  // camadas dinâmicas: posição/ciclista, círculo de precisão, escala
  function drawDynamic(S) {
    const th = theme;
    // fora da rota: linha tracejada e seta da posição até o ponto mais próximo do traçado, com a distância
    if (S.fix && (S.off || (S.proj && S.proj.off > 60)) && !cam) {
      const pp = S.pos || S.fix, q0 = proj(pp.lat, pp.lon), tp = pointAt(S.stage, S.proj.dist || 0), q1 = proj(tp[0], tp[1]);
      ctx.save(); ctx.setLineDash([8, 6]); ctx.lineWidth = 4; ctx.strokeStyle = th.rouge || '#E10D0D'; ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke(); ctx.setLineDash([]);
      const a = Math.atan2(q1[1] - q0[1], q1[0] - q0[0]); ctx.translate(q1[0], q1[1]); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-16, -9); ctx.lineTo(-11, 0); ctx.lineTo(-16, 9); ctx.closePath(); ctx.fillStyle = '#E10D0D'; ctx.fill(); ctx.restore();
      const mx = (q0[0] + q1[0]) / 2, my = (q0[1] + q1[1]) / 2; label(Math.round(S.proj.off) + ' m', mx + 8, my - 8, 'left', '900 14px "Barlow Condensed", sans-serif', '#E10D0D');
    }
    // lugares marcados
    if (S.session && S.session.marks) for (const m of S.session.marks) { if (m.kind !== 'lugar' || m.lat == null) continue; const q = proj(m.lat, m.lon); if (!q[3]) continue; ctx.beginPath(); ctx.arc(q[0], q[1] - 9, 8, 0, 7); ctx.fillStyle = '#FFFF00'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#000'; ctx.stroke(); ctx.beginPath(); ctx.moveTo(q[0] - 5, q[1] - 3); ctx.lineTo(q[0], q[1] + 6); ctx.lineTo(q[0] + 5, q[1] - 3); ctx.fillStyle = '#000'; ctx.fill(); }
    // posição
    if (!S.fix && S.stage.cps.length) {
      for (const c of (S.showStart !== false && (S.proj.dist || 0) < 300 ? [S.stage.cps[S.stage.cps.length - 1]] : [S.stage.cps[0], S.stage.cps[S.stage.cps.length - 1]])) { const q = proj(c.lat, c.lon); if (!q[3]) continue; const im = icon('hotel', 44); const sz = 44 * sizeAt(q); if (ready(im)) ctx.drawImage(im, q[0] - sz / 2, q[1] - sz * .87, sz, sz); }
      if (S.showStart !== false) { const p = pointAt(S.stage, S.proj.dist || 0), q = proj(p[0], p[1]); placeRider(q, bearingAt(S.stage, S.proj.dist || 0) * Math.PI / 180 + view.rot); }
    }
    if (S.fix) { const mpp = metersPerPixel(S.fix.lat, view.z); const accPx = Math.min(200, (S.fix.acc || 0) / mpp); if (!cam && accPx > 40) { const qa = proj(S.fix.lat, S.fix.lon); ctx.beginPath(); ctx.arc(qa[0], qa[1], accPx, 0, 7); ctx.fillStyle = th.acc; ctx.fill(); }
      const pp = S.pos || { lat: S.fix.lat, lon: S.fix.lon, head: (S.fix.head || 0) * Math.PI / 180 }; const q = proj(pp.lat, pp.lon); placeRider(q, pp.head + view.rot); }
    // escala (só em 2D)
    if (!cam) {
      const mpp = metersPerPixel(S.fix ? S.fix.lat : 45.3, view.z), bar = [100, 200, 500, 1000, 2000, 5000].find(v => v / mpp > 60) || 5000;
      const sx = S.mode === 'resumo' ? 156 : 12;
      ctx.fillStyle = th.scale; ctx.fillRect(sx, H - S.scaleBottom - 4, bar / mpp, 4); ctx.fillStyle = th.borne; ctx.fillRect(sx, H - S.scaleBottom - 4, bar / mpp / 2, 4); ctx.strokeStyle = th.scale; ctx.lineWidth = 0.8; ctx.strokeRect(sx, H - S.scaleBottom - 4, bar / mpp, 4);
      label(bar >= 1000 ? (bar / 1000) + ' km' : bar + ' m', sx, H - S.scaleBottom - 12, 'left', '600 11px Barlow, sans-serif');
    }
  }
  function drawSkyFull() {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.55); g.addColorStop(0, theme.sky0); g.addColorStop(1, theme.sky1);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
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
    const sz = sizeAt(q), w = 32 * sz, h = 36 * sz, x = q[0] - w / 2, y = q[1] - h;
    ctx.beginPath(); rr(x, y, w, h, 4 * sz); ctx.fillStyle = c.done ? theme.res : theme.borne; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = theme.casing; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + 5 * sz); ctx.arc(q[0], y + 16 * sz, 16 * sz, Math.PI, 0); ctx.lineTo(x + w, y + 12 * sz); ctx.lineTo(x, y + 12 * sz); ctx.closePath(); ctx.fillStyle = (c.col || c.hotel) ? '#E10D0D' : '#FFFF00'; ctx.fill();
    ctx.fillStyle = '#000000'; ctx.font = '900 ' + Math.round(16 * sz) + 'px "Barlow Condensed", "Arial Narrow", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(c.kmLabel), q[0], y + 25 * sz); ctx.textAlign = 'left';
    if (z >= 12 && sz > .5) label(c.name + (c.ele ? ' ' + c.ele + ' m' : ''), q[0] + 20 * sz, q[1] - 10 * sz, 'left', '700 ' + Math.round(14 * Math.max(.8, sz)) + 'px "Barlow Condensed", Barlow, sans-serif');
  }
  // disco atrás do ícone (estilo Apple Maps): branco de dia, preto à noite; amarelo para as paradas da viagem
  let placed = [];
  function disc(x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = theme === THEMES.night ? '#FFFFFF' : '#000000'; ctx.stroke(); }
  function crowded(x, y, r) { for (const q of placed) if (Math.abs(q[0] - x) < r && Math.abs(q[1] - y) < r) return true; placed.push([x, y]); return false; }
  function sightIcon(p, q, z) {
    const sz = sizeAt(q); if (sz < .35) return;
    const base = z >= 14.5 ? 48 : 36, im = icon(SIGHT_ICON[p.kind] || 'camera', base);
    if (ready(im)) { const s = base * sz; ctx.globalAlpha = p.done ? .45 : 1; disc(q[0], q[1], s * .56, '#FFFF00'); ctx.drawImage(im, q[0] - s * .38, q[1] - s * .42, s * .76, s * .76); ctx.globalAlpha = 1; if (z >= 13.5 && sz > .55 && !crowded(q[0], q[1] + s * .56 + 8, 40)) label(p.nome.split(' · ')[0], q[0], q[1] + s * .56 + 9 * sz, 'center', '700 ' + Math.round(13 * Math.max(.85, sz)) + 'px "Barlow Condensed", Barlow, sans-serif'); return; }
    const col = p.kind === 'compras' ? '#B8720A' : p.kind === 'opcional' ? theme.label : '#E10D0D';
    ctx.beginPath(); ctx.arc(q[0], q[1], 9, 0, 7); ctx.fillStyle = theme.borne; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = col; if (p.kind === 'opcional') ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]);
  }
  function poiIcon(p, q, z) {
    const s = POI[p.k]; if (!s) return;
    const sz = sizeAt(q); if (sz < .35) return;
    const base = z >= 16 ? 40 : z >= 14.5 ? 34 : 26, nm = KIND_ICON[p.k], im = nm ? icon(nm, base) : null;
    if (crowded(q[0], q[1], base * 0.9)) return;
    if (ready(im)) { const s2 = base * sz; disc(q[0], q[1], s2 * .52, theme.poiBg); ctx.drawImage(im, q[0] - s2 * .36, q[1] - s2 * .4, s2 * .72, s2 * .72); if (sz > .6 && (z >= 15.5 || ((p.k === 'peak' || p.k === 'pass' || p.k === 'water' || p.k === 'toilets' || p.k === 'bike' || p.k === 'castle' || p.k === 'viewpoint') && z >= 14)) && p.n && !crowded(q[0], q[1] + s2 * .52 + 8, 36)) label(p.n + (p.k === 'peak' || p.k === 'pass' ? (p.e ? ' ' + p.e : '') : ''), q[0], q[1] + s2 * .52 + 8 * sz, 'center', '700 ' + Math.round(12 * Math.max(.85, sz)) + 'px "Barlow Condensed", Barlow, sans-serif'); return; }
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
    if (rider && rider.show && !riderExternal) bike(octx, rider, frame);
  }
  function bike(c, r, frame) {
    c.save(); c.translate(r.x, r.y); c.rotate(r.rot); const s = 84 * (r.scale || 1);
    let im = icon('bikeTop' + (frame || 0), 84); if (!ready(im)) im = icon('bikeTop0', 84); if (!ready(im)) im = icon('bikeTop', 84);
    if (ready(im)) c.drawImage(im, -s / 2, -s * .55, s, s);
    else { c.beginPath(); c.moveTo(0, -18); c.lineTo(10, 12); c.lineTo(0, 6); c.lineTo(-10, 12); c.closePath(); c.fillStyle = theme.puck; c.fill(); c.lineWidth = 2; c.strokeStyle = theme.bike; c.stroke(); }
    c.restore();
  }
  function rr(x, y, w, h, r) { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  return {
    view, resize, toPx, fromPx, invalidate() { dirty = true; dirtyBase = true; }, draw, drawRider, riderMoved() { return riderMoved; }, riderInfo() { return rider ? { ...rider, mode: cam ? (cam.rider ? 'tp' : 'fp') : '2d' } : null; }, setRiderExternal(v) { riderExternal = !!v; }, size() { return { W, H }; },
    setTheme(name) { theme = THEMES[name] || THEMES.day; dirty = true; dirtyBase = true; },
    setMode(m) { view.mode = m; if (m !== '2d') view.anchorY = CAMS[m].yr; dirty = true; },
    setSat(on) { view.sat = !!on; dirty = true; },
    setView(cx, cy, z, rot) { if (cx != null) view.cx = cx; if (cy != null) view.cy = cy; if (z != null) view.z = Math.max(9, Math.min(19, z)); if (rot != null) view.rot = rot; dirty = true; lastViewChange = performance.now(); },
    // zoom mantendo fixo o ponto da tela (px, py): pinça e toque duplo, como no Waze
    zoomAround(z, px, py, rot) { const a = fromPx(px, py); view.z = Math.max(9, Math.min(19, z)); if (rot != null) view.rot = rot; const b = fromPx(px, py); view.cx += a.mx - b.mx; view.cy += a.my - b.my; dirty = true; riderMoved = true; lastViewChange = performance.now(); },
    animateTo(to, ms = 450) { anim = { from: { cx: view.cx, cy: view.cy, z: view.z, rot: view.rot }, to: { cx: to.cx ?? view.cx, cy: to.cy ?? view.cy, z: to.z ?? view.z, rot: to.rot ?? view.rot }, t0: performance.now(), ms }; dirty = true; },
    animating() { return !!anim; }, stopAnim() { anim = null; },
    stats() { return { baseCount, dpr, base: base ? base.W : 0 }; },
    centerOn(lat, lon) { view.cx = mercX(lon); view.cy = mercY(lat); dirty = true; }
  };
}

// perfil da etapa no grafismo do Tour: amarelo com contorno branco, hastes e bandeirinhas
export function drawProfile(canvas, stage, dist, theme, opts = {}) {
  const ctx = canvas.getContext('2d'), dpr = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return; if (canvas.width !== Math.round(w * dpr)) { canvas.width = w * dpr; canvas.height = h * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const p = stage.prof, km = stage.total / 1000; let lo = 1e9, hi = -1e9; for (const q of p) { if (q[1] < lo) lo = q[1]; if (q[1] > hi) hi = q[1]; }
  lo = Math.floor((lo - 40) / 100) * 100; hi = Math.ceil((hi + 60) / 100) * 100;
  const big = !!opts.labels, top = big ? 34 : 4, bottom = big ? 16 : 2;
  const X = d => 6 + d / km * (w - 12), Y = e => h - bottom - (e - lo) / (hi - lo) * (h - top - bottom);
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3A3D44'); g.addColorStop(1, '#0A0A0A'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.beginPath(); ctx.moveTo(X(0), h - bottom); for (const q of p) ctx.lineTo(X(q[0]), Y(q[1])); ctx.lineTo(X(km), h - bottom); ctx.closePath(); ctx.fillStyle = '#FFFF00'; ctx.fill();
  ctx.beginPath(); for (let i = 0; i < p.length; i++) { const q = p[i]; if (i) ctx.lineTo(X(q[0]), Y(q[1])); else ctx.moveTo(X(q[0]), Y(q[1])); } ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = big ? 3 : 1.6; ctx.lineJoin = 'round'; ctx.stroke();
  const xd = X(dist / 1000); ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(6, 0, Math.max(0, xd - 6), h - bottom);
  const flags = stageFlags(stage, opts.paradas || []);
  for (const f of flags) {
    if (!big && f.kind !== 'cat' && f.kind !== 'finish' && f.kind !== 'start') continue;
    const x = Math.min(w - 16, Math.max(8, X(f.dist / 1000))), y = Y(elevationAt(stage, f.dist));
    if (big) flagAt(ctx, x, Math.max(20, y - 26), h - bottom, f.kind, f.text, 1);
    else { ctx.strokeStyle = FLAG[f.kind] || '#E10D0D'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, h - bottom); ctx.lineTo(x, Math.max(2, y - 6)); ctx.stroke(); }
  }
  ctx.beginPath(); ctx.arc(xd, Y(elevationAt(stage, dist)), big ? 5 : 3.5, 0, 7); ctx.fillStyle = '#000000'; ctx.fill(); ctx.lineWidth = big ? 2 : 1.2; ctx.strokeStyle = '#FFFFFF'; ctx.stroke();
  if (big) {
    ctx.font = '600 10px "Barlow Condensed", Barlow, sans-serif'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#FFFFFF';
    const a = stage.cps[0], b = stage.cps[stage.cps.length - 1]; ctx.textAlign = 'left'; ctx.fillText(a.name + ' ' + Math.round(elevationAt(stage, 0)) + ' m', 8, h - 7); ctx.textAlign = 'right'; ctx.fillText(b.name + ' ' + Math.round(elevationAt(stage, stage.total)) + ' m', w - 6, h - 7);
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = '700 9px Barlow, sans-serif'; ctx.textAlign = 'left';
    for (const c of stage.climbs) { const x = Math.min(w - 16, Math.max(8, X(c.to / 1000))); const nm = (c.name.length > 16 ? c.name.slice(0, 15) + '…' : c.name).toUpperCase(); ctx.fillText(nm, x + 4, Math.max(20, Y(c.topEle) - 26) + 4 + 16 + 7); }
    ctx.textAlign = 'left';
  }
}
