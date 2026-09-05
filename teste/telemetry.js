// Étape Navegar · telemetry.js
// Telemetria: amostras a 5 s, números da tela, VAM, gradiente, registro do dia, GPX.
import { elevationAt, climbRemaining, gradeAt, climbAt } from './track.js';
import * as store from './store.js';

export function sample(fix, stage, proj, prev) {
  const ele = Math.round(elevationAt(stage, proj.dist));
  const s = { t: fix.t, lat: +fix.lat.toFixed(5), lon: +fix.lon.toFixed(5), ele, dist: Math.round(proj.dist), v: +(fix.v || 0).toFixed(2), off: Math.round(proj.off) };
  s.grade = +gradeAt(stage, proj.dist, 100).toFixed(1);
  return s;
}
// registro: guarda uma amostra a cada 5 s; escreve no store a cada 30 s
export function record(log, s, stageKey, force) {
  const last = log[log.length - 1];
  if (!last || s.t - last.t >= 5000 || force) {
    log.push(s);
    if (force || !record._w || s.t - record._w > 30000) { store.setLog(stageKey, log); record._w = s.t; }
    return true;
  }
  return false;
}
export function vam(log, seconds) {
  if (log.length < 2) return 0;
  const now = log[log.length - 1].t; let i = log.length - 1;
  while (i > 0 && now - log[i].t < seconds * 1000) i--;
  const dt = (now - log[i].t) / 1000; if (dt < 60) return 0;
  let up = 0; for (let j = i + 1; j < log.length; j++) { const d = log[j].ele - log[j - 1].ele; if (d > 0) up += d; }
  return Math.round(up / dt * 3600);
}
export function live(log, stage, session, now, movingSec) {
  const s = log[log.length - 1] || { dist: 0, v: 0, ele: elevationAt(stage, 0), grade: 0 };
  let vmax = 0, maxEle = 0, up = 0;
  for (let i = 0; i < log.length; i++) { if (log[i].v > vmax) vmax = log[i].v; if (log[i].ele > maxEle) maxEle = log[i].ele; if (i && log[i].ele > log[i - 1].ele) up += log[i].ele - log[i - 1].ele; }
  const avg = movingSec > 60 ? s.dist / movingSec : 0;
  const cl = climbAt(stage, s.dist);
  return { v: s.v * 3.6, avg: avg * 3.6, vmax: vmax * 3.6, grade: s.grade, gradeAhead: gradeAt(stage, s.dist, 500), vam: vam(log, 300), ele: s.ele, maxEle, up, upRem: climbRemaining(stage, s.dist), climb: cl, climbPct: cl ? Math.min(1, Math.max(0, (s.dist - cl.from) / (cl.to - cl.from))) : 0, climbLeft: cl ? Math.max(0, cl.to - s.dist) : 0 };
}
export function toGpx(samples, meta) {
  const pts = samples.map(s => `<trkpt lat="${s.lat}" lon="${s.lon}"><ele>${s.ele}</ele><time>${new Date(s.t).toISOString()}</time></trkpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Étape Navegar" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>${esc(meta.name || 'Étape')}</name><trkseg>\n${pts}\n</trkseg></trk>\n</gpx>`;
}
function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
