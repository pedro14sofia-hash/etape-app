// Étape Navegar · geo.js
// Geometria e projeção. Puro: sem DOM, sem estado.
const R = 6371000, D = Math.PI / 180;

export function haversine(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * D, p2 = lat2 * D, dp = p2 - p1, dl = (lon2 - lon1) * D;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// distância rápida (equiretangular) para buscas locais
export function fastDist(lat1, lon1, lat2, lon2) {
  const x = (lon2 - lon1) * D * Math.cos((lat1 + lat2) / 2 * D), y = (lat2 - lat1) * D;
  return R * Math.sqrt(x * x + y * y);
}
export function bearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin((lon2 - lon1) * D) * Math.cos(lat2 * D);
  const x = Math.cos(lat1 * D) * Math.sin(lat2 * D) - Math.sin(lat1 * D) * Math.cos(lat2 * D) * Math.cos((lon2 - lon1) * D);
  return (Math.atan2(y, x) / D + 360) % 360;
}
export function turnAngle(b1, b2) { return ((b2 - b1 + 540) % 360) - 180; }
export function mercX(lon) { return (lon + 180) / 360; }
export function mercY(lat) { const s = Math.sin(lat * D); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); }
export function metersPerPixel(lat, zoom) { return 40075016 * Math.cos(lat * D) / (256 * Math.pow(2, zoom)); }
export function bbox(pts) {
  let s = 90, w = 180, n = -90, e = -180;
  for (const p of pts) { if (p[0] < s) s = p[0]; if (p[0] > n) n = p[0]; if (p[1] < w) w = p[1]; if (p[1] > e) e = p[1]; }
  return [s, w, n, e];
}
// distância de p ao segmento a-b (em metros, plano local); devolve {d, t, q}
export function pointToSegment(p, a, b) {
  const k = Math.cos(p[0] * D);
  const ax = (a[1] - p[1]) * k, ay = a[0] - p[0], bx = (b[1] - p[1]) * k, by = b[0] - p[0];
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? -(ax * dx + ay * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx, qy = ay + t * dy;
  return { d: Math.sqrt(qx * qx + qy * qy) * R * D, t, q: [p[0] + qy, p[1] + qx / k] };
}
export function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const dseg = (p, a, b) => pointToSegment(p, a, b).d;
  let dmax = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = dseg(pts[i], pts[0], pts[pts.length - 1]); if (d > dmax) { dmax = d; idx = i; } }
  if (dmax > tol) return simplify(pts.slice(0, idx + 1), tol).slice(0, -1).concat(simplify(pts.slice(idx), tol));
  return [pts[0], pts[pts.length - 1]];
}
// nascer e pôr do sol (NOAA simplificado), devolve Date locais
export function sunTimes(date, lat, lon) {
  const rad = D, Jd = date.getTime() / 86400000 + 2440587.5;
  const n = Math.ceil(Jd - 2451545 + 0.0008), Js = n - lon / 360;
  const M = (357.5291 + 0.98560028 * Js) % 360, C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const L = (M + C + 180 + 102.9372) % 360, Jt = 2451545 + Js + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * L * rad);
  const dec = Math.asin(Math.sin(L * rad) * Math.sin(23.44 * rad));
  const cosw = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(dec)) / (Math.cos(lat * rad) * Math.cos(dec));
  if (cosw < -1 || cosw > 1) return null;
  const w = Math.acos(cosw) / rad / 360;
  const toDate = j => new Date((j - 2440587.5) * 86400000);
  return { sunrise: toDate(Jt - w), sunset: toDate(Jt + w) };
}

// Fuso da viagem: as horas do plano (8h45, "fecha às 12h30", écart, relógio) são sempre no fuso da Auvergne,
// mesmo que o aparelho continue em Brasília. A rota de teste usa America/Sao_Paulo (window.ETAPE_TZ, gerado pelo build).
export const TZ = (typeof window !== 'undefined' && window.ETAPE_TZ) || 'Europe/Paris';
const TZF = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
export function tzParts(d) { const p = {}; for (const x of TZF.formatToParts(new Date(d))) p[x.type] = x.value; return { y: +p.year, mo: +p.month, d: +p.day, h: (+p.hour) % 24, mi: +p.minute, s: +p.second }; }
export function tzHM(d) { const p = tzParts(d); return String(p.h).padStart(2, '0') + ':' + String(p.mi).padStart(2, '0'); }
export function tzMinutes(d) { const p = tzParts(d); return p.h * 60 + p.mi + p.s / 60; }
export function tzHour(d) { return tzParts(d).h; }
// instante correspondente a h:m no fuso da viagem, no mesmo dia (do fuso) que `base`
export function tzAt(base, h, m = 0) { const p = tzParts(base); const guess = Date.UTC(p.y, p.mo - 1, p.d, h, m); const q = tzParts(guess); const diff = (q.h * 60 + q.mi) - (h * 60 + m); return new Date(guess - diff * 60000); }
