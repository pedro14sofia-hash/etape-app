// Étape Navegar · icons.js
// Biblioteca de ícones isométricos "papel recortado" na paleta Étape. Cada ícone é um SVG 64×64 sobre uma base amarela;
// são rasterizados uma vez por tamanho e desenhados no Canvas com drawImage.
const INK = '#17191C', PAPER = '#F7F5EE', MID = '#D9D6CE', DEEP = '#FFD100', AUTO = '#FFE566', ROUGE = '#D71920', VERT = '#2F8F46', WATER = '#3E7FAF', BREAD = '#B8720A', DARK = '#3C4045';
const base = (fill = DEEP) => `<ellipse cx="32" cy="50" rx="24" ry="9" fill="rgba(0,0,0,.18)"/><ellipse cx="32" cy="46" rx="24" ry="9" fill="${fill}" stroke="${INK}" stroke-width="2"/>`;
const S = { 'stroke': INK, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
const g = (body) => `<g stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${body}</g>`;

export const ICONS = {
  // igreja: nave + torre + flecha
  church: base() + g(`<path d="M18 44V26l8-5 8 5v18z" fill="${PAPER}"/><path d="M34 44V26l-8-5v23z" fill="${MID}"/><path d="M34 44V30l10-4v18z" fill="${PAPER}"/><path d="M38 20l6 6-10 4-8-5z" fill="${MID}"/><path d="M40 12l-6 8h12z" fill="${INK}"/><path d="M40 4v8M37 8h6" stroke="${INK}"/><rect x="21" y="34" width="4" height="6" fill="${INK}"/>`),
  // castelo: torre de menagem com ameias
  castle: base() + g(`<path d="M16 44V24h32v20z" fill="${PAPER}"/><path d="M32 44V24h16v20z" fill="${MID}"/><path d="M16 24l4-4h24l4 4z" fill="${MID}"/><path d="M16 24v-8h5v4h5v-4h5v4h5v-4h5v4h5v-4h4v8" fill="${PAPER}"/><rect x="21" y="30" width="4" height="6" fill="${INK}"/><rect x="38" y="30" width="4" height="6" fill="${INK}"/><path d="M26 44v-8h12v8" fill="${INK}"/><path d="M44 16l8-5v9" fill="${ROUGE}"/>`),
  // mirante: mesa de orientação com luneta
  viewpoint: base() + g(`<path d="M22 46V34h20v12z" fill="${MID}"/><ellipse cx="32" cy="34" rx="10" ry="4" fill="${PAPER}"/><path d="M26 30l16-12" stroke-width="5"/><path d="M26 30l16-12" stroke="${DEEP}" stroke-width="2"/><circle cx="43" cy="17" r="4" fill="${PAPER}"/><circle cx="43" cy="17" r="1.5" fill="${INK}"/><path d="M14 20c4-6 10-6 14 0M36 12c3-4 8-4 11 0" fill="none" stroke="${DARK}"/>`),
  // padaria: baguetes
  bakery: base() + g(`<path d="M14 38c6-12 22-22 34-18-8 4-18 12-24 24z" fill="${BREAD}"/><path d="M22 36l4-6M28 30l4-6M34 25l4-5" stroke="${PAPER}" stroke-width="1.6"/><path d="M20 44c4-10 18-18 30-16-6 3-14 10-20 20z" fill="#D9A066"/><path d="M28 40l4-5M34 34l4-5M40 30l3-4" stroke="${PAPER}" stroke-width="1.6"/>`),
  // café: xícara
  cafe: base() + g(`<path d="M20 26h22v10a11 11 0 0 1-22 0z" fill="${PAPER}"/><path d="M42 29h4a4 4 0 0 1 0 8h-4" fill="${PAPER}"/><ellipse cx="31" cy="26" rx="11" ry="3.5" fill="${BREAD}"/><path d="M26 18c0-3 3-3 3-6M32 18c0-3 3-3 3-6" stroke="${DARK}" fill="none"/><ellipse cx="31" cy="46" rx="16" ry="4" fill="${MID}"/>`),
  // fonte: tanque com jato
  water: base() + g(`<ellipse cx="32" cy="40" rx="18" ry="6" fill="${WATER}"/><path d="M14 40v4a18 6 0 0 0 36 0v-4" fill="${MID}"/><rect x="29" y="18" width="6" height="22" fill="${PAPER}"/><path d="M32 10c-6 6-6 12 0 12s6-6 0-12z" fill="${WATER}"/><path d="M24 34c2-3 4-3 5 0M35 35c2-3 4-3 5 0" fill="none" stroke="${PAPER}" stroke-width="1.6"/>`),
  // banheiro: porta com placa WC
  toilets: base() + g(`<path d="M20 46V16h20v30z" fill="${PAPER}"/><path d="M40 46V16l6-4v30z" fill="${MID}"/><rect x="24" y="22" width="12" height="9" rx="1" fill="${WATER}"/><text x="30" y="29" font-family="Archivo,Arial,sans-serif" font-weight="800" font-size="6.5" fill="${PAPER}" text-anchor="middle" stroke="none">WC</text><circle cx="35" cy="36" r="1.5" fill="${INK}"/>`),
  // bicicletaria: roda com chave inglesa
  bike: base() + g(`<circle cx="32" cy="32" r="14" fill="${PAPER}"/><circle cx="32" cy="32" r="9" fill="none" stroke="${MID}" stroke-width="3"/><circle cx="32" cy="32" r="3" fill="${INK}"/><path d="M32 18v28M18 32h28M22 22l20 20M42 22L22 42" stroke-width="1.4"/><path d="M40 10l6 6-3 3 8 8-4 4-8-8-3 3-6-6a5 5 0 0 1 7-7z" fill="${VERT}"/>`),
  // hotel: cama
  hotel: base() + g(`<path d="M14 42V26h36v16z" fill="${PAPER}"/><path d="M14 30h36v6H14z" fill="${ROUGE}"/><path d="M16 26v-8h8v8" fill="${MID}"/><path d="M18 42v4M46 42v4"/><rect x="26" y="20" width="22" height="6" rx="3" fill="${MID}"/>`),
  // farmácia: cruz verde
  pharmacy: base() + g(`<path d="M22 44V20h20v24z" fill="${PAPER}"/><path d="M42 44V20l6-3v24z" fill="${MID}"/><path d="M29 24h6v5h5v6h-5v5h-6v-5h-5v-6h5z" fill="${VERT}"/>`),
  // supermercado: cesta
  shop: base() + g(`<path d="M16 28h32l-4 16H20z" fill="${PAPER}"/><path d="M16 28h32v4H16z" fill="${ROUGE}"/><path d="M24 28l6-10M40 28l-6-10"/><path d="M26 34v6M32 34v6M38 34v6" stroke="${MID}"/>`),
  // hospital: bloco com H
  hospital: base() + g(`<path d="M18 44V16h28v28z" fill="${PAPER}"/><path d="M46 44V16l4-2v28z" fill="${MID}"/><path d="M26 22v14M38 22v14M26 29h12" stroke="${ROUGE}" stroke-width="4"/>`),
  // piquenique: mesa
  picnic: base() + g(`<path d="M14 26h36v5H14z" fill="${BREAD}"/><path d="M22 31l-6 14M42 31l6 14M18 39h28" fill="none"/><path d="M12 34h40v4H12z" fill="${BREAD}"/>`),
  // foto: câmera
  camera: base() + g(`<path d="M16 40V24h9l3-5h8l3 5h9v16z" fill="${INK}"/><path d="M16 40V24h9l3-5h8l3 5h9" fill="${DARK}"/><circle cx="32" cy="32" r="6" fill="${PAPER}"/><circle cx="32" cy="32" r="3" fill="${WATER}"/><rect x="40" y="26" width="4" height="3" fill="${DEEP}"/>`),
  // visita: porta aberta
  visit: base() + g(`<path d="M18 46V14h22v32z" fill="${PAPER}"/><path d="M40 46V14l8 4v28z" fill="${MID}"/><path d="M24 46V22h10v24z" fill="${ROUGE}"/><circle cx="32" cy="35" r="1.5" fill="${DEEP}"/>`),
  // pico
  peak: base() + g(`<path d="M12 44l14-24 6 8 6-12 14 28z" fill="${MID}"/><path d="M26 20l6 8 6-12" fill="none"/><path d="M32 16l4 8-2 2-3-4-3 5-2-2z" fill="${PAPER}"/>`),
  // col: borne
  pass: base() + g(`<path d="M22 44V22a10 10 0 0 1 20 0v22z" fill="${PAPER}"/><path d="M22 28a10 10 0 0 1 20 0v3H22z" fill="${ROUGE}"/><path d="M27 36h10M27 40h10" stroke="${DARK}" stroke-width="1.6"/>`),
  // compras: sacola
  shopping: base() + g(`<path d="M18 26h28l-3 20H21z" fill="${DEEP}"/><path d="M24 26v-4a8 8 0 0 1 16 0v4" fill="none"/><path d="M18 26h28l-1 5H19z" fill="${INK}"/>`),
  // sos
  sos: base(ROUGE) + g(`<circle cx="32" cy="30" r="14" fill="${PAPER}"/><path d="M32 22v10l6 4" fill="none" stroke-width="3"/>`),
};

const cache = new Map(); let onLoad = null;
export function setOnLoad(cb) { onLoad = cb; }
// devolve um HTMLImageElement rasterizado (pronto ou não; ver .complete && .naturalWidth); size em px CSS
export function icon(name, size = 32) {
  const key = name + '@' + size; if (cache.has(key)) return cache.get(key);
  const svg = ICONS[name]; if (!svg) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 3), px = Math.round(size * dpr);
  const img = new Image(px, px);
  img.onload = () => { if (onLoad) onLoad(); try { document.dispatchEvent(new Event('etape:icons')); } catch (e) { } };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${px}" height="${px}">${svg}</svg>`);
  cache.set(key, img); return img;
}
export function ready(img) { return img && img.complete && img.naturalWidth > 0; }
export function svgOf(name, size = 32) { const s = ICONS[name]; return s ? `<svg viewBox="0 0 64 64" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${s}</svg>` : ''; }
export const KIND_ICON = { water: 'water', bakery: 'bakery', shop: 'shop', bike: 'bike', pharmacy: 'pharmacy', hospital: 'hospital', pass: 'pass', peak: 'peak', toilets: 'toilets', cafe: 'cafe', church: 'church', castle: 'castle', viewpoint: 'viewpoint', picnic: 'picnic', hotel: 'hotel' };
export const SIGHT_ICON = { foto: 'camera', visita: 'visit', opcional: 'viewpoint', compras: 'shopping' };
