// Étape Navegar · diorama.js
// Diorama 3D da etapa, como as maquetes das etapas de montanha: bloco de relevo real (DEM z12) com sombreado e tintas
// hipsométricas na paleta Étape (ou ortofoto IGN por cima), fita amarela da etapa em relevo, bandeirinhas do Tour
// (largada, cols, paradas, musette, flamme rouge, chegada), nomes das cidades e cols, e a posição atual do ciclista.
// Gira devagar sozinho; arrastar orbita, pinça/roda aproxima. WebGL via three.js.
import * as THREE from './vendor/three.module.min.js';
import * as dem from './dem.js';
import * as sat from './sat.js';
import { mercX, mercY } from './geo.js';
import { flagAt, stageFlags } from './render.js';

const EXAG = 1.7;            // exagero vertical
const PAPER = '#F7F5EE', INK = '#17191C';
let renderer = null, scene, camera, canvas, raf = 0, W = 0, H = 0, dpr = 1;
let world = null;            // { box, cols, rows, hmin, sx, sz, toXZ(lat,lon), heightAt(lat,lon), terrain, ribbon, marker, texBase, texSat }
let cam = { az: -0.65, el: 0.62, dist: 1, target: new THREE.Vector3(), auto: true }, drag = null, pinch = 0, lastTouch = 0, S2 = null;

export function isReady() { return !!renderer; }

