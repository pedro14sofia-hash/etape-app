// Étape Navegar · session.js
// Estado da etapa: idle → running ⇄ paused → finished. Tempo em movimento, paradas, passagens.
import * as store from './store.js';

export function create(stageKey) {
  return { stageKey, state: 'idle', startedAt: null, finishedAt: null, pauses: [], stops: [], marks: [], stoppedAuto: 0, _stillSince: null, _stillCounted: 0 };
}
export function start(s, now) { if (s.state === 'idle') { s.startedAt = now; } s.state = 'running'; save(s); }
export function pause(s, now, where) {
  if (s.state !== 'running') return;
  s.state = 'paused'; s.pauses.push({ at: now, until: null, dist: where ? where.dist : null, lat: where ? where.lat : null, lon: where ? where.lon : null, place: where ? where.place : '' }); save(s);
}
export function resume(s, now) {
  if (s.state !== 'paused') return;
  const p = s.pauses[s.pauses.length - 1]; if (p && !p.until) { p.until = now; p.seconds = Math.round((now - p.at) / 1000); s.stops.push({ ...p, kind: 'pausa' }); }
  s.state = 'running'; s._stillSince = null; save(s);
}
export function finish(s, now) { if (s.state === 'paused') resume(s, now); s.state = 'finished'; s.finishedAt = now; save(s); }
export function elapsed(s, now) { return s.startedAt ? Math.round(((s.state === 'finished' ? s.finishedAt : now) - s.startedAt) / 1000) : 0; }
export function pausedTime(s, now) {
  let t = 0; for (const p of s.pauses) t += ((p.until || now) - p.at) / 1000; return Math.round(t);
}
export function movingTime(s, now) { return Math.max(0, elapsed(s, now) - pausedTime(s, now) - s.stoppedAuto); }
// detecta parado sem pausa (v < 2 km/h por mais de 30 s): desconta do tempo em movimento e registra parada
export function trackStill(s, fix, now, place) {
  if (s.state !== 'running') return false;
  const still = (fix.v || 0) < 0.55;
  if (still) {
    if (!s._stillSince) { s._stillSince = now; s._stillCounted = 0; s._stillWhere = { dist: fix.dist, lat: fix.lat, lon: fix.lon, place: place || '' }; }
    const dur = (now - s._stillSince) / 1000;
    if (dur > 30) { const add = dur - s._stillCounted; s.stoppedAuto += add; s._stillCounted = dur; return true; }
  } else if (s._stillSince) {
    const dur = (now - s._stillSince) / 1000;
    if (dur > 60) s.stops.push({ at: s._stillSince, until: now, seconds: Math.round(dur), ...s._stillWhere, kind: 'parada' });
    s._stillSince = null; save(s);
  }
  return false;
}
export function mark(s, kind, payload) { s.marks.push({ kind, at: Date.now(), ...payload }); save(s); }
export function restore(stageKey) { const s = store.session(stageKey); return s && s.state !== 'finished' ? s : null; }
export function save(s) { store.setSession(s.stageKey, s); }
export function label(state) { return { idle: 'Iniciar', running: 'Pausar', paused: 'Retomar', finished: 'Encerrada' }[state]; }
