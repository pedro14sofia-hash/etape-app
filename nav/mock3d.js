// Étape Navegar · mock3d.js — F0: cena parada em three.js (terreno + satélite + fita cravada + avatar + ícones + bandeira).
// Só para aprovação visual. Parâmetros: ?stage=4&km=17.2&theme=day|night&sat=1&dist=70&h=34&fov=50&z14=1
import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { loadRoutes } from './data-mod.js';
import { loadStage, pointAt, bearingAt } from './track.js';
import { mercX, mercY } from './geo.js';
import * as dem from './dem.js';
import * as sat from './sat.js';
import { flagAt } from './render.js';

const q = new URLSearchParams(location.search);
const KEY = q.get('stage') || '4', KM = parseFloat(q.get('km') || '17.2'), NIGHT = q.get('theme') === 'night', SAT = q.get('sat') !== '0';
const CAM = { dist: parseFloat(q.get('dist') || '40'), h: parseFloat(q.get('h') || '18'), fov: parseFloat(q.get('fov') || '50'), ahead: parseFloat(q.get('ahead') || '70'), rider: parseFloat(q.get('rider') || '2.8') };   // avatar um pouco maior que o real, como o carro do Waze
const CLOSE = 200, NEAR = 800, FAR = 2600, STEP_C = 5, STEP_N = 10, STEP_F = 60;   // quadrado colado (z18), próximo (z16/17) e anel distante (z15)   // metros: meio-lado do quadrado próximo/distante e passo da malha
const st = document.getElementById('st'), say = s => { st.textContent += s + '\n'; };

// ---------- elevação multinível (z14 no corredor quando existe; senão z12) — protótipo do que vai para dem.js ----------
const demL = { idx: null, tiles: new Map() };
async function demInit() { demL.idx = await dem.loadIndex('dem/index.json'); }
function demTile(z, x, y) {
  const k = z + '/' + x + '/' + y; if (demL.tiles.has(k)) return demL.tiles.get(k);
  const p = new Promise(res => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, 256, 256).data, h = new Float32Array(65536); for (let i = 0, j = 0; i < 65536; i++, j += 4) h[i] = d[j] * 256 + d[j + 1] + d[j + 2] / 256 - 32768; res(h); }; im.onerror = () => res(null); im.src = 'dem/' + z + '/' + x + '/' + y + '.png'; });
  demL.tiles.set(k, p); return p;
}
const hcache = new Map();
async function demEnsure(lat0, lon0, lat1, lon1) {   // carrega os tiles z14 (se houver) e z12 da caixa
  const levels = [12]; if (q.get('z14') !== '0' && demL.idx && demL.idx.z14) levels.push(14);
  for (const z of levels) {
    const n = 2 ** z, set = z === 12 ? new Set(demL.idx.tiles.map(t => t.join('/'))) : new Set(demL.idx.z14.tiles.map(t => t.join('/')));
    const tx0 = Math.floor(mercX(lon0) * n), tx1 = Math.floor(mercX(lon1) * n), ty0 = Math.floor(mercY(lat1) * n), ty1 = Math.floor(mercY(lat0) * n);
    for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) if (set.has(x + '/' + y)) hcache.set(z + '/' + x + '/' + y, await demTile(z, x, y));
  }
}
function elev(lat, lon) {
  for (const z of [14, 12]) {
    const n = 2 ** z, px = mercX(lon) * n * 256, py = mercY(lat) * n * 256, tx = Math.floor(px / 256), ty = Math.floor(py / 256);
    const h = hcache.get(z + '/' + tx + '/' + ty); if (!h) continue;
    let u = px - tx * 256 - 0.5, v = py - ty * 256 - 0.5; u = Math.max(0, Math.min(254.999, u)); v = Math.max(0, Math.min(254.999, v));
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, o = j * 256 + i;
    return (h[o] * (1 - fu) + h[o + 1] * fu) * (1 - fv) + (h[o + 256] * (1 - fu) + h[o + 257] * fu) * fv;
  }
  return null;
}

