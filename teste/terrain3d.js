// Étape Navegar · terrain3d.js
// Vista 3ª pessoa em WebGL (three.js): relevo em três anéis concêntricos que acompanham o ciclista (clipmap simples),
// textura do satélite montada dos tiles já no aparelho (z15 → z18), estrada "cravada" no relevo, fita amarela com
// trecho feito, caminho azul do recálculo, câmera de perseguição, névoa e céu por tema. Sem WebGL, init() devolve false.
// Unidades: metros num plano local (x leste, z sul, y altitude absoluta), origem no centro da etapa.
import * as THREE from './vendor/three.module.min.js';
import * as dem from './dem.js';
import * as sat from './sat.js';
import { mercX, mercY } from './geo.js';
import { pointAt } from './track.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

// anéis: meio-lado (m), passo da malha (m), textura (px) e níveis do satélite (de baixo para cima), rebuild ao andar `move` m
const RINGS = [
  { half: 200, step: 8, tex: 2048, levels: [16, 17, 18], move: 64, drop: 0 },
  { half: 800, step: 20, tex: 1024, levels: [15, 16], move: 200, drop: 0.9 },
  { half: 2600, step: 80, tex: 1024, levels: [15], move: 800, drop: 2.5 }
];
const CARVE = 12, ROAD_STEP = 6, RIB_CHUNK = 1000, RIB_W = 4.6, CASE_W = 6.0, RIB_Y = 0.55, CASE_Y = 0.35;
const CAM = { dist: 40, h: 18, ahead: 70, fov: 50, rider: 2.8 };

let renderer = null, scene = null, camera = null, canvas = null, W = 0, H = 0, HV = 0, dpr = 1, ok = false, lost = false;
let night = false, satOn = true, stage = null, lat0 = 0, lon0 = 0, kx = 1, ky = 1;
let hemi = null, sun = null, rings = [], road = null, ribbons = new Map(), ribMat = null, caseMat = null, reroute = null, avatar = null;
let nRebuild = 0, nTex = 0, tm = {}, texDirty = 0, demDirty = false, lastRender = 0, frameMs = [], camHead = null, camPos = null, camTgt = null, stats = { tri: 0, calls: 0, dpr: 1, ms: 0 };

const toXZ = (lat, lon) => [(lon - lon0) * kx, -(lat - lat0) * ky];
const toLL = (x, z) => [lat0 - z / ky, lon0 + x / kx];

