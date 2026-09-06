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
const ARROW = { esquerda: '<path d="M14 20V10a3 3 0 0 0-3-3H5"/><path d="M8 4L4 7l4 3"/>', direita: '<path d="M10 20V10a3 3 0 0 1 3-3h6"/><path d="M16 4l4 3-4 3"/>', reto: '<path d="M12 20V5"/><path d="M7 10l5-5 5 5"/>', retorno: '<path d="M8 20V8a4 4 0 0 1 8 0v4"/><path d="M12 9l4 3 4-3"/>' };
export const svgArrow = k => `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${ARROW[k] || ARROW.reto}</svg>`;
export const chip = k => k ? `<i class="chip ${k === 'asfalto' ? 'asf' : k === 'gravel' ? 'grv' : 'trl'}">${k}</i>` : '';

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
  $('eta').textContent = S.eta && S.eta.arrival ? fmtH(S.eta.arrival) : '–:–';
  const vp = S.vsPlan; $('vsplan').textContent = vp == null ? (S.planArrival ? 'plano ' + S.planArrival : '') : (vp > 0 ? '+' : '−') + fmtMin(vp); $('vsplan').className = vp == null ? '' : vp > 10 ? 'late' : 'ok';
  $('rem').textContent = fmtKm1(rem);
  $('btnSession').innerHTML = session.label(sess.state) + '<small>' + (sess.state === 'idle' ? 'etapa' : 'mov. ' + fmtT(moving)) + '</small>';
  $('btnSession').className = 'sbtn ' + sess.state;
  // linha da borne + curva
  const cp = S.next.cp, tn = S.next.turn, sf = surfaceAt(st, d), ch = nextSurfaceChange(st, d);
  $('nbName').textContent = cp ? cp.name : '–';
  const sfTxt = ch ? chip(ch.kind) + ' em ' + fmtKm1(ch.from - d) + ' km' : chip(sf);
  $('nbSub').innerHTML = cp ? '<b>' + fmtKm1(cp.dist - d) + ' km</b> · ' + (sfTxt || (cp.ele ? cp.ele + ' m' : '')) : '';
  $('mName').textContent = $('nbName').textContent; $('mSub').innerHTML = $('nbSub').innerHTML;
  if (tn) { $('tcArrow').innerHTML = svgArrow(tn.txt.includes('retorno') ? 'retorno' : tn.dir); $('tcDist').textContent = tn.dist - d < 950 ? Math.round((tn.dist - d) / 10) * 10 + ' m' : fmtKm1(tn.dist - d) + ' km'; $('tcSub').textContent = tn.road || tn.txt; }
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
    const set = (id, v, plan, total) => { $(id + 'Bar').style.width = Math.min(100, total ? v / total * 100 : 0) + '%'; $(id + 'Mark').style.left = Math.min(100, total ? plan / total * 100 : 0) + '%'; };
    set('fW', F.water, F.waterPlan, F.waterTotal); set('fC', F.carbs, F.carbsPlan, F.carbsTotal); set('fS', F.sodium, F.sodiumPlan, F.sodiumTotal);
    $('fWv').innerHTML = n1(F.water / 1000) + '<small>de ' + n1(F.waterTotal / 1000) + ' L</small>'; $('fCv').innerHTML = n0(F.carbs) + '<small>de ' + n0(F.carbsTotal) + ' g</small>'; $('fSv').innerHTML = n1(F.sodium / 1000) + '<small>de ' + n1(F.sodiumTotal / 1000) + ' g</small>';
    $('fNext').innerHTML = `<span>garrafa ≈ <b>${n1(F.bottles)}</b></span><span>beber em <b>${fmtMin(F.nextDrinkMin)}</b></span><span>comer em <b>${fmtMin(F.nextEatMin)}</b></span>`;
    $('mWv').textContent = n1(F.water / 1000) + ' L'; $('mWn').textContent = fmtMin(F.nextDrinkMin); $('mCv').textContent = n0(F.carbs) + ' g'; $('mCn').textContent = fmtMin(F.nextEatMin);
    $('mWBar').style.width = Math.min(100, F.waterTotal ? F.water / F.waterTotal * 100 : 0) + '%'; $('mWMark').style.left = Math.min(100, F.waterTotal ? F.waterPlan / F.waterTotal * 100 : 0) + '%';
    $('mCBar').style.width = Math.min(100, F.carbsTotal ? F.carbs / F.carbsTotal * 100 : 0) + '%'; $('mCMark').style.left = Math.min(100, F.carbsTotal ? F.carbsPlan / F.carbsTotal * 100 : 0) + '%';
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
    if (ec && ec.now != null && sess.state !== 'idle') { const g = ec.now; eb.hidden = false; eb.className = 'ecart ' + (g > 2 ? 'late' : g < -2 ? 'ahead' : ''); eb.innerHTML = '<span>écart</span><b>' + (g > 0 ? '+' : g < 0 ? '−' : '') + fmtGap(Math.abs(g)) + '</b>'; }
    else eb.hidden = true;
  }
  const pl = $('passages');
  if (pl && S.tab === 'prof') {
    if (ec && ec.items.length) pl.innerHTML = ec.items.map(it => `<li${it.dist <= d ? ' class="done"' : ''}><span class="k">${it.kind === 'cat' ? '<i class="catf">' + it.cat + '</i>' : it.kind === 'start' ? '▶' : '🏁'}</span><span class="nm">${it.name}</span><span class="t">${fmtMinH(it.plan)}</span><span class="t">${it.eta == null ? '–' : fmtMinH(it.eta)}</span><span class="g ${it.gap == null ? '' : it.gap > 2 ? 'late' : it.gap < -2 ? 'ahead' : ''}">${it.gap == null ? '' : (it.gap > 0 ? '+' : it.gap < 0 ? '−' : '') + fmtGap(Math.abs(it.gap))}</span></li>`).join('');
    else pl.innerHTML = '';
  }
  // velocímetro estilo Tour, só no resumo
  const sp = $('speedo'); sp.hidden = S.mode !== 'resumo';
  if (!sp.hidden && L) { $('spV').textContent = Math.round(L.v); const g = $('spG'); g.textContent = (L.grade > 0 ? '+' : '') + n1(L.grade) + ' %'; g.className = 'g' + (L.grade >= 3 ? ' up' : L.grade <= -3 ? ' down' : ''); sp.style.bottom = (S.scaleBottom + 22) + 'px'; }
  $('gpsSt').textContent = S.gpsMsg || '';
  $('clock').textContent = fmtH(new Date());
}
function terrainStrip(el, st) {
  if (!el || el.dataset.k === st.key) return; el.dataset.k = st.key;
  if (!st.surfaces.length) { el.innerHTML = '<i class="a" style="width:100%"></i>'; return; }
  el.innerHTML = st.surfaces.map(s => `<i class="${s.kind === 'asfalto' ? 'a' : s.kind === 'gravel' ? 'g' : 't'}" style="width:${(s.to - s.from) / st.total * 100}%"></i>`).join('');
}
export function setTab(S, tab) { S.tab = tab; document.querySelectorAll('#tabs div').forEach(d => d.classList.toggle('on', d.dataset.tab === tab)); document.querySelectorAll('.pane').forEach(p => p.hidden = p.dataset.tab !== tab); document.querySelectorAll('.mini').forEach(p => p.hidden = p.dataset.tab !== tab); }
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