// ---------- cena ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const SKY = NIGHT ? 0x0A0C12 : 0xBFD8F0, FOG = NIGHT ? 0x14161C : 0xE6E2D8;
scene.background = new THREE.Color(SKY); scene.fog = new THREE.Fog(FOG, FAR * 0.45, FAR * 1.05);
scene.add(new THREE.HemisphereLight(NIGHT ? 0x7A86A8 : 0xFFFFFF, NIGHT ? 0x202020 : 0x8A8070, NIGHT ? 1.9 : 1.0));
const sun = new THREE.DirectionalLight(NIGHT ? 0x6070A0 : 0xFFF4E0, NIGHT ? 0.35 : 1.6); sun.position.set(-900, 1200, 400); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 800, far: 2400 }); sun.shadow.bias = -0.0015;
scene.add(sun);
const camera = new THREE.PerspectiveCamera(CAM.fov, 1, 1, FAR * 1.4);
function resize() { const W = canvas.clientWidth, H = canvas.clientHeight; renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); }
window.addEventListener('resize', resize); resize();

// coordenadas locais (m): origem no ciclista, x leste, z sul, y altitude relativa
let lat0 = 0, lon0 = 0, kx = 1, ky = 1, h0 = 0;
const toXZ = (lat, lon) => [(lon - lon0) * kx, -(lat - lat0) * ky];
const toLL = (x, z) => [lat0 - z / ky, lon0 + x / kx];