// tiles DEM z12 que cobrem a caixa [s,w,n,e]
function demTiles(box) {
  const n = 2 ** dem.zoom, t = (lat, lon) => [(lon + 180) / 360 * n, (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n];
  const [x0, y0] = t(box[2], box[1]), [x1, y1] = t(box[0], box[3]); const out = [];
  for (let x = Math.floor(x0); x <= Math.floor(x1); x++) for (let y = Math.floor(y0); y <= Math.floor(y1); y++) out.push([x, y]);
  return out;
}

// monta o diorama de uma etapa: stage (track.loadStage), paradas da etapa, key para os tiles de satélite
export async function build(cv, stage, paradas, key, opts = {}) {
  canvas = cv; dispose();
  try { renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, powerPreference: 'low-power' }); }
  catch (e) { renderer = null; return false; }
  renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(38, 1, 0.01, 200);
  scene.add(new THREE.HemisphereLight(0xf4f1e8, 0x7a6f5c, 0.85));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.25); sun.position.set(-3, 4, -2); scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.15));
  resize();

  // caixa da etapa com folga; grade regular em Mercator
  const pts = stage.pts, bb = pts.reduce((a, p) => [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])], [90, 180, -90, -180]);
  const padLat = 1200 / 111320, padLon = padLat / Math.cos((bb[0] + bb[2]) / 2 * Math.PI / 180);
  const box = [bb[0] - padLat, bb[1] - padLon, bb[2] + padLat, bb[3] + padLon];
  await dem.ensure(demTiles(box));
  const mx0 = mercX(box[1]), mx1 = mercX(box[3]), my0 = mercY(box[2]), my1 = mercY(box[0]);   // my cresce para o sul
  const kmPerMerc = 40075 * Math.cos((box[0] + box[2]) / 2 * Math.PI / 180);
  const wkm = (mx1 - mx0) * kmPerMerc, hkm = (my1 - my0) * kmPerMerc, big = Math.max(wkm, hkm);
  const cols = Math.round(Math.min(420, Math.max(120, big / 0.11))), rows = Math.max(40, Math.round(cols * hkm / wkm));
  // unidades de cena: 1 = big km (o lado maior mede 1)
  const sx = wkm / big, sz = hkm / big, vsc = EXAG / big / 1000;
  const toXZ = (lat, lon) => [((mercX(lon) - mx0) / (mx1 - mx0) - 0.5) * sx, ((mercY(lat) - my0) / (my1 - my0) - 0.5) * sz];
  const latAt = j => { const my = my0 + (my1 - my0) * j / rows; return Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180 / Math.PI; };
  const lonAt = i => (mx0 + (mx1 - mx0) * i / cols) * 360 - 180;
  const hgt = new Float32Array((cols + 1) * (rows + 1)); let hmin = 1e9, hmax = -1e9;
  for (let j = 0; j <= rows; j++) { const lat = latAt(j); for (let i = 0; i <= cols; i++) { const h = dem.elevation(lat, lonAt(i)); const v = h == null ? 0 : h; hgt[j * (cols + 1) + i] = v; if (h != null) { hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); } } }
  if (hmin > hmax) { hmin = 0; hmax = 1; }
  const base = hmin - 120;
  const heightAt = (lat, lon) => { const h = dem.elevation(lat, lon); return ((h == null ? hmin : h) - base) * vsc; };

  // malha do terreno
  const geo = new THREE.PlaneGeometry(sx, sz, cols, rows); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) { const k = j * (cols + 1) + i; pos.setY(k, (hgt[k] - base) * vsc); }
  geo.computeVertexNormals();
  const texBase = baseTexture(hgt, cols, rows, hmin, hmax, big);
  const terrainMat = new THREE.MeshLambertMaterial({ map: texBase });
  const terrain = new THREE.Mesh(geo, terrainMat); scene.add(terrain);
  // paredes do bloco (maquete) e base
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x17191c }); const walls = new THREE.Group();
  const edge = (pick, n) => { const out = []; for (let t = 0; t <= n; t++) out.push(pick(t)); return out; };
  const top = edge(i => [-sx / 2 + sx * i / cols, (hgt[i] - base) * vsc, -sz / 2], cols), bot = edge(i => [-sx / 2 + sx * i / cols, (hgt[rows * (cols + 1) + i] - base) * vsc, sz / 2], cols);
  const lef = edge(j => [-sx / 2, (hgt[j * (cols + 1)] - base) * vsc, -sz / 2 + sz * j / rows], rows), rig = edge(j => [sx / 2, (hgt[j * (cols + 1) + cols] - base) * vsc, -sz / 2 + sz * j / rows], rows);
  for (const e of [top, bot, lef, rig]) walls.add(wall(e, wallMat));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), wallMat); floor.rotateX(Math.PI / 2); floor.position.y = -0.0005; walls.add(floor);
  scene.add(walls);

  // fita da etapa: casaco preto e amarelo por cima, ~40 m acima do chão
  const lift = 45 * vsc, rw = Math.max(0.0035, 0.10 / big);
  const path = []; for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 1400))) path.push(pts[i]); if (path[path.length - 1] !== pts[pts.length - 1]) path.push(pts[pts.length - 1]);
  const line = path.map(p => { const [x, z] = toXZ(p[0], p[1]); return new THREE.Vector3(x, heightAt(p[0], p[1]) + lift, z); });
  const ribbon = new THREE.Group();
  ribbon.add(new THREE.Mesh(strip(line, rw * 1.7, -0.0006), new THREE.MeshBasicMaterial({ color: 0x17191c })));
  ribbon.add(new THREE.Mesh(strip(line, rw, 0), new THREE.MeshBasicMaterial({ color: 0xffd100 })));
  scene.add(ribbon);
  // trecho já feito (tracejado escuro) é atualizado por setProgress

  // bandeiras e rótulos
  const labels = new THREE.Group(); scene.add(labels);
  const flagH = Math.max(0.045, 3.3 / big);
  for (const f of stageFlags(stage, paradas)) {
    if (f.kind === 'feed' && big > 30 && paradas.length > 6) continue;
    const p = ptAt(stage, f.dist), [x, z] = toXZ(p[0], p[1]), y = heightAt(p[0], p[1]) + lift;
    labels.add(flagSprite(f.kind, f.text, x, y, z, flagH));
  }
  const named = [];
  for (const c of stage.cps) if (c.col || c.hotel || c.idx === 0 || c.dist >= stage.total - 500) named.push(c);
  const seen = new Set(), placed = [], poleMat = new THREE.LineBasicMaterial({ color: 0x17191c, transparent: true, opacity: 0.55 });
  for (const c of named) {
    if (seen.has(c.name)) continue; seen.add(c.name);
    const [x, z] = toXZ(c.lat, c.lon), y0 = heightAt(c.lat, c.lon) + lift;
    const level = placed.filter(p => Math.hypot(p[0] - x, p[1] - z) < 0.16).length; placed.push([x, z]);
    const y = y0 + flagH * (1.25 + 0.7 * level);
    labels.add(textSprite(c.name.toUpperCase(), x, y, z, c.col, big));
    if (level > 0) labels.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y0, z), new THREE.Vector3(x, y, z)]), poleMat));
  }
  // ciclista
  const marker = new THREE.Group();
  const dot = new THREE.Mesh(new THREE.SphereGeometry(rw * 1.8, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffd100 })); marker.add(dot);
  const halo = new THREE.Mesh(new THREE.RingGeometry(rw * 2.4, rw * 3.4, 24), new THREE.MeshBasicMaterial({ color: 0x17191c, side: THREE.DoubleSide })); halo.rotateX(-Math.PI / 2); marker.add(halo);
  marker.visible = false; scene.add(marker);

  world = { box, cols, rows, hmin, hmax, base, vsc, sx, sz, big, toXZ, heightAt, terrain, terrainMat, ribbon, marker, texBase, texSat: null, stage, lift, key, done: null };
  cam.target.set(0, (hmin + (hmax - hmin) * 0.35 - base) * vsc, 0); cam.dist = 1.22; cam.az = -0.7; cam.el = 0.52; cam.auto = true;
  bind(); if (opts.sat) setSat(true);
  loop(); return true;
}

