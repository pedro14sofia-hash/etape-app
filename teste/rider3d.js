// Étape Navegar · rider3d.js
// Ciclista e bike em 3D de verdade (WebGL, three.js), numa camada própria sobre o mapa.
// Modo principal: avatar do Pedro (models/avatar.glb, malha texturizada gerada por imagem-para-3D a partir das fotos dele
// na Cannondale). A malha vem fundida e sem esqueleto, então o rig é procedural, montado na carga: rodas giram no cubo,
// pedivela e coroa giram no movimento central, pés seguem os pedais e as pernas dobram com IK de dois ossos; os pesos
// por vértice são calculados por região da malha. Sem modelo (ou sem WebGL), fica o desenho 2D do render.js.
// Modo secundário (página rider3d.html): ciclista procedural em tubos, mantido para testes.
import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

const C = { ink: 0x17191c, paper: 0xf7f5ee, green: 0x2f8f46, yellow: 0xffd100, skin: 0xe0b08a, helmet: 0xffffff, silver: 0xc9c9c9, tire: 0x1a1b1e, rim: 0x9a9fa6, dark: 0x3c4045 };
let renderer = null, scene, camera, dpr = 1, W = 0, H = 0, ok = false;
let bike, riderG, wheelF, wheelR, crank, legs = [], arms = [], crankAngle = 0, wheelAngle = 0, lastT = 0, ground, sun;
const R_WHEEL = 0.34;
let model = null;   // avatar glb com rig procedural: { group, rig }

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
    const dir = d.clone().normalize(), fwd = new THREE.Vector3(0, 0, -1);
    const perp = new THREE.Vector3().crossVectors(new THREE.Vector3(1, 0, 0), dir).normalize(); if (perp.dot(fwd) < 0) perp.negate();
    const knee = hip.clone().addScaledVector(dir, Math.cos(ang) * L1).addScaledVector(perp, Math.sin(ang) * L1);
    placeCapsule(leg.thigh, hip, knee); placeCapsule(leg.shin, knee, pedal); leg.knee.position.copy(knee);
    leg.foot.position.copy(pedal).add(new THREE.Vector3(0, 0.03, -0.03));
    const ped = crank.pedals.find(p => p.s === leg.s); if (ped) { ped.mesh.position.set(leg.s * 0.13, Math.sin(a) * 0.17, -Math.cos(a) * 0.17); ped.mesh.rotation.set(0, 0, 0); }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Avatar glb + rig procedural. Coordenadas do modelo: frente = -x, cima = +y, lateral = z (chão em y mínimo). Todas as
// medidas abaixo são em "metros do modelo" (k = raio da roda / 0,34 corrige a escala do gerador).
// ---------------------------------------------------------------------------------------------------------------------
const RIG = { hipBack: 0.15, hipUp: 0.66, hipSide: 0.09, thigh: 0.44, shin: 0.44, crank: 0.17, bbBack: 0.41, bbDrop: 0.07, legZ: [0.045, 0.24], legR: 0.15, footR: 0.15, wheelZ: 0.035, crankZ: [0.04, 0.07], blend: 0.06 };
function analyseMesh(pos) {
  const n = pos.length / 3; let ymin = Infinity, xmin = Infinity, xmax = -Infinity;
  for (let i = 0; i < n; i++) { const x = pos[3 * i], y = pos[3 * i + 1]; if (y < ymin) ymin = y; if (x < xmin) xmin = x; if (x > xmax) xmax = x; }
  // cubos das rodas: pontos mais baixos, separados pelo meio; frente = -x
  const lo = []; for (let i = 0; i < n; i++) if (pos[3 * i + 1] < ymin + 0.03) lo.push(pos[3 * i]);
  const mid = (xmin + xmax) / 2; const rear = lo.filter(x => x > mid), front = lo.filter(x => x < mid);
  const avg = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  const rearX = avg(rear), frontX = avg(front);
  // raio: candidato com mais vértices no anel do pneu (|z| pequeno)
  let bestR = 0.34, bestN = -1;
  for (let R = 0.26; R <= 0.46; R += 0.005) {
    let c = 0; for (let i = 0; i < n; i++) { const z = pos[3 * i + 2]; if (Math.abs(z) > 0.03) continue; const dx = pos[3 * i] - frontX, dy = pos[3 * i + 1] - (ymin + R); const r = Math.hypot(dx, dy); if (Math.abs(r - R) < 0.02) c++; }
    if (c > bestN) { bestN = c; bestR = R; }
  }
  return { ymin, rearX, frontX, R: bestR };
}
// dois ossos no plano x-y: quadril H, alvo P, comprimentos → joelho à frente (-x)
function ik(H, Pt, L1, L2) {
  const d = new THREE.Vector3().subVectors(Pt, H); const dist = Math.min(d.length(), L1 + L2 - 0.005); d.normalize();
  const cosA = Math.max(-1, Math.min(1, (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist))), a = Math.acos(cosA);
  const perp = new THREE.Vector3(-d.y, d.x, 0); if (perp.x > 0) perp.negate();   // joelho para a frente (-x)
  return H.clone().addScaledVector(d, Math.cos(a) * L1).addScaledVector(perp, Math.sin(a) * L1);
}
function segDist(p, a, b) { const ab = new THREE.Vector3().subVectors(b, a), ap = new THREE.Vector3().subVectors(p, a); const t = Math.max(0, Math.min(1, ap.dot(ab) / ab.lengthSq())); return { d: ap.addScaledVector(ab, -t).length(), t }; }

