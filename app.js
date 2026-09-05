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
const S = { map: null, routes: null, stage: null, paradas: [], proj: { idx: 0, dist: 0, off: 0 }, fix: null, prev: null, off: false, offSince: 0, session: null, log: [], fuel: null, fuelPlan: null, live: null, eta: null, next: {}, follow: true, mode: 'full', tab: 'tele', theme: 'day', prefs: store.prefs(), scaleBottom: 380, hist: [], planArrival: null };
let R, panelTimer = null;

export function init() {
  S.map = loadMap(); S.routes = loadRoutes(); S.allParadas = loadParadas();
  R = createRenderer($('map'));
  const sel = $('stageSel'); for (const k in S.routes.stages) { const o = document.createElement('option'); o.value = k; o.textContent = 'E' + k; sel.appendChild(o); }
  sel.onchange = () => selectStage(sel.value);
  ui.bindGestures($('map'), R, () => { if (S.follow) { S.follow = false; $('btnFollow').classList.remove('on'); R.setView(null, null, null, 0); } });
  $('zin').onclick = () => R.setView(null, null, R.view.z + 0.7); $('zout').onclick = () => R.setView(null, null, R.view.z - 0.7);
  $('btnFollow').onclick = () => { S.follow = true; $('btnFollow').classList.add('on'); if (S.fix) { R.centerOn(S.fix.lat, S.fix.lon); if (R.view.z < 14) R.setView(null, null, 15); } };
  $('btnVoice').onclick = () => { const on = voice.isMuted(); if (on) voice.unmute(); else voice.mute(); S.prefs.voice = on; store.setPrefs(S.prefs); $('btnVoice').classList.toggle('on', on); if (on) voice.say('Voz ligada.', 2); };
  $('btnTheme').onclick = () => { S.prefs.theme = S.theme === 'night' ? 'day' : 'night'; store.setPrefs(S.prefs); applyTheme(); };
  $('btnSession').onclick = toggleSession; $('btnFinish').onclick = finishStage; $('btnSim').onclick = toggleSim; $('btnReset').onclick = resetStage;
  $('btnBrief').onclick = showBriefing; $('btnReport').onclick = () => showReport(report.list()[S.stage.key]);
  document.querySelectorAll('#tabs div').forEach(d => d.onclick = () => { ui.setTab(S, d.dataset.tab); S.prefs.tab = d.dataset.tab; store.setPrefs(S.prefs); setMode(S.prefs.mode[S.tab] || 'full'); });
  $('grab').onclick = () => setMode(S.mode === 'full' ? 'resumo' : 'full');
  let gy = null; $('panel').addEventListener('pointerdown', e => { if (e.target.closest('button,select,.pane,.tabs')) return; gy = e.clientY; });
  $('panel').addEventListener('pointerup', e => { if (gy == null) return; const dy = e.clientY - gy; gy = null; if (dy > 40) setMode('resumo'); else if (dy < -40) setMode('full'); });
  $('fDrink').onclick = () => confirmFuel('drink'); $('fEat').onclick = () => confirmFuel('eat'); $('fSnooze').onclick = () => { fuel.snooze(S.fuel, 'drink'); fuel.snooze(S.fuel, 'eat'); refresh(); };
  $('mDrink').onclick = () => confirmFuel('drink'); $('mEat').onclick = () => confirmFuel('eat');
  $('cue').onclick = () => { voice.clearBanner(); };
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
  if (!S.prefs.voice) { voice.mute(); $('btnVoice').classList.remove('on'); } else $('btnVoice').classList.add('on');
  window.addEventListener('resize', () => { R.resize(); measurePanel(); });
  R.resize();
  selectStage(store.get('stage', '1'));
  ui.setTab(S, S.prefs.tab || 'tele'); setMode(S.prefs.mode[S.tab] || 'full');
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
}

export function selectStage(key) {
  if (gps.running()) stopNavigation();
  S.stage = track.loadStage(S.routes, key); track.nameTurns(S.stage.turns, S.stage, S.map.index);
  store.set('stage', key); $('stageSel').value = key; $('stageName').textContent = S.stage.name.replace(/^E\S+ /, ''); $('stageSub').textContent = (S.allParadas.dias[key] || '') + ' · ' + S.stage.km + ' km · ' + S.stage.up + ' m';
  $('stageCode').firstChild.textContent = 'E' + key; $('stageCode').className = 'code m-' + S.stage.type;
  S.paradas = S.allParadas.itens.filter(p => p.stage === key).map(p => ({ ...p }));
  S.planArrival = (S.routes.plan || {})[key] || null;
  const prog = store.progress(key); for (const c of S.stage.cps) c.done = prog.done.includes(c.id); for (const p of S.paradas) { p.done = prog.sights.includes(p.id); }
  S.session = session.restore(key) || session.create(key);
  S.log = store.log(key); S.fuel = fuel.create(key); S.fuelPlan = fuel.plan(S.stage);
  S.proj = { idx: 0, dist: 0, off: 0 }; S.fix = null; S.prev = null; S.off = false; S.climbId = null; S.surface = ''; S.flamme = false; S.hist = [];
  if (S.log.length) { const l = S.log[S.log.length - 1]; S.proj = track.project(S.stage, l.lat, l.lon, -1); }
  const b = S.stage.pts.reduce((a, p) => [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])], [90, 180, -90, -180]);
  R.setView((mercX(b[1]) + mercX(b[3])) / 2, (mercY(b[0]) + mercY(b[2])) / 2, 11.6, 0); R.view.anchorY = 0.45;
  S.next = guide.nextCue(S); S.live = telemetry.live(S.log, S.stage, S.session, Date.now(), session.movingTime(S.session, Date.now()));
  applyTheme(); refresh(); measurePanel();
  if (S.session.state === 'running') startNavigation(true);
}
function measurePanel() { S.scaleBottom = $('panel').offsetHeight + 8; $('attr').style.bottom = (S.scaleBottom + 4) + 'px'; }
function setMode(m) { ui.setMode(S, m); S.prefs.mode[S.tab] = m; store.setPrefs(S.prefs); R.view.anchorY = m === 'resumo' ? 0.6 : 0.45; refresh(); measurePanel(); }
function applyTheme() { S.theme = ui.theme(S.prefs.theme, S); R.setTheme(S.theme); }

