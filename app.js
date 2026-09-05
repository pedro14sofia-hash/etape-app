// Étape Navegar · app.js
// Composição: liga os módulos e controla o ciclo de vida.
import { mercX, mercY } from './geo.js';
import { loadMap, loadRoutes, loadParadas, poisNear } from './data-mod.js';
import { createRenderer } from './render.js';
import * as track from './track.js';
import * as gps from './gps.js';
import * as guide from './guide.js';
import * as voice from './voice.js';
import * as ui from './ui.js';
import * as store from './store.js';
import * as session from './session.js';
import * as telemetry from './telemetry.js';
import * as fuel from './fuel.js';
import * as report from './report.js';

const $ = id => document.getElementById(id);
const code = k => /^\d/.test(k) ? 'E' + k : k;
const S = { map: null, routes: null, stage: null, paradas: [], proj: { idx: 0, dist: 0, off: 0 }, fix: null, prev: null, off: false, offSince: 0, session: null, log: [], fuel: null, fuelPlan: null, live: null, eta: null, next: {}, follow: true, mode: 'full', tab: 'tele', theme: 'day', prefs: store.prefs(), scaleBottom: 380, hist: [], planArrival: null };
let R, panelTimer = null;

export function init() {
  S.map = loadMap(); S.routes = loadRoutes(); S.allParadas = loadParadas();
  R = createRenderer($('map'));
  const sel = $('stageSel'); for (const k in S.routes.stages) { const o = document.createElement('option'); o.value = k; o.textContent = code(k); sel.appendChild(o); }
  sel.onchange = () => selectStage(sel.value);
  ui.bindGestures($('map'), R, () => { if (S.follow) { S.follow = false; $('btnFollow').classList.remove('on'); R.setView(null, null, null, 0); } });
  // zoom manual desliga o zoom automático por 45 s
  $('zin').onclick = () => { S.userZoomAt = Date.now(); R.setView(null, null, R.view.z + 0.7); }; $('zout').onclick = () => { S.userZoomAt = Date.now(); R.setView(null, null, R.view.z - 0.7); };
  $('map').addEventListener('wheel', () => { S.userZoomAt = Date.now(); }); $('map').addEventListener('pointerdown', e => { if (e.isPrimary === false) S.userZoomAt = Date.now(); });
  $('btnFollow').onclick = () => { S.follow = true; $('btnFollow').classList.add('on'); S.userZoomAt = 0; if (S.fix) { R.centerOn(S.fix.lat, S.fix.lon); if (R.view.z < 15) R.setView(null, null, 16.2); } };
  $('btnVoice').onclick = () => { const on = voice.isMuted(); if (on) voice.unmute(); else voice.mute(); S.prefs.voice = on; store.setPrefs(S.prefs); $('btnVoice').classList.toggle('on', on); if (on) voice.say('Voz ligada.', 2); };
  $('btnTheme').onclick = () => { S.prefs.theme = S.theme === 'night' ? 'day' : 'night'; store.setPrefs(S.prefs); applyTheme(); };
  $('btnSession').onclick = toggleSession; $('btnFinish').onclick = finishStage; $('btnSim').onclick = toggleSim; $('btnReset').onclick = resetStage;
  $('btnBrief').onclick = showBriefing; $('btnReport').onclick = () => showReport(report.list()[S.stage.key]);
  document.querySelectorAll('#tabs div').forEach(d => d.onclick = () => { ui.setTab(S, d.dataset.tab); S.prefs.tab = d.dataset.tab; store.setPrefs(S.prefs); refresh(); });
  $('grab').onclick = () => setMode(S.mode === 'full' ? 'resumo' : 'full');
  $('btnMode').onclick = () => setMode(S.mode === 'full' ? 'resumo' : 'full');
  // gestos no painel: vertical alterna completo/resumo; horizontal troca a aba (também no resumo)
  const TABS = ['tele', 'fuel', 'prof']; let gy = null, gx = null;
  $('panel').addEventListener('pointerdown', e => { if (e.target.closest('button,select,.tabs')) return; gy = e.clientY; gx = e.clientX; });
  $('panel').addEventListener('pointerup', e => {
    if (gy == null) return; const dy = e.clientY - gy, dx = e.clientX - gx; gy = gx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { const i = TABS.indexOf(S.tab); const t = TABS[(i + (dx < 0 ? 1 : TABS.length - 1)) % TABS.length]; ui.setTab(S, t); S.prefs.tab = t; store.setPrefs(S.prefs); refresh(); return; }
    if (dy > 40) setMode('resumo'); else if (dy < -40) setMode('full');
  });
  $('fDrink').onclick = () => confirmFuel('drink'); $('fEat').onclick = () => confirmFuel('eat'); $('fSnooze').onclick = () => { fuel.snooze(S.fuel, 'drink'); fuel.snooze(S.fuel, 'eat'); refresh(); };
  $('mDrink').onclick = () => confirmFuel('drink'); $('mEat').onclick = () => confirmFuel('eat');
  $('cue').onclick = () => { voice.clearBanner(); };
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
  if (!S.prefs.voice) { voice.mute(); $('btnVoice').classList.remove('on'); } else $('btnVoice').classList.add('on');
  window.addEventListener('resize', () => { R.resize(); measurePanel(); });
  R.resize();
  selectStage(store.get('stage', '1'));
  ui.setTab(S, S.prefs.tab || 'tele'); setMode(typeof S.prefs.mode === 'string' ? S.prefs.mode : 'full');
  requestAnimationFrame(loop);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !new URLSearchParams(location.search).get('nosw')) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
    // versão nova instalada: recarrega quando não há etapa rodando
    let had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && S.session && S.session.state !== 'running') location.reload(); had = true; });
  }
  const q = new URLSearchParams(location.search);
  if (q.get('stage')) selectStage(q.get('stage'));
  if (q.get('mode')) setMode(q.get('mode'));
  if (q.get('theme')) { S.prefs.theme = q.get('theme'); applyTheme(); }
  if (q.get('tab')) { ui.setTab(S, q.get('tab')); }
  if (q.get('sim')) setTimeout(() => startSim(+q.get('sim') || 22, +(q.get('from') || 0) * 1000), 500);
  if (q.get('preview')) setTimeout(() => showPreview(q.get('preview')), 300);
  // ícones carregam de forma assíncrona: redesenha a prévia quando ficarem prontos
  document.addEventListener('etape:icons', () => { if (PV && $('dlgPreview').open) { PV.R2.invalidate(); PV.R2.draw(PV.S2); } });
}

