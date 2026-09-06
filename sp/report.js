import { tzHM, tzAt } from './geo.js';
// Étape Navegar · report.js
// Relatório do dia: números, subidas, paradas, ingestão vs plano, exportação.
import { elevationAt } from './track.js';
import { toGpx } from './telemetry.js';
import * as session from './session.js';
import * as store from './store.js';

const fmtT = s => { if (!isFinite(s) || s < 0) return '–'; const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h + ':' + String(m).padStart(2, '0'); };
const fmtH = d => d ? tzHM(d) : '–';
const fmtMin = m => { m = Math.round(Math.abs(m)); if (m < 60) return m + ' min'; const h = Math.floor(m / 60), r = m % 60; return r ? h + 'h' + String(r).padStart(2, '0') : h + ' h'; };
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
  if (planArrival && sess.finishedAt) { const [h, m] = planArrival.split(/[h:]/).map(Number); const p = tzAt(sess.finishedAt, h, m || 0); vsPlan = Math.round((sess.finishedAt - p) / 60000); }
  const first = log[0] || { dist: 0 }, ridden = Math.max(0, last.dist - first.dist);
  const marks = (sess.marks || []).filter(m => m.kind === 'lugar').map(m => ({ lat: m.lat, lon: m.lon, km: m.dist != null ? m.dist / 1000 : null, at: m.at, note: m.note || '' }));
  return { marks, stageKey: stage.key, name: stage.name, type: stage.type, date: sess.startedAt, startedAt: sess.startedAt, finishedAt: sess.finishedAt, km: last.dist / 1000, ridden: ridden / 1000, planKm: stage.km, moving, elapsed, stopped: elapsed - moving, avg: moving > 60 ? ridden / moving * 3.6 : 0, vmax: vmax * 3.6, up, down, planUp: stage.up, maxEle, climbs, stops, cps, sights, fuel, vsPlan, samples: log.length };
}

