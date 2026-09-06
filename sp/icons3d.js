// Étape Navegar · icons3d.js
// Ícones 3D para a vista 3ª pessoa, no estilo "maquete recortada" do Tour: objetos low-poly com contorno preto nas
// arestas (como os ícones 2D), texturas desenhadas em canvas (pedra, telha, madeira, água, quadriculado), disco amarelo
// com borda preta e placa de texto virada para a câmera. Cada tipo é construído uma vez (protótipo) e clonado.
// Escala: objetos de 5–8 m; terrain3d aumenta a escala com a distância para o ícone nunca sumir na tela.
import * as THREE from './vendor/three.module.min.js';
import { flagAt } from './render.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';

export const INK = 0x0A0A0A, JAUNE = 0xFFFF00, BLANC = 0xF4F4F4, ROUGE = 0xE10D0D, VERT = 0x1DAE50, BLEU = 0x3969B7, BRUN = 0xB8720A, GRIS = 0x8A8F96, PEDRA = 0xC9C2B4, MADEIRA = 0x9C6B3C, TELHA = 0xB5533C, CREME = 0xF3E9D2;
const mats = new Map(), lineMat = new THREE.LineBasicMaterial({ color: INK });
const M = c => { let m = mats.get(c); if (!m) { m = new THREE.MeshLambertMaterial({ color: c }); mats.set(c, m); } return m; };
// ---------- texturas desenhadas ----------
const texCache = new Map();
function canvasTex(key, w, h, draw, rep = 1) {
  let t = texCache.get(key); if (t) return t;
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 4; texCache.set(key, t); return t;
}
const TEX = {
  stone: () => canvasTex('stone', 128, 128, (g, w, h) => { g.fillStyle = '#C9C2B4'; g.fillRect(0, 0, w, h); let y = 0, row = 0; while (y < h) { let x = row % 2 ? -16 : 0; const rh = 14 + (row % 3) * 4; while (x < w) { const bw = 22 + ((x * 7 + row * 13) % 14); g.fillStyle = ['#D6CFC0', '#BFB7A8', '#CCC5B6', '#B8B0A0'][(x + row) % 4]; g.fillRect(x + 1, y + 1, bw - 2, rh - 2); x += bw; } y += rh; row++; } g.strokeStyle = 'rgba(40,36,30,.35)'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, w - 1, h - 1); }, 2),
  tiles: () => canvasTex('tiles', 128, 128, (g, w, h) => { g.fillStyle = '#8F3F2C'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 12) for (let x = (y / 12) % 2 ? 8 : 0; x < w; x += 16) { g.fillStyle = (x + y) % 32 ? '#B5533C' : '#A84A35'; g.beginPath(); g.arc(x + 8, y + 6, 8, Math.PI, 0); g.lineTo(x + 16, y + 12); g.lineTo(x, y + 12); g.closePath(); g.fill(); } }, 3),
  planks: () => canvasTex('planks', 128, 128, (g, w, h) => { for (let y = 0; y < h; y += 16) { g.fillStyle = ['#9C6B3C', '#8E5F33', '#A97645', '#956537'][(y / 16) % 4]; g.fillRect(0, y, w, 15); g.strokeStyle = 'rgba(60,35,10,.35)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0, y + 2 + i * 2.4); g.lineTo(w, y + 3 + i * 2.2); g.stroke(); } g.fillStyle = 'rgba(30,20,10,.5)'; g.fillRect(0, y + 15, w, 1); } }, 2),
  water: () => canvasTex('water', 128, 128, (g, w, h) => { g.fillStyle = '#3969B7'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 2; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(20 + (i * 37) % 100, 20 + (i * 53) % 100, 6 + i * 2, 0, 6.3); g.stroke(); } }, 1),
  checker: () => canvasTex('checker', 64, 64, (g, w, h) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#0A0A0A' : '#F4F4F4'; g.fillRect(x * 8, y * 16, 8, 16); } }, 1),
  awning: () => canvasTex('awning', 64, 16, (g, w, h) => { for (let x = 0; x < w; x += 8) { g.fillStyle = (x / 8) % 2 ? '#E10D0D' : '#F4F4F4'; g.fillRect(x, 0, 8, h); } }, 3),
  bread: () => canvasTex('bread', 64, 32, (g, w, h) => { g.fillStyle = '#C98A45'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8A5A25'; g.lineWidth = 3; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(8 + i * 14, 4); g.lineTo(18 + i * 14, 28); g.stroke(); } }, 1),
  windows: () => canvasTex('windows', 64, 64, (g, w, h) => { g.fillStyle = '#F4F4F4'; g.fillRect(0, 0, w, h); for (let y = 6; y < h; y += 20) for (let x = 6; x < w; x += 20) { g.fillStyle = '#FFE566'; g.fillRect(x, y, 12, 13); g.fillStyle = '#0A0A0A'; g.fillRect(x + 5, y, 2, 13); g.fillRect(x, y + 6, 12, 2); } }, 1)
};
const TM = (key, color = 0xFFFFFF) => { const k = 'T' + key; let m = mats.get(k); if (!m) { m = new THREE.MeshLambertMaterial({ map: TEX[key](), color }); mats.set(k, m); } return m; };

// ---------- primitivas com contorno ----------
function part(geo, mat, x, y, z, g, o = {}) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (o.ry) m.rotation.y = o.ry; if (o.rx) m.rotation.x = o.rx; if (o.rz) m.rotation.z = o.rz; m.castShadow = true; g.add(m);
  if (o.edges !== false) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, o.angle || 25), lineMat); e.position.copy(m.position); e.rotation.copy(m.rotation); g.add(e); }
  return m;
}
const box = (w, h, d, c, x, y, z, g, o = {}) => part(new THREE.BoxGeometry(w, h, d), typeof c === 'number' ? M(c) : c, x, y, z, g, o);
const cyl = (rt, rb, h, c, x, y, z, g, n = 12, o = {}) => part(new THREE.CylinderGeometry(rt, rb, h, n), typeof c === 'number' ? M(c) : c, x, y, z, g, { angle: 40, ...o });
const cone = (r, h, c, x, y, z, g, n = 4, o = {}) => part(new THREE.ConeGeometry(r, h, n), typeof c === 'number' ? M(c) : c, x, y, z, g, { ry: Math.PI / 4, ...o });
const sph = (r, c, x, y, z, g) => part(new THREE.SphereGeometry(r, 14, 10), M(c), x, y, z, g, { edges: false });
const torus = (r, t, c, x, y, z, g, o = {}) => part(new THREE.TorusGeometry(r, t, 8, 24), M(c), x, y, z, g, { edges: false, ...o });
function disc(g, r = 4) { cyl(r, r, 0.6, JAUNE, 0, 0.3, 0, g, 32, { edges: false }).receiveShadow = true; cyl(r + 0.5, r + 0.5, 0.35, INK, 0, 0.17, 0, g, 32, { edges: false }); }
function cross(c, x, y, z, g, s = 1.6, t = 0.45) { box(s, t, t, c, x, y, z, g); box(t, s, t, c, x, y, z, g); }
function crenels(g, y, z, from, to, c = TM('stone')) { for (let x = from; x <= to; x += 1.1) box(0.55, 0.55, 0.55, c, x, y, z, g); }

