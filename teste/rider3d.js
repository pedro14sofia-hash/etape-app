// Étape Navegar · rider3d.js
// Ciclista e bike em 3D de verdade (WebGL, three.js), no estilo dos apps de pedal indoor: quadro em tubos com a geometria
// da Cannondale, rodas com pneu, aro e raios, pedivela girando, guidão de estrada, ciclista de maillot jaune com pernas
// que dobram na pedalada (IK de dois ossos), iluminação e sombra. Renderizado numa camada própria sobre o mapa.
// Se o WebGL falhar, o app volta ao desenho 2D. Um modelo glb externo pode substituir o procedural (loadModel).
import * as THREE from './vendor/three.module.min.js';

const C = { ink: 0x17191c, paper: 0xf7f5ee, green: 0x2f8f46, yellow: 0xffd100, skin: 0xe0b08a, helmet: 0xffffff, silver: 0xc9c9c9, tire: 0x1a1b1e, rim: 0x9a9fa6, dark: 0x3c4045 };
let renderer = null, scene, camera, dpr = 1, W = 0, H = 0, ok = false;
let bike, riderG, wheelF, wheelR, crank, legs = [], arms = [], crankAngle = 0, wheelAngle = 0, lastT = 0, ground, sun;
const R_WHEEL = 0.34;

function mat(color, opts = {}) { return new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.55, metalness: opts.metal ?? 0.05, ...opts.extra }); }
// cilindro entre dois pontos (metros), eixo three: x direita, y cima, z para trás (frente = -z)
function tube(a, b, r, m, group) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), d = new THREE.Vector3().subVectors(vb, va), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, 12, 1); const mesh = new THREE.Mesh(g, m);
  mesh.position.copy(va).addScaledVector(d, 0.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  mesh.castShadow = true; group.add(mesh); return mesh;
}
function sphere(p, r, m, group, sy = 1) { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), m); s.position.set(...p); s.scale.y = sy; s.castShadow = true; group.add(s); return s; }
// conversão do modelo bike3d.py (X frente, Y esquerda, Z cima) para three (x=-Y, y=Z, z=-X)
const P = (x, y, z) => [-y, z, -x];

