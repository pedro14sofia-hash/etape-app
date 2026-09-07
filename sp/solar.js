// Étape Navegar · solar.js (Cinema pacote 4 · bússola de luz)
// Posição do sol (azimute e elevação) por posição e hora, algoritmo NOAA simplificado (erro < 0,5°). Sem fuso: tudo em UTC.
// light(lat, lon, t, heading) diz se o sol está nas costas, de lado ou de frente do ciclista, e quanto falta para a luz baixa.
const R = Math.PI / 180;
export function sun(lat, lon, t = Date.now()) {
  const d = t / 86400000 - 10957.5;                       // dias desde J2000 (2000-01-01 12:00 UTC)
  const g = (357.529 + 0.98560028 * d) % 360, q = (280.459 + 0.98564736 * d) % 360;
  const L = (q + 1.915 * Math.sin(g * R) + 0.020 * Math.sin(2 * g * R)) % 360;   // longitude eclíptica
  const e = 23.439 - 0.00000036 * d;
  const ra = Math.atan2(Math.cos(e * R) * Math.sin(L * R), Math.cos(L * R)) / R, dec = Math.asin(Math.sin(e * R) * Math.sin(L * R));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const ha = ((gmst * 15 + lon - ra) % 360 + 540) % 360 - 180;   // ângulo horário −180..180
  const la = lat * R, h = ha * R;
  const el = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(h));
  let az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(la) - Math.tan(dec) * Math.cos(la)) / R + 180;   // 0 = norte, horário
  az = (az + 360) % 360;
  return { az, el: el / R };
}
// heading em graus (0 = norte). Devolve { az, el, rel, where: 'costas'|'lado'|'frente'|'noite', golden: bool }
export function light(lat, lon, t, heading) {
  const s = sun(lat, lon, t);
  if (s.el < -1) return { ...s, rel: null, where: 'noite', golden: false };
  const rel = heading == null ? null : ((s.az - heading) % 360 + 540) % 360 - 180;   // −180..180: 0 = sol à frente
  const a = rel == null ? null : Math.abs(rel);
  const where = a == null ? '' : a > 120 ? 'costas' : a < 60 ? 'frente' : 'lado';
  return { ...s, rel, where, golden: s.el < 10 };
}
// minutos até a elevação do sol cair abaixo de `deg` (hora dourada/baixa) ou até o pôr; null se já passou ou de manhã ainda sobe
export function minutesUntil(lat, lon, t, deg = 10) {
  const now = sun(lat, lon, t); if (sun(lat, lon, t + 300000).el > now.el) return null;   // ainda subindo (manhã)
  if (now.el <= deg) return 0;
  for (let m = 5; m <= 600; m += 5) { if (sun(lat, lon, t + m * 60000).el <= deg) return m; }
  return null;
}