// ponto do traçado à distância d (m)
function ptAt(stage, d) { const cum = stage.cum, pts = stage.pts; let lo = 0, hi = pts.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < d) lo = m + 1; else hi = m; } const i = Math.max(1, lo), t = cum[i] === cum[i - 1] ? 0 : (d - cum[i - 1]) / (cum[i] - cum[i - 1]); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; }

// faixa plana seguindo a polilinha (largura constante no plano XZ)
function strip(line, w, dy) {
  const n = line.length, v = new Float32Array(n * 2 * 3), idx = [];
  for (let i = 0; i < n; i++) {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(n - 1, i + 1)]; let dx = b.x - a.x, dz = b.z - a.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const nx = -dz * w / 2, nz = dx * w / 2, p = line[i];
    v.set([p.x + nx, p.y + dy, p.z + nz, p.x - nx, p.y + dy, p.z - nz], i * 6);
    if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(v, 3)); g.setIndex(idx); return g;
}
function wall(edge, m) {
  const n = edge.length, v = new Float32Array(n * 2 * 3), idx = [];
  for (let i = 0; i < n; i++) { const [x, y, z] = edge[i]; v.set([x, y, z, x, 0, z], i * 6); if (i < n - 1) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(v, 3)); g.setIndex(idx); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, m.clone()); mesh.material.side = THREE.DoubleSide; return mesh;
}

