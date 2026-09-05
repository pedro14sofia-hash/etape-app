// Étape Navegar · report.js
// Relatório do dia: números, subidas, paradas, ingestão vs plano, exportação.
import { elevationAt } from './track.js';
import { toGpx } from './telemetry.js';
import * as session from './session.js';
import * as store from './store.js';

const fmtT = s => { if (!isFinite(s) || s < 0) return '–'; const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h + ':' + String(m).padStart(2, '0'); };
const fmtH = d => d ? new Date(d).getHours() + ':' + String(new Date(d).getMinutes()).padStart(2, '0') : '–';
const n1 = x => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');

export function build(stage, sess, log, fuelState, fuelPlan, paradas, planArrival) {
  const now = sess.finishedAt || Date.now();
  const last = log[log.length - 1] || { dist: 0 };
  let vmax = 0, maxEle = 0, up = 0, down = 0;
  for (let i = 0; i < log.length; i++) { if (log[i].v > vmax) vmax = log[i].v; if (log[i].ele > maxEle) maxEle = log[i].ele; if (i) { const d = log[i].ele - log[i - 1].ele; if (d > 0) up += d; else down -= d; } }
  const moving = session.movingTime(sess, now), elapsed = session.elapsed(sess, now);
  const climbs = stage.climbs.map(c => {
    const a = log.find(s => s.dist >= c.from), b = log.find(s => s.dist >= c.to);
    const t = a && b && b.t - a.t > 30000 ? (b.t - a.t) / 1000 : NaN;
    return { name: c.name, cat: c.cat, len: c.len, pct: c.pct, gain: c.gain, time: t, vam: t > 0 ? Math.round(c.gain / t * 3600) : null };
  });
  const stops = sess.stops.map(s => ({ km: s.dist != null ? s.dist / 1000 : null, place: s.place || '', seconds: s.seconds, kind: s.kind }));
  const cps = stage.cps.filter(c => c.done && c.at).map(c => ({ name: c.name, km: c.dist / 1000, at: c.at }));
  const sights = paradas.filter(p => p.kind !== 'compras').map(p => ({ nome: p.nome, km: p.km, done: !!p.done, skipped: !!p.skipped }));
  const hours = moving / 3600;
  const fuel = fuelState && fuelPlan ? { water: fuelState.water, waterPlan: fuelPlan.waterPerHour * hours, carbs: fuelState.carbs, carbsPlan: fuelPlan.carbsPerHour * hours, sodium: fuelState.sodium, sodiumPlan: fuelPlan.sodiumPerHour * hours } : null;
  let vsPlan = null;
  if (planArrival && sess.finishedAt) { const [h, m] = planArrival.split(/[h:]/).map(Number); const p = new Date(sess.finishedAt); p.setHours(h, m || 0, 0, 0); vsPlan = Math.round((sess.finishedAt - p) / 60000); }
  const first = log[0] || { dist: 0 }, ridden = Math.max(0, last.dist - first.dist);
  return { stageKey: stage.key, name: stage.name, type: stage.type, date: sess.startedAt, startedAt: sess.startedAt, finishedAt: sess.finishedAt, km: last.dist / 1000, ridden: ridden / 1000, planKm: stage.km, moving, elapsed, stopped: elapsed - moving, avg: moving > 60 ? ridden / moving * 3.6 : 0, vmax: vmax * 3.6, up, down, planUp: stage.up, maxEle, climbs, stops, cps, sights, fuel, vsPlan, samples: log.length };
}

