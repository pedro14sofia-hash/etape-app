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
  if (fix.acc > 50 && fix.src === 'gps') return null;
  const f = { ...fix };
  if (prev) {
    const d = haversine(prev.lat, prev.lon, fix.lat, fix.lon), dt = Math.max(0.5, (fix.t - prev.t) / 1000);
    if (d / dt > 40) return null;                 // > 144 km/h: salto
    if (d > 3) f.head = bearing(prev.lat, prev.lon, fix.lat, fix.lon);
    else f.head = prev.head;
    if (fix.head != null && !isNaN(fix.head) && fix.speed > 1.5) f.head = fix.head;
    if (f.head != null && prev.head != null) { let dh = ((f.head - prev.head + 540) % 360) - 180; f.head = (prev.head + dh * 0.6 + 360) % 360; }
    f.v = fix.speed != null && !isNaN(fix.speed) ? fix.speed : d / dt;
  } else { f.head = fix.head || 0; f.v = fix.speed || 0; }
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
// simulação: percorre o traçado a speedKmh a partir de fromDist
export function simulate(stage, speedKmh, onFix, fromDist = 0) {
  stopSim(); let dist = fromDist, t = Date.now(); const step = 700, v = speedKmh / 3.6;
  const tick = () => {
    dist += v * step / 1000; t += step;
    if (dist > stage.total + 30) { stopSim(); return; }
    const i = idxAt(stage, dist), p = stage.pts[Math.min(i, stage.pts.length - 1)], q = stage.pts[Math.max(0, i - 2)];
    onFix({ t, lat: p[0] + (Math.random() - 0.5) * 0.00004, lon: p[1] + (Math.random() - 0.5) * 0.00004, acc: 8, ele: null, speed: v, head: bearing(q[0], q[1], p[0], p[1]), src: 'sim' });
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