// textura base: sombreado de relevo + tintas por altitude na paleta Étape (creme → verde-oliva → castanho → cinza claro)
function baseTexture(h, cols, rows, hmin, hmax, big) {
  const TW = 1024, TH = Math.max(64, Math.round(1024 * rows / cols)); const c = document.createElement('canvas'); c.width = TW; c.height = TH;
  const g = c.getContext('2d'), img = g.createImageData(TW, TH), d = img.data;
  const stops = [[0, [232, 226, 200]], [0.22, [206, 208, 160]], [0.45, [166, 176, 122]], [0.68, [150, 128, 92]], [0.86, [128, 114, 100]], [1, [214, 210, 204]]];
  const tint = t => { let a = stops[0], b = stops[stops.length - 1]; for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { a = stops[i - 1]; b = stops[i]; break; } const f = (t - a[0]) / (b[0] - a[0] || 1); return [0, 1, 2].map(k => a[1][k] + (b[1][k] - a[1][k]) * f); };
  const cellM = big * 1000 / cols, lx = -0.6, ly = -0.6, lz = 0.53;   // luz de noroeste, como nas cartas
  for (let y = 0; y < TH; y++) {
    const jf = y / TH * rows, j = Math.min(rows - 1, Math.floor(jf));
    for (let x = 0; x < TW; x++) {
      const i = Math.min(cols - 1, Math.floor(x / TW * cols)), k = j * (cols + 1) + i;
      const hz = h[k], dxh = (h[k + 1] - hz) / cellM, dzh = (h[k + cols + 1] - hz) / cellM;   // z cresce para o sul
      const nl = Math.hypot(dxh, dzh, 1), shade = Math.max(0, Math.min(1, (-dxh * lx - dzh * ly + lz) / nl));
      const t = (hz - hmin) / (hmax - hmin || 1), col = tint(t), s = 0.55 + 0.75 * shade;
      const o = (y * TW + x) * 4; d[o] = Math.min(255, col[0] * s); d[o + 1] = Math.min(255, col[1] * s); d[o + 2] = Math.min(255, col[2] * s); d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
}
// ortofoto IGN por cima da base, só onde há tiles (corredor da etapa)
async function satTexture() {
  if (!world || !sat.available()) return null;
  const dio = sat.dioTiles(world.key); if (!dio || !dio.list.length) return null; const list = dio.list;
  const TW = 2048, TH = Math.max(64, Math.round(2048 * world.rows / world.cols)); const c = document.createElement('canvas'); c.width = TW; c.height = TH;
  const g = c.getContext('2d'); g.drawImage(world.texBase.image, 0, 0, TW, TH); try { g.filter = 'brightness(1.22) saturate(0.92)'; } catch (e) { }
  const mx0 = mercX(world.box[1]), mx1 = mercX(world.box[3]), my0 = mercY(world.box[2]), my1 = mercY(world.box[0]);
  await new Promise(res => { let pending = 0; const done = () => { if (--pending <= 0) res(); };
    for (const [x, y] of list) {
      const tm = sat.tileMercZ(x, y, dio.z), px = (tm.mx - mx0) / (mx1 - mx0) * TW, py = (tm.my - my0) / (my1 - my0) * TH, pw = tm.size / (mx1 - mx0) * TW, ph = tm.size / (my1 - my0) * TH;
      if (px + pw < 0 || py + ph < 0 || px > TW || py > TH) continue;
      pending++; const im = new Image(); im.onload = () => { g.drawImage(im, px, py, pw + 0.5, ph + 0.5); done(); }; im.onerror = done; im.src = sat.tileUrl(x, y, dio.z);
    }
    if (!pending) res(); });
  g.filter = 'none'; g.fillStyle = 'rgba(247,245,238,0.14)'; g.fillRect(0, 0, TW, TH);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
}
export async function setSat(on) {
  if (!world) return; if (on && !world.texSat) world.texSat = await satTexture();
  world.terrainMat.map = on && world.texSat ? world.texSat : world.texBase; world.terrainMat.needsUpdate = true; world.sat = on && !!world.texSat;
}
export function satOn() { return !!(world && world.sat); }

// bandeira (desenho do render.js) como sprite de tamanho fixo em cena, presa por uma haste
function flagSprite(kind, text, x, y, z, hgt) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 96; const g = c.getContext('2d'); g.scale(2, 2);
  flagAt(g, 3, 20, 46, kind, text, 1.0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })); sp.center.set(0.09, 0.02);
  sp.scale.set(hgt * 64 / 96, hgt, 1); sp.position.set(x, y, z); sp.renderOrder = 5; return sp;
}
function textSprite(txt, x, y, z, col, big) {
  const c = document.createElement('canvas'); const g = c.getContext('2d'); const font = '800 34px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.font = font; const w = Math.ceil(g.measureText(txt).width) + 26; c.width = w; c.height = 48; g.font = font; g.textBaseline = 'middle';
  g.fillStyle = col ? '#D71920' : INK; roundRect(g, 0, 4, w, 40, 4); g.fill(); g.fillStyle = col ? '#FFFFFF' : '#FFE566'; g.fillText(txt, 13, 26);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })); const h = Math.max(0.022, 1.55 / big);
  sp.scale.set(h * w / 48, h, 1); sp.position.set(x, y, z); sp.center.set(0.5, 0); sp.renderOrder = 6; return sp;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// posição do ciclista (m percorridos) e trecho feito
