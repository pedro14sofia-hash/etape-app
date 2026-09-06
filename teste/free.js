// Étape Navegar · free.js
// Navegação livre (build de São Paulo, window.FREE): sem traçado. A etapa vira um percurso que cresce com o pedal: cada
// fix é encaixado na via mais provável (match.js), o ponto entra na fita amarela, o perfil vem do relevo (dem.js) e toda
// a telemetria da viagem (velocidade, média, VAM, rampa, subida, sensores, abastecimento, relatório, GPX) continua igual.
// O painel mostra a rua atual, o tipo de via, a superfície, a ciclovia e o próximo cruzamento; a voz só fala quando a
// rua muda. Subidas são detectadas ao vivo e categorizadas ao terminar, como as bandeirinhas do Tour.
import * as match from './match.js';
import * as dem from './dem.js';
import * as voice from './voice.js';
import { haversine } from './geo.js';

let S = null, cur = null, cross = null, crossAt = 0, lastPt = null, lastEle = null, eleSm = null, eleOut = null, climb = null, streetAt = 0, spoken = '';
const fmtKm1 = m => (m / 1000).toFixed(1).replace('.', ',');

export function active() { return !!S; }
// cria a etapa dinâmica no lugar da etapa fixa do build
export function init(state, center) {
  S = state;
  const st = S.stage; st.key = 'SP'; st.free = true; st.name = 'SP · navegação livre'; st.type = 'blanc';
  const c = center || st.pts[0];
  st.pts = [[c[0], c[1]], [c[0] + 1e-6, c[1] + 1e-6]]; st.cum = [0, 0.16]; st.total = 0.16;
  st.prof = [[0, 745], [0.0002, 745]]; st.profS = null; st.upRem = [0, 0]; st.km = 0; st.up = 0;
  st.climbs = []; st.surfaces = []; st.cps = []; st.turns = [];
  cur = null; cross = null; lastPt = null; lastEle = null; eleSm = null; eleOut = null; climb = null; spoken = '';
  return st;
}
export function reset(center) { return init(S, center); }