export function selectStage(key) {
  if (!S.routes.stages[key]) key = Object.keys(S.routes.stages)[0];
  if (gps.running()) stopNavigation();
  S.stage = track.loadStage(S.routes, key); track.nameTurns(S.stage.turns, S.stage, S.map.index);
  store.set('stage', key); $('stageSel').value = key; $('stageName').textContent = S.stage.name.replace(/^E\S+ /, ''); $('stageSub').textContent = (S.allParadas.dias[key] || '') + ' · ' + S.stage.km + ' km · ' + S.stage.up + ' m';
  $('stageKey').textContent = code(key); $('stageCode').className = 'code m-' + S.stage.type;
  S.paradas = S.allParadas.itens.filter(p => p.stage === key).map(p => ({ ...p }));
  S.planArrival = (S.routes.plan || {})[key] || null;
  const prog = store.progress(key); for (const c of S.stage.cps) c.done = prog.done.includes(c.id); for (const p of S.paradas) { p.done = prog.sights.includes(p.id); }
  S.session = session.restore(key) || session.create(key);
  S.log = store.log(key); S.fuel = fuel.create(key); S.fuelPlan = fuel.plan(S.stage);
  S.proj = { idx: 0, dist: 0, off: 0 }; S.fix = null; S.prev = null; S.off = false; S.climbId = null; S.surface = ''; S.flamme = false; S.hist = [];
  if (S.log.length) { const l = S.log[S.log.length - 1]; S.proj = track.project(S.stage, l.lat, l.lon, track.idxAtDist(S.stage, l.dist)); }
  const b = S.stage.pts.reduce((a, p) => [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])], [90, 180, -90, -180]);
  R.setView((mercX(b[1]) + mercX(b[3])) / 2, (mercY(b[0]) + mercY(b[2])) / 2, 11.6, 0); R.view.anchorY = 0.45;
  S.next = guide.nextCue(S); S.live = telemetry.live(S.log, S.stage, S.session, Date.now(), session.movingTime(S.session, Date.now()));
  applyTheme(); refresh(); measurePanel();
  if (S.session.state === 'running') startNavigation(true);
}
function measurePanel() { S.scaleBottom = $('panel').offsetHeight + 8; $('attr').style.bottom = (S.scaleBottom + 4) + 'px'; }
function setMode(m) { ui.setMode(S, m); S.prefs.mode = m; store.setPrefs(S.prefs); R.view.anchorY = m === 'resumo' ? 0.6 : 0.45; $('btnMode').textContent = m === 'resumo' ? '▴' : '▾'; $('btnMode').classList.toggle('on', m === 'resumo'); refresh(); measurePanel(); }
function applyTheme() { S.theme = ui.theme(S.prefs.theme, S); R.setTheme(S.theme); }