function buildRig(mesh) {
  const geo = mesh.geometry; const pos = geo.attributes.position.array; const n = pos.length / 3;
  const A = analyseMesh(pos); const k = A.R / 0.34;
  const BB = new THREE.Vector3(A.rearX - RIG.bbBack * k, A.ymin + A.R - RIG.bbDrop * k, 0);
  const Lc = RIG.crank * k, L1 = RIG.thigh * k, L2 = RIG.shin * k;
  const pedalAt = (th, s) => new THREE.Vector3(BB.x + Lc * Math.cos(th), BB.y + Lc * Math.sin(th), s * 0.11 * k);
  // ângulo de repouso do pedal de cada lado, pela posição dos pés na malha
  const th0 = {}, feet = {};
  for (const s of [1, -1]) {
    let sx = 0, sy = 0, c = 0;
    for (let i = 0; i < n; i++) {
      const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2] * s; if (z < 0.07 * k || z > 0.17 * k) continue;
      const r = Math.hypot(x - BB.x, y - BB.y); if (r < 0.10 * k || r > 0.30 * k || y > BB.y + 0.22 * k) continue;
      sx += x; sy += y; c++;
    }
    feet[s] = c; th0[s] = c > 20 ? Math.atan2(sy / c - BB.y, sx / c - BB.x) : (s > 0 ? -1.1 : Math.PI - 1.1);
  }
  const bones = {}, list = [];
  const mk = (name, p) => { const b = new THREE.Bone(); b.name = name; b.position.copy(p); bones[name] = b; list.push(b); return b; };
  const root = mk('root', new THREE.Vector3());
  mk('wheelR', new THREE.Vector3(A.rearX, A.ymin + A.R, 0)); mk('wheelF', new THREE.Vector3(A.frontX, A.ymin + A.R, 0)); mk('crank', BB);
  const side = {};
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'R' : 'L';
    const H = new THREE.Vector3(BB.x + RIG.hipBack * k, BB.y + RIG.hipUp * k, s * RIG.hipSide * k);
    const P0 = pedalAt(th0[s], s); const K0 = ik(H, P0, L1, L2);
    mk('thigh' + tag, H); mk('shin' + tag, K0); mk('pedal' + tag, P0);
    side[s] = { tag, H, K0, P0 };
  }
  for (const b of list) if (b !== root) root.add(b);
  // pesos por vértice
  const idx = new Float32Array(n * 4), wgt = new Float32Array(n * 4); const bi = name => list.indexOf(bones[name]);
  const set = (i, a, wa, b = 0, wb = 0) => { idx[4 * i] = a; wgt[4 * i] = wa; idx[4 * i + 1] = b; wgt[4 * i + 1] = wb; };
  // tubos do quadro (linhas no plano sagital): vértices rentes a eles com |z| pequeno ficam parados
  const hubR = new THREE.Vector3(A.rearX, A.ymin + A.R, 0), hubF = new THREE.Vector3(A.frontX, A.ymin + A.R, 0);
  const seatTop = new THREE.Vector3(BB.x + 0.14 * k, BB.y + 0.58 * k, 0), headB = new THREE.Vector3(A.frontX + 0.03 * k, A.ymin + A.R + 0.32 * k, 0), headT = new THREE.Vector3(A.frontX + 0.01 * k, A.ymin + A.R + 0.48 * k, 0);
  const frameSegs = [[BB, seatTop], [BB, headB], [BB, hubR], [hubR, seatTop], [seatTop, headT], [headB, headT], [headB, hubF]];
  const nearFrame = p => { const q = new THREE.Vector3(p.x, p.y, 0); for (const [a, b] of frameSegs) if (segDist(q, a, b).d < 0.055 * k) return true; return false; };
  const v = new THREE.Vector3(); let counts = { wheel: 0, crank: 0, leg: 0, foot: 0, frame: 0 };
  for (let i = 0; i < n; i++) {
    v.set(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); set(i, 0, 1);
    const az = Math.abs(v.z);
    if (az < RIG.wheelZ * k) {
      const rr = Math.hypot(v.x - A.rearX, v.y - (A.ymin + A.R)), rf = Math.hypot(v.x - A.frontX, v.y - (A.ymin + A.R));
      // só o interior do aro (raios e cubo) gira: pneu e aro são simétricos e o quadro/garfo passam rente ao pneu
      if (rr < A.R - 0.06 * k) { set(i, bi('wheelR'), 1); counts.wheel++; continue; }
      if (rf < A.R - 0.06 * k) { set(i, bi('wheelF'), 1); counts.wheel++; continue; }
    }
    const rBB = Math.hypot(v.x - BB.x, v.y - BB.y);
    if (az < 0.085 * k && rBB > 0.07 * k && nearFrame(v)) { counts.frame++; continue; }
    const s = v.z > 0 ? 1 : -1; const S = side[s]; const z = az;
    const dFoot = v.distanceTo(S.P0);
    if (z >= RIG.legZ[0] * k && dFoot < RIG.footR * k) {   // pé, pedal e ponta do pedivela: seguem o pedal; transição para a canela
      const w = Math.max(0, Math.min(1, (RIG.footR * k - dFoot) / (RIG.blend * k)));
      set(i, bi('pedal' + S.tag), w, bi('shin' + S.tag), 1 - w); counts.foot++; continue;
    }
    // pedivela e coroa giram no movimento central, mas nunca a canela que passa rente (fica para a canela)
    const dShin = Math.min(segDist(v, side[1].K0, side[1].P0).d, segDist(v, side[-1].K0, side[-1].P0).d);
    if (az >= RIG.crankZ[0] * k && az <= RIG.crankZ[1] * k && rBB < Lc + 0.03 * k && dShin > 0.10 * k) { set(i, bi('crank'), 1); counts.crank++; continue; }
    if (z < RIG.legZ[0] * k || z > RIG.legZ[1] * k || v.y > S.H.y + 0.05 * k || v.x < BB.x - 0.32 * k || v.x > S.H.x + 0.16 * k) continue;
    const t1 = segDist(v, S.H, S.K0), t2 = segDist(v, S.K0, S.P0);
    const dLeg = Math.min(t1.d, t2.d);
    if (dLeg > RIG.legR * k) continue;
    // coxa ou canela, com mistura perto do joelho
    const dK = v.distanceTo(S.K0);
    if (dK < RIG.blend * k) { const w = 0.5 + 0.5 * (t1.d < t2.d ? 1 : -1) * (1 - dK / (RIG.blend * k)); set(i, bi('thigh' + S.tag), w, bi('shin' + S.tag), 1 - w); }
    else if (t1.d <= t2.d) set(i, bi('thigh' + S.tag), 1); else set(i, bi('shin' + S.tag), 1);
    counts.leg++;
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(wgt, 4));
  const skinned = new THREE.SkinnedMesh(geo, mesh.material); skinned.add(root); skinned.updateMatrixWorld(true); skinned.bind(new THREE.Skeleton(list)); skinned.castShadow = true; skinned.frustumCulled = false;
  console.info('rider3d: rig ' + JSON.stringify({ R: +A.R.toFixed(3), k: +k.toFixed(2), rearX: +A.rearX.toFixed(2), frontX: +A.frontX.toFixed(2), BB: BB.toArray().map(x => +x.toFixed(2)), th0R: +(th0[1] * 180 / Math.PI).toFixed(0), th0L: +(th0[-1] * 180 / Math.PI).toFixed(0), feet, ...counts }));
  return { skinned, bones, A, k, BB, Lc, L1, L2, th0, side, pedalAt };
}
function animateRig(rig) {
  const { bones, side, th0, pedalAt, L1, L2 } = rig;
  bones.wheelR.rotation.z = wheelAngle; bones.wheelF.rotation.z = wheelAngle;   // frente = -x: giro positivo leva o topo para a frente
  bones.crank.rotation.z = crankAngle;
  const q = new THREE.Quaternion(), a = new THREE.Vector3(), b = new THREE.Vector3();
  for (const s of [1, -1]) {
    const S = side[s]; const Pn = pedalAt(th0[s] + crankAngle, s); const K = ik(S.H, Pn, L1, L2);
    bones['pedal' + S.tag].position.copy(Pn);
    a.subVectors(S.K0, S.H).normalize(); b.subVectors(K, S.H).normalize(); bones['thigh' + S.tag].quaternion.copy(q.setFromUnitVectors(a, b));
    a.subVectors(S.P0, S.K0).normalize(); b.subVectors(Pn, K).normalize(); bones['shin' + S.tag].position.copy(K); bones['shin' + S.tag].quaternion.copy(q.setFromUnitVectors(a, b));
  }
}
// carrega models/avatar.glb; resolve true se o avatar substituiu o procedural
export function loadModel(url) {
  if (!ok) return Promise.resolve(false);
  return new Promise(resolve => {
    new GLTFLoader().load(url, gltf => {
      try {
        let mesh = null; gltf.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
        if (!mesh) return resolve(false);
        mesh.updateMatrixWorld(true); mesh.geometry.applyMatrix4(mesh.matrixWorld);
        if (mesh.material && mesh.material.map) {
          // a textura já traz a luz do gerador: brilho próprio (emissive) + luz forte, para o branco do maillot não virar cinza
          const mm = mesh.material; mm.map.colorSpace = THREE.SRGBColorSpace; mm.roughness = 0.85; mm.metalness = 0;
          mm.emissive = new THREE.Color(0xffffff); mm.emissiveMap = mm.map; mm.emissiveIntensity = 0.45; mm.needsUpdate = true;
        }
        const rig = buildRig(mesh);
        const group = new THREE.Group(); group.add(rig.skinned);
        // modelo: frente -x, chão em ymin, meio das rodas em x → three: frente -z, chão y=0, origem sob o centro das rodas
        const sc = 0.34 / rig.A.R; group.scale.setScalar(sc); group.rotation.y = -Math.PI / 2;
        const cx = (rig.A.rearX + rig.A.frontX) / 2; group.position.set(0, -rig.A.ymin * sc, 0);
        rig.skinned.position.set(-cx, 0, 0);
        scene.add(group); if (bike) bike.visible = false;
        model = { group, rig }; resolve(true);
      } catch (e) { console.error('rider3d: rig falhou', e); resolve(false); }
    }, undefined, err => { console.warn('rider3d: sem modelo', err && err.message); resolve(false); });
  });
}
export function hasModel() { return !!model; }
// marcadores: quadril (vermelho), joelho (verde), pedal (azul), movimento central e cubos (amarelo) — página rider3d.html?rig=1
let dbg = null;
export function debugRig(on) {
  if (!model) return; if (dbg) { model.group.remove(dbg); dbg = null; } if (!on) return;
  dbg = new THREE.Group(); const { rig } = model; const mk = (c, r = 0.03) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r * rig.k, 10, 8), new THREE.MeshBasicMaterial({ color: c, depthTest: false })); dbg.add(m); return m; };
  dbg.marks = { hipR: mk(0xff0000), hipL: mk(0xff0000), kneeR: mk(0x00cc00), kneeL: mk(0x00cc00), pedR: mk(0x0044ff), pedL: mk(0x0044ff), bb: mk(0xffcc00), hubR: mk(0xffcc00), hubF: mk(0xffcc00) };
  dbg.position.copy(rig.skinned.position); model.group.add(dbg);
}
function updateDebug() {
  if (!dbg || !model) return; const { rig } = model; const m = dbg.marks, b = rig.bones;
  m.hipR.position.copy(rig.side[1].H); m.hipL.position.copy(rig.side[-1].H); m.kneeR.position.copy(b.shinR.position); m.kneeL.position.copy(b.shinL.position);
  m.pedR.position.copy(b.pedalR.position); m.pedL.position.copy(b.pedalL.position); m.bb.position.copy(rig.BB); m.hubR.position.copy(b.wheelR.position); m.hubF.position.copy(b.wheelF.position);
}