// um fix novo: encaixa na via, estende o percurso, atualiza rua e cruzamento; devolve eventos para o app
export function onFix(fix, now) {
  const ev = [], st = S.stage, prev = cur;
  const m = match.locate(S.map, fix, cur);
  cur = m;
  const plat = m ? m.lat : fix.lat, plon = m ? m.lon : fix.lon;
  // percurso: novo vértice a cada ≥ 6 m
  const last = st.pts[st.pts.length - 1];
  const dd = haversine(last[0], last[1], plat, plon);
  if (!lastPt) { st.pts = [[plat, plon], [plat + 1e-6, plon + 1e-6]]; st.cum = [0, 0.16]; st.total = 0.16; lastPt = [plat, plon]; }
  else if (dd >= 6 && dd < 400) { st.pts.push([plat, plon]); st.cum.push(st.total + dd); st.total += dd; lastPt = [plat, plon]; }
  // perfil pelo relevo: um ponto a cada 25 m; sem relevo, a altitude do GPS
  // altitude suavizada ao longo do percurso: o relevo (SRTM) carrega prédios e viadutos
  const eleRaw = eleAt(plat, plon, fix);
  // dois filtros: média móvel por distância (constante 150 m) e histerese de 3 m, para o ruído do relevo não virar VAM
  if (eleRaw != null && eleSm == null) { for (const q of st.prof) q[1] = Math.round(eleRaw * 10) / 10; for (const smp of (S.log || [])) smp.ele = Math.round(eleRaw); st.profS = null; }   // 1ª altitude real: apaga o valor de partida provisório (o relevo carrega depois do 1º fix)
  if (eleRaw != null) { eleSm = eleSm == null ? eleRaw : eleSm + (eleRaw - eleSm) * Math.min(1, dd / 150); if (eleOut == null || Math.abs(eleSm - eleOut) > 3) eleOut = eleSm; }
  const ele = eleOut;
  const pk = st.prof[st.prof.length - 1];
  if (ele != null && st.total / 1000 - pk[0] >= 0.025) { st.prof.push([+(st.total / 1000).toFixed(4), Math.round(ele * 10) / 10]); st.upRem.push(0); st.profS = null; if (st.prof.length > 3 && st.prof[1][0] < 0.001) { st.prof.splice(1, 1); st.upRem.splice(1, 1); } }
  else if (ele != null && st.prof.length <= 2) { st.prof[0][1] = st.prof[1][1] = Math.round(ele * 10) / 10; }
  S.proj = { idx: Math.max(0, st.pts.length - 2), dist: st.total, off: m ? m.off : 0 }; S.off = false; S.offSince = 0;
  // rua: muda quando a nova via ficou estável por 2 fixes (ou é a primeira)
  const name = m ? (m.name || match.classLabel(m.way)) : '';
  if (m && (m.stable >= 1 || !prev) && name && name !== S.street) {
    S.street = name; S.streetWay = m.way; streetAt = now;
    S.bikeway = m.way.k === 2 ? 'ciclovia' : m.way.k === 1 ? 'faixa' : '';
    S.surface = match.surfaceLabel(m.way);
    if (spoken !== name) { spoken = name; ev.push(streetEvent(m, now)); }
  } else if (!m && S.street && now - streetAt > 15000) { S.street = ''; S.streetWay = null; S.bikeway = ''; }
  // cruzamento à frente: recalcula a cada 2 s
  if (m && now - crossAt > 2000) { crossAt = now; try { cross = match.nextCross(S.map, m, 450); } catch (e) { cross = null; } if (cross) cross.at = now; }
  S.cross = cross && m ? cross : null;
  // subidas ao vivo
  climbTick(st, ele, now, ev);
  S.next = { cp: null, turn: null };
  return ev;
}
function eleAt(lat, lon, fix) {
  let e = null; try { e = dem.available() ? dem.elevation(lat, lon) : null; } catch (err) { e = null; }   // z12 (38 m/px): o z14 carrega a altura dos prédios
  if (e == null && fix.alt != null) e = fix.alt;
  if (e == null) e = lastEle; else lastEle = e;
  return e;
}
function streetEvent(m, now) {
  const w = m.way, kind = match.classLabel(w), bw = match.bikewayLabel(w), sf = match.surfaceLabel(w);
  const sub = [bw || kind, sf && sf !== 'asfalto' ? sf : '', w.o === 1 ? 'mão única' : ''].filter(Boolean).join(' · ');
  const nm = m.name || kind;
  return { kind: 'street', level: 3, text: nm, sub, speak: nm + (bw ? ', ' + bw : '') + (sf && sf !== 'asfalto' ? ', ' + sf : '') + '.', hold: 6000 };
}
// subida: começa com rampa ≥ 3 % sustentada por 200 m; termina depois de 300 m sem subir; menos de 25 m de ganho não conta; categoria pelo ganho e pela rampa
function climbTick(st, ele, now, ev) {
  if (ele == null || st.prof.length < 4) return;
  const d = st.total, g = grade(st, d, 150);
  if (!climb) {
    if (g >= 3) { if (!climbTick._from) climbTick._from = { d, ele }; else if (d - climbTick._from.d >= 200 && ele - climbTick._from.ele >= 6) { climb = { name: 'Subida ' + (S.street || ''), from: climbTick._from.d, fromEle: climbTick._from.ele, maxEle: ele, lastUp: d, n: st.climbs.length + 1, cat: '', to: d + 1, len: 0, gain: 0, pct: g }; st.climbs.push(climb); climbTick._from = null; ev.push({ kind: 'climbStart', level: 3, text: 'Subida', sub: (S.street || '') + ' · ' + g.toFixed(1).replace('.', ',') + ' %', speak: 'Subida.' }); } }
    else climbTick._from = null;
    return;
  }
  if (ele > climb.maxEle) { climb.maxEle = ele; climb.lastUp = d; }
  climb.to = Math.max(climb.lastUp, d) + 1; climb.len = climb.lastUp - climb.from; climb.gain = Math.max(0, climb.maxEle - climb.fromEle); climb.pct = climb.len > 0 ? +(climb.gain / climb.len * 100).toFixed(1) : 0;
  climb.cat = category(climb.len, climb.gain);
  if (d - climb.lastUp > 300 || g <= -2.5) {   // acabou
    climb.to = climb.lastUp;
    if (climb.gain < 25 || climb.len < 250) st.climbs.pop();
    else ev.push({ kind: 'summit', level: 3, text: 'Topo', sub: fmtKm1(climb.len) + ' km · ' + Math.round(climb.gain) + ' m · ' + climb.pct.toFixed(1).replace('.', ',') + ' %' + (climb.cat ? ' · cat. ' + climb.cat : ''), speak: 'Topo. ' + Math.round(climb.gain) + ' metros de subida' + (climb.cat ? ', categoria ' + climb.cat : '') + '.' });
    climb = null;
  }
}
function grade(st, d, win) {
  const d1 = Math.max(0, d - win), p = st.prof; if (p.length < 2) return 0;
  const e = k => { const km = k / 1000; let lo = 0, hi = p.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (p[mid][0] < km) lo = mid + 1; else hi = mid; } const i = Math.max(1, lo), a = p[i - 1], b = p[i], t = Math.min(1, Math.max(0, (km - a[0]) / Math.max(1e-6, b[0] - a[0]))); return a[1] + (b[1] - a[1]) * t; };
  return d - d1 < 40 ? 0 : (e(d) - e(d1)) / (d - d1) * 100;
}
function category(len, gain) {
  const pct = len > 0 ? gain / len * 100 : 0, score = gain * Math.max(1, pct / 4);
  if (gain >= 800) return 'HC'; if (gain >= 400 || score >= 900) return '1'; if (gain >= 200 || score >= 450) return '2'; if (gain >= 100 || score >= 200) return '3'; if (gain >= 40 && len >= 300) return '4'; return '';
}
export function currentClimb() { return climb; }
export function heading() { return cur ? cur.head : null; }