export function setProgress(distM) {
  if (!world) return; const st = world.stage;
  if (distM == null || distM <= 0) { world.marker.visible = false; if (world.done) { scene.remove(world.done); world.done = null; } return; }
  const p = ptAt(st, distM), [x, z] = world.toXZ(p[0], p[1]); world.marker.position.set(x, world.heightAt(p[0], p[1]) + world.lift + 0.002, z); world.marker.visible = true;
  if (world.done) scene.remove(world.done);
  const step = Math.max(1, Math.floor(st.pts.length / 1400)), line = []; for (let i = 0; i < st.pts.length && st.cum[i] <= distM; i += step) { const q = st.pts[i]; const [qx, qz] = world.toXZ(q[0], q[1]); line.push(new THREE.Vector3(qx, world.heightAt(q[0], q[1]) + world.lift + 0.0006, qz)); }
  if (line.length > 1) { world.done = new THREE.Mesh(strip(line, Math.max(0.0035, 0.10 / world.big) * 0.9, 0), new THREE.MeshBasicMaterial({ color: 0x8a8f96 })); scene.add(world.done); }
}

function resize() { if (!renderer || !canvas) return; dpr = Math.min(window.devicePixelRatio || 1, 2); W = canvas.clientWidth || 300; H = canvas.clientHeight || 260; renderer.setPixelRatio(dpr); renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); }
function frame() {
  if (!renderer || !world) return;
  if (canvas.clientWidth !== W || canvas.clientHeight !== H) resize();
  if (cam.auto) cam.az += 0.0025;
  const el = Math.max(0.12, Math.min(1.45, cam.el)), r = Math.max(0.3, Math.min(4, cam.dist)) * Math.max(1, 1.25 * H / W);
  camera.position.set(cam.target.x + Math.sin(cam.az) * Math.cos(el) * r, cam.target.y + Math.sin(el) * r, cam.target.z + Math.cos(cam.az) * Math.cos(el) * r);
  camera.lookAt(cam.target); renderer.render(scene, camera);
}
function loop() { cancelAnimationFrame(raf); const tick = () => { frame(); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); }
export function stop() { cancelAnimationFrame(raf); raf = 0; }
export function dispose() { stop(); if (renderer) { renderer.dispose(); renderer = null; } world = null; }

function bind() {
  if (canvas.dataset.bound) return; canvas.dataset.bound = '1'; canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; cam.auto = false; canvas.setPointerCapture(e.pointerId); e.preventDefault(); });
  canvas.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id || pinch) return; cam.az -= (e.clientX - drag.x) * 0.008; cam.el += (e.clientY - drag.y) * 0.006; drag.x = e.clientX; drag.y = e.clientY; });
  const up = e => { if (drag && e.pointerId === drag.id) drag = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { cam.dist *= 1 + Math.sign(e.deltaY) * 0.1; cam.auto = false; e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchstart', e => { if (e.touches.length === 2) { pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); } }, { passive: true });
  canvas.addEventListener('touchmove', e => { if (e.touches.length === 2 && pinch) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); cam.dist *= pinch / d; pinch = d; cam.auto = false; } }, { passive: true });
  canvas.addEventListener('touchend', e => { if (e.touches.length < 2) pinch = 0; }, { passive: true });
  canvas.addEventListener('dblclick', () => { cam.auto = !cam.auto; });
}