export function render(r) {
  const cat = c => `<span class="cat${c === 'HC' ? ' hc' : ''}">${c}</span>`;
  const vamAvg = r.climbs.filter(c => c.vam).map(c => c.vam); const vam = vamAvg.length ? Math.round(vamAvg.reduce((a, b) => a + b, 0) / vamAvg.length) : '–';
  const d = r.date ? new Date(r.date) : new Date();
  const dia = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  const bar = (lab, v, p, unit, f) => `<div class="fb"><div class="lab">${lab}</div><div class="bar"><i style="width:${Math.min(100, p ? v / p * 100 : 0)}%"></i><em style="left:90%"></em></div><b>${f(v)} / ${f(p)}${unit}</b></div>`;
  return `<div class="rep m-${r.type}">
  <div class="hd"><div class="eyebrow">Relatório do dia · ${dia}</div><h3>${esc(r.name)}</h3>${r.type === 'pois' ? '<div class="pois-line"></div>' : ''}</div>
  <div class="big"><div><b>${n1(r.km)}</b><span>km</span></div><div><b>${fmtT(r.moving)}</b><span>em movimento</span></div><div><b>${Math.round(r.up)}</b><span>m subida</span></div></div>
  <div class="grid"><div><b>${fmtT(r.elapsed)}</b><span>total</span></div><div><b>${fmtT(r.stopped)}</b><span>parado</span></div><div><b>${n1(r.avg)}</b><span>média km/h</span></div><div><b>${n1(r.vmax)}</b><span>máx km/h</span></div></div>
  <div class="grid"><div><b>${Math.round(r.maxEle)}</b><span>alt. máx</span></div><div><b>${vam}</b><span>VAM subidas</span></div><div class="hi"><b>${fmtH(r.finishedAt)}</b><span>chegada</span></div><div class="hi"><b>${r.vsPlan == null ? '–' : (r.vsPlan > 0 ? '+' : '') + r.vsPlan + ' min'}</b><span>vs plano</span></div></div>
  ${r.climbs.length ? `<h4>Subidas</h4><table>${r.climbs.map(c => `<tr><td>${cat(c.cat)}${esc(c.name)}</td><td class="r">${n1(c.len / 1000)} km · ${n1(c.pct)} %</td><td class="r">${isFinite(c.time) ? fmtT(c.time) + ' · ' + c.vam + ' m/h' : '–'}</td></tr>`).join('')}</table>` : ''}
  ${r.stops.length ? `<h4>Paradas</h4><table>${r.stops.map(s => `<tr><td class="k">${s.km != null ? 'km ' + Math.round(s.km) : '–'}</td><td>${esc(s.place || s.kind)}</td><td class="r">${Math.round(s.seconds / 60)} min</td></tr>`).join('')}</table>` : ''}
  ${r.fuel ? `<h4>Abastecimento</h4>${bar('Água', r.fuel.water / 1000, r.fuel.waterPlan / 1000, ' L', n1)}${bar('Carbo', r.fuel.carbs, r.fuel.carbsPlan, ' g', Math.round)}${bar('Sódio', r.fuel.sodium / 1000, r.fuel.sodiumPlan / 1000, ' g', n1)}` : ''}
  <h4>Plano</h4><table><tr><td>Distância</td><td class="r">${n1(r.km)} de ${n1(r.planKm)} km</td></tr><tr><td>Subida</td><td class="r">${Math.round(r.up)} de ${r.planUp} m</td></tr><tr><td>Bornes</td><td class="r">${r.cps.length}</td></tr><tr><td>Paradas de foto feitas</td><td class="r">${r.sights.filter(s => s.done).length} de ${r.sights.length}</td></tr></table>
  </div>`;
}
export function share(r, log) {
  const text = `Étape ${r.name}\n${n1(r.km)} km · ${fmtT(r.moving)} em movimento · ${Math.round(r.up)} m de subida\nmédia ${n1(r.avg)} km/h · máx ${n1(r.vmax)} · alt. máx ${Math.round(r.maxEle)} m\nchegada ${fmtH(r.finishedAt)}${r.vsPlan != null ? ' (' + (r.vsPlan > 0 ? '+' : '') + r.vsPlan + ' min vs plano)' : ''}`;
  return { text, gpx: toGpx(log, { name: r.name }), json: JSON.stringify(r) };
}
export function list() { return store.reports(); }
export function save(r) { store.setReport(r.stageKey, r); }
function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
