// Étape Navegar · guide.js
// Orientação: transforma posição em eventos (curva, borne, fora de rota, chegada, parada, compra, subida, luz).
import { haversine, sunTimes, bearing, tzAt, tzMinutes } from './geo.js';
import { project, nextCheckpoint, climbAt, surfaceAt, pointAt } from './track.js';
import { poisNear, nearestWay } from './data-mod.js';

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
  // longe da etapa (> 5 km): só o aviso, sem curvas, bornes ou paradas
  if (pr.off > 5000) {
    if (!S.off) { S.off = true; const km = pr.off / 1000; ev.push({ kind: 'offRoute', off: pr.off, level: 2, text: 'Longe da etapa', sub: (km > 100 ? Math.round(km).toLocaleString('pt-BR') : km.toFixed(1).replace('.', ',')) + ' km do traçado · para treinar, use a rota de teste', speak: 'Você está a ' + Math.round(km) + ' quilômetros da etapa.', hold: 120000 }); }
    S.offDist = pr.off; return ev;
  }
  // fora de rota
  if (offRoute(pr.off, S.offSince, now)) { if (!S.off) { S.off = true; const km = pr.off / 1000;
      if (km > 5) ev.push({ kind: 'offRoute', off: pr.off, level: 2, text: 'Longe da etapa', sub: (km > 100 ? Math.round(km).toLocaleString('pt-BR') : km.toFixed(1).replace('.', ',')) + ' km do traçado · para treinar, use a rota de teste', speak: 'Você está a ' + Math.round(km) + ' quilômetros da etapa.', hold: 120000 });
      else { const q = pointAt(st, S.proj.dist); const back = bearing(fix.lat, fix.lon, q[0], q[1]); const rel = ((back - (fix.head || 0)) + 540) % 360 - 180, side = Math.abs(rel) < 25 ? 'à frente' : Math.abs(rel) > 155 ? 'atrás' : rel > 0 ? 'à sua direita' : 'à sua esquerda'; ev.push({ kind: 'offRoute', off: pr.off, back, rel, side, level: 1, text: 'Volte à rota', sub: 'traçado ' + Math.round(pr.off) + ' m ' + side, speak: 'Fora da rota. Traçado a ' + Math.round(pr.off) + ' metros ' + side + '.', hold: 12000 }); } } }
  else if (pr.off <= 120) { S.offSince = 0; if (S.off) { S.off = false; S.reroute = null; ev.push({ kind: 'backOnRoute', level: 3, text: 'De volta à rota', speak: 'De volta à rota.' }); } }
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
    if (ahead > 0 && ahead < 320 && !t.a300) { t.a300 = true; ev.push({ kind: 'turn300', level: 2, text: t.short || cap(t.txt), sub: 'em 300 m' + (t.road ? ' · ' + t.road : ''), speak: 'Em 300 metros, ' + t.txt + (t.road ? ', ' + t.road : '') + '.', turn: t }); }
    if (ahead > 0 && ahead < 60 && !t.a50) { t.a50 = true; ev.push({ kind: 'turn50', level: 1, text: t.short || cap(t.txt), sub: 'agora' + (t.road ? ' · ' + t.road : ''), speak: cap(t.txt) + ' agora.', turn: t, hold: 8000 }); }
    if (ahead < -120) { t.a300 = false; t.a50 = false; }
  }
  // subidas
  const cl = climbAt(st, dist);
  if (cl && S.climbId !== cl.id && !cl.done) { S.climbId = cl.id; ev.push({ kind: 'climbStart', cat: cl.cat, level: 3, text: 'Subida · ' + cl.name, sub: (cl.len / 1000).toFixed(1).replace('.', ',') + ' km a ' + cl.pct.toFixed(1).replace('.', ',') + ' % · cat. ' + cl.cat, speak: 'Começa a subida de ' + cl.name + ', ' + Math.round(cl.len / 1000) + ' quilômetros.' }); }
  if (!cl && S.climbId) { const done = st.climbs.find(c => c.id === S.climbId); S.climbId = null; if (done && dist >= done.to - 150) done.done = true; if (done && dist >= done.to - 150 && S.prefs && S.prefs.camera !== false) ev.push({ kind: 'rec', level: 2, text: 'Grava agora', sub: 'descida · ' + done.name + ' · 3 min', speak: 'Grava agora. Descida.', voice: true }); if (done && dist >= done.to - 150) ev.push({ kind: 'summit', level: 3, text: 'Topo · ' + done.name, sub: Math.round(done.topEle) + ' m', speak: 'Topo. ' + done.name + '.' }); }
  // terreno
  const sf = surfaceAt(st, dist);
  if (sf && sf !== S.surface) { if (S.surface && !st.diario) ev.push({ kind: 'surface', level: 3, text: cap(sf), sub: 'mudança de terreno', speak: sf === 'asfalto' ? 'Volta ao asfalto.' : 'Trecho de ' + sf + '.' }); S.surface = sf; }
  // ciclovia / faixa de bike / rua: via mais próxima (≤ 25 m), muda só depois de 2 leituras iguais
  if (S.map && S.map.index) {
    const p = S.pos || fix, nw = nearestWay(S.map.index, p.lat, p.lon, 30), bw = nw ? (nw.way.k === 2 ? 'ciclovia' : nw.way.k === 1 ? 'faixa' : 'rua') : (S.bikeway || 'rua');
    if (bw !== S.bikeway) { S.bwCand = bw === S.bwCand ? S.bwCand : bw; S.bwN = bw === S.bwCand ? (S.bwN || 0) + 1 : 1; }
    if (bw !== S.bikeway && S.bwN >= (bw === 'rua' ? 3 : 2)) {
      const first = !S.bikeway; S.bikeway = bw; S.bwN = 0;
      if (!first) ev.push(bw === 'ciclovia' ? { kind: 'bikeway', level: 3, text: 'Ciclovia', sub: 'via própria de bike', speak: 'Ciclovia.' } : bw === 'faixa' ? { kind: 'bikeway', level: 3, text: 'Faixa de bike', sub: 'na rua, atenção ao trânsito', speak: 'Faixa de bike.' } : { kind: 'bikeway', level: 3, text: 'Rua', sub: 'trânsito compartilhado', speak: 'De volta à rua. Atenção ao trânsito.' });
    }
  }
  // flamme rouge
  if (st.total - dist < 1000 && !S.flamme) { S.flamme = true; ev.push({ kind: 'flamme', level: 2, text: 'Flamme rouge', sub: 'último quilômetro', speak: 'Último quilômetro.' }); if (S.prefs && S.prefs.camera !== false) ev.push({ kind: 'rec', level: 2, text: 'Grava agora', sub: 'chegada · ' + st.name.split('→').pop().trim(), speak: 'Grava agora. Chegada.' }); }
  // paradas e compras
  for (const p of S.paradas) {
    const ahead = p.km * 1000 - dist, near = p.kind === 'compras' ? 500 : 300;
    if (!p.warned && ahead > 0 && ahead < near) { p.warned = true; ev.push({ kind: p.kind === 'compras' ? 'shop' : 'sight', level: p.nivel, text: p.aviso, sub: p.kind === 'compras' ? p.horario : (p.min ? (p.min >= 60 ? Math.floor(p.min / 60) + 'h' + (p.min % 60 ? String(p.min % 60).padStart(2, '0') : '') : p.min + ' min') + ' previstos' : ''), speak: p.aviso.replace(/·/g, ','), parada: p }); }
    if (!p.passed && ahead < -300) { p.passed = true; }
  }
  // serviços à frente: banheiro (a cada 30 min no máximo), bicicletaria (uma vez cada), calculados uma vez por etapa
  if (!S.services || S.services.key !== st.key) S.services = servicesAlong(st, S.map);
  for (const sv of S.services.list) {
    const ahead = sv.dist - dist; if (ahead < -200) { sv.done = true; continue; } if (sv.done) continue;
    if (sv.kind === 'toilets' && ahead < 400 && ahead > 0 && now - (S.toiletCueAt || 0) > 1800000) { sv.done = true; S.toiletCueAt = now; ev.push({ kind: 'toilets', level: 3, m: Math.round(ahead), text: 'Banheiro · ' + Math.round(ahead / 50) * 50 + ' m', sub: sv.name || 'banheiro público', speak: 'Banheiro em ' + Math.round(ahead / 50) * 50 + ' metros.' }); }
    if (sv.kind === 'bike' && ahead < 2000 && ahead > 0) { sv.done = true; ev.push({ kind: 'bikeshop', level: 3, m: Math.round(ahead), text: 'Bicicletaria · ' + (ahead >= 1000 ? (ahead / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(ahead / 50) * 50 + ' m'), sub: sv.name || 'oficina de bikes', speak: 'Bicicletaria à frente, ' + (ahead >= 1000 ? (ahead / 1000).toFixed(1).replace('.', ',') + ' quilômetros' : Math.round(ahead / 50) * 50 + ' metros') + '.' }); }
  }
  // hotel na aproximação: 2,5 km antes da chegada
  const day = (S.routes && S.routes.days || {})[st.key], hotel = day && day.hotel;
  if (hotel && hotel.nome && !S.hotelCued && st.total - dist < 2500 && st.total - dist > 300) { S.hotelCued = true; ev.push({ kind: 'hotel', level: 3, km: (st.total - dist) / 1000, text: hotel.nome.split(' · ')[0].slice(0, 34), sub: [hotel.checkin ? 'check-in ' + hotel.checkin : '', hotel.bike ? 'bike: ' + hotel.bike : ''].filter(Boolean).join(' · ').slice(0, 70), speak: 'Hotel a ' + ((st.total - dist) / 1000).toFixed(1).replace('.', ',') + ' quilômetros. ' + (hotel.checkin ? 'Check-in ' + hotel.checkin + '.' : '') }); }
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
// média que o plano pede daqui até a chegada (marca branca do velocímetro): km restantes ÷ (hora do plano − agora − paradas que faltam)
export function planSpeed(stage, dist, planArrival, paradasLeftMin = 0, now = Date.now()) {
  if (!planArrival || !stage) return null;
  const [h, m] = planArrival.split(/[h:]/).map(Number); const p = tzAt(new Date(now), h, m || 0);
  const s = (p - now) / 1000 - paradasLeftMin * 60; if (!(s > 300)) return null;   // com menos de 5 min de plano a marca não diz nada
  return (stage.total - dist) / s * 3.6;
}
// comparação com o plano: hora prevista de chegada do guia (HH:MM) vs ETA
export function vsPlan(planArrival, arrival) {
  if (!planArrival || !arrival) return null;
  const [h, m] = planArrival.split(/[h:]/).map(Number); const p = tzAt(arrival, h, m || 0);
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
    const close = tzAt(now, +m[1], +(m[2] || 0));
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
  const nowMin = tzMinutes(now);
  const planNow = planTimeAt(day, d0);
  const items = [{ dist: 0, name: 'Largada', kind: 'start' }].concat(st.climbs.map(c => ({ dist: c.to, name: c.name, kind: 'cat', cat: c.cat })), [{ dist: st.total, name: 'Chegada', kind: 'finish' }]);
  for (const it of items) {
    const plan = planTimeAt(day, it.dist); if (plan == null) continue;
    let eta = null;
    if (it.dist <= d0) { const mk = (S.session.marks || []).find(m => m.dist != null && Math.abs(m.dist - it.dist) < 400); eta = mk ? tzMinutes(mk.at) : null; }
    else if (speedMs > 0.8) eta = nowMin + (it.dist - d0) / speedMs / 60;
    out.push({ ...it, plan, eta, gap: eta == null ? null : Math.round(eta - plan) });
  }
  return { now: planNow == null ? null : Math.round(nowMin - planNow), items: out };
}
export function nextCue(S) {
  const st = S.stage, d = S.proj.dist;
  return { cp: nextCheckpoint(st, d), turn: st.turns.find(t => t.dist > d) };
}

// serviços (banheiro, bicicletaria) até 120 m do traçado, com a distância ao longo da etapa
export function servicesAlong(st, map) {
  const list = [];
  if (map && map.pois) {
    const bb = st.pts.reduce((a, p) => [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])], [90, 180, -90, -180]);
    for (const p of map.pois) {
      if (p.k !== 'toilets' && p.k !== 'bike') continue;
      if (p.lat < bb[0] - 0.002 || p.lat > bb[2] + 0.002 || p.lon < bb[1] - 0.003 || p.lon > bb[3] + 0.003) continue;
      const pr = project(st, p.lat, p.lon, -1);
      if (pr.off <= 120) list.push({ kind: p.k, name: p.n || '', dist: pr.dist, off: pr.off, lat: p.lat, lon: p.lon });
    }
  }
  list.sort((a, b) => a.dist - b.dist);
  return { key: st.key, list };
}