// placa de texto (sprite): fundo na cor, texto branco (ou preto no amarelo)
const plateCache = new Map();
export function plate(txt, color = '#0A0A0A', h = 2.4) {
  const key = txt + '|' + color; let tex = plateCache.get(key), w;
  if (!tex) {
    const c = document.createElement('canvas'), cx = c.getContext('2d'), font = '800 44px "Barlow Condensed", "Arial Narrow", sans-serif';
    cx.font = font; let tw = cx.measureText(txt).width; let f2 = font; if (tw > 480) { f2 = '800 ' + Math.max(26, Math.floor(44 * 480 / tw)) + 'px "Barlow Condensed", "Arial Narrow", sans-serif'; cx.font = f2; tw = cx.measureText(txt).width; }   // largura máxima: encolhe a fonte
    w = Math.ceil(tw) + 44; c.width = w; c.height = 68;
    cx.fillStyle = '#0A0A0A'; cx.fillRect(0, 0, w, 68); cx.fillStyle = color; cx.fillRect(3, 3, w - 6, 62); cx.fillStyle = color.toUpperCase() === '#FFFF00' ? '#000' : '#fff'; cx.font = f2; cx.textBaseline = 'middle'; cx.fillText(txt, 22, 36);
    tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.userData.w = w; plateCache.set(key, tex);
  }
  w = tex.userData.w; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false })); s.scale.set(h * w / 68, h, 1); s.center.set(0.5, 0); s.renderOrder = 9; return s;
}