export function init(cv) {
  canvas = cv;
  if (/[?&]nogl=1/.test(location.search)) return false;   // teste do fallback para 2D
  try {
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  } catch (e) { renderer = null; ok = false; return false; }
  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; }, false);
  scene = new THREE.Scene();
  hemi = new THREE.HemisphereLight(0xFFFFFF, 0x8A8070, 1.0); scene.add(hemi);
  sun = new THREE.DirectionalLight(0xFFF4E0, 1.6); sun.position.set(-900, 1200, 400); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 800, far: 2400 }); sun.shadow.bias = -0.0015;
  scene.add(sun); scene.add(sun.target);
  camera = new THREE.PerspectiveCamera(CAM.fov, 1, 1, RINGS[2].half * 1.5);
  ribMat = new THREE.ShaderMaterial({
    uniforms: { uDone: { value: 0 }, uColor: { value: new THREE.Color(0xFFFF00) }, uDoneColor: { value: new THREE.Color(0x8A8A8A) }, fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 2 } },
    vertexShader: 'attribute float dist; varying float vD; varying float vFog; void main(){ vD = dist; vec4 mv = modelViewMatrix * vec4(position,1.0); vFog = -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uDone; uniform vec3 uColor; uniform vec3 uDoneColor; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; varying float vD; varying float vFog; void main(){ vec3 c = vD < uDone ? uDoneColor : uColor; float f = smoothstep(fogNear, fogFar, vFog); gl_FragColor = vec4(mix(c, fogColor, f), 1.0); }',
    side: THREE.DoubleSide
  });
  caseMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, fog: true });
  sat.setOnLoad(() => { texDirty = performance.now(); });
  dem.setOnLoad(() => { demDirty = true; });
  ok = true; setTheme(false); return true;
}
export function isReady() { return ok && !lost; }
// hv: altura visível do mapa (o painel cobre a parte de baixo do canvas); a cena é composta só nessa faixa
export function resize(w, h, ratio, hv) {
  if (!ok) return; W = w; H = h; HV = hv && hv > 120 && hv < h ? hv : h; dpr = Math.min(ratio || 1, 1.5);
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
  renderer.setViewport(0, H - HV, W, HV); renderer.setScissor(0, H - HV, W, HV); renderer.setScissorTest(true);
  camera.aspect = W / HV; camera.updateProjectionMatrix();
}
export function setVisible(hv) { if (ok && W) resize(W, H, dpr, hv); }
export function setTheme(n) {
  if (!ok) return; night = !!n;
  scene.background = new THREE.Color(night ? 0x0A0C12 : 0xBFD8F0); scene.fog = new THREE.Fog(night ? 0x14161C : 0xE6E2D8, RINGS[2].half * 0.45, RINGS[2].half * 1.05);
  hemi.color.set(night ? 0x7A86A8 : 0xFFFFFF); hemi.groundColor.set(night ? 0x202020 : 0x8A8070); hemi.intensity = night ? 1.9 : 1.0;
  sun.color.set(night ? 0x6070A0 : 0xFFF4E0); sun.intensity = night ? 0.35 : 1.6;
  ribMat.uniforms.fogColor.value.copy(scene.fog.color); ribMat.uniforms.fogNear.value = scene.fog.near; ribMat.uniforms.fogFar.value = scene.fog.far;
  for (const r of rings) r.texStamp = -1;   // textura refeita (véu da noite)
}
export function setSat(on) { if (!ok) return; satOn = !!on; for (const r of rings) r.texStamp = -1; }
// avatar (GLB): frente −x → −z, chão em y=0, altura 1,75 m; sem pedalada ainda (F4 traz o rig do rider3d.js)
export function loadAvatar(url) {
  if (!ok || avatar) return;
  new GLTFLoader().load(url, gltf => {
    const g = gltf.scene; g.traverse(o => { if (o.isMesh) { o.castShadow = true; const m = o.material; if (m && m.map) { m.map.colorSpace = THREE.SRGBColorSpace; m.emissive = new THREE.Color(0xffffff); m.emissiveMap = m.map; m.emissiveIntensity = 0.45; m.needsUpdate = true; } } });
    const bb = new THREE.Box3().setFromObject(g), s = 1.75 / (bb.max.y - bb.min.y), wrap = new THREE.Group();
    g.scale.setScalar(s); g.position.set(-(bb.min.x + bb.max.x) / 2 * s, -bb.min.y * s, -(bb.min.z + bb.max.z) / 2 * s); g.rotation.y = -Math.PI / 2; wrap.add(g);
    setAvatar(wrap);
  }, undefined, () => { });
}
export function setAvatar(group) { if (avatar) scene.remove(avatar); avatar = group || null; if (avatar) scene.add(avatar); }
export function setStage(st) {
  stage = st; ribbons.forEach(r => { scene.remove(r.rib); scene.remove(r.cas); r.rib.geometry.dispose(); r.cas.geometry.dispose(); }); ribbons.clear();
  for (const r of rings) { if (r.mesh) { scene.remove(r.mesh); r.mesh.geometry.dispose(); if (r.mesh.material.map) r.mesh.material.map.dispose(); r.mesh.material.dispose(); } }
  rings = RINGS.map(cfg => ({ cfg, mesh: null, cx: null, cz: null, texStamp: -1 }));
  if (!st) { road = null; return; }
  const pts = st.pts; let la = 0, lo = 0; for (const p of pts) { la += p[0]; lo += p[1]; } lat0 = la / pts.length; lon0 = lo / pts.length;
  ky = 111320; kx = 111320 * Math.cos(lat0 * Math.PI / 180);
  // estrada: pontos a cada 6 m no plano local, altura pelo DEM suavizado (±40 m ao longo do traçado), calculada quando precisa
  const n = Math.floor(st.total / ROAD_STEP) + 1, xs = new Float32Array(n), zs = new Float32Array(n), ys = new Float32Array(n).fill(NaN), grid = new Map();
  for (let i = 0; i < n; i++) { const p = pointAt(st, i * ROAD_STEP), [x, z] = toXZ(p[0], p[1]); xs[i] = x; zs[i] = z; const k = Math.floor(x / 40) + ':' + Math.floor(z / 40); const g = grid.get(k); if (g) g.push(i); else grid.set(k, [i]); }
  road = { n, xs, zs, ys, grid };
  if (rerouteMesh) { scene.remove(rerouteMesh); rerouteMesh = null; }
}
function roadY(i) {   // altura da estrada no ponto i (média do DEM em ±40 m); NaN se o DEM ainda não carregou ali
  const r = road; if (!isNaN(r.ys[i])) return r.ys[i];
  let s = 0, c = 0; for (let k = -7; k <= 7; k++) { const j = Math.max(0, Math.min(r.n - 1, i + k)); const ll = toLL(r.xs[j], r.zs[j]); const e = dem.elevationHi(ll[0], ll[1]); if (e != null) { s += e; c++; } }
  if (!c) return NaN; if (c === 15) r.ys[i] = s / c; return s / c;   // só guarda quando todas as amostras existem
}
function nearRoad(x, z) {
  const r = road; if (!r) return null; let bi = -1, bd = 1e9; const ci = Math.floor(x / 40), cj = Math.floor(z / 40);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const g = r.grid.get((ci + i) + ':' + (cj + j)); if (!g) continue; for (const k of g) { const d = Math.hypot(r.xs[k] - x, r.zs[k] - z); if (d < bd) { bd = d; bi = k; } } }
  return bi < 0 ? null : { i: bi, d: bd };
}
// altura do terreno no plano local, com a estrada cravada; null quando o DEM não está na memória
function height(x, z) {
  const ll = toLL(x, z); let e = dem.elevationHi(ll[0], ll[1]); if (e == null) return null;
  const nr = nearRoad(x, z); if (nr && nr.d < CARVE) { const ry = roadY(nr.i); if (!isNaN(ry)) { const w = nr.d < 4 ? 1 : 1 - (nr.d - 4) / (CARVE - 4); e += (ry - e) * w; } }
  return e;
}
export function groundAt(lat, lon) { const [x, z] = toXZ(lat, lon); return height(x, z); }