async function main() {
  await demInit(); await sat.loadIndex('sat/index.json');
  const stage = loadStage(loadRoutes(), KEY), d0 = KM * 1000;
  const p0 = pointAt(stage, d0), head = bearingAt(stage, d0);
  lat0 = p0[0]; lon0 = p0[1]; ky = 111320; kx = 111320 * Math.cos(lat0 * Math.PI / 180);
  const R = FAR + 200, [la0, lo0] = toLL(-R, R), [la1, lo1] = toLL(R, -R);
  await demEnsure(la0, lo0, la1, lo1);
  say('dem z14: ' + (demL.idx && demL.idx.z14 ? 'sim' : 'não'));
  // perfil da rota alinhado ao DEM (deslocamento médio no trecho visível)
  const prof = stage.prof; const profAt = d => { const km = d / 1000; let i = 0; while (i < prof.length - 1 && prof[i + 1][0] < km) i++; const a = prof[i], b = prof[Math.min(i + 1, prof.length - 1)]; const t = b[0] > a[0] ? (km - a[0]) / (b[0] - a[0]) : 0; return a[1] + (b[1] - a[1]) * Math.max(0, Math.min(1, t)); };
  let off = 0, n = 0; for (let d = Math.max(0, d0 - 1500); d < Math.min(stage.total, d0 + 1500); d += 100) { const p = pointAt(stage, d), e = elev(p[0], p[1]); if (e != null) { off += e - profAt(d); n++; } } off = n ? off / n : 0;
  h0 = elev(lat0, lon0) ?? 0;
  // altura da estrada = DEM suavizado ao longo do traçado (±40 m): a fita nasce sobre o relevo; o perfil do GPX só serve de conferência
  const roadH = d => { let sum = 0, n = 0; for (let k = -40; k <= 40; k += 10) { const p = pointAt(stage, Math.max(0, Math.min(stage.total, d + k))), e = elev(p[0], p[1]); if (e != null) { sum += e; n++; } } return n ? sum / n - h0 : profAt(d) + off - h0; };
  say('offset perfil→DEM: ' + off.toFixed(1) + ' m');
  // pontos da rota no quadrado (para cravar e para a fita)
  const road = []; for (let d = Math.max(0, d0 - 3000); d < Math.min(stage.total, d0 + 6000); d += 6) { const p = pointAt(stage, d); const [x, z] = toXZ(p[0], p[1]); road.push({ x, z, y: roadH(d), d }); }
  const cell = 40, grid = new Map(); for (const r of road) { const k = Math.floor(r.x / cell) + ':' + Math.floor(r.z / cell); (grid.get(k) || grid.set(k, []).get(k)).push(r); }
  const nearRoad = (x, z) => { let best = null, bd = 1e9; const ci = Math.floor(x / cell), cj = Math.floor(z / cell); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const r of grid.get((ci + i) + ':' + (cj + j)) || []) { const dd = Math.hypot(r.x - x, r.z - z); if (dd < bd) { bd = dd; best = r; } } return best ? { r: best, d: bd } : null; };
  const CARVE = 12;
  const height = (x, z) => { const ll = toLL(x, z); let e = elev(ll[0], ll[1]); e = e == null ? 0 : e - h0; const nr = nearRoad(x, z); if (nr && nr.d < CARVE) { const w = nr.d < 4 ? 1 : 1 - (nr.d - 4) / (CARVE - 4); e = e + (nr.r.y - e) * w; } return e; };

  // terreno: quadrado próximo (10 m) e anel distante (60 m)
  function terrain(half, step, hole) {
    const nn = Math.round(2 * half / step), geo = new THREE.PlaneGeometry(2 * half, 2 * half, nn, nn); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, height(x, z)); }
    if (hole) { // recorta o quadrado interno (mantém só o anel): joga os triângulos internos para fora do índice
      const idx = geo.index.array, keep = []; for (let t = 0; t < idx.length; t += 3) { let inside = true; for (let k = 0; k < 3; k++) { const x = pos.getX(idx[t + k]), z = pos.getZ(idx[t + k]); if (Math.abs(x) > hole || Math.abs(z) > hole) inside = false; } if (!inside) keep.push(idx[t], idx[t + 1], idx[t + 2]); }
      geo.setIndex(keep);
    }
    geo.computeVertexNormals(); return geo;
  }
  const gClose = terrain(CLOSE, STEP_C, 0), gNear = terrain(NEAR, STEP_N, CLOSE - STEP_N), gFar = terrain(FAR, STEP_F, NEAR - STEP_F);
  say('triângulos: ' + Math.round((gClose.index.count + gNear.index.count + gFar.index.count) / 3));
  // textura do satélite: z17 no quadrado próximo (2048²), z15 no anel (1024²); sem satélite: sombreado hipsométrico
  async function satTexture(half, px, z, under) {
    const c = document.createElement('canvas'); c.width = c.height = px; const g = c.getContext('2d');
    g.fillStyle = NIGHT ? '#20242A' : '#B9B29A'; g.fillRect(0, 0, px, px);
    if (!SAT || !sat.available()) return c;
    if (under) g.drawImage(under, 0, 0, px, px);
    const n = 2 ** z, [laN, loW] = toLL(-half, -half), [laS, loE] = toLL(half, half);
    const mx0 = mercX(loW), mx1 = mercX(loE), my0 = mercY(laN), my1 = mercY(laS);
    const tx0 = Math.floor(mx0 * n), tx1 = Math.floor(mx1 * n), ty0 = Math.floor(my0 * n), ty1 = Math.floor(my1 * n); let got = 0, miss = 0;
    const jobs = [];
    for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) {
      if (z !== 15 && !sat.hasDetailTile(x, y, z)) { miss++; continue; }
      jobs.push(new Promise(res => { const im = new Image(); im.onload = () => { const X = (x / n - mx0) / (mx1 - mx0) * px, Y = (y / n - my0) / (my1 - my0) * px, S = (1 / n) / (mx1 - mx0) * px; g.drawImage(im, X, Y, S + 0.5, S + 0.5); got++; res(); }; im.onerror = () => { miss++; res(); }; im.src = sat.tileUrl(x, y, z); }));
    }
    await Promise.all(jobs);
    if (NIGHT && !under && z === 15) { } if (NIGHT) { g.fillStyle = 'rgba(10,12,18,.30)'; g.fillRect(0, 0, px, px); }
    say('sat z' + z + ': ' + got + ' tiles, ' + miss + ' faltando'); return c;
  }
  const mkTex = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t; };
  let matClose, matNear, matFar;
  if (SAT && sat.available()) {
    const u15 = await satTexture(NEAR, 1024, 15), u16 = await satTexture(NEAR, 2048, 16, u15); matNear = new THREE.MeshLambertMaterial({ map: mkTex(await satTexture(NEAR, 2048, 17, u16)) });
    const c16 = await satTexture(CLOSE, 512, 16), c17 = await satTexture(CLOSE, 1024, 17, c16); matClose = new THREE.MeshLambertMaterial({ map: mkTex(await satTexture(CLOSE, 2048, 18, c17)) });   // 400 m a 0,2 m/px
    matFar = new THREE.MeshLambertMaterial({ map: mkTex(await satTexture(FAR, 1024, 15)) });
  }
  else { const col = NIGHT ? 0x2A3028 : 0xB8B090; matClose = matNear = new THREE.MeshLambertMaterial({ color: col }); matFar = new THREE.MeshLambertMaterial({ color: col }); }
  const close = new THREE.Mesh(gClose, matClose); close.receiveShadow = true; scene.add(close); scene.add(new THREE.Mesh(gNear, matNear)); scene.add(new THREE.Mesh(gFar, matFar));

  // fita: faixa amarela (6 m) com casaco preto (7,6 m), apoiada no terreno cravado; trecho feito em cinza
  function ribbon(pts, w, y, color, from, to) {
    const v = [], idx = []; let k = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i]; if (p.d < from || p.d > to) continue; const q2 = pts[Math.min(i + 1, pts.length - 1)], p2 = pts[Math.max(i - 1, 0)]; let dx = q2.x - p2.x, dz = q2.z - p2.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; const nx = -dz * w / 2, nz = dx * w / 2; v.push(p.x + nx, p.y + y, p.z + nz, p.x - nx, p.y + y, p.z - nz); if (k) idx.push(k - 2, k - 1, k, k - 1, k + 1, k); k += 2; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })); return m;
  }
  scene.add(ribbon(road, 6.0, 0.45, 0x000000, -1e9, 1e9));
  scene.add(ribbon(road, 4.6, 0.65, 0x8A8A8A, -1e9, d0 - 3));   // feito
  scene.add(ribbon(road, 4.6, 0.65, 0xFFFF00, d0 - 3, 1e9));    // restante

  // ícones low-poly (procedurais, paleta do Tour) sobre disco amarelo + placa de texto
  const INK = 0x0A0A0A, JAUNE = 0xFFFF00, BLANC = 0xF4F4F4, BLEU = 0x3969B7, VERT = 0x1DAE50, ROUGE = 0xE10D0D;
  const M = c => new THREE.MeshLambertMaterial({ color: c });
  const box = (w, h, d, c, x, y, z, g) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const cyl = (rt, rb, h, c, x, y, z, g, n = 12) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, n), M(c)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  function plate(txt, color, w, h, y, g) { const c = document.createElement('canvas'); const cx = c.getContext('2d'); const font = '800 44px "Barlow Condensed", "Arial Narrow", sans-serif'; cx.font = font; const tw = Math.ceil(cx.measureText(txt).width) + 40; c.width = tw; c.height = 64; cx.fillStyle = color; cx.fillRect(0, 0, tw, 64); cx.fillStyle = color === '#FFFF00' ? '#000' : '#fff'; cx.font = font; cx.textBaseline = 'middle'; cx.fillText(txt, 20, 34); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); s.scale.set(h * tw / 64, h, 1); s.position.y = y; s.center.set(0.5, 0); s.renderOrder = 9; g.add(s); }
  function disc(g, r) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.6, 24), M(JAUNE)); m.position.y = 0.3; g.add(m); const k = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.5, r + 0.5, 0.35, 24), M(INK)); k.position.y = 0.17; g.add(k); }
  function iconFountain() { const g = new THREE.Group(); disc(g, 4); cyl(2.2, 2.4, 1.2, BLEU, 0, 1.2, 0, g, 16); cyl(0.35, 0.45, 3.2, INK, 0, 3.2, 0, g); const s = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), M(BLEU)); s.position.y = 5.2; s.castShadow = true; g.add(s); plate('ÁGUA', '#3969B7', 0, 2.6, 6.6, g); return g; }
  function iconWC() { const g = new THREE.Group(); disc(g, 4); box(3.6, 3.2, 3.0, BLANC, 0, 2.2, 0, g); box(3.9, 0.5, 3.3, INK, 0, 4.05, 0, g); box(1.0, 2.0, 0.2, INK, 0, 1.6, 1.55, g); plate('WC', '#3969B7', 0, 2.6, 5.4, g); return g; }
  function iconCol(name, ele) { const g = new THREE.Group(); disc(g, 4); cyl(0.25, 0.3, 6, INK, 0, 3.6, 0, g); box(4.8, 1.7, 0.25, ROUGE, 0, 6.2, 0, g); plate(name.toUpperCase() + ' · ' + ele + ' M', '#E10D0D', 0, 2.4, 7.4, g); return g; }
  function iconBakery() { const g = new THREE.Group(); disc(g, 4); box(3.4, 2.6, 2.8, 0xB8720A, 0, 1.9, 0, g); const roof = new THREE.Mesh(new THREE.ConeGeometry(2.7, 1.6, 4), M(INK)); roof.position.y = 4.0; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof); plate('PADARIA', '#B8720A', 0, 2.4, 5.4, g); return g; }
  const place = (g, d, side) => { const p = pointAt(stage, d), b = bearingAt(stage, d) * Math.PI / 180; const [x, z] = toXZ(p[0], p[1]); const ox = Math.cos(b) * 9 * side, oz = Math.sin(b) * 9 * side; g.position.set(x + ox, height(x + ox, z + oz), z + oz); scene.add(g); };
  place(iconFountain(), d0 + 120, 1); place(iconWC(), d0 + 230, -1); place(iconBakery(), d0 + 520, 1);
  const col = stage.climbs.find(c => c.to > d0 && c.to - d0 < 3000); place(iconCol(col ? col.name : 'Col de Serre', col ? Math.round(col.topEle) : 1335), d0 + 380, -1);   // no mockup o col fica perto para aparecer
  // bandeira de categoria (sprite do render.js) no topo
  { const c = document.createElement('canvas'); c.width = 128; c.height = 192; const g = c.getContext('2d'); g.scale(4, 4); flagAt(g, 3, 20, 46, 'cat', col ? String(col.cat) : '1', 1); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); sp.center.set(0.09, 0.02); sp.scale.set(14 * 128 / 192, 14, 1); const d = d0 + 380; const p = pointAt(stage, d); const [x, z] = toXZ(p[0], p[1]); sp.position.set(x + 6, height(x, z), z); sp.renderOrder = 8; scene.add(sp); }

  // avatar (GLB): frente −x → gira para −z; escala pela altura (1,75 m); ao rumo
  await new Promise(res => new GLTFLoader().load('models/avatar.glb', gltf => { const g = gltf.scene; g.traverse(o => { if (o.isMesh) { o.castShadow = true; if (o.material && o.material.map) { o.material.map.colorSpace = THREE.SRGBColorSpace; o.material.emissive = new THREE.Color(0xffffff); o.material.emissiveMap = o.material.map; o.material.emissiveIntensity = NIGHT ? 0.25 : 0.45; } } }); const bb = new THREE.Box3().setFromObject(g); const s = 1.75 * CAM.rider / (bb.max.y - bb.min.y); const wrap = new THREE.Group(); g.scale.setScalar(s); g.position.set(-(bb.min.x + bb.max.x) / 2 * s, -bb.min.y * s, -(bb.min.z + bb.max.z) / 2 * s); g.rotation.y = -Math.PI / 2; wrap.add(g); wrap.rotation.y = -head * Math.PI / 180; wrap.position.set(0, height(0, 0) + 0.7, 0); scene.add(wrap); say('avatar ok'); res(); }, undefined, e => { say('avatar: sem modelo'); res(); }));

  // câmera: atrás e acima do ciclista, olhando para um ponto à frente
  const hb = head * Math.PI / 180, fx = Math.sin(hb), fz = -Math.cos(hb);
  const ry = height(0, 0);
  camera.position.set(-fx * CAM.dist, ry + CAM.h, -fz * CAM.dist);
  const tgt = new THREE.Vector3(fx * CAM.ahead, ry + 6, fz * CAM.ahead); camera.lookAt(tgt);
  sun.target.position.copy(new THREE.Vector3(0, ry, 0)); scene.add(sun.target);
  renderer.render(scene, camera); say('fps: parado (F0)');
  window.__mock = { THREE, scene, camera, renderer, height, nearRoad, elev, toLL, h0, road, rerender: () => renderer.render(scene, camera) };
}
main().catch(e => say('ERRO ' + e.message));
