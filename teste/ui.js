import { tzHM, tzHour } from './geo.js';
// Étape Navegar · ui.js
// Painel, controles, gestos, tema, orientação, modo resumo.
import { drawProfile } from './render.js';
import { surfaceAt, nextSurfaceChange } from './track.js';
import * as session from './session.js';

const $ = id => document.getElementById(id);
const fmtKm1 = m => (Math.max(0, m) / 1000).toFixed(1).replace('.', ',');
const fmtH = d => d ? tzHM(d) : '–';
const fmtT = s => { if (!isFinite(s) || s < 0) return '–'; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h + ':' + String(m).padStart(2, '0'); };
const n0 = x => isFinite(x) ? Math.round(x).toLocaleString('pt-BR') : '–';
export const fmtMin = m => { m = Math.round(Math.abs(m)); if (m < 60) return m + ' min'; const h = Math.floor(m / 60), r = m % 60; return r ? h + 'h' + String(r).padStart(2, '0') : h + ' h'; };
const fmtGap = m => { m = Math.round(m); return m >= 60 ? Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0') + "'" : m + "'"; };
const fmtMinH = m => { m = Math.round(m); return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0'); };
const n1 = x => isFinite(x) ? (Math.round(x * 10) / 10).toFixed(1).replace('.', ',') : '–';
const ARROW = {
  reto: '<path d="M12 20V5"/><path d="M7 10l5-5 5 5"/>',
  leve: '<path d="M9 20v-7l7-7"/><path d="M11 6h5v5"/>',                                   // desenhada para a direita
  acentuada: '<path d="M10 20V10a3 3 0 0 1 3-3h6"/><path d="M16 4l4 3-4 3"/>',
  retorno: '<path d="M8 20V8a4 4 0 0 1 8 0v4"/><path d="M12 9l4 3 4-3"/>'
};
ARROW.direita = ARROW.acentuada; ARROW.esquerda = '<g transform="translate(24 0) scale(-1 1)">' + ARROW.acentuada + '</g>';
// k: leve | acentuada | retorno | reto (ou direita/esquerda); dir espelha as classes desenhadas para a direita
export const svgArrow = (k, dir) => { const g = ARROW[k] || ARROW.reto, mir = dir === 'esquerda' && (k === 'leve' || k === 'acentuada' || k === 'retorno'); return `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${mir ? '<g transform="translate(24 0) scale(-1 1)">' + g + '</g>' : g}</svg>`; };
export const chip = k => k ? `<i class="chip ${k === 'asfalto' ? 'asf' : k === 'gravel' ? 'grv' : (k === 'ciclovia' || k === 'faixa') ? 'bike' : k === 'rua' ? 'asf' : 'trl'}">${k}</i>` : '';

export function bindGestures(canvas, R, onUserPan, onUserZoom, onUserRotate) {
  const ptrs = new Map(); let pinch = null, trail = [], fling = 0, lastTap = 0, lastTapAt = null;
  const stopFling = () => { if (fling) { cancelAnimationFrame(fling); fling = 0; } };
  const rect = () => canvas.getBoundingClientRect();
  canvas.addEventListener('pointerdown', e => {
    stopFling(); R.stopAnim(); ptrs.set(e.pointerId, [e.clientX, e.clientY]); try { canvas.setPointerCapture(e.pointerId); } catch (err) { } trail = [[performance.now(), e.clientX, e.clientY]];
    if (ptrs.size === 2) { const a = [...ptrs.values()]; pinch = { d: Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]), z: R.view.z, ang: Math.atan2(a[1][1] - a[0][1], a[1][0] - a[0][0]), rot: R.view.rot, turned: false }; if (onUserZoom) onUserZoom(); }
  });
  canvas.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return; const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 1) {
      const a = R.fromPx(prev[0], prev[1]), b = R.fromPx(e.clientX, e.clientY); R.setView(R.view.cx - (b.mx - a.mx), R.view.cy - (b.my - a.my)); onUserPan();
      const now = performance.now(); trail.push([now, e.clientX, e.clientY]); while (trail.length > 2 && now - trail[0][0] > 90) trail.shift();
    } else if (ptrs.size === 2 && pinch) {
      const a = [...ptrs.values()], d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]), r = rect();
      // rotação com dois dedos: só depois de girar 8° (evita girar sem querer ao dar pinça); depois acompanha o ângulo
      const ang = Math.atan2(a[1][1] - a[0][1], a[1][0] - a[0][0]); let da = ang - pinch.ang; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (!pinch.turned && Math.abs(da) > 0.14) { pinch.turned = true; pinch.ang = ang; pinch.rot = R.view.rot; da = 0; if (onUserRotate) onUserRotate(); }
      R.zoomAround(pinch.z + Math.log2(d / pinch.d), (a[0][0] + a[1][0]) / 2 - r.left, (a[0][1] + a[1][1]) / 2 - r.top, pinch.turned ? pinch.rot + da : null);
    }
  });
  const up = e => {
    const was = ptrs.size; ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
    if (was === 1 && trail.length >= 1) {
      const now = performance.now(), t0 = trail[0], t1 = trail[trail.length - 1], dt = Math.max(16, t1[0] - t0[0]);
      if (trail.length >= 2 && now - t1[0] < 60) {
        let vx = (t1[1] - t0[1]) / dt * 1000, vy = (t1[2] - t0[2]) / dt * 1000;   // px/s
        const sp = Math.hypot(vx, vy); if (sp > 2600) { vx *= 2600 / sp; vy *= 2600 / sp; }   // teto de velocidade da inércia
        if (sp > 250) {                                             // inércia: decai com constante de 0,35 s
          let last = now; const step = () => { const t = performance.now(), d = Math.min(0.05, (t - last) / 1000); last = t; const k = Math.exp(-d / 0.35);
            const a = R.fromPx(0, 0), b = R.fromPx(vx * d, vy * d); R.setView(R.view.cx - (b.mx - a.mx), R.view.cy - (b.my - a.my)); vx *= k; vy *= k;
            if (Math.hypot(vx, vy) > 15) fling = requestAnimationFrame(step); else fling = 0; };
          fling = requestAnimationFrame(step);
        }
      }
      // toque duplo: aproxima em volta do dedo
      const moved = Math.hypot(e.clientX - trail[0][1], e.clientY - trail[0][2]) > 10;
      if (!moved && lastTapAt && now - lastTap < 320 && Math.hypot(e.clientX - lastTapAt[0], e.clientY - lastTapAt[1]) < 30) { stopFling(); const r = rect(); zoomAnim(R, R.view.z + 1, e.clientX - r.left, e.clientY - r.top); if (onUserZoom) onUserZoom(); lastTap = 0; lastTapAt = null; }
      else if (!moved) { lastTap = now; lastTapAt = [e.clientX, e.clientY]; }
    }
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); const r = rect(); zoomAnim(R, R.view.z - Math.sign(e.deltaY) * 0.5, e.clientX - r.left, e.clientY - r.top, 160); if (onUserZoom) onUserZoom(); }, { passive: false });
}
// zoom animado em volta de um ponto da tela (ease-out, 220 ms)
export function zoomAnim(R, z, px, py, ms = 220) {
  const z0 = R.view.z, z1 = Math.max(9, Math.min(19, z)), t0 = performance.now();
  const step = () => { const t = Math.min(1, (performance.now() - t0) / ms), e = 1 - Math.pow(1 - t, 3); R.zoomAround(z0 + (z1 - z0) * e, px, py); if (t < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// painel: atualiza tudo a partir do estado
export function panel(S) {
  const st = S.stage, d = S.proj.dist, rem = st.total - d, sess = S.session, now = Date.now();
  const moving = session.movingTime(sess, now);
  // faixa fixa
  $('eta').textContent = S.eta && S.eta.arrival ? fmtH(S.eta.arrival) : (S.destEta && sess.state === 'idle' ? S.destEta : '–:–');
  const vp = S.vsPlan; $('vsplan').textContent = vp == null ? (S.planArrival ? 'plano ' + S.planArrival : '') : (vp > 0 ? '+' : '−') + fmtMin(vp); $('vsplan').className = vp == null ? '' : vp > 10 ? 'late' : 'ok';
  $('rem').textContent = fmtKm1(rem);
  const idleLbl = sess.state === 'idle' && (st.diario || S.free) ? 'Partir' : session.label(sess.state);
  $('btnSession').innerHTML = idleLbl + '<small>' + (sess.state === 'idle' ? (st.diario ? (S.destEta ? 'chegada ' + S.destEta : 'Diário') : S.free ? 'livre' : 'etapa') : 'mov. ' + fmtT(moving)) + '</small>';
  $('btnSession').className = 'sbtn ' + sess.state;
  // linha da borne + curva
  const cp = S.next.cp, tn = S.next.turn, sf = surfaceAt(st, d), ch = nextSurfaceChange(st, d);
  $('nbName').textContent = cp ? cp.name : '–';
  const bwChip = S.bikeway === 'ciclovia' ? '<i class="chip bike">ciclovia</i>' : S.bikeway === 'faixa' ? '<i class="chip bike">faixa</i>' : '';
  const sfTxt = bwChip + chip(sf);   // regra 01: só a superfície de agora; a próxima mudança está na faixa da fita
  $('nbSub').innerHTML = cp ? '<b>' + fmtKm1(cp.dist - d) + ' km</b> · ' + (cp.reroute ? '<i class="chip rr">nova rota</i>' : (sfTxt || (cp.ele ? cp.ele + ' m' : ''))) : '';
  $('mName').textContent = $('nbName').textContent; $('mSub').innerHTML = $('nbSub').innerHTML;
  if (tn) { $('tcArrow').innerHTML = svgArrow(tn.kind || tn.dir, tn.dir); $('tcDist').textContent = tn.dist - d < 950 ? Math.round((tn.dist - d) / 10) * 10 + ' m' : fmtKm1(tn.dist - d) + ' km'; $('tcSub').textContent = tn.road || tn.label || tn.txt; }
  else { $('tcArrow').innerHTML = svgArrow('reto'); $('tcDist').textContent = fmtKm1(rem) + ' km'; $('tcSub').textContent = 'reto'; }
  // telemetria
  const L = S.live;
  if (L) {
    $('tV').textContent = n1(L.v); $('tG').textContent = n1(L.grade); $('tDone').textContent = fmtKm1(d); $('tVam').textContent = n0(L.vam); $('tEle').textContent = n0(L.ele); $('tUp').textContent = n0(L.upRem);
    // resumo: FC e cadência quando há sensor; senão VAM e subida restante (a velocidade já está no velocímetro)
    const sn = S.sensors || {};
    if (sn.hr) { $('mV').textContent = n0(sn.hr); $('mVu').textContent = 'bpm'; $('mVl').textContent = 'FC'; } else { $('mV').textContent = n0(L.vam); $('mVu').textContent = 'm/h'; $('mVl').textContent = 'VAM'; }
    if (sn.cad) { $('mG').textContent = n0(sn.cad); $('mGu').textContent = 'rpm'; $('mGl').textContent = 'cadência'; } else { $('mG').textContent = n0(L.upRem); $('mGu').textContent = 'm'; $('mGl').textContent = 'a subir'; }
    const cl = L.climb, ctxEl = $('ctx');
    if (cl) { ctxEl.hidden = false; ctxEl.className = 'climb'; ctxEl.innerHTML = `<div class="cat">${cl.cat}</div><div class="t"><b>${cl.name}</b><span>${cl.n} de ${st.climbs.length} · próx. 500 m a ${n1(L.gradeAhead)} %</span><div class="bar"><i style="width:${Math.round(L.climbPct * 100)}%"></i></div></div><div class="r"><b>${fmtKm1(L.climbLeft)} km</b><span>para o topo</span></div>`; }
    else if (S.light && S.light.remaining < 5400) { ctxEl.hidden = false; ctxEl.className = 'light'; const mins = Math.max(0, S.light.remaining / 60); ctxEl.innerHTML = `<div class="t"><b>Luz do dia</b><span>pôr do sol ${fmtH(S.light.sunset)} · civil até ${fmtH(S.light.civil)}</span></div><div class="r"><b>${fmtMin(mins)}</b><span>de sol</span></div>`; }
    else ctxEl.hidden = true;
  }
  // abastecer
  const F = S.fuelStatus;
  if (F) {
    const P = S.fuelPlan || { drinkEveryMin: 12, eatEveryMin: 25, sipMl: 150, biteG: 30 };
    const card = (idCard, idN, idBar, next, every, label) => {
      const el = $(idCard); if (!el) return; const due = next <= 0;
      $(idN).textContent = due ? 'AGORA' : 'em ' + fmtMin(next);
      $(idBar).style.width = Math.round(Math.max(0, Math.min(1, 1 - next / every)) * 100) + '%';
      el.classList.toggle('due', due); el.classList.toggle('soon', !due && next <= 3);
    };
    card('fcD', 'fDn', 'fDBar', F.nextDrinkMin, P.drinkEveryMin, 'beber'); card('fcE', 'fEn', 'fEBar', F.nextEatMin, P.eatEveryMin, 'comer');
    card('mcD', 'mWn', 'mDBar', F.nextDrinkMin, P.drinkEveryMin, 'beber'); card('mcE', 'mCn', 'mEBar', F.nextEatMin, P.eatEveryMin, 'comer');
    const tot = (idV, idBar, idMark, v, plan, total, fmt, unit) => { $(idV).innerHTML = fmt(v) + '<small> de ' + fmt(total) + ' ' + unit + '</small>'; $(idBar).style.width = Math.min(100, total ? v / total * 100 : 0) + '%'; $(idMark).style.left = Math.min(100, total ? plan / total * 100 : 0) + '%'; };
    tot('fWv', 'fWBar', 'fWMark', F.water / 1000, F.waterPlan / 1000, F.waterTotal / 1000, n1, 'L'); tot('fCv', 'fCBar', 'fCMark', F.carbs, F.carbsPlan, F.carbsTotal, n0, 'g');
    const behind = F.water < F.waterPlan * 0.8 && F.waterPlan > 300;
    $('fNext').innerHTML = 'garrafas ≈ <b>' + n1(F.bottles) + '</b>' + (S.waterAhead ? ' · fonte a <b>' + Math.round(S.waterAhead) + ' m</b>' : '') + (behind ? ' · <b class="late">água atrasada</b>' : '');
    const bd = $('fDrink'), be = $('fEat'); if (bd) bd.innerHTML = 'Bebi<small>' + Math.round(P.sipMl) + ' ml</small>'; if (be) be.innerHTML = 'Comi<small>' + Math.round(P.biteG) + ' g</small>';
    const off = F.off || {}; $('fcD').classList.toggle('offm', !!off.water); $('fcE').classList.toggle('offm', !!off.carbs); const fw = $('fWv').closest('div'), fc = $('fCv').closest('div'); if (fw) fw.hidden = !!off.water; if (fc) fc.hidden = !!off.carbs;
    const fx = $('fExtra'); if (fx) { const xs = F.extras || []; fx.hidden = !xs.length; fx.innerHTML = xs.map(x => `<div class="xrow${x.nextMin === 0 ? ' due' : ''}"><div class="xl"><b>${esc(x.name)}</b><span>${n0(x.taken)} de ${n0(x.total)} ${esc(x.unit)}${x.nextMin != null ? ' · ' + (x.nextMin === 0 ? 'agora' : 'em ' + fmtMin(x.nextMin)) : ''}</span><div class="bar"><i style="width:${Math.min(100, x.total ? x.taken / x.total * 100 : 0)}%"></i></div></div><button data-fuel="${x.id}">Tomei<small>${n0(x.dose)} ${esc(x.unit)}</small></button></div>`).join(''); }
  }
  // perfil
  if (S.tab === 'prof') {
    drawProfile(S.mode === 'resumo' ? $('spark') : $('prof'), st, d, S.theme, { labels: S.mode !== 'resumo', paradas: S.paradas });
    const ahead = st.climbs.filter(c => c.to > d);
    $('pAhead').innerHTML = `<div><b>${ahead.length}</b><span>subidas</span></div><div><b>${n0(L ? L.upRem : 0)}</b><span>m a subir</span></div><div><b>${n0(rem / 1000)}</b><span>km restam</span></div>`;
    const cl = L && L.climb; $('mProfTxt').innerHTML = cl ? `<span>${cl.cat} · topo em <b>${fmtKm1(L.climbLeft)} km</b></span><span><b>${n0(L.upRem)} m</b> a subir</span>` : `<span>${ahead.length} subidas à frente</span><span><b>${n0(L ? L.upRem : 0)} m</b> a subir</span>`;
    terrainStrip($('terr'), st); terrainStrip($('mTerr'), st);
  }
  // écart estilo TV: diferença para o plano do guia (à frente em verde, atrás em vermelho)
  const ec = S.ecart, eb = $('ecart');
  if (eb) {
    if (false && ec && ec.now != null && sess.state !== 'idle') { const g = ec.now; eb.hidden = false; eb.className = 'ecart ' + (g > 2 ? 'ec-late' : g < -2 ? 'ec-ahead' : ''); eb.innerHTML = '<span>écart</span><b>' + (g > 0 ? '+' : g < 0 ? '−' : '') + fmtGap(Math.abs(g)) + '</b>'; }
    else eb.hidden = true;
  }
  const pl = $('passages');
  if (pl && S.tab === 'prof') {
    if (ec && ec.items.length) pl.innerHTML = ec.items.map(it => `<li${it.dist <= d ? ' class="done"' : ''}><span class="k">${it.kind === 'cat' ? '<i class="catf">' + it.cat + '</i>' : it.kind === 'start' ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 2h2v20H5zm3 2h10l-3 4 3 4H8z"/></svg>' : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 2h2v20H5zm3 2h4v4H8zm4 4h4v4h-4zm4-4h4v4h-4zm-8 8h4v4H8zm8 0h4v4h-4zm-4-4h4v4h-4z"/></svg>'}</span><span class="nm">${it.name}</span><span class="t">${fmtMinH(it.plan)}</span><span class="t">${it.eta == null ? '–' : fmtMinH(it.eta)}</span><span class="g ${it.gap == null ? '' : it.gap > 2 ? 'late' : it.gap < -2 ? 'ahead' : ''}">${it.gap == null ? '' : (it.gap > 0 ? '+' : it.gap < 0 ? '−' : '') + fmtGap(Math.abs(it.gap))}</span></li>`).join('');
    else pl.innerHTML = '';
  }
  // números soltos sobre o mapa (F2): velocidade à esquerda, rampa à direita, sempre visíveis
  const sp = $('speedo'), gr = $('grade'); sp.hidden = !L; if (gr) gr.hidden = !L;
  if (L) { initSpeedo(); const v = L.v < 2 ? 0 : L.v; $('spV').textContent = Math.round(v); const nd = $('spNeedle'); if (nd) nd.setAttribute('transform', 'rotate(' + spAngle(v).toFixed(1) + ' 60 60)'); const pk = $('spPlan'); if (pk) { if (S.planSpeed > 0) { pk.removeAttribute('hidden'); pk.setAttribute('transform', 'rotate(' + spAngle(S.planSpeed).toFixed(1) + ' 60 60)'); } else pk.setAttribute('hidden', ''); } /* elemento SVG não tem .hidden */ const g = $('spG'); g.textContent = (L.grade > 0 ? '+' : '') + n1(L.grade) + ' %'; g.className = 'g' + (L.grade >= 3 ? ' up' : L.grade <= -3 ? ' down' : ''); sp.style.bottom = (S.scaleBottom + 22) + 'px'; if (gr) gr.style.bottom = (S.scaleBottom + 26) + 'px'; }
  const plc = $('place'); if (plc) { plc.textContent = S.place || ''; plc.hidden = !S.place; plc.style.bottom = (S.scaleBottom + 150) + 'px'; }   // acima do velocímetro (118 px)
  $('gpsSt').textContent = S.gpsMsg || '';
  $('clock').textContent = fmtH(new Date());
}
// velocímetro B (Anna, 06/09/2026): escala fixa 0–60 km/h em 120° no topo, como o mostrador da transmissão do Tour.
// O arco é a escala (não cresce com a velocidade); o ponteiro dá o valor; a marca branca é a média que o plano pede.
const SP_MAX = 60, SP_SWEEP = 120, SP_COLS = [[14, 154, 76], [255, 210, 0], [255, 138, 0], [228, 0, 43]], SP_STOPS = [0, .5, .78, 1];   // verde, amarelo, laranja, vermelho (tokens.json ui)
function spAngle(v) { return -SP_SWEEP / 2 + SP_SWEEP * Math.max(0, Math.min(1, v / SP_MAX)); }
function spPol(r, deg) { const a = (deg - 90) * Math.PI / 180; return [60 + r * Math.cos(a), 60 + r * Math.sin(a)]; }
function spColor(t) { let i = 0; while (i < SP_STOPS.length - 2 && t > SP_STOPS[i + 1]) i++; const a = SP_COLS[i], b = SP_COLS[i + 1], f = (t - SP_STOPS[i]) / (SP_STOPS[i + 1] - SP_STOPS[i]); return 'rgb(' + a.map((x, k) => Math.round(x + (b[k] - x) * f)).join(',') + ')'; }
function initSpeedo() {
  const sc = $('spScale'); if (!sc || sc.childElementCount) return;
  const N = 48, a0 = -SP_SWEEP / 2; let s = '';
  for (let i = 0; i < N; i++) { const p = spPol(45, a0 + SP_SWEEP * i / N - .4), q = spPol(45, a0 + SP_SWEEP * (i + 1) / N + .4); s += `<path d="M${p[0].toFixed(2)} ${p[1].toFixed(2)} A45 45 0 0 1 ${q[0].toFixed(2)} ${q[1].toFixed(2)}" stroke="${spColor((i + .5) / N)}"/>`; }
  const e0 = spPol(45, a0), e1 = spPol(45, a0 + SP_SWEEP); s += `<circle cx="${e0[0].toFixed(2)}" cy="${e0[1].toFixed(2)}" r="3" fill="${spColor(0)}"/><circle cx="${e1[0].toFixed(2)}" cy="${e1[1].toFixed(2)}" r="3" fill="${spColor(1)}"/>`;
  sc.innerHTML = s;
  let t = ''; for (let k = 0; k <= SP_MAX; k += 10) { const p = spPol(39.5, spAngle(k)), q = spPol(36.5, spAngle(k)); t += `<line x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${q[0].toFixed(1)}" y2="${q[1].toFixed(1)}"/>`; }
  $('spTicks').innerHTML = t;
}

// tela 04 · Chegada: papel inteiro, o dia na fita, pódio com o maillot do dia, diferença para o plano; no Diário, a última vez
export function arrivalHtml(r, S, st, ec, prev, maillot) {
  const code = r.diario ? 'SP' : (/^\d/.test(r.stageKey) ? 'E' + r.stageKey : r.stageKey);
  const dest = r.dest || String(r.name).replace(/^E\S+ /, '').split('→').pop().split('·')[0].trim();
  const vp = r.vsPlan, when = r.finishedAt ? fmtH(new Date(r.finishedAt)) : '–:–';
  const plano = vp == null ? '' : `<i${vp > 0 ? ' class="late"' : ''}>${vp === 0 ? 'na hora' : fmtMin(vp) + (vp > 0 ? ' atrasado' : ' adiantado')}</i>${S.planArrival ? ' · plano ' + S.planArrival : ''}`;
  const sub = r.diario ? 'Diário · ' + n1(r.km) + ' km · ' + n0(r.up) + ' m' : String(S.allParadas && S.allParadas.dias ? S.allParadas.dias[r.stageKey] || '' : '').trim() + ' · ' + n1(r.planKm) + ' km · ' + n0(r.planUp) + ' m';
  const type = r.diario ? 'blanc' : (r.type || 'blanc');
  const podium = `<div class="podium"><div class="step s2">${maillot('vert', 34)}<b>${n1(r.avg)}</b><span>média km/h</span></div><div class="step s1">${maillot(type, 46)}<b>${fmtT(r.moving)}</b><span>em movimento${r.diario ? '' : ' · maillot ' + ({ pois: 'à pois', jaune: 'jaune', vert: 'vert', blanc: 'blanc' }[type] || '')}</span></div><div class="step s3">${maillot('pois', 34)}<b>${Math.round(r.up)}</b><span>m subidos</span></div></div>`;
  let pass = '';
  if (!r.diario && ec && ec.items) { const its = ec.items.filter(it => it.kind === 'cat' && it.eta != null); if (its.length) pass = its.map(it => `${esc(it.name)} <b>${fmtMinH(it.eta)}</b> ${it.gap == null ? '' : `<i${it.gap > 2 ? ' class="late"' : ''}>${it.gap > 0 ? '+' : '−'}${Math.abs(Math.round(it.gap))}</i>`}`).join(' · '); }
  if (pass || r.vmax) pass = `<div class="pass">${pass}${pass ? ' · ' : ''}máxima <b>${n1(r.vmax)} km/h</b></div>`;
  let trip = '';
  if (!r.diario && st) trip = `<div class="pass">Viagem · ${st.n} de 8 etapas · <b>${fmtT(st.moving)}</b> em movimento · <b>${n0(st.up)} m</b> subidos</div>`;
  if (r.diario) trip = prev ? `<div class="pass">Última vez até ${esc(r.dest)}: <b>${fmtT(prev.moving)}</b> · média <b>${n1(prev.avg)} km/h</b> · hoje ${r.moving < prev.moving ? '<i>' + fmtMin((prev.moving - r.moving) / 60) + ' mais rápido</i>' : '<i class="late">' + fmtMin((r.moving - prev.moving) / 60) + ' mais lento</i>'}</div>` : `<div class="pass">Primeira vez até ${esc(r.dest)} registrada no Diário.</div>`;
  return `<div class="arrive"><div class="hd"><div class="code m-${type}">${code}</div><div class="nm"><b>${esc(String(r.name).replace(/^E\S+ /, '').split(' · ')[0])}</b><span>${esc(sub)}</span></div></div>
  <div class="big">Chegada</div><div class="where">${esc(dest)} · ${when}</div><div class="when">${plano || (r.diario ? n1(r.km) + ' km em ' + fmtT(r.moving) : '')}</div>
  <canvas id="arrProf" class="arrprof"></canvas>${podium}${pass}${trip}</div>`;
}
// folha Parado (tela 03): seis números fixos, abastecimento com o botão amarelo só no que venceu, some sozinha ao andar
export function paradoPanel(S) {
  const el = $('paradoBody'); if (!el) return;
  const L = S.live || {}, F = S.fuelStatus, d = S.proj.dist || 0, sess = S.session, now = Date.now(), moving = session.movingTime(sess, now);
  const since = S.stillAt ? Math.max(0, Math.round((now - S.stillAt) / 1000)) : 0, mm = Math.floor(since / 60), ss = since % 60;
  const eta = S.eta && S.eta.arrival ? fmtH(S.eta.arrival) : '–:–', vp = S.vsPlan;
  const etaSub = vp == null ? 'chegada prevista' : 'chegada · ' + (vp > 0 ? '+' : '−') + fmtMin(vp) + (vp > 0 ? ' atrasado' : ' adiantado');
  const place = S.place || (S.next && S.next.cp ? 'perto de ' + S.next.cp.name : '');
  el.innerHTML = `<div class="parado-t"><h4>Parado</h4><div class="tm">${mm}:${String(ss).padStart(2, '0')}<small>min</small></div></div>
  <div class="sub">${esc(place)}${place ? ' · ' : ''}km ${fmtKm1(d)}${S.stillAt ? ' · desde ' + fmtH(new Date(S.stillAt)) : ''}</div>
  <div class="lbl">Até aqui</div>
  <div class="tiles"><div><b>${fmtKm1(d)}<small>km</small></b><span>feitos</span></div><div><b>${fmtT(moving)}</b><span>em movimento</span></div><div><b>${n1(L.avg)}</b><span>média km/h</span></div>
  <div><b>${n0(L.upRem)}<small>m</small></b><span>a subir</span></div><div class="${vp == null ? '' : vp > 10 ? 'late' : 'g'}"><b>${eta}</b><span>${etaSub}</span></div><div><b>${n0(L.ele)}<small>m</small></b><span>altitude</span></div></div>
  ${F && (!F.off || !F.off.water || !F.off.carbs) ? '<div class="lbl">Abastecer</div>' : ''}
  ${F && !(F.off && F.off.water) ? `<div class="fuelrow${F.nextDrinkMin === 0 ? ' due' : ''}"><div class="fl"><b>Água</b><span>${n1(F.water / 1000)} de ${n1(F.waterTotal / 1000)} L · ${F.nextDrinkMin === 0 ? 'gole agora' : 'próximo em ' + fmtMin(F.nextDrinkMin)}</span><div class="bar"><i style="width:${Math.min(100, F.waterTotal ? F.water / F.waterTotal * 100 : 0)}%"></i></div></div><button data-fuel="drink">Bebi<small>${Math.round((S.fuelPlan || {}).sipMl || 150)} ml</small></button></div>` : ''}
  ${F && !(F.off && F.off.carbs) ? `<div class="fuelrow${F.nextEatMin === 0 ? ' due' : ''}"><div class="fl"><b>Carboidrato</b><span>${n0(F.carbs)} de ${n0(F.carbsTotal)} g · ${F.nextEatMin === 0 ? 'mordida agora' : 'próxima em ' + fmtMin(F.nextEatMin)}</span><div class="bar"><i style="width:${Math.min(100, F.carbsTotal ? F.carbs / F.carbsTotal * 100 : 0)}%"></i></div></div><button data-fuel="eat">Comi<small>${Math.round((S.fuelPlan || {}).biteG || 30)} g</small></button></div>` : ''}
  <div class="note">Some sozinha quando você voltar a andar. A parada entra no registro com o lugar.</div>`;
}
function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function terrainStrip(el, st) {
  if (!el || el.dataset.k === st.key) return; el.dataset.k = st.key;
  if (!st.surfaces.length) { el.innerHTML = '<i class="a" style="width:100%"></i>'; return; }
  el.innerHTML = st.surfaces.map(s => `<i class="${s.kind === 'asfalto' ? 'a' : s.kind === 'gravel' ? 'g' : 't'}" style="width:${(s.to - s.from) / st.total * 100}%"></i>`).join('');
}
export function setTab(S, tab) { S.tab = tab; document.querySelectorAll('.cb button').forEach(d => d.classList.toggle('on', S.mode === 'full' && d.dataset.tab === tab)); document.querySelectorAll('.pane').forEach(p => p.hidden = p.dataset.tab !== tab); document.querySelectorAll('.mini').forEach(p => p.hidden = p.dataset.tab !== tab); }
export function setMode(S, mode) { S.mode = mode; $('panel').classList.toggle('resumo', mode === 'resumo'); }
export function theme(mode, S) {
  const night = mode === 'night' || (mode === 'auto' && S.light && S.light.remaining < 0 && S.light.remaining > -14 * 3600) || (mode === 'auto' && !S.light && tzHour(Date.now()) >= 19);
  document.documentElement.setAttribute('data-theme', night ? 'night' : 'day'); return night ? 'night' : 'day';
}
// prévia do dia: tudo o que se lê na véspera. day = routes.days[key]; b = guide.briefing()
export function previewHtml(stage, day, b, paradas, sun) {
  const d = day || {}, code = /^\d/.test(stage.key) ? 'E' + stage.key : stage.key;
  const tl = (d.timeline || []).map(t => `<li><span class="h">${t[0]}</span><span class="k">${t[1] ? 'km ' + t[1] : ''}</span><span>${t[2]}</span></li>`).join('');
  const sights = paradas.filter(p => p.kind !== 'compras').map(p => `<li><span class="k">km ${Math.round(p.km)}</span><span><span class="chipk ${p.kind}">${p.kind}</span>${p.nome}${p.min ? ' · ' + fmtMin(p.min) : ''}<small>${p.oque || ''}</small></span></li>`).join('');
  const shops = paradas.filter(p => p.kind === 'compras').map(p => `<li${p.nivel === 1 ? ' class="n1"' : ''}><span class="k">km ${Math.round(p.km)}</span><span>${p.nome}<small>${p.horario || ''}${p.oque ? ' · ' + p.oque : ''}</small></span></li>`).join('');
  const climbs = stage.climbs.map(c => `<li><span class="k">km ${Math.round(c.from / 1000)}</span><span><span class="chipk">${c.cat}</span>${c.name} · ${(c.len / 1000).toFixed(1).replace('.', ',')} km a ${c.pct.toFixed(1).replace('.', ',')} % · +${c.gain} m</span></li>`).join('');
  const bornes = stage.cps.map(c => `<li><span class="k">km ${c.kmLabel}</span><span>${c.full}${c.ele ? ' · ' + c.ele + ' m' : ''}</span></li>`).join('');
  const h = d.hotel;
  return `<div class="pv m-${stage.type}">
  <div class="hd"><div class="eyebrow">${d.dia || b.day || ''}${d.sol ? ' · sol ' + d.sol : ''}</div><h3>${code} ${d.titulo || stage.name.replace(/^E\S+ /, '')}</h3><div class="sub">${d.sub || ''}${d.tipo ? ' · ' + d.tipo : ''}</div>${stage.type === 'pois' ? '<div class="pois-line"></div>' : ''}</div>
  <div class="row3"><div><b>${stage.km}</b><span>km</span></div><div><b>${stage.up}</b><span>m subida</span></div><div><b>${d.saida || '–'}</b><span>saída</span></div><div><b>${d.chegada || '–'}</b><span>chegada</span></div></div>
  <div id="pvWx"></div>
  <div class="dio"><canvas class="dio3d" id="pvDio"></canvas><canvas class="map" id="pvMap" hidden></canvas><div class="dio-ctl"><button data-v="dio" class="on">Maquete</button><button data-v="sat">Satélite</button><button data-v="map">Mapa</button></div><div class="dio-hint">montando a maquete…</div></div>
  <canvas class="prof" id="pvProf"></canvas>
  ${d.intro ? `<p>${d.intro}</p>` : ''}
  ${b.critical.length ? `<h4>Não esquecer</h4><ul>${b.critical.map(p => `<li class="n1">${p.aviso}</li>`).join('')}</ul>` : ''}
  <h4>Cronograma</h4><ul>${tl}</ul>
  ${climbs ? `<h4>Subidas</h4><ul>${climbs}</ul>` : ''}
  <h4>Paradas · ${fmtMin(b.mins)}</h4><ul>${sights}</ul>
  ${shops ? `<h4>Compras e horários</h4><ul>${shops}</ul>` : ''}
  <h4>Bornes</h4><ul>${bornes}</ul>
  ${d.estradas ? `<h4>Estradas</h4><p>${d.estradas}</p>` : ''}
  ${d.comida ? `<h4>Comida e água</h4><p>${d.comida}</p>${d.agua && d.agua.length ? `<p>Água: ${d.agua.join(', ')}.</p>` : ''}` : ''}
  ${h ? `<h4>Hospedagem</h4><div class="card"><b>${h.nome || ''}</b>${h.end || ''}${h.tel ? '<br>' + h.tel : ''}${h.checkin ? '<br>Check-in: ' + h.checkin : ''}${h.bike ? '<br>Bike: ' + h.bike : ''}${h.obs ? '<br><small>' + h.obs + '</small>' : ''}</div>` : ''}
  ${d.alertas && d.alertas.length ? `<h4>Alertas</h4><ul>${d.alertas.map(a => `<li>${a}</li>`).join('')}</ul>` : ''}
  ${d.planob ? `<h4>Plano B</h4><p>${d.planob}</p>` : ''}
  ${d.hospital || d.bike_shop ? `<h4>Se der problema</h4>${d.hospital ? `<p><b>Hospital:</b> ${d.hospital}</p>` : ''}${d.bike_shop ? `<p><b>Bicicletaria:</b> ${d.bike_shop}</p>` : ''}` : ''}
  <h4>Horários da região</h4><ul>${b.regras.map(r => `<li><small style="font-size:.85rem;color:var(--ink)">${r}</small></li>`).join('')}</ul>
  </div>`;
}
export function tripHtml(routes, reports) {
  const keys = Object.keys(routes.stages).filter(k => k !== '4b');
  let km = 0, up = 0;
  const items = keys.map(k => { const s = routes.stages[k], d = (routes.days || {})[k] || {}, r = reports[k]; km += s.km; up += s.up; return `<li data-k="${k}"><span class="code m-${(routes.types || {})[k] || 'blanc'}">${/^\d/.test(k) ? 'E' + k : k}</span><span><b style="font-family:var(--fd);font-size:1.15rem;text-transform:uppercase;display:block;line-height:1">${d.titulo || routes.names[k]}</b><small>${d.dia || ''}${d.sub ? ' · ' + d.sub : ''}${r ? ' · feita: ' + (Math.round(r.km * 10) / 10) + ' km' : ''}</small></span><span class="r">${s.km}<small>km · ${s.up} m</small></span></li>`; }).join('');
  return `<div class="pv"><div class="hd"><div class="eyebrow">Étape · a viagem</div><h3>8 etapas · ${Math.round(km)} km</h3><div class="sub">${Math.round(up).toLocaleString('pt-BR')} m de subida · 22 a 29 de outubro de 2026</div></div><ul class="trip">${items}</ul><p style="color:var(--muted);font-size:.82rem">Toque numa etapa para ver a prévia do dia.</p></div>`;
}
export function briefingHtml(b, stage) {
  const crit = b.critical.map(p => `<li><b>${p.aviso}</b></li>`).join('');
  const items = b.items.filter(p => p.kind !== 'compras').map(p => `<li><span class="k">km ${Math.round(p.km)}</span> ${p.nome} <small>${p.min ? fmtMin(p.min) : ''}${p.kind === 'opcional' ? ' · opcional' : ''}</small></li>`).join('');
  return `<div class="brief"><div class="eyebrow">${b.day}${b.sunday ? ' · DOMINGO: comércio fechado' : b.monday ? ' · segunda: lojas fechadas de manhã' : ''}</div><h3>${stage.name}</h3>
  <div class="row3"><div><b>${stage.km}</b><span>km</span></div><div><b>${stage.up}</b><span>m subida</span></div><div><b>${fmtMin(b.mins)}</b><span>de paradas</span></div></div>
  ${crit ? `<h4>Não esquecer</h4><ul class="crit">${crit}</ul>` : ''}
  <h4>Paradas do dia</h4><ul class="list">${items}</ul>
  <h4>Horários da região</h4><ul class="rules">${b.regras.map(r => `<li>${r}</li>`).join('')}</ul></div>`;
}
