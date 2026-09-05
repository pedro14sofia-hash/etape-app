// Étape Navegar · guide.js
// Orientação: transforma posição em eventos (curva, borne, fora de rota, chegada, parada, compra, subida, luz).
import { haversine, sunTimes } from './geo.js';
import { project, nextCheckpoint, climbAt, surfaceAt } from './track.js';
import { poisNear } from './data-mod.js';

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// S: estado do app {stage, proj, fix, off, offSince, session, paradas, map}; devolve eventos {kind, level, text, sub, speak}
export function tick(S, fix, now) {
  const ev = [], st = S.stage;
  // projeção local primeiro; global só quando perdido, e só troca se for claramente melhor (ida e volta)
  let pr = project(st, fix.lat, fix.lon, S.proj.idx);
  if (pr.off > 150 && now - (S.globalAt || 0) > 10000) {
    S.globalAt = now; const g = project(st, fix.lat, fix.lon, -1);
    if (g.off < 40 && g.off < pr.off - 100) pr = g;
  }
  if (pr.off < 250) S.proj = pr; else S.proj = { ...S.proj, off: pr.off };
  const dist = S.proj.dist;
  // fora de rota
  if (offRoute(pr.off, S.offSince, now)) { if (!S.off) { S.off = true; ev.push({ kind: 'offRoute', level: 1, text: 'Fora da rota', sub: Math.round(pr.off) + ' m do traçado', speak: 'Fora da rota. Volte ' + Math.round(pr.off) + ' metros.', hold: 60000 }); } }
  else if (pr.off <= 120) { S.offSince = 0; if (S.off) { S.off = false; ev.push({ kind: 'backOnRoute', level: 3, text: 'De volta à rota', speak: 'De volta à rota.' }); } }
  if (pr.off > 120 && !S.offSince) S.offSince = now;
  if (S.off) { S.offDist = pr.off; return ev; }
  // bornes
  for (const c of st.cps) {
    if (!c.done && haversine(fix.lat, fix.lon, c.lat, c.lon) < 150 && Math.abs(dist - c.dist) < 400) {
      c.done = true; c.at = now;
      if (c.n === 0 && dist < 400) continue;               // largada: sem aviso
      const last = c === st.cps[st.cps.length - 1];
      ev.push({ kind: last ? 'arrival' : 'checkpoint', level: last ? 2 : 3, text: (last ? 'Chegada · ' : 'Borne ' + c.kmLabel + ' · ') + c.name, sub: last ? 'etapa concluída' : 'km ' + (c.dist / 1000).toFixed(1).replace('.', ','), speak: last ? 'Chegada. Etapa concluída.' : c.name, cp: c });
    }
  }
  // curvas
  for (const t of st.turns) {
    const ahead = t.dist - dist;
    if (ahead > 0 && ahead < 320 && !t.a300) { t.a300 = true; ev.push({ kind: 'turn300', level: 2, text: cap(t.txt) + ' · 300 m', sub: t.road ? t.road : '', speak: 'Em 300 metros, ' + t.txt + (t.road ? ', ' + t.road : '') + '.', turn: t }); }
    if (ahead > 0 && ahead < 60 && !t.a50) { t.a50 = true; ev.push({ kind: 'turn50', level: 1, text: cap(t.txt) + ' agora', sub: t.road || '', speak: cap(t.txt) + ' agora.', turn: t, hold: 8000 }); }
    if (ahead < -120) { t.a300 = false; t.a50 = false; }
  }
  // subidas
  const cl = climbAt(st, dist);
  if (cl && S.climbId !== cl.id) { S.climbId = cl.id; ev.push({ kind: 'climbStart', level: 3, text: 'Subida · ' + cl.name, sub: (cl.len / 1000).toFixed(1).replace('.', ',') + ' km a ' + cl.pct.toFixed(1).replace('.', ',') + ' % · cat. ' + cl.cat, speak: 'Começa a subida de ' + cl.name + ', ' + Math.round(cl.len / 1000) + ' quilômetros.' }); }
  if (!cl && S.climbId) { const done = st.climbs.find(c => c.id === S.climbId); S.climbId = null; if (done && dist >= done.to - 150) ev.push({ kind: 'summit', level: 3, text: 'Topo · ' + done.name, sub: Math.round(done.topEle) + ' m', speak: 'Topo. ' + done.name + '.' }); }
  // terreno
  const sf = surfaceAt(st, dist);
  if (sf && sf !== S.surface) { if (S.surface) ev.push({ kind: 'surface', level: 3, text: cap(sf), sub: 'mudança de terreno', speak: sf === 'asfalto' ? 'Volta ao asfalto.' : 'Trecho de ' + sf + '.' }); S.surface = sf; }
  // flamme rouge
  if (st.total - dist < 1000 && !S.flamme) { S.flamme = true; ev.push({ kind: 'flamme', level: 2, text: 'Flamme rouge', sub: 'último quilômetro', speak: 'Último quilômetro.' }); }
  // paradas e compras
  for (const p of S.paradas) {
    const ahead = p.km * 1000 - dist, near = p.kind === 'compras' ? 500 : 300;
    if (!p.warned && ahead > 0 && ahead < near) { p.warned = true; ev.push({ kind: p.kind === 'compras' ? 'shop' : 'sight', level: p.nivel, text: p.aviso, sub: p.kind === 'compras' ? p.horario : (p.min ? (p.min >= 60 ? Math.floor(p.min / 60) + 'h' + (p.min % 60 ? String(p.min % 60).padStart(2, '0') : '') : p.min + ' min') + ' previstos' : ''), speak: p.aviso.replace(/·/g, ','), parada: p }); }
    if (!p.passed && ahead < -300) { p.passed = true; }
  }
  // fonte à frente (POIs do mapa) para o abastecimento
  S.waterAhead = null;
  if (S.map && S.map.poiIndex) { const w = poisNear(S.map.poiIndex, fix.lat, fix.lon, 350, ['water']); if (w.length) S.waterAhead = w[0].d; }
  return ev;
}
export function offRoute(off, since, now) { return off > 120 && since && now - since > 20000; }