export function startNavigation(silent) {
  const ok = gps.start(onFix, e => { S.gpsMsg = 'GPS: ' + (e.message || 'erro'); refresh(); });
  if (!ok) return;
  S.gpsMsg = 'GPS ligado'; S.follow = true; $('btnFollow').classList.add('on'); if (R.view.z < 14) R.setView(null, null, 15.5);
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
export function finishStage() {
  if (S.session.state === 'idle') return;
  if (!confirm('Encerrar a etapa e gerar o relatório?')) return;
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
    S.eta = guide.eta(S.stage, S.proj.dist, S.speed10, left); S.vsPlan = guide.vsPlan(S.planArrival, S.eta.arrival);
    S.light = guide.daylight(new Date(now), fix.lat, fix.lon);
    if (S.prefs.theme === 'auto') applyTheme();
  }
  for (const ev of events) handleEvent(ev);
  S.next = guide.nextCue(S);
  if (S.follow) { R.centerOn(fix.lat, fix.lon); R.setView(null, null, null, S.prefs.orientation === 'heading' ? -(fix.head || 0) * Math.PI / 180 : 0); }
  R.invalidate(); refresh();
}
function handleEvent(ev) {
  if (ev.kind === 'checkpoint' || ev.kind === 'arrival') { const prog = store.progress(S.stage.key); if (!prog.done.includes(ev.cp.id)) prog.done.push(ev.cp.id); store.setProgress(S.stage.key, prog); session.mark(S.session, 'borne', { id: ev.cp.id, dist: ev.cp.dist }); }
  if (ev.kind === 'sight') { ev.right = '<button class="mini-btn" data-done="' + ev.parada.id + '">feito</button>'; }
  if (ev.kind === 'turn300' || ev.kind === 'turn50') ev.right = '<span class="arr">' + ui.svgArrow(ev.turn.txt.includes('retorno') ? 'retorno' : ev.turn.dir) + '</span>';
  if (ev.kind === 'climbStart' || ev.kind === 'summit') session.mark(S.session, ev.kind, { dist: S.proj.dist });
  voice.announce(ev);
  if (ev.kind === 'arrival') setTimeout(() => { if (S.session.state === 'running' && confirm('Chegou. Encerrar a etapa e gerar o relatório?')) finishStage(); }, 1500);
  const b = $('cue').querySelector('[data-done]'); if (b) b.onclick = e => { e.stopPropagation(); const p = S.paradas.find(x => x.id === b.dataset.done); if (p) { p.done = true; const prog = store.progress(S.stage.key); prog.sights.push(p.id); store.setProgress(S.stage.key, prog); } voice.clearBanner(); };
}
function refresh() { if (panelTimer) return; panelTimer = setTimeout(() => { panelTimer = null; try { ui.panel(S); } catch (e) { console.error(e); } }, 120); }
function loop() { R.draw(S); requestAnimationFrame(loop); }

function toggleSim() { if (gps.simulating()) { stopNavigation(); $('btnSim').classList.remove('on'); return; } startSim(22, S.proj.dist); }
function startSim(kmh, from) {
  stopNavigation(); if (S.session.state === 'idle') session.start(S.session, Date.now()); else if (S.session.state === 'paused') session.resume(S.session, Date.now());
  S.follow = true; $('btnFollow').classList.add('on'); R.setView(null, null, Math.max(R.view.z, 15.5)); S.gpsMsg = 'Simulação ' + kmh + ' km/h'; $('btnSim').classList.add('on');
  gps.simulate(S.stage, kmh, onFix, from);
}
function showBriefingOnce() { if (!store.get('brief:' + S.stage.key, false)) { store.set('brief:' + S.stage.key, true); showBriefing(); } }
function showBriefing() { const b = guide.briefing(S.stage, S.allParadas.itens, S.allParadas.dias, S.allParadas.regras); $('briefBody').innerHTML = ui.briefingHtml(b, S.stage); $('dlgBrief').showModal(); }
function showReport(r) {
  if (!r) { alert('Sem relatório desta etapa ainda.'); return; }
  $('repBody').innerHTML = report.render(r);
  const sh = report.share(r, S.log);
  $('repShare').onclick = async () => { try { if (navigator.share) await navigator.share({ title: r.name, text: sh.text }); else { await navigator.clipboard.writeText(sh.text); alert('Resumo copiado.'); } } catch (e) { } };
  $('repGpx').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([sh.gpx], { type: 'application/gpx+xml' })); a.download = 'etape-' + r.stageKey + '.gpx'; a.click(); };
  $('dlgReport').showModal();
}
window.addEventListener('DOMContentLoaded', init);