// painel: sobrescreve o que é da etapa fixa (borne, curva, km restam, chegada) pelo que faz sentido no modo livre
export function panel($) {
  const st = S.stage, d = S.proj.dist || 0;
  $('rem').textContent = fmtKm1(d); const remLab = $('rem').nextElementSibling; if (remLab) remLab.textContent = 'km feitos';
  const t = new Date(); $('eta').textContent = String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'); $('vsplan').textContent = ''; const etaLab = $('eta').nextElementSibling; if (etaLab) etaLab.firstChild.textContent = 'agora · ';
  const w = S.streetWay;
  $('nbName').textContent = S.street || (S.fix ? 'Fora das vias' : 'Aguardando GPS');
  const parts = w ? [match.bikewayLabel(w) ? '<i class="chip bike">' + match.bikewayLabel(w) + '</i>' : match.classLabel(w), match.surfaceLabel(w), w.o === 1 ? 'mão única' : '', w.v ? w.v + ' km/h' : ''].filter(Boolean) : [];
  $('nbSub').innerHTML = parts.join(' · '); $('mName').textContent = $('nbName').textContent; $('mSub').innerHTML = $('nbSub').innerHTML;
  const c = S.cross;
  if (c) { $('tcArrow').innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V5M6 11l6-6 6 6"/><path d="M4 20h16" opacity=".5"/></svg>'; $('tcDist').textContent = Math.round(c.dist / 10) * 10 + ' m'; $('tcSub').textContent = c.name; }
  else { $('tcArrow').innerHTML = ''; $('tcDist').textContent = '–'; $('tcSub').textContent = 'sem cruzamento à vista'; }
  const cl = climb, ctx = $('ctx');
  if (cl && ctx) { ctx.hidden = false; ctx.className = 'climb'; ctx.innerHTML = `<div class="cat">${cl.cat || '·'}</div><div class="t"><b>${cl.name}</b><span>${fmtKm1(cl.len)} km · ${Math.round(cl.gain)} m · ${cl.pct.toFixed(1).replace('.', ',')} %</span></div><div class="r"><b>${Math.round(S.live ? S.live.grade : 0)} %</b><span>agora</span></div>`; }
}

// simulação de teste (?sim=… no build SP): percorre vias do mapa pelo nome, com ruído de GPS, a v km/h
export function simulate(names, kmh, onFix) {
  const M = S.map, kx0 = 111320; const path = [];
  for (const nm of names) {
    const ws = M.ways.filter(w => w.n === nm); if (!ws.length) continue;
    // encadeia os pedaços da via pelo vértice mais próximo do último ponto
    let rest = ws.slice(); let tail = path.length ? path[path.length - 1] : null;
    while (rest.length) {
      let bi = 0, bd = 1e12, rev = false;
      rest.forEach((w, i) => { if (!tail) { if (i === 0) { bi = 0; bd = 0; } return; } const d0 = haversine(tail[0], tail[1], w.p[0][0], w.p[0][1]), d1 = haversine(tail[0], tail[1], w.p[w.p.length - 1][0], w.p[w.p.length - 1][1]); if (d0 < bd) { bd = d0; bi = i; rev = false; } if (d1 < bd) { bd = d1; bi = i; rev = true; } });
      const w = rest.splice(bi, 1)[0]; const pts = rev ? w.p.slice().reverse() : w.p;
      if (tail && bd > 250) continue;
      for (const p of pts) path.push([p[0], p[1]]); tail = path[path.length - 1];
    }
  }
  if (path.length < 2) { voice.banner('Simulação: vias não encontradas', 3); return; }
  const cum = [0]; for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversine(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]));
  let dist = 0, t = Date.now(); const v = kmh / 3.6, step = 1000;
  clearInterval(simulate._iv);
  simulate._iv = setInterval(() => {
    dist += v * step / 1000 * (0.9 + Math.random() * 0.2); t += step; if (dist > cum[cum.length - 1]) { clearInterval(simulate._iv); return; }
    let i = 1; while (i < cum.length - 1 && cum[i] < dist) i++;
    const f = (dist - cum[i - 1]) / Math.max(1, cum[i] - cum[i - 1]), a = path[i - 1], b = path[i];
    const lat = a[0] + (b[0] - a[0]) * f + (Math.random() - 0.5) * 6 / 111320, lon = a[1] + (b[1] - a[1]) * f + (Math.random() - 0.5) * 6 / (111320 * Math.cos(a[0] * Math.PI / 180));
    const head = (Math.atan2((b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180), b[0] - a[0]) * 180 / Math.PI + 360) % 360;
    onFix({ t, lat, lon, acc: 6, speed: v, heading: head, src: 'sim' });
  }, step);
  return () => clearInterval(simulate._iv);
}
export function stopSim() { clearInterval(simulate._iv); }