// ---------- os 15 objetos ----------
const BUILD = {
  water() { const g = new THREE.Group(); disc(g);
    cyl(2.4, 2.6, 0.9, TM('stone'), 0, 0.85, 0, g, 18); cyl(2.15, 2.15, 0.35, TM('water'), 0, 1.45, 0, g, 18, { edges: false });
    cyl(0.5, 0.7, 1.4, TM('stone'), 0, 2.2, 0, g, 10); cyl(1.2, 1.2, 0.3, TM('stone'), 0, 3.0, 0, g, 14); cyl(1.0, 1.0, 0.2, TM('water'), 0, 3.25, 0, g, 14, { edges: false });
    cyl(0.28, 0.32, 1.6, TM('stone'), 0, 4.1, 0, g, 8); sph(0.55, BLEU, 0, 5.2, 0, g);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; cyl(0.06, 0.1, 1.6, BLEU, Math.sin(a) * 0.7, 2.6, Math.cos(a) * 0.7, g, 6, { edges: false, rx: Math.cos(a) * 0.6, rz: -Math.sin(a) * 0.6 }); }
    return g; },
  toilets() { const g = new THREE.Group(); disc(g);
    box(3.8, 3.0, 3.0, TM('stone'), 0, 1.9, 0, g); box(4.2, 0.5, 3.4, INK, 0, 3.6, 0, g); box(4.0, 0.25, 3.2, BLANC, 0, 3.95, 0, g);
    box(1.0, 2.0, 0.15, BLEU, -1.0, 1.4, 1.55, g); box(1.0, 2.0, 0.15, ROUGE, 1.0, 1.4, 1.55, g);
    sph(0.22, BLANC, -1.0, 2.45, 1.7, g); box(0.5, 0.9, 0.12, BLANC, -1.0, 1.7, 1.7, g, { edges: false }); sph(0.22, BLANC, 1.0, 2.45, 1.7, g); cone(0.45, 0.9, BLANC, 1.0, 1.7, 1.7, g, 8, { edges: false, ry: 0 });
    return g; },
  bakery() { const g = new THREE.Group(); disc(g);
    box(3.8, 2.8, 3.2, TM('stone'), 0, 1.8, 0, g); box(4.2, 0.2, 3.6, INK, 0, 3.3, 0, g);
    cone(2.9, 1.8, TM('tiles'), 0, 4.2, 0, g, 4); cyl(0.3, 0.3, 1.2, TM('stone'), 1.2, 4.6, -0.8, g, 8);
    box(3.6, 0.9, 0.9, TM('awning'), 0, 2.55, 1.9, g, { rx: 0.35, edges: false }); box(2.4, 1.2, 0.1, CREME, 0, 1.6, 1.62, g); box(1.6, 0.5, 0.5, TM('bread'), 0, 1.75, 1.7, g, { rz: 0.2, edges: false }); box(1.6, 0.5, 0.5, TM('bread'), 0.3, 1.35, 1.75, g, { rz: -0.15, edges: false });
    return g; },
  bike() { const g = new THREE.Group(); disc(g);
    torus(1.15, 0.12, INK, -1.6, 1.45, 0, g); torus(1.15, 0.12, INK, 1.6, 1.45, 0, g); cyl(0.9, 0.9, 0.05, GRIS, -1.6, 1.45, 0, g, 16, { edges: false, rx: Math.PI / 2 }); cyl(0.9, 0.9, 0.05, GRIS, 1.6, 1.45, 0, g, 16, { edges: false, rx: Math.PI / 2 });
    const f = M(VERT); box(2.4, 0.22, 0.22, f, -0.2, 2.75, 0, g, { edges: false }); box(0.22, 2.2, 0.22, f, -0.8, 2.1, 0, g, { edges: false, rz: 0.25 }); box(0.22, 2.4, 0.22, f, 1.0, 2.3, 0, g, { edges: false, rz: -0.2 }); box(0.22, 1.8, 0.22, f, -0.1, 1.9, 0, g, { edges: false, rz: -0.65 }); box(1.9, 0.18, 0.18, f, -0.7, 1.45, 0, g, { edges: false });
    box(0.9, 0.22, 0.45, INK, -0.9, 3.35, 0, g); box(0.2, 0.6, 0.2, INK, -0.85, 3.05, 0, g, { edges: false }); box(0.3, 0.2, 1.4, INK, 1.25, 3.5, 0, g); cyl(0.12, 0.12, 0.7, INK, 1.2, 3.15, 0, g, 6, { edges: false });
    return g; },
  pharmacy() { const g = new THREE.Group(); disc(g);
    box(3.6, 2.8, 3.0, TM('stone'), 0, 1.8, 0, g); box(3.9, 0.45, 3.3, VERT, 0, 3.4, 0, g); box(1.0, 1.7, 0.12, VERT, 0, 1.25, 1.55, g); box(2.6, 0.9, 0.1, BLANC, 0, 2.6, 1.56, g);
    cross(VERT, 0, 5.0, 0, g, 2.6, 0.75); cross(BLANC, 0, 5.0, 0.42, g, 1.8, 0.35);
    return g; },
  hospital() { const g = new THREE.Group(); disc(g);
    box(4.4, 3.8, 3.2, BLANC, 0, 2.3, 0, g); box(4.7, 0.45, 3.5, ROUGE, 0, 4.4, 0, g); for (let i = -1; i <= 1; i++) box(0.7, 0.8, 0.12, BLEU, i * 1.3, 3.0, 1.62, g, { edges: false }); box(1.4, 1.5, 0.12, GRIS, 0, 1.15, 1.62, g);
    cross(ROUGE, 0, 6.0, 0, g, 2.8, 0.8); box(2.9, 2.9, 0.3, BLANC, 0, 6.0, -0.35, g);
    return g; },
  pass() { const g = new THREE.Group(); disc(g);
    cyl(0.2, 0.26, 6.0, INK, 0, 3.3, 0, g, 8, { edges: false }); box(5.0, 1.9, 0.3, BLANC, 0, 6.3, 0, g); box(4.7, 1.6, 0.34, ROUGE, 0, 6.3, 0, g, { edges: false });
    cone(1.0, 1.1, BLANC, -1.4, 6.15, 0.2, g, 3, { ry: 0, edges: false }); cone(1.3, 1.5, BLANC, 0.2, 6.35, 0.2, g, 3, { ry: 0, edges: false }); cone(0.9, 1.0, BLANC, 1.5, 6.1, 0.2, g, 3, { ry: 0, edges: false });
    cyl(1.2, 1.4, 0.5, TM('stone'), 0, 0.85, 0, g, 12);
    return g; },
  peak() { const g = new THREE.Group(); disc(g);
    cone(2.8, 5.6, TM('stone', 0x9A948A), 0, 3.1, 0, g, 5, { ry: 0.3 }); cone(1.1, 2.2, BLANC, 0, 4.85, 0, g, 5, { ry: 0.3 }); cross(INK, 0, 6.5, 0, g, 0.9, 0.16);
    return g; },
  viewpoint() { const g = new THREE.Group(); disc(g);
    cyl(0.2, 0.26, 3.4, TM('planks'), -1.6, 2.0, 0, g, 8); cyl(0.2, 0.26, 3.4, TM('planks'), 1.6, 2.0, 0, g, 8); box(4.4, 0.3, 2.4, TM('planks'), 0, 3.8, 0, g);
    for (const z of [1.1, -1.1]) { box(4.4, 0.12, 0.12, INK, 0, 4.9, z, g, { edges: false }); for (let x = -2; x <= 2; x += 1) box(0.1, 1.0, 0.1, INK, x, 4.4, z, g, { edges: false }); }
    cyl(0.2, 0.2, 1.0, INK, 0, 4.4, 0.3, g, 8, { edges: false }); cyl(0.3, 0.3, 1.6, GRIS, 0, 5.0, 0.3, g, 10, { rx: Math.PI / 2 - 0.4 }); cyl(0.42, 0.3, 0.5, INK, 0, 5.4, -0.4, g, 10, { rx: Math.PI / 2 - 0.4, edges: false });
    return g; },
  castle() { const g = new THREE.Group(); disc(g);
    box(4.4, 2.6, 3.4, TM('stone'), 0, 1.6, 0, g); crenels(g, 3.15, 1.7, -1.7, 1.7); crenels(g, 3.15, -1.7, -1.7, 1.7);
    for (const [x, z] of [[-2.2, -1.7], [2.2, -1.7], [-2.2, 1.7], [2.2, 1.7]]) { cyl(0.75, 0.8, 4.4, TM('stone'), x, 2.5, z, g, 12); cone(0.95, 1.4, TM('tiles'), x, 5.4, z, g, 12, { ry: 0 }); box(0.25, 0.5, 0.12, INK, x, 3.6, z + 0.8, g, { edges: false }); }
    box(1.2, 1.8, 0.2, MADEIRA, 0, 1.2, 1.75, g); box(1.5, 2.1, 0.12, INK, 0, 1.35, 1.7, g, { edges: false }); box(0.9, 0.6, 0.1, JAUNE, 0, 2.55, 1.85, g, { edges: false });
    return g; },
  church() { const g = new THREE.Group(); disc(g);
    box(3.0, 2.6, 4.6, TM('stone'), 0, 1.6, 0.4, g); cone(2.35, 1.5, TM('tiles'), 0, 3.6, 0.4, g, 4); box(0.9, 1.6, 0.12, MADEIRA, 0, 1.1, 2.75, g); cyl(0.45, 0.45, 0.12, MADEIRA, 0, 1.9, 2.75, g, 12, { rx: Math.PI / 2, edges: false });
    cyl(1.0, 1.0, 4.8, TM('stone'), 0, 2.7, -2.3, g, 8); cone(1.2, 2.4, TM('tiles'), 0, 6.3, -2.3, g, 8, { ry: 0 }); box(0.5, 0.8, 0.12, INK, 0, 4.4, -1.3, g, { edges: false }); cyl(0.42, 0.42, 0.1, BLANC, 0, 3.4, -1.3, g, 16, { rx: Math.PI / 2, edges: false }); box(0.08, 0.3, 0.06, INK, 0, 3.5, -1.24, g, { edges: false });
    cross(INK, 0, 7.9, -2.3, g, 0.9, 0.16);
    return g; },
  picnic() { const g = new THREE.Group(); disc(g);
    box(3.2, 0.22, 1.3, TM('planks'), 0.5, 1.45, 0, g); box(3.2, 0.16, 0.5, TM('planks'), 0.5, 0.95, 1.05, g); box(3.2, 0.16, 0.5, TM('planks'), 0.5, 0.95, -1.05, g);
    for (const x of [-0.7, 1.7]) { box(0.16, 1.3, 0.16, MADEIRA, x, 0.75, 0.6, g, { rz: 0, rx: 0.5, edges: false }); box(0.16, 1.3, 0.16, MADEIRA, x, 0.75, -0.6, g, { rx: -0.5, edges: false }); }
    box(0.45, 0.3, 0.45, ROUGE, 0.1, 1.7, 0.2, g, { edges: false }); cyl(0.12, 0.12, 0.5, VERT, 1.0, 1.8, -0.2, g, 6, { edges: false });
    cyl(0.22, 0.3, 2.4, MADEIRA, -2.3, 1.5, 0, g, 8); sph(1.5, VERT, -2.3, 3.3, 0, g); sph(1.0, 0x27C25C, -1.6, 3.9, 0.4, g); sph(0.9, 0x179A45, -2.9, 3.8, -0.5, g);
    return g; },
  hotel() { const g = new THREE.Group(); disc(g);
    box(4.0, 5.2, 3.2, TM('windows'), 0, 3.0, 0, g); box(4.3, 0.45, 3.5, INK, 0, 5.8, 0, g); box(1.2, 1.6, 0.15, INK, 0, 1.2, 1.65, g); box(2.2, 0.4, 0.9, TM('awning'), 0, 2.2, 2.0, g, { rx: 0.3, edges: false });
    box(1.3, 1.3, 0.25, BLEU, 0, 6.7, 0, g); box(0.22, 0.8, 0.28, BLANC, -0.3, 6.7, 0, g, { edges: false }); box(0.22, 0.8, 0.28, BLANC, 0.3, 6.7, 0, g, { edges: false }); box(0.7, 0.2, 0.28, BLANC, 0, 6.7, 0, g, { edges: false });
    return g; },
  feed() { const g = new THREE.Group(); disc(g);
    box(3.0, 2.3, 1.5, GRIS, 0, 1.55, 0, g); box(3.1, 0.5, 1.6, INK, 0, 2.85, 0, g); torus(1.3, 0.13, INK, 0, 3.4, 0, g); box(2.0, 0.55, 0.12, JAUNE, 0, 1.4, 0.8, g);
    cyl(0.28, 0.32, 2.4, TM('bread'), 0.8, 3.0, 0, g, 8, { rz: 0.35 }); sph(0.5, ROUGE, -0.9, 3.2, 0.1, g); cyl(0.12, 0.12, 0.7, VERT, -0.9, 3.7, 0.1, g, 6, { edges: false });
    return g; },
  finish() { const g = new THREE.Group(); disc(g, 4.6);
    cyl(0.32, 0.36, 6.4, INK, -3.4, 3.5, 0, g, 8); cyl(0.32, 0.36, 6.4, INK, 3.4, 3.5, 0, g, 8); box(8.0, 1.6, 0.5, TM('checker'), 0, 7.0, 0, g); box(8.2, 0.3, 0.7, INK, 0, 7.95, 0, g); box(8.2, 0.3, 0.7, INK, 0, 6.05, 0, g);
    box(2.2, 0.7, 0.2, JAUNE, 0, 5.2, 0.4, g); box(0.5, 6.0, 0.1, BLANC, -3.4, 3.4, 0.4, g, { edges: false }); box(0.5, 6.0, 0.1, BLANC, 3.4, 3.4, 0.4, g, { edges: false });
    return g; }
};
export const KINDS = Object.keys(BUILD);
export const LABEL = { water: ['ÁGUA', '#3969B7'], toilets: ['WC', '#3969B7'], bakery: ['PADARIA', '#B8720A'], bike: ['BIKE', '#1DAE50'], pharmacy: ['FARMÁCIA', '#1DAE50'], hospital: ['HOSPITAL', '#E10D0D'], pass: ['COL', '#E10D0D'], peak: ['CUME', '#0A0A0A'], viewpoint: ['MIRANTE', '#1DAE50'], castle: ['CASTELO', '#0A0A0A'], church: ['IGREJA', '#0A0A0A'], picnic: ['PIQUENIQUE', '#1DAE50'], hotel: ['HOTEL', '#3969B7'], feed: ['MUSETTE', '#8A8F96'], finish: ['CHEGADA', '#0A0A0A'] };
const TOP = { water: 6.0, toilets: 4.3, bakery: 5.6, bike: 4.0, pharmacy: 6.5, hospital: 7.6, pass: 7.4, peak: 7.0, viewpoint: 6.0, castle: 6.3, church: 8.5, picnic: 5.0, hotel: 7.5, feed: 4.5, finish: 8.3 };
// funde as peças do protótipo por material (um draw call por material) e todos os contornos numa malha só
function compact(src) {
  src.updateMatrixWorld(true); const byMat = new Map(), edges = []; const out = new THREE.Group();
  src.traverse(o => {
    if (o.isMesh) { const g = o.geometry.clone().applyMatrix4(o.matrixWorld); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); const k = o.material.uuid; (byMat.get(k) || byMat.set(k, { m: o.material, gs: [], rs: o.receiveShadow }).get(k)).gs.push(g); }
    else if (o.isLineSegments) edges.push(o.geometry.clone().applyMatrix4(o.matrixWorld));
  });
  for (const { m, gs, rs } of byMat.values()) { const g = mergeGeometries(gs, false); if (!g) continue; const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = !!rs; out.add(mesh); }
  if (edges.length) { const g = mergeGeometries(edges, false); if (g) out.add(new THREE.LineSegments(g, lineMat)); }
  return out;
}
const protos = new Map();
// devolve um Group novo do tipo, com placa (txt: texto próprio; vazio usa o rótulo do tipo)
export function make(kind, txt, opts = {}) {
  if (!BUILD[kind]) kind = 'feed';
  let p = protos.get(kind); if (!p) { p = compact(BUILD[kind]()); protos.set(kind, p); }
  const g = p.clone();
  const [lab, col] = LABEL[kind]; const text = (txt || lab).toUpperCase();
  if (opts.plate !== false) { const s = plate(text, col); s.position.y = TOP[kind] + 0.4; g.add(s); }
  g.userData.kind = kind; return g;
}
// bandeira do Tour (sprite do desenho 2D): kind start | cat | sprint | feed | sight | flamme | finish
export function flag(kind, text, hgt = 14) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 192; const g = c.getContext('2d'); g.scale(4, 4); flagAt(g, 3, 20, 46, kind, text || '', 1);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); sp.center.set(0.09, 0.02); sp.scale.set(hgt * 128 / 192, hgt, 1); sp.renderOrder = 8; return sp;
}