// ---------- anéis de terreno ----------
function buildRing(r, cx, cz) {
  const { half, step, drop } = r.cfg, nn = Math.round(2 * half / step);
  const geo = new THREE.PlaneGeometry(2 * half, 2 * half, nn, nn); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position; let holes = 0, last = 0; dem.takeLowRes();
  for (let i = 0; i < pos.count; i++) { const x = cx + pos.getX(i), z = cz + pos.getZ(i); let y = height(x, z); if (y == null) { holes++; y = last; } else last = y; pos.setY(i, y - drop); pos.setX(i, x); pos.setZ(i, z); }
  geo.computeVertexNormals();
  if (!r.mesh) { r.mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xB8B090 })); r.mesh.receiveShadow = r.cfg.half <= 200; r.mesh.frustumCulled = false; scene.add(r.mesh); }
  else { r.mesh.geometry.dispose(); r.mesh.geometry = geo; }
  r.cx = cx; r.cz = cz; r.holes = holes; r.low = dem.takeLowRes(); r.texStamp = -1; nRebuild++;
}
// textura do anel: níveis do satélite empilhados (grosso por baixo); devolve quantos tiles faltaram (para refazer depois)
function buildTexture(r) {
  const { half, tex, levels } = r.cfg, c = document.createElement('canvas'); c.width = c.height = tex; const g = c.getContext('2d');
  g.fillStyle = night ? '#20242A' : '#B9B29A'; g.fillRect(0, 0, tex, tex); let miss = 0;
  if (satOn && sat.available()) {
    const [laN, loW] = toLL(r.cx - half, r.cz - half), [laS, loE] = toLL(r.cx + half, r.cz + half);
    const mx0 = mercX(loW), mx1 = mercX(loE), my0 = mercY(laN), my1 = mercY(laS);
    for (const z of levels) {
      if (z !== 15 && !sat.hasLevel(z)) continue;
      const n = 2 ** z, tx0 = Math.floor(mx0 * n), tx1 = Math.floor(mx1 * n), ty0 = Math.floor(my0 * n), ty1 = Math.floor(my1 * n);
      for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) {
        if (!sat.hasTile(x, y, z) || sat.isBad(x, y, z)) continue;
        const im = sat.tile(x, y, z); if (!im) { miss++; continue; }
        const X = (x / n - mx0) / (mx1 - mx0) * tex, Y = (y / n - my0) / (my1 - my0) * tex, S = (1 / n) / (mx1 - mx0) * tex;
        g.drawImage(im, X, Y, S + 0.5, S + 0.5);
      }
    }
    if (night) { g.fillStyle = 'rgba(10,12,18,.30)'; g.fillRect(0, 0, tex, tex); }
  } else { g.fillStyle = night ? '#2A3028' : '#B8B090'; g.fillRect(0, 0, tex, tex); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  const m = r.mesh.material; if (m.map) m.map.dispose(); m.map = t; m.color.set(0xFFFFFF); m.needsUpdate = true;
  r.miss = miss; r.texStamp = performance.now(); nTex++; return miss;
}
function demBox(r, cx, cz) { const [laN, loW] = toLL(cx - r.cfg.half, cz - r.cfg.half), [laS, loE] = toLL(cx + r.cfg.half, cz + r.cfg.half); return [laS, loW, laN, loE]; }
let ensuring = new Set();
function ensureDem(r, cx, cz) {   // pede os tiles do DEM da caixa do anel (z14 só no anel colado e no próximo); ao chegar, demDirty refaz
  const box = demBox(r, cx, cz), key = r.cfg.half + ':' + Math.round(cx / 200) + ':' + Math.round(cz / 200); if (ensuring.has(key)) return; ensuring.add(key);
  const jobs = [dem.ensure(dem.tilesFor(box, 12), 12)]; if (r.cfg.half <= 800 && dem.hasLevel(14)) jobs.push(dem.ensure(dem.tilesFor(box, 14), 14));
  Promise.all(jobs).then(() => { demDirty = true; ensuring.delete(key); });
}
function warmSat(r) {   // dispara o carregamento dos tiles do anel (o cache do sat.js guarda as imagens)
  if (!satOn || !sat.available()) return;
  const { half, levels } = r.cfg, [laN, loW] = toLL(r.cx - half, r.cz - half), [laS, loE] = toLL(r.cx + half, r.cz + half);
  for (const z of levels) { if (z !== 15 && !sat.hasLevel(z)) continue; const n = 2 ** z; const x0 = Math.floor(mercX(loW) * n), x1 = Math.floor(mercX(loE) * n), y0 = Math.floor(mercY(laN) * n), y1 = Math.floor(mercY(laS) * n); for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (sat.hasTile(x, y, z)) sat.tile(x, y, z); }
}