export function startNavigation(silent) {
  const ok = gps.start(onFix, e => { S.gpsMsg = 'GPS: ' + (e.message || 'erro'); refresh(); });
  if (!ok) return;
  S.gpsMsg = 'GPS ligado'; S.follow = true; $('btnFollow').classList.add('on'); if (R.view.z < 16) R.setView(null, null, 16.2);
  gps.keepAwake(true);
  if (!silent) voice.announce({ level: 3, text: 'Navegação iniciada', sub: S.stage.name, speak: 'Navegação iniciada. ' + S.stage.name.replace(/^E\S+ /, '') });
}
export function stopNavigation() { gps.stop(); gps.keepAwake(false); S.gpsMsg = 'GPS desligado'; refresh(); }

export function toggleSession() {
  const now = Date.now(), s = S.session;
  if (s.state === 'idle') { session.start(s, now); startNavigation(); showBriefingOnce(); }
  else if (s.state === 'running') { session.pause(s, now, placeNow()); voice.announce({ level: 3, text: 'Pausa', sub: 'GPS segue ligado', speak: 'Pausa.' }); }
  else if (s.state === 'paused') { session.resume(s, now); if (!gps.running()) startNavigation(true); voice.announce({ level: 3, text: 'Retomada', speak: 'Retomando.' }); }
  refresh();
}
export function finishStage(force) {
  if (S.session.state === 'idle') return;
  if (!force && !confirm('Encerrar a etapa e gerar o relatório?')) return;
  session.finish(S.session, Date.now()); stopNavigation();
  telemetry.record(S.log, S.log[S.log.length - 1] || telemetry.sample({ t: Date.now(), lat: S.stage.pts[0][0], lon: S.stage.pts[0][1] }, S.stage, S.proj), S.stage.key, true);
  const r = report.build(S.stage, S.session, S.log, S.fuel, S.fuelPlan, S.paradas, S.planArrival); report.save(r); showReport(r);
}
function resetStage() { if (!confirm('Zerar progresso, sessão e registro desta etapa?')) return; stopNavigation(); store.clearStage(S.stage.key); selectStage(S.stage.key); }
function placeNow() {
  if (!S.fix) return null;
  const near = poisNear(S.map.poiIndex, S.fix.lat, S.fix.lon, 400, ['place:village', 'place:hamlet', 'place:town', 'bakery', 'water', 'pass', 'shop']);
  const place = near.length ? near[0].poi.n : (S.next.cp ? 'perto de ' + S.next.cp.name : '');
  return { dist: S.proj.dist, lat: S.fix.lat, lon: S.fix.lon, place };
}
function confirmFuel(kind) { fuel.confirm(S.fuel, S.fuelPlan, kind, session.movingTime(S.session, Date.now())); voice.banner(kind === 'drink' ? 'Bebeu 150 ml' : 'Comeu 30 g', 3); refresh(); }