export function eta(stage, dist, speedMs, paradasLeftMin = 0) {
  const rem = stage.total - dist;
  if (!(speedMs > 0.8)) return { seconds: NaN, arrival: null };
  const s = rem / speedMs + paradasLeftMin * 60;
  return { seconds: s, arrival: new Date(Date.now() + s * 1000) };
}
// comparação com o plano: hora prevista de chegada do guia (HH:MM) vs ETA
export function vsPlan(planArrival, arrival) {
  if (!planArrival || !arrival) return null;
  const [h, m] = planArrival.split(/[h:]/).map(Number); const p = new Date(arrival); p.setHours(h, m || 0, 0, 0);
  return Math.round((arrival - p) / 60000);
}
export function daylight(date, lat, lon) {
  const t = sunTimes(date, lat, lon); if (!t) return null;
  const civil = new Date(t.sunset.getTime() + 30 * 60000);
  return { sunset: t.sunset, civil, remaining: (t.sunset - date) / 1000 };
}
export function briefing(stage, paradas, dias, regras) {
  const day = dias[stage.key] || '', items = paradas.filter(p => p.stage === stage.key);
  const mins = items.filter(p => p.kind !== 'compras' && p.kind !== 'opcional').reduce((a, p) => a + p.min, 0);
  const critical = items.filter(p => p.nivel === 1);
  return { day, items, mins, critical, regras, sunday: /DOM/.test(day), monday: /seg/.test(day) };
}
// shopWindow: hora prevista de chegar ao comércio vs fechamento
export function shopWindow(S, speedMs, now) {
  const ev = [];
  if (!(speedMs > 0.8)) return ev;
  for (const p of S.paradas) {
    if (p.kind !== 'compras' || p.passed || !p.horario) continue;
    const m = p.horario.match(/(?:até|fecha[m]?)\s*(\d{1,2})h(\d{0,2})/); if (!m) continue;
    const close = new Date(now); close.setHours(+m[1], +(m[2] || 0), 0, 0);
    const arrive = new Date(now + (p.km * 1000 - S.proj.dist) / speedMs * 1000);
    const slack = (close - arrive) / 60000;
    if (slack < 20 && slack > -60 && !p.winWarned && p.km * 1000 > S.proj.dist) { p.winWarned = true; ev.push({ kind: 'shopWindow', level: 2, text: p.nome.split(' · ')[0] + ' fecha ' + m[1] + 'h' + (m[2] || ''), sub: 'você chega ' + arrive.getHours() + 'h' + String(arrive.getMinutes()).padStart(2, '0'), speak: p.nome.split(' · ')[0] + ' fecha às ' + m[1] + ' horas. Você chega às ' + arrive.getHours() + ' e ' + arrive.getMinutes() + '.' }); }
  }
  return ev;
}
// hora prevista no plano do guia para um km da etapa (interpola o cronograma do dia; horas "8h45")
export function planTimeAt(day, distM) {
  const tl = ((day && day.timeline) || []).filter(t => t[1] !== '' && t[1] != null).map(t => { const m = String(t[0]).match(/(\d{1,2})h(\d{0,2})/); return m ? { km: +t[1], min: +m[1] * 60 + (+(m[2] || 0)) } : null; }).filter(Boolean);
  if (tl.length < 2) return null; const km = distM / 1000;
  if (km <= tl[0].km) return tl[0].min; if (km >= tl[tl.length - 1].km) return tl[tl.length - 1].min;
  for (let i = 1; i < tl.length; i++) if (tl[i].km >= km) { const a = tl[i - 1], b = tl[i]; return a.min + (b.min - a.min) * (km - a.km) / Math.max(0.1, b.km - a.km); }
  return null;
}
// écart: diferença (min) entre a hora prevista de passagem e a hora do plano, nos pontos com bandeira à frente
export function ecart(S, speedMs, now, day) {
  const st = S.stage, out = [], d0 = S.proj.dist;
  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes() + new Date(now).getSeconds() / 60;
  const planNow = planTimeAt(day, d0);
  const items = [{ dist: 0, name: 'Largada', kind: 'start' }].concat(st.climbs.map(c => ({ dist: c.to, name: c.name, kind: 'cat', cat: c.cat })), [{ dist: st.total, name: 'Chegada', kind: 'finish' }]);
  for (const it of items) {
    const plan = planTimeAt(day, it.dist); if (plan == null) continue;
    let eta = null;
    if (it.dist <= d0) { const mk = (S.session.marks || []).find(m => m.dist != null && Math.abs(m.dist - it.dist) < 400); eta = mk ? new Date(mk.at).getHours() * 60 + new Date(mk.at).getMinutes() : null; }
    else if (speedMs > 0.8) eta = nowMin + (it.dist - d0) / speedMs / 60;
    out.push({ ...it, plan, eta, gap: eta == null ? null : Math.round(eta - plan) });
  }
  return { now: planNow == null ? null : Math.round(nowMin - planNow), items: out };
}
export function nextCue(S) {
  const st = S.stage, d = S.proj.dist;
  return { cp: nextCheckpoint(st, d), turn: st.turns.find(t => t.dist > d) };
}
