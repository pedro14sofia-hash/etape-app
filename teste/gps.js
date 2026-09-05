// Étape Navegar · gps.js
// Posição, rumo, velocidade, qualidade do sinal, simulação, tela acesa.
import { haversine, bearing } from './geo.js';

let watchId = null, wake = null, simTimer = null;

export function start(onFix, onError) {
  if (watchId != null) return true;
  if (!navigator.geolocation) { onError && onError({ message: 'sem GPS neste navegador' }); return false; }
  watchId = navigator.geolocation.watchPosition(
    p => onFix({ t: p.timestamp || Date.now(), lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy || 0, ele: p.coords.altitude, speed: p.coords.speed, head: p.coords.heading, src: 'gps' }),
    e => onError && onError(e), { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  return true;
}
export function stop() {
  if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  stopSim();
}
export function running() { return watchId != null || simTimer != null; }

// filtra saltos e suaviza rumo; prev = fix anterior aceito
export function smooth(fix, prev) {
  if (fix.acc > 80 && fix.src === 'gps') return null;   // sem qualidade: descarta (gargantas podem chegar a 30 m)
  const f = { ...fix };
  if (prev) {
    const d = haversine(prev.lat, prev.lon, fix.lat, fix.lon), dt = Math.max(0.5, (fix.t - prev.t) / 1000);
    if (d / dt > 40) return null;                 // > 144 km/h: salto
    f.v = fix.speed != null && !isNaN(fix.speed) && fix.speed >= 0 ? fix.speed : d / dt;
    // rumo só em movimento (> 1 m/s): parado o GPS gira à toa
    if (f.v > 1 && d > 3) {
      let h = bearing(prev.lat, prev.lon, fix.lat, fix.lon);
      if (fix.head != null && !isNaN(fix.head) && f.v > 1.5) h = fix.head;
      if (prev.head != null) { const dh = ((h - prev.head + 540) % 360) - 180; h = (prev.head + dh * 0.6 + 360) % 360; }
      f.head = h;
    } else f.head = prev.head;
  } else { f.head = fix.head != null && !isNaN(fix.head) ? fix.head : 0; f.v = fix.speed > 0 ? fix.speed : 0; }
  return f;
}
// velocidade média numa janela (s), só com movimento; history = [{t,lat,lon}]
export function speedWindow(history, seconds) {
  const now = history[history.length - 1].t, from = now - seconds * 1000;
  let d = 0, t0 = null, tMove = 0;
  for (let i = 1; i < history.length; i++) {
    if (history[i].t < from) continue;
    if (t0 === null) t0 = history[i - 1].t;
    const dd = haversine(history[i - 1].lat, history[i - 1].lon, history[i].lat, history[i].lon), dt = (history[i].t - history[i - 1].t) / 1000;
    if (dt > 0 && dd / dt > 0.7) { d += dd; tMove += dt; }
  }
  return tMove > 20 ? d / tMove : 0;
}
// simulação: percorre o traçado; a velocidade segue a rampa do perfil (sobe devagar, desce rápido), com variação natural
export function simulate(stage, speedKmh, onFix, fromDist = 0, gradeAt = null) {
  stopSim(); let dist = fromDist, t = Date.now(), v = speedKmh / 3.6; const step = 700;
  const tick = () => {
    const g = gradeAt ? gradeAt(dist) : 0;
    const base = speedKmh / 3.6;
    let target = g > 0 ? base * Math.max(0.28, 1 - g * 0.085) : Math.min(58 / 3.6, base * (1 + Math.abs(g) * 0.07));
    target *= 1 + (Math.random() - 0.5) * 0.12;                 // cadência irregular
    v += (target - v) * 0.25;                                   // inércia
    dist += v * step / 1000; t += step;
    if (dist > stage.total + 30) { stopSim(); return; }
    // interpola dentro do segmento para a simulação andar liso, como o GPS real
    const i = Math.max(1, idxAt(stage, dist)), a = stage.pts[i - 1], b = stage.pts[Math.min(i, stage.pts.length - 1)];
    const f = Math.min(1, Math.max(0, (dist - stage.cum[i - 1]) / Math.max(1, stage.cum[i] - stage.cum[i - 1])));
    const lat = a[0] + (b[0] - a[0]) * f, lon = a[1] + (b[1] - a[1]) * f;
    onFix({ t, lat: lat + (Math.random() - 0.5) * 0.00004, lon: lon + (Math.random() - 0.5) * 0.00004, acc: 8, ele: null, speed: v, head: bearing(a[0], a[1], b[0], b[1]), src: 'sim' });
  };
  simTimer = setInterval(tick, step); tick();
  return stopSim;
}
export function simulating() { return simTimer != null; }
function stopSim() { if (simTimer) { clearInterval(simTimer); simTimer = null; } }
function idxAt(stage, dist) { const c = stage.cum; let lo = 0, hi = c.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (c[m] < dist) lo = m + 1; else hi = m; } return lo; }

export async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
    else if (!on && wake) { await wake.release(); wake = null; }
  } catch (e) { /* sem wake lock: segue */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && running() && !wake) keepAwake(true); });