function onFix(raw) {
  const fix = gps.smooth(raw, S.prev); if (!fix) return;
  const now = fix.t; S.prev = fix; S.fix = fix;
  S.hist.push({ t: now, lat: fix.lat, lon: fix.lon }); while (S.hist.length && now - S.hist[0].t > 600000) S.hist.shift();
  S.speed10 = gps.speedWindow(S.hist, 600);
  const sess = S.session, running = sess.state === 'running';
  if (running) session.trackStill(sess, { ...fix, dist: S.proj.dist }, now, S.next.cp ? 'perto de ' + S.next.cp.name : '');
  const events = running ? guide.tick(S, fix, now) : (S.proj = track.project(S.stage, fix.lat, fix.lon, S.proj.idx), []);
  if (running && !S.off) {
    const smp = telemetry.sample(fix, S.stage, S.proj, null); telemetry.record(S.log, smp, S.stage.key);
    const moving = session.movingTime(sess, now);
    events.push(...fuel.tick(S.fuel, S.fuelPlan, moving, now, { waterAhead: S.waterAhead }));
    events.push(...guide.shopWindow(S, S.speed10, now));
    S.live = telemetry.live(S.log, S.stage, sess, now, moving);
    S.fuelStatus = fuel.status(S.fuel, S.fuelPlan, moving, (S.stage.total - S.proj.dist) / 1000, S.speed10 * 3.6);
    const left = S.paradas.filter(p => p.kind !== 'compras' && p.kind !== 'opcional' && !p.done && !p.skipped && p.km * 1000 > S.proj.dist).reduce((a, p) => a + p.min, 0);
    // chegada prevista: recalculada a cada 15 min (ou quando ainda não há), não a cada posição
    if (!S.eta || !S.eta.arrival || now - (S.etaAt || 0) > 900000) { const e = guide.eta(S.stage, S.proj.dist, S.speed10, left); if (e.arrival) { S.eta = e; S.etaAt = now; S.vsPlan = guide.vsPlan(S.planArrival, e.arrival); } }
    S.light = guide.daylight(new Date(now), fix.lat, fix.lon);
    if (S.prefs.theme === 'auto') applyTheme();
  }
  for (const ev of events) handleEvent(ev);
  S.next = guide.nextCue(S);
  if (S.follow) {
    R.centerOn(fix.lat, fix.lon); R.setView(null, null, null, S.prefs.orientation === 'heading' ? -(fix.head || 0) * Math.PI / 180 : 0);
    // zoom automático pela velocidade: parado/subida 16,5 · normal 16 · descida rápida 15,5; suave, e só sem zoom manual recente
    if (now - (S.userZoomAt || 0) > 45000) { const v = fix.v || 0, target = v < 3 ? 16.5 : v < 9 ? 16 : 15.5; const z = R.view.z + (target - R.view.z) * 0.15; if (Math.abs(z - R.view.z) > 0.01) R.setView(null, null, z); }
  }
  R.invalidate(); refresh();
}
function handleEvent(ev) {
  if (ev.kind === 'checkpoint' || ev.kind === 'arrival') { const prog = store.progress(S.stage.key); if (!prog.done.includes(ev.cp.id)) prog.done.push(ev.cp.id); store.setProgress(S.stage.key, prog); session.mark(S.session, 'borne', { id: ev.cp.id, dist: ev.cp.dist }); }
  if (ev.kind === 'sight') { ev.right = '<button class="mini-btn" data-done="' + ev.parada.id + '">feito</button>'; }
  if (ev.kind === 'arrival') { ev.right = '<button class="mini-btn" data-finish>Encerrar</button>'; ev.hold = 120000; ev.level = 1; }
  if (ev.kind === 'turn300' || ev.kind === 'turn50') ev.right = '<span class="arr">' + ui.svgArrow(ev.turn.txt.includes('retorno') ? 'retorno' : ev.turn.dir) + '</span>';
  if (ev.kind === 'climbStart' || ev.kind === 'summit') session.mark(S.session, ev.kind, { dist: S.proj.dist });
  voice.announce(ev);
  const fb = $('cue').querySelector('[data-finish]'); if (fb) fb.onclick = e => { e.stopPropagation(); voice.clearBanner(); finishStage(true); };
  const b = $('cue').querySelector('[data-done]'); if (b) b.onclick = e => { e.stopPropagation(); const p = S.paradas.find(x => x.id === b.dataset.done); if (p) { p.done = true; const prog = store.progress(S.stage.key); prog.sights.push(p.id); store.setProgress(S.stage.key, prog); } voice.clearBanner(); };
}
function refresh() { if (panelTimer) return; panelTimer = setTimeout(() => { panelTimer = null; try { ui.panel(S); } catch (e) { console.error(e); } const h = $('panel').offsetHeight + 8; if (h !== S.scaleBottom) { measurePanel(); R.invalidate(); } }, 120); }
function loop() { R.draw(S); requestAnimationFrame(loop); }