// ---------- fita ----------
function stripGeo(xsF, zsF, ysF, from, to, w, y, withDist) {   // faixa entre os índices [from, to] da estrada
  const v = [], d = [], idx = []; let k = 0;
  for (let i = from; i <= to; i++) {
    const a = Math.max(from, i - 1), b = Math.min(to, i + 1); let dx = xsF[b] - xsF[a], dz = zsF[b] - zsF[a]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const nx = -dz * w / 2, nz = dx * w / 2, yy = (isNaN(ysF[i]) ? 0 : ysF[i]) + y;
    v.push(xsF[i] + nx, yy, zsF[i] + nz, xsF[i] - nx, yy, zsF[i] - nz); if (withDist) d.push(i * ROAD_STEP, i * ROAD_STEP);
    if (k) idx.push(k - 2, k - 1, k, k - 1, k + 1, k); k += 2;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); if (withDist) g.setAttribute('dist', new THREE.Float32BufferAttribute(d, 1)); g.setIndex(idx); return g;
}
function ribbonChunks(dist, redo) {   // mantém os trechos de 1 km a até 2,5 km do ciclista; refaz os que tinham buracos de DEM
  if (!road) return;
  const c0 = Math.max(0, Math.floor((dist - 2500) / RIB_CHUNK)), c1 = Math.floor((dist + 2500) / RIB_CHUNK);
  for (const [c, r] of ribbons) if (c < c0 - 1 || c > c1 + 1) { scene.remove(r.rib); scene.remove(r.cas); r.rib.geometry.dispose(); r.cas.geometry.dispose(); ribbons.delete(c); }
  for (let c = c0; c <= c1; c++) {
    const from = Math.floor(c * RIB_CHUNK / ROAD_STEP), to = Math.min(road.n - 1, Math.floor((c + 1) * RIB_CHUNK / ROAD_STEP)); if (from >= road.n - 1) break;
    let r = ribbons.get(c); if (r && (!r.holes || !redo)) continue;
    let holes = 0; for (let i = from; i <= to; i++) if (isNaN(roadY(i))) holes++;
    if (r && holes >= r.holes) continue;   // nada de novo chegou
    if (r) { scene.remove(r.rib); scene.remove(r.cas); r.rib.geometry.dispose(); r.cas.geometry.dispose(); }
    const rib = new THREE.Mesh(stripGeo(road.xs, road.zs, road.ys, from, to, RIB_W, RIB_Y, true), ribMat), cas = new THREE.Mesh(stripGeo(road.xs, road.zs, road.ys, from, to, CASE_W, CASE_Y, false), caseMat);
    rib.renderOrder = 2; cas.renderOrder = 1; scene.add(cas); scene.add(rib); ribbons.set(c, { rib, cas, holes });
  }
}
let rerouteMesh = null, rerouteAt = 0, rerouteHoles = 0;
function rerouteStrip(S, redo, gy) {
  const rr = S.reroute; if (!rr) { if (rerouteMesh) { scene.remove(rerouteMesh); rerouteMesh = null; } return; }
  if (rr.at === rerouteAt && rerouteMesh && !(redo && rerouteHoles)) return; rerouteAt = rr.at; if (rerouteMesh) scene.remove(rerouteMesh);
  const xs = [], zs = [], ys = []; rerouteHoles = 0; for (const p of rr.pts) { const [x, z] = toXZ(p[0], p[1]); const h = height(x, z); xs.push(x); zs.push(z); if (h == null) { rerouteHoles++; ys.push(gy); } else ys.push(h); }   // sem DEM ali ainda: altura do ciclista, refeito quando o DEM chegar
  const g = new THREE.Group(); g.add(new THREE.Mesh(stripGeo(xs, zs, ys, 0, xs.length - 1, 5.2, 0.6, false), new THREE.MeshBasicMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide, fog: true }))); g.add(new THREE.Mesh(stripGeo(xs, zs, ys, 0, xs.length - 1, 3.6, 0.8, false), new THREE.MeshBasicMaterial({ color: 0x3969B7, side: THREE.DoubleSide, fog: true })));
  g.renderOrder = 3; rerouteMesh = g; scene.add(g);
}