function buildWheel() {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(R_WHEEL - 0.012, 0.014, 10, 40), mat(C.tire, { rough: 0.9 })); tire.castShadow = true; g.add(tire);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R_WHEEL - 0.03, 0.006, 8, 40), mat(C.rim, { metal: 0.6, rough: 0.35 })); g.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.09, 12), mat(C.silver, { metal: 0.7, rough: 0.3 })); hub.rotation.z = Math.PI / 2; g.add(hub);
  const spokeM = mat(C.rim, { metal: 0.5, rough: 0.4 });
  for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2, s = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, R_WHEEL - 0.04, 4, 1), spokeM); s.position.set((i % 2 ? 0.02 : -0.02), Math.cos(a) * (R_WHEEL - 0.04) / 2, Math.sin(a) * (R_WHEEL - 0.04) / 2); s.rotation.x = -a; g.add(s); }
  return g;
}
function buildBike() {
  const g = new THREE.Group();
  const white = mat(C.paper, { rough: 0.35, metal: 0.05 }), black = mat(C.ink, { rough: 0.4 }), green = mat(C.green, { rough: 0.45 }), silver = mat(C.silver, { metal: 0.7, rough: 0.3 });
  const rear = [0, 0, R_WHEEL], front = [0.99, 0, R_WHEEL], bb = [0.42, 0, 0.28], seat = [0.35, 0, 0.80], headT = [0.90, 0, 0.84], headB = [0.94, 0, 0.70];
  const T = (a, b, r, m) => tube(P(...a), P(...b), r, m, g);
  T(rear, bb, 0.014, black); T(rear, seat, 0.012, black);             // chainstay, seatstay
  T(headB, [0.985, 0, R_WHEEL + 0.02], 0.016, black);                   // garfo
  const dt = T(headB, bb, 0.028, black);                                // tubo inferior
  T([0.94 - 0.52 * 0.42, 0, 0.70 - 0.42 * 0.42], [0.94 - 0.52 * 0.6, 0, 0.70 - 0.42 * 0.6], 0.030, green);  // faixa verde
  T(seat, bb, 0.024, white); T(seat, headT, 0.026, white); T(headT, headB, 0.028, white);
  T(seat, [0.31, 0, 0.93], 0.014, black);                                // canote
  T([0.93, 0, 0.88], [0.93, 0, 0.955], 0.014, black);                    // mesa
  // guidão de estrada: barra + drops
  T([0.93, -0.21, 0.955], [0.93, 0.21, 0.955], 0.014, black);
  for (const s of [-1, 1]) {
    const pts = [[0.93, s * 0.21, 0.955], [1.04, s * 0.21, 0.945], [1.085, s * 0.21, 0.87], [1.02, s * 0.21, 0.80]].map(p => new THREE.Vector3(...P(...p)));
    const curve = new THREE.CatmullRomCurve3(pts); const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.013, 8, false), black); m.castShadow = true; g.add(m);
    const hood = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.05, 4, 8), black); hood.position.set(...P(1.0, s * 0.21, 0.96)); hood.rotation.x = 1.2; g.add(hood);
  }
  // selim
  const sad = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.035, 0.27), white); sad.position.set(...P(0.33, 0, 0.945)); sad.castShadow = true; g.add(sad);
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.036, 0.07), green); tip.position.set(...P(0.20, 0, 0.945)); g.add(tip);
  // rodas
  wheelR = buildWheel(); wheelR.position.set(...P(...rear)); g.add(wheelR);
  wheelF = buildWheel(); wheelF.position.set(...P(...front)); g.add(wheelF);
  // pedivela: coroa + braços + pedais (giram em crank)
  crank = new THREE.Group(); crank.position.set(...P(...bb)); g.add(crank);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.006, 40), silver); ring.rotation.z = Math.PI / 2; ring.position.x = -0.05; crank.add(ring);
  const ring2 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.006, 40), silver); ring2.rotation.z = Math.PI / 2; ring2.position.x = -0.06; crank.add(ring2);
  crank.pedals = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.17, 0.025), silver); arm.position.set(s * 0.075, s * 0.085, 0); arm.castShadow = true; crank.add(arm);
    const ped = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.06), black); ped.position.set(s * 0.13, s * 0.17, 0); crank.add(ped); crank.pedals.push({ mesh: ped, s });
  }
  return g;
}
function buildRider() {
  const g = new THREE.Group();
  const jersey = mat(C.yellow, { rough: 0.6 }), bib = mat(C.ink, { rough: 0.7 }), skin = mat(C.skin, { rough: 0.7 }), helmet = mat(C.helmet, { rough: 0.3 }), shoe = mat(C.ink, { rough: 0.5 });
  // tronco inclinado do quadril aos ombros
  const hip = new THREE.Vector3(...P(0.33, 0, 0.98)), sh = new THREE.Vector3(...P(0.72, 0, 1.18));
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, hip.distanceTo(sh) - 0.1, 6, 12), jersey);
  torso.position.copy(hip).lerp(sh, 0.5); torso.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(sh, hip).normalize()); torso.scale.x = 1.35; torso.castShadow = true; g.add(torso);
  const shorts = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 12), bib); shorts.position.copy(hip).add(new THREE.Vector3(0, -0.02, 0.02)); shorts.scale.set(1.25, 0.8, 1); shorts.castShadow = true; g.add(shorts);
  // cabeça e capacete
  const headP = P(0.86, 0, 1.27); sphere(headP, 0.095, skin, g);
  const hm = sphere([headP[0], headP[1] + 0.03, headP[2] - 0.01], 0.108, helmet, g, 0.85); hm.scale.z = 1.15;
  // braços: ombro → cotovelo → hood (IK simples fixa)
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Vector3(...P(0.72, s * 0.15, 1.16)), hand = new THREE.Vector3(...P(1.0, s * 0.21, 0.97));
    const elbow = new THREE.Vector3().addVectors(shoulder, hand).multiplyScalar(0.5).add(new THREE.Vector3(s * 0.04, -0.06, 0));
    tube(shoulder.toArray(), elbow.toArray(), 0.038, jersey, g); tube(elbow.toArray(), hand.toArray(), 0.03, skin, g);
    sphere(hand.toArray(), 0.032, skin, g);
    const glove = arms; glove.push({ shoulder, elbow, hand });
  }
  // pernas: quadril → joelho → pedal, atualizadas por quadro
  for (const s of [-1, 1]) {
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.3, 4, 10), bib); thigh.castShadow = true; g.add(thigh);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.32, 4, 10), skin); shin.castShadow = true; g.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.05, 0.19), shoe); foot.castShadow = true; g.add(foot);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), bib); g.add(knee);
    legs.push({ s, thigh, shin, foot, knee, hip: new THREE.Vector3(...P(0.33, s * 0.11, 0.97)) });
  }
  return g;
}
function placeCapsule(mesh, a, b) {
  const d = new THREE.Vector3().subVectors(b, a); mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  const len = d.length(); const geo = mesh.geometry.parameters; const full = geo.length + 2 * geo.radius; mesh.scale.y = Math.max(0.3, (len + 0.02) / full);
}
// IK de dois ossos no plano sagital: quadril, pedal, comprimentos → joelho (para a frente)
function updateLegs() {
  const bb = crank.position, L1 = 0.44, L2 = 0.44;
  for (const leg of legs) {
    const a = crankAngle + (leg.s > 0 ? 0 : Math.PI);
    const pedal = new THREE.Vector3(bb.x + leg.s * 0.13, bb.y + Math.sin(a) * 0.17, bb.z - Math.cos(a) * 0.17);
    const hip = leg.hip, d = new THREE.Vector3().subVectors(pedal, hip), dist = Math.min(d.length(), L1 + L2 - 0.01);
    const cosA = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), ang = Math.acos(Math.max(-1, Math.min(1, cosA)));
    const dir = d.clone().normalize(), fwd = new THREE.Vector3(0, 0, -1), side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(1, 0, 0)).normalize();
    // joelho para a frente e para cima do segmento quadril–pedal
    const perp = new THREE.Vector3().crossVectors(new THREE.Vector3(1, 0, 0), dir).normalize(); if (perp.dot(fwd) < 0) perp.negate();
    const knee = hip.clone().addScaledVector(dir, Math.cos(ang) * L1).addScaledVector(perp, Math.sin(ang) * L1);
    placeCapsule(leg.thigh, hip, knee); placeCapsule(leg.shin, knee, pedal); leg.knee.position.copy(knee);
    leg.foot.position.copy(pedal).add(new THREE.Vector3(0, 0.03, -0.03));
    const ped = crank.pedals.find(p => p.s === leg.s); if (ped) { ped.mesh.position.set(leg.s * 0.13, Math.sin(a) * 0.17, -Math.cos(a) * 0.17); ped.mesh.rotation.set(0, 0, 0); }
  }
}