function toggleSim() { if (gps.simulating()) { stopNavigation(); $('btnSim').classList.remove('on'); return; } startSim(22, S.proj.dist); }
function startSim(kmh, from) {
  stopNavigation(); if (S.session.state === 'idle') session.start(S.session, Date.now()); else if (S.session.state === 'paused') session.resume(S.session, Date.now());
  S.follow = true; $('btnFollow').classList.add('on'); R.setView(null, null, Math.max(R.view.z, 16.2)); S.gpsMsg = 'Simulação ' + kmh + ' km/h'; $('btnSim').classList.add('on');
  gps.simulate(S.stage, kmh, onFix, from, d => track.gradeAt(S.stage, d, 150));
}
function showBriefingOnce() { if (!store.get('brief:' + S.stage.key, false)) { store.set('brief:' + S.stage.key, true); showPreview(S.stage.key); } }
function showBriefing() { showPreview(S.stage.key); }
// prévia do dia: mapa inteiro, perfil, cronograma, paradas, compras, hospedagem; ou a viagem inteira
let PV = null;
function showPreview(key) {
  const dlg = $('dlgPreview'), tabs = $('pvTabs');
  const keys = Object.keys(S.routes.stages);
  tabs.innerHTML = keys.map(k => `<button data-k="${k}" class="m-${(S.routes.types || {})[k] || 'blanc'}${k === key ? ' on' : ''}">${code(k)}</button>`).join('') + '<button data-k="trip" class="trip' + (key === 'trip' ? ' on' : '') + '">Viagem</button>';
  tabs.querySelectorAll('button').forEach(b => b.onclick = () => showPreview(b.dataset.k));
  if (key === 'trip') {
    $('pvBody').innerHTML = ui.tripHtml(S.routes, report.list());
    $('pvBody').querySelectorAll('li[data-k]').forEach(li => li.onclick = () => showPreview(li.dataset.k));
    $('pvGo').hidden = true;
  } else {
    const st = key === S.stage.key ? S.stage : track.loadStage(S.routes, key);
    const paradas = S.allParadas.itens.filter(p => p.stage === key);
    const b = guide.briefing(st, S.allParadas.itens, S.allParadas.dias, S.allParadas.regras);
    $('pvBody').innerHTML = ui.previewHtml(st, (S.routes.days || {})[key], b, paradas);
    $('pvGo').hidden = false; $('pvGo').onclick = () => { dlg.close(); if (key !== S.stage.key) selectStage(key); };
    if (!dlg.open) dlg.showModal();            // o canvas só tem tamanho com o diálogo aberto
    // mapa inteiro, norte para cima, ajustado ao traçado
    const cv = $('pvMap'); const R2 = createRenderer(cv); R2.setTheme(S.theme); R2.resize();
    const bb = st.pts.reduce((a, p) => [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])], [90, 180, -90, -180]);
    const { W, H } = R2.size(); const dx = mercX(bb[3]) - mercX(bb[1]), dy = mercY(bb[0]) - mercY(bb[2]);
    const z = Math.log2(Math.min((W - 40) / Math.max(dx, 1e-9), (H - 40) / Math.max(dy, 1e-9)) / 256);
    R2.setView((mercX(bb[1]) + mercX(bb[3])) / 2, (mercY(bb[0]) + mercY(bb[2])) / 2, Math.min(15, z), 0); R2.view.anchorY = 0.5;
    const S2 = { map: S.map, routes: S.routes, stage: st, paradas, proj: { idx: 0, dist: 0, off: 0 }, fix: null, scaleBottom: 8, mode: 'full' };
    PV = { R2, S2 }; requestAnimationFrame(() => { R2.invalidate(); R2.draw(S2); });
    import('./render.js').then(m => m.drawProfile($('pvProf'), st, 0, S.theme, { labels: true }));
  }
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
}
function showReport(r) {
  if (!r) { alert('Sem relatório desta etapa ainda.'); return; }
  $('repBody').innerHTML = report.render(r);
  const sh = report.share(r, S.log);
  $('repShare').onclick = async () => { try { if (navigator.share) await navigator.share({ title: r.name, text: sh.text }); else { await navigator.clipboard.writeText(sh.text); alert('Resumo copiado.'); } } catch (e) { } };
  $('repGpx').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([sh.gpx], { type: 'application/gpx+xml' })); a.download = 'etape-' + r.stageKey + '.gpx'; a.click(); };
  $('dlgReport').showModal();
}
window.addEventListener('DOMContentLoaded', init);