// ---------- quadro ----------
// S: estado do app (S.pos {lat, lon, head rad}, S.proj.dist, S.reroute); devolve false se não há o que desenhar
export function update(S, now) {
  if (!ok || lost || !stage || !road) return false;
  const p = S.pos || S.fix; if (!p) return false; const tUpd = performance.now();
  if (!W || !H) { if (canvas.clientWidth) resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1, HV); else return false; }
  const [x, z] = toXZ(p.lat, p.lon), head = S.pos ? S.pos.head : ((p.head || 0) * Math.PI / 180);
  // anéis: refaz quando o ciclista se afasta do centro ou quando chegou DEM novo
  const redo = demDirty; demDirty = false;
  for (const r of rings) {
    const { step, move } = r.cfg; const need = r.cx == null || Math.hypot(x - r.cx, z - r.cz) > move || (redo && (r.holes > 0 || r.low > 0));   // refaz se andou, ou se chegou DEM que faltava aqui
    if (need) { const cx = Math.round(x / step) * step, cz = Math.round(z / step) * step; ensureDem(r, cx, cz); buildRing(r, cx, cz); warmSat(r); }
  }
  tm.rings = performance.now() - tUpd; const tA = performance.now();
  // texturas: a que falta ou a que ficou velha (tiles chegaram)
  for (const r of rings) if (r.mesh && (r.texStamp < 0 || (r.miss > 0 && texDirty > r.texStamp && now - r.texStamp > 1500))) { buildTexture(r); break; }   // uma por quadro, no máximo a cada 1,5 s
  tm.tex = performance.now() - tA; const tB = performance.now();
  const dist = S.proj ? S.proj.dist : 0; ribbonChunks(dist, redo); ribMat.uniforms.uDone.value = dist;
  // ciclista e câmera
  let gy = height(x, z); if (gy == null) { const nr = nearRoad(x, z); gy = nr ? roadY(nr.i) : NaN; if (isNaN(gy)) gy = camPos ? camPos.y - CAM.h : 0; }
  rerouteStrip(S, redo, gy); tm.rib = performance.now() - tB;
  const ry = gy + RIB_Y;
  if (avatar) { avatar.position.set(x, ry, z); avatar.rotation.y = -head; avatar.scale.setScalar(CAM.rider); }
  if (camHead == null) camHead = head; else { let d = head - camHead; d = Math.atan2(Math.sin(d), Math.cos(d)); camHead += d * Math.min(1, (now - lastRender) / 350); }
  const fx = Math.sin(camHead), fz = -Math.cos(camHead);
  const want = new THREE.Vector3(x - fx * CAM.dist, ry + CAM.h, z - fz * CAM.dist), tgt = new THREE.Vector3(x + fx * CAM.ahead, ry + 6, z + fz * CAM.ahead);
  if (!camPos) { camPos = want.clone(); camTgt = tgt.clone(); } else { const k = Math.min(1, (now - lastRender) / 250); camPos.lerp(want, k); camTgt.lerp(tgt, k); }
  // a câmera nunca entra no relevo: fica 4 m acima do chão
  const gc = height(camPos.x, camPos.z); if (gc != null && camPos.y < gc + 4) camPos.y = gc + 4;
  camera.position.copy(camPos); camera.lookAt(camTgt);
  sun.target.position.set(x, gy, z); sun.position.set(x - 900, gy + 1200, z + 400);
  const t0 = performance.now(); renderer.render(scene, camera); const ms = performance.now() - t0; stats.upd = +(t0 - tUpd).toFixed(1);
  frameMs.push(ms); if (frameMs.length > 40) frameMs.shift(); lastRender = now;
  const avg = frameMs.reduce((a, b) => a + b, 0) / frameMs.length; if (frameMs.length >= 40 && avg > 42 && dpr > 1) { resize(W, H, 1, HV); frameMs = []; }
  stats = { upd: stats.upd, tri: renderer.info.render.triangles, calls: renderer.info.render.calls, dpr, ms: +avg.toFixed(1), holes: rings.map(r => r.holes).join('/'), miss: rings.map(r => r.miss).join('/'), low: rings.map(r => r.low).join('/'), rebuilds: nRebuild, textures: nTex, t: { rings: +tm.rings.toFixed(1), tex: +tm.tex.toFixed(1), rib: +tm.rib.toFixed(1) } };
  return true;
}
export function getStats() { return stats; }
export function debugInfo() { const rr = rerouteMesh ? rerouteMesh.children[1].geometry.attributes.position : null; const ys = []; if (rr) for (let i = 0; i < rr.count; i += 2) ys.push([+rr.getX(i).toFixed(0), +rr.getY(i).toFixed(1), +rr.getZ(i).toFixed(0)]); const scr = []; if (rr) for (let i = 0; i < rr.count; i += 4) { const v = new THREE.Vector3(rr.getX(i), rr.getY(i), rr.getZ(i)).project(camera); scr.push([+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(3)]); } const g0 = rr ? height(rr.getX(0), rr.getZ(0)) : null; return { reroute: !!rerouteMesh, visible: rerouteMesh && rerouteMesh.visible, scr, ground0: g0, holes: rerouteHoles, ys, camHead: camHead, cam: camPos && camPos.toArray().map(v => +v.toFixed(0)), avatar: avatar && avatar.position.toArray().map(v => +v.toFixed(0)) }; }
export function dispose() { if (!ok) return; setStage(null); renderer.dispose(); ok = false; }