export function init(canvas) {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } catch (e) { renderer = null; ok = false; return false; }
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
  scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x8a7a5a, 0.9));
  sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-1.5, 3.2, -1.2); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -1.5; sun.shadow.camera.right = 1.5; sun.shadow.camera.top = 1.5; sun.shadow.camera.bottom = -1.5; sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 8; sun.shadow.bias = -0.002; scene.add(sun);
  bike = new THREE.Group(); bike.add(buildBike()); riderG = buildRider(); bike.add(riderG);
  bike.position.set(0, 0, 0.5);   // centro do modelo na origem (rodas em z=+0.5 atrás … -0.49 à frente)
  scene.add(bike);
  ground = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ opacity: 0.35 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  ok = true; return true;
}
export function isReady() { return ok; }
export function resize(w, h, ratio) { if (!ok) return; W = w; H = h; dpr = ratio; renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); }

// r: {x, y, rot, scale, show, mode: '2d'|'tp'|'fp'}; v em m/s; t em ms
export function render(r, v, t) {
  if (!ok) return;
  const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0; lastT = t;
  if (v > 0.8) { const rpm = Math.min(95, 60 + v * 3); crankAngle += rpm / 60 * Math.PI * 2 * dt; wheelAngle += v / R_WHEEL * dt; }
  wheelF.rotation.x = wheelR.rotation.x = -wheelAngle; crank.rotation.x = -crankAngle; updateLegs();
  renderer.setScissorTest(true); renderer.clear(true, true, true);
  if (!r || !r.show) { renderer.setScissorTest(false); return; }
  const size = Math.round((r.mode === 'tp' ? 210 : 150) * (r.scale || 1)); const x0 = Math.round(r.x - size / 2), y0 = Math.round(H - r.y - size * 0.5);
  renderer.setViewport(x0, y0, size, size); renderer.setScissor(x0, y0, size, size);
  camera.aspect = 1;
  if (r.mode === 'tp') { camera.position.set(0.05, 1.3, 3.1); camera.fov = 30; }     // atrás e um pouco acima, como a câmera do mapa
  else { camera.position.set(-1.0, 3.2, 2.2); camera.fov = 26; }                     // 2D: de cima, três quartos, de trás
  camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();                           // origem = chão sob o pedivela, no centro do viewport
  bike.rotation.y = -(r.rot || 0);                                                   // rumo: o mapa gira, a bike acompanha
  renderer.render(scene, camera); renderer.setScissorTest(false);
}
// vista livre (página rider3d.html): azimute/elevação/distância, quadrado de lado size no canto inferior esquerdo
export function renderFree(o, v, t) {
  if (!ok) return;
  const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0; lastT = t;
  if (v > 0.8) { const rpm = Math.min(95, 60 + v * 3); crankAngle += rpm / 60 * Math.PI * 2 * dt; wheelAngle += v / R_WHEEL * dt; }
  wheelF.rotation.x = wheelR.rotation.x = -wheelAngle; crank.rotation.x = -crankAngle; updateLegs();
  renderer.setScissorTest(false); renderer.clear(true, true, true);
  const size = o.size; renderer.setViewport((W - size) / 2, (H - size) / 2, size, size); camera.aspect = 1; camera.fov = 30;
  camera.position.set(Math.sin(o.az) * Math.cos(o.el) * o.dist, Math.sin(o.el) * o.dist + 0.6, Math.cos(o.az) * Math.cos(o.el) * o.dist);
  camera.lookAt(0, 0.6, 0); camera.updateProjectionMatrix(); bike.rotation.y = 0;
  renderer.render(scene, camera);
}