export function init(canvas) {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } catch (e) { renderer = null; ok = false; return false; }
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b0a0, 1.6));
  sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(-0.6, 4.5, 0.4);   // quase a pino: a sombra fica sob a bike, não um borrão ao lado sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -1.5; sun.shadow.camera.right = 1.5; sun.shadow.camera.top = 1.5; sun.shadow.camera.bottom = -1.5; sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 8; sun.shadow.bias = -0.002; scene.add(sun);
  bike = new THREE.Group(); bike.add(buildBike()); riderG = buildRider(); bike.add(riderG);
  bike.position.set(0, 0, 0.5);   // centro do modelo na origem (rodas em z=+0.5 atrás … -0.49 à frente)
  scene.add(bike);
  ground = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ opacity: 0.28 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  ok = true; return true;
}
export function isReady() { return ok; }
export function resize(w, h, ratio) { if (!ok) return; W = w; H = h; dpr = ratio; renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); }

function step(v, t) {
  const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0; lastT = t;
  if (v > 0.8) { const rpm = Math.min(95, 60 + v * 3); crankAngle += rpm / 60 * Math.PI * 2 * dt; wheelAngle += v / R_WHEEL * dt; }
  if (model) { animateRig(model.rig); updateDebug(); return; }
  wheelF.rotation.x = wheelR.rotation.x = -wheelAngle; crank.rotation.x = -crankAngle; updateLegs();
}
function yaw(rot) { if (model) model.group.rotation.y = -Math.PI / 2 - (rot || 0); else bike.rotation.y = -(rot || 0); }