// maillots por tipo de etapa (mesmo desenho do guia)
const MAILLOT = { pois: ['#FFFFFF', 'url(#pd)'], jaune: ['#FFFF00', '#FFFF00'], vert: ['#1DAE50', '#1DAE50'], blanc: ['#FFFFFF', '#FFFFFF'] };
export function maillotSvg(kind, size = 40) {
  const body = kind === 'pois' ? 'url(#pdots)' : (MAILLOT[kind] || MAILLOT.blanc)[0];
  return `<svg viewBox="0 0 40 32" width="${size}" height="${size * .8}"><defs><pattern id="pdots" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#fff"/><circle cx="3" cy="3" r="1.6" fill="#E10D0D"/></pattern></defs><path d="M8 3 L14 1 L20 3 L26 1 L32 3 L37 9 L31 13 L30 30 L10 30 L9 13 L3 9 Z" fill="${body}" stroke="#000000" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 1 Q20 7 26 1" fill="none" stroke="#000000" stroke-width="1.6"/></svg>`;
}
// classificações da viagem a partir de todos os relatórios salvos: geral (tempo), montanha (subida), pontos (média), jovem (etapas feitas)
export function standings(all) {
  const rs = Object.values(all).filter(x => x && x.finishedAt).sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
  if (!rs.length) return null;
  const sum = f => rs.reduce((a, r) => a + (f(r) || 0), 0);
  const best = f => rs.reduce((a, r) => (f(r) > f(a) ? r : a), rs[0]);
  return { n: rs.length, km: sum(r => r.km), moving: sum(r => r.moving), up: sum(r => r.up), avg: sum(r => r.moving) ? sum(r => r.km) / (sum(r => r.moving) / 3600) : 0,
    pois: best(r => r.up), vert: best(r => r.avg), vmax: best(r => r.vmax), longest: best(r => r.km) };
}
export function render(r, all) {
  const cat = c => `<span class="cat${c === 'HC' ? ' hc' : ''} cat-${String(c).toLowerCase()}">${c}</span>`;
  const vamAvg = r.climbs.filter(c => c.vam).map(c => c.vam); const vam = vamAvg.length ? Math.round(vamAvg.reduce((a, b) => a + b, 0) / vamAvg.length) : '–';
  const d = r.date ? new Date(r.date) : new Date();
  const dia = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  const bar = (lab, v, p, unit, f) => `<div class="fb"><div class="lab">${lab}</div><div class="bar"><i style="width:${Math.min(100, p ? v / p * 100 : 0)}%"></i><em style="left:90%"></em></div><b>${f(v)} / ${f(p)}${unit}</b></div>`;
  const st = all ? standings(all) : null;
  const podium = `<div class="podium"><div class="step s2">${maillotSvg('vert', 34)}<b>${n1(r.avg)}</b><span>média km/h</span></div><div class="step s1">${maillotSvg(r.type, 46)}<b>${fmtT(r.moving)}</b><span>tempo da etapa</span></div><div class="step s3">${maillotSvg('pois', 34)}<b>${Math.round(r.up)}</b><span>m de subida</span></div></div>`;
  const geral = st ? `<h4>Classificação geral · ${st.n} etapa${st.n > 1 ? 's' : ''}</h4><table class="cls">
   <tr><td>${maillotSvg('jaune', 26)}</td><td><b>Maillot jaune</b><small>tempo total em movimento</small></td><td class="r"><b>${fmtT(st.moving)}</b><small>${n1(st.km)} km</small></td></tr>
   <tr><td>${maillotSvg('pois', 26)}</td><td><b>Rei da montanha</b><small>maior subida: ${esc(st.pois.name.replace(/^E\S+ /, ''))}</small></td><td class="r"><b>${Math.round(st.pois.up)} m</b><small>${Math.round(st.up)} m no total</small></td></tr>
   <tr><td>${maillotSvg('vert', 26)}</td><td><b>Maillot vert</b><small>melhor média: ${esc(st.vert.name.replace(/^E\S+ /, ''))}</small></td><td class="r"><b>${n1(st.vert.avg)} km/h</b><small>${n1(st.avg)} na viagem</small></td></tr>
   <tr><td>${maillotSvg('blanc', 26)}</td><td><b>Ponta de velocidade</b><small>máxima: ${esc(st.vmax.name.replace(/^E\S+ /, ''))}</small></td><td class="r"><b>${n1(st.vmax.vmax)} km/h</b><small>mais longa ${n1(st.longest.km)} km</small></td></tr></table>` : '';
  return `<div class="rep m-${r.type}">
  <div class="hd"><div class="eyebrow">Relatório do dia · ${dia}</div><h3>${esc(r.name)}</h3>${r.type === 'pois' ? '<div class="pois-line"></div>' : ''}</div>
  ${podium}
  <div class="big"><div><b>${n1(r.km)}</b><span>km</span></div><div><b>${fmtT(r.moving)}</b><span>em movimento</span></div><div><b>${Math.round(r.up)}</b><span>m subida</span></div></div>
  <div class="grid"><div><b>${fmtT(r.elapsed)}</b><span>total</span></div><div><b>${fmtT(r.stopped)}</b><span>parado</span></div><div><b>${n1(r.avg)}</b><span>média km/h</span></div><div><b>${n1(r.vmax)}</b><span>máx km/h</span></div></div>
  <div class="grid"><div><b>${Math.round(r.maxEle)}</b><span>alt. máx</span></div><div><b>${vam}</b><span>VAM subidas</span></div><div class="hi"><b>${fmtH(r.finishedAt)}</b><span>chegada</span></div><div class="hi"><b>${r.vsPlan == null ? '–' : (r.vsPlan > 0 ? '+' : '−') + fmtMin(r.vsPlan)}</b><span>vs plano</span></div></div>
  ${r.climbs.length ? `<h4>Subidas</h4><table>${r.climbs.map(c => `<tr><td>${cat(c.cat)}${esc(c.name)}</td><td class="r">${n1(c.len / 1000)} km · ${n1(c.pct)} %</td><td class="r">${isFinite(c.time) ? fmtT(c.time) + ' · ' + c.vam + ' m/h' : '–'}</td></tr>`).join('')}</table>` : ''}
  ${r.stops.length ? `<h4>Paradas</h4><table>${r.stops.map(s => `<tr><td class="k">${s.km != null ? 'km ' + Math.round(s.km) : '–'}</td><td>${esc(s.place || s.kind)}</td><td class="r">${fmtMin(s.seconds / 60)}</td></tr>`).join('')}</table>` : ''}
  ${r.marks && r.marks.length ? `<h4>Lugares marcados</h4><table>${r.marks.map(m => `<tr><td class="k">${m.km != null ? 'km ' + n1(m.km) : '–'}</td><td>${esc(m.note || 'lugar marcado')}</td><td class="r">${fmtH(m.at)} · ${m.lat.toFixed(5)}, ${m.lon.toFixed(5)}</td></tr>`).join('')}</table>` : ''}
  ${r.fuel ? `<h4>Abastecimento</h4>${bar('Água', r.fuel.water / 1000, r.fuel.waterPlan / 1000, ' L', n1)}${bar('Carbo', r.fuel.carbs, r.fuel.carbsPlan, ' g', Math.round)}${bar('Sódio', r.fuel.sodium / 1000, r.fuel.sodiumPlan / 1000, ' g', n1)}` : ''}
  ${geral}
  <h4>Plano</h4><table><tr><td>Distância</td><td class="r">${n1(r.km)} de ${n1(r.planKm)} km</td></tr><tr><td>Subida</td><td class="r">${Math.round(r.up)} de ${r.planUp} m</td></tr><tr><td>Bornes</td><td class="r">${r.cps.length}</td></tr><tr><td>Paradas de foto feitas</td><td class="r">${r.sights.filter(s => s.done).length} de ${r.sights.length}</td></tr></table>
  </div>`;
}
export function share(r, log) {
  const text = `Étape ${r.name}\n${n1(r.km)} km · ${fmtT(r.moving)} em movimento · ${Math.round(r.up)} m de subida\nmédia ${n1(r.avg)} km/h · máx ${n1(r.vmax)} · alt. máx ${Math.round(r.maxEle)} m\nchegada ${fmtH(r.finishedAt)}${r.vsPlan != null ? ' (' + (r.vsPlan > 0 ? '+' : '−') + fmtMin(r.vsPlan) + ' vs plano)' : ''}`;
  let gpx = toGpx(log, { name: r.name });
  if (r.marks && r.marks.length) { const w = r.marks.map(m => `<wpt lat="${m.lat}" lon="${m.lon}"><name>${esc(m.note || 'Lugar marcado')}</name><time>${new Date(m.at).toISOString()}</time></wpt>`).join(''); gpx = gpx.replace(/<trk>/, w + '<trk>'); }
  return { text, gpx, json: JSON.stringify(r) };
}
export function list() { return store.reports(); }
export function save(r) { store.setReport(r.stageKey, r); }
function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