// r: {x, y, rot, scale, show, mode: '2d'|'tp'|'fp'}; v em m/s; t em ms
export function render(r, v, t) {
  if (!ok) return;
  step(v, t);
  renderer.setScissorTest(true); renderer.clear(true, true, true);
  if (!r || !r.show) { renderer.setScissorTest(false); return; }
  const size = Math.round(133 * (r.scale || 1)); const x0 = Math.round(r.x - size / 2), y0 = Math.round(H - r.y - size * 0.36);   // 1ª versão 230 → −20 % → −15 % → −15 %
  renderer.setViewport(x0, y0, size, size); renderer.setScissor(x0, y0, size, size);
  camera.aspect = 1;
  if (model) { camera.position.set(0.0, 1.3, 3.3); camera.fov = 30; }                // avatar: de trás e um pouco acima, como a TV do Tour
  else if (r.mode === 'tp') { camera.position.set(0.0, 1.15, 2.7); camera.fov = 30; }
  else { camera.position.set(-1.0, 3.2, 2.2); camera.fov = 26; }                     // procedural em 2D: de cima, três quartos, de trás
  camera.lookAt(0, model ? 0.7 : 0.6, 0); camera.updateProjectionMatrix();           // origem = chão sob o centro das rodas
  yaw(r.rot);                                                                        // rumo: o mapa gira, a bike acompanha
  renderer.render(scene, camera); renderer.setScissorTest(false);
}
// vista livre (página rider3d.html): azimute/elevação/distância, quadrado de lado size no canto inferior esquerdo
export function renderFree(o, v, t) {
  if (!ok) return;
  step(v, t);
  renderer.setScissorTest(false); renderer.clear(true, true, true);
  const size = o.size; renderer.setViewport((W - size) / 2, (H - size) / 2, size, size); camera.aspect = 1; camera.fov = 30;
  camera.position.set(Math.sin(o.az) * Math.cos(o.el) * o.dist, Math.sin(o.el) * o.dist + 0.6, Math.cos(o.az) * Math.cos(o.el) * o.dist);
  camera.lookAt(0, 0.6, 0); camera.updateProjectionMatrix(); yaw(0);
  renderer.render(scene, camera);
}
