// Étape Navegar · app.js
// Composição: liga os módulos e controla o ciclo de vida.
import { mercX, mercY, haversine } from './geo.js';
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
import * as sat from './sat.js';
import * as dem from './dem.js';
import * as compass from './compass.js';
let rider3d = null, diorama = null;   // módulos WebGL (three.js) carregados sob demanda

const $ = id => document.getElementById(id);
const code = k => /^\d/.test(k) ? 'E' + k : k;
const S = { map: null, routes: null, stage: null, paradas: [], proj: { idx: 0, dist: 0, off: 0 }, fix: null, prev: null, off: false, offSince: 0, session: null, log: [], fuel: null, fuelPlan: null, live: null, eta: null, next: {}, follow: true, mode: 'full', tab: 'tele', theme: 'day', prefs: store.prefs(), scaleBottom: 380, hist: [], planArrival: null };
let R, panelTimer = null;

export function init() {
  S.map = loadMap(); S.routes = loadRoutes(); S.allParadas = loadParadas();
  R = createRenderer($('map'), $('rider'));
  // ciclista 3D em WebGL na camada própria; sem WebGL, fica o desenho 2D
  if (/[?&]debug=1/.test(location.search)) window.__etape = { R, S, gps, track, guide };
  if (/[?&]r3d=1/.test(location.search)) import('./rider3d.js').then(m => { if (m.init($('rider3d'))) { rider3d = m; R.setRiderExternal(true); size3d(); } });
  const sel = $('stageSel'); for (const k in S.routes.stages) { const o = document.createElement('option'); o.value = k; o.textContent = code(k); sel.appendChild(o); }
  sel.onchange = () => selectStage(sel.value);
  ui.bindGestures($('map'), R, () => { if (R.view.mode !== '2d') setCam('2d'); if (S.follow) { S.follow = false; $('btnFollow').classList.remove('on'); R.setView(null, null, null, 0); } }, () => { S.userZoomAt = Date.now(); });
  // zoom manual desliga o zoom automático por 45 s
  const zoomBtn = dz => { S.userZoomAt = Date.now(); const { W, H } = R.size(); ui.zoomAnim(R, R.view.z + dz, W / 2, H * R.view.anchorY); };
  $('zin').onclick = () => zoomBtn(0.7); $('zout').onclick = () => zoomBtn(-0.7);
  $('map').addEventListener('wheel', () => { S.userZoomAt = Date.now(); }); $('map').addEventListener('pointerdown', e => { if (e.isPrimary === false) S.userZoomAt = Date.now(); });
  $('btnFollow').onclick = () => { S.follow = true; $('btnFollow').classList.add('on'); S.userZoomAt = 0; const p = S.pos || S.fix; if (p) { const head = S.pos ? S.pos.head : ((S.fix.head || 0) * Math.PI / 180); const rot = (R.view.mode !== '2d' || S.prefs.orientation === 'heading') ? -head : 0; R.animateTo({ cx: mercX(p.lon), cy: mercY(p.lat), z: R.view.mode === '2d' ? (S.zoomTarget || 19) : R.view.z, rot }, 500); } };
  $('btnVoice').onclick = () => { const on = voice.isMuted(); if (on) voice.unmute(); else voice.mute(); S.prefs.voice = on; store.setPrefs(S.prefs); $('btnVoice').classList.toggle('on', on); if (on) voice.say('Voz ligada.', 2); };
  $('btnTheme').onclick = () => { S.prefs.theme = S.theme === 'night' ? 'day' : 'night'; store.setPrefs(S.prefs); applyTheme(); };
  $('btnSession').onclick = toggleSession; $('btnFinish').onclick = finishStage; $('btnSim').onclick = toggleSim; $('btnReset').onclick = resetStage;
  $('btnBrief').onclick = showBriefing; $('btnReport').onclick = () => showReport(report.list()[S.stage.key]);
  document.querySelectorAll('#tabs div').forEach(d => d.onclick = () => { ui.setTab(S, d.dataset.tab); S.prefs.tab = d.dataset.tab; store.setPrefs(S.prefs); refresh(); });
  $('grab').onclick = () => setMode(S.mode === 'full' ? 'resumo' : 'full');
  $('btnMode').onclick = () => setMode(S.mode === 'full' ? 'resumo' : 'full');
  // câmera: 2D → 3ª pessoa → 1ª pessoa; satélite liga/desliga (e baixa a etapa para offline na primeira vez)
  $('btnCam').onclick = () => { const seq = ['2d', 'tp', 'fp']; setCam(seq[(seq.indexOf(S.prefs.cam || '2d') + 1) % 3]); };
  $('btnSat').onclick = async () => {
    if (!sat.available()) { voice.banner('Satélite indisponível nesta versão', 3); return; }
    const on = !S.prefs.sat; S.prefs.sat = on; store.setPrefs(S.prefs); R.setSat(on); $('btnSat').classList.toggle('on', on);
    if (on && sat.hasStage(S.stage.key) && !store.get('satdl:' + S.stage.key, false) && navigator.onLine) {
      voice.banner('Baixando satélite da etapa', 3);
      await sat.prefetch(S.stage.key, (d, t) => { S.gpsMsg = 'satélite ' + Math.round(d / t * 100) + ' %'; refresh(); });
      store.set('satdl:' + S.stage.key, true); S.gpsMsg = 'satélite da etapa guardado'; refresh(); R.invalidate();
    }
  };
  dem.loadIndex('dem/index.json').then(ix => { if (ix) R.invalidate(); });
  sat.loadIndex('sat/index.json').then(ix => { if (ix) { R.setSat(!!S.prefs.sat); $('btnSat').classList.toggle('on', !!S.prefs.sat); $('btnSat').hidden = false; } else $('btnSat').hidden = true; setCam(S.prefs.cam || '2d'); });
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
  window.addEventListener('resize', size3d);
  selectStage(store.get('stage', '1'));
  ui.setTab(S, S.prefs.tab || 'tele'); setMode(typeof S.prefs.mode === 'string' ? S.prefs.mode : 'full');
  requestAnimationFrame(loop);
  // dentro do app Étape (quadro): a etapa vem por mensagem e o service worker é o da raiz
  $('dlgPreview').addEventListener('close', () => { if (diorama) diorama.dispose(); });
  window.addEventListener('message', e => { const m = e.data || {}; if (m.etape === 'selectStage' && m.key && S.routes.stages[m.key] && m.key !== S.stage.key) selectStage(m.key); if (m.etape === 'resize') { R.resize(); measurePanel(); size3d(); } });
  const inFrame = window.parent && window.parent !== window;
  if (!inFrame && 'serviceWorker' in navigator && location.protocol.startsWith('http') && !new URLSearchParams(location.search).get('nosw')) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
    // versão nova instalada: recarrega quando não há etapa rodando
    let had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && S.session && S.session.state !== 'running') location.reload(); had = true; });
  }
  const q = new URLSearchParams(location.search);
  if (q.get('stage')) selectStage(q.get('stage'));
  if (q.get('mode')) setMode(q.get('mode'));
  if (q.get('theme')) { S.prefs.theme = q.get('theme'); applyTheme(); }
  if (q.get('cam')) S.prefs.cam = q.get('cam');
  if (q.get('sat')) S.prefs.sat = q.get('sat') === '1';
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
  S.proj = { idx: 0, dist: 0, off: 0 }; S.fix = null; S.prev = null; S.pos = null; S.viewTarget = null; S.zoomTarget = null; S.off = false; S.climbId = null; S.surface = ''; S.flamme = false; S.hist = [];
  if (S.log.length) { const l = S.log[S.log.length - 1]; S.proj = track.project(S.stage, l.lat, l.lon, track.idxAtDist(S.stage, l.dist)); }
  // tela inicial: a bike na porta do hotel (ou onde parou), no zoom de rua, com o rumo da largada
  S.eta = null; S.etaAt = 0; S.vsPlan = null; S.live = null; S.fuelStatus = null; S.light = null;
  const p0 = track.pointAt(S.stage, S.proj.dist), b0 = track.bearingAt(S.stage, S.proj.dist);
  R.centerOn(p0[0], p0[1]); R.setView(null, null, R.view.mode === '2d' ? 18.5 : 16, S.prefs.orientation === 'heading' ? -b0 * Math.PI / 180 : 0); if (R.view.mode === '2d') R.view.anchorY = 0.45; S.follow = true; $('btnFollow').classList.add('on');
  S.next = guide.nextCue(S); S.live = telemetry.live(S.log, S.stage, S.session, Date.now(), session.movingTime(S.session, Date.now()));
  if (!S.log.length) S.live = { ...S.live, v: 0, avg: 0, vam: 0, grade: track.gradeAt(S.stage, 0, 200) };
  applyTheme(); refresh(); measurePanel();
  if (S.session.state === 'running') startNavigation(true);
}
function measurePanel() { S.scaleBottom = $('panel').offsetHeight + 8; $('attr').style.bottom = (S.scaleBottom + 4) + 'px'; }
function setCam(c) { S.prefs.cam = c; store.setPrefs(S.prefs); R.setMode(c); $('btnCam').textContent = c === '2d' ? '2D' : c === 'tp' ? '3ª' : '1ª'; $('btnCam').classList.toggle('on', c !== '2d'); if (c !== '2d') { S.follow = true; $('btnFollow').classList.add('on'); if (S.fix) R.centerOn(S.fix.lat, S.fix.lon); R.setView(null, null, 16, S.fix ? -(S.fix.head || 0) * Math.PI / 180 : R.view.rot); } else R.view.anchorY = S.mode === 'resumo' ? 0.6 : 0.45; R.invalidate(); }
function setMode(m) { ui.setMode(S, m); S.prefs.mode = m; store.setPrefs(S.prefs); if (R.view.mode === '2d') R.view.anchorY = m === 'resumo' ? 0.6 : 0.45; $('btnMode').textContent = m === 'resumo' ? '▴' : '▾'; $('btnMode').classList.toggle('on', m === 'resumo'); refresh(); measurePanel(); }
function applyTheme() { S.theme = ui.theme(S.prefs.theme, S); R.setTheme(S.theme); }

export function startNavigation(silent) {
  const ok = gps.start(onFix, e => { S.gpsMsg = 'GPS: ' + (e.message || 'erro'); refresh(); });
  if (!ok) return;
  compass.start(); S.gpsMsg = 'GPS ligado'; S.follow = true; $('btnFollow').classList.add('on'); R.setView(null, null, 19);
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
    S.ecart = guide.ecart(S, S.speed10, now, (S.routes.days || {})[S.stage.key]);
    if (S.prefs.theme === 'auto') applyTheme();
  }
  for (const ev of events) handleEvent(ev);
  S.next = guide.nextCue(S);
  // modelo de movimento (estilo Waze): o fix vira um alvo; o loop prevê a posição ao longo da estrada e desliza até ela
  const onRoad = (S.proj.off || 0) <= 30 && !S.off, v0 = fix.v || 0;
  if (S.gpsMsg === 'GPS perdido · estimando') { S.gpsMsg = 'GPS ligado'; }
  const T = { lat: fix.lat, lon: fix.lon, v: v0, head: (fix.head || 0) * Math.PI / 180, dist: S.proj.dist || 0, on: onRoad, t: Date.now() };
  const prev = S.viewTarget; S.viewTarget = T;
  const jump = !S.pos || !prev || Date.now() - prev.t > 60000 || haversine(S.pos.lat, S.pos.lon, fix.lat, fix.lon) > 150;
  if (jump) { const p = onRoad ? track.pointAt(S.stage, T.dist) : [fix.lat, fix.lon]; S.pos = { lat: p[0], lon: p[1], head: onRoad ? track.bearingAt(S.stage, T.dist) * Math.PI / 180 : T.head, dist: T.dist }; if (S.follow) snapView(); }
  // zoom automático pela velocidade (2D): parado 19 · normal 18,2 · descida rápida 17,4; desliza no loop, e só sem zoom manual recente
  if (S.follow && R.view.mode === '2d' && now - (S.userZoomAt || 0) > 45000) S.zoomTarget = v0 < 3 ? 19 : v0 < 9 ? 18.2 : 17.4; else S.zoomTarget = null;
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
function size3d() { if (!rider3d) return; const c = $('rider3d'); rider3d.resize(c.clientWidth, c.clientHeight, Math.min(window.devicePixelRatio || 1, 2)); }
let riderFrame = -1, lastGlide = 0;
function headingRot() { return (R.view.mode !== '2d' || S.prefs.orientation === 'heading') ? -S.pos.head : 0; }
function snapView() { R.centerOn(S.pos.lat, S.pos.lon); R.setView(null, null, null, headingRot()); R.invalidate(); }
// Posição mostrada (S.pos) desliza até a posição prevista: na estrada, avança pela geometria do traçado à velocidade do
// último fix (extrapolação até 1,5 s; com GPS perdido, até 45 s como o Waze num túnel); fora dela, em linha reta.
// Rumo pela geometria da via 15 m à frente (estável), ou pelo GPS fora da rota. Constantes de tempo: posição 0,25 s,
// rumo 0,35 s, zoom 1,2 s. ~30 qps em 2D, 20 com relevo + satélite; parado, nada é redesenhado.
function glide(ts) {
  const T = S.viewTarget; if (!T || !S.pos || !gps.running() || R.animating()) return;
  const now = Date.now(), age = (now - T.t) / 1000;
  const minGap = (R.view.mode !== '2d' && R.view.sat) ? 50 : 33; if (ts - lastGlide < minGap) return;
  const dt = Math.min(0.1, lastGlide ? (ts - lastGlide) / 1000 : 0.033); lastGlide = ts;
  let lat, lon, head, dist = T.dist;
  const lost = age > 4;
  if (lost && !(T.on && T.v > 2 && age < 45)) { if (lost && S.gpsMsg === 'GPS ligado' && gps.running() && T.v > 0.5) { S.gpsMsg = 'GPS perdido · estimando'; refresh(); } if (age > 45) return; }
  const ahead = T.v < 0.5 ? 0 : T.v * Math.min(lost ? 45 : 1.5, age);
  if (T.on) { dist = Math.min(S.stage.total, T.dist + ahead); const p = track.pointAt(S.stage, dist); lat = p[0]; lon = p[1]; head = track.bearingAt(S.stage, Math.min(S.stage.total, dist + 15)) * Math.PI / 180; }
  else { lat = T.lat + ahead * Math.cos(T.head) / 111320; lon = T.lon + ahead * Math.sin(T.head) / (111320 * Math.cos(T.lat * Math.PI / 180)); head = T.head; const ch = T.v < 1.2 ? compass.heading() : null; if (ch != null) head = ch * Math.PI / 180; }
  const kp = 1 - Math.exp(-dt / 0.25), kh = 1 - Math.exp(-dt / 0.35), P = S.pos;
  let dh = head - P.head; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  const dlat = lat - P.lat, dlon = lon - P.lon;
  let moved = false;
  if (Math.abs(dlat) > 1e-8 || Math.abs(dlon) > 1e-8) { P.lat += dlat * kp; P.lon += dlon * kp; moved = true; }
  if (Math.abs(dh) > 2e-4) { P.head += dh * kh; P.head = Math.atan2(Math.sin(P.head), Math.cos(P.head)); moved = true; }
  P.dist = dist;
  if (S.follow) {
    const v = R.view; if (moved) { v.cx = mercX(P.lon); v.cy = mercY(P.lat); v.rot = headingRot(); }
    if (S.zoomTarget != null && Math.abs(S.zoomTarget - v.z) > 0.005) { v.z += (S.zoomTarget - v.z) * (1 - Math.exp(-dt / 1.2)); moved = true; }
  }
  if (moved) R.invalidate();
}
const PERF = { n: 0, ms: 0, last: 0, el: null };
function perfHud(ts, ms) {
  if (!/[?&]debug=1/.test(location.search)) return;
  PERF.n++; PERF.ms += ms;
  if (ts - PERF.last < 500) return; PERF.last = ts;
  if (!PERF.el) { PERF.el = document.createElement('div'); PERF.el.id = 'perf'; PERF.el.style.cssText = 'position:fixed;left:8px;top:64px;z-index:50;font:600 12px/1.3 monospace;background:rgba(23,25,28,.8);color:#FFE566;padding:4px 6px;border-radius:4px;pointer-events:none;white-space:pre'; document.body.appendChild(PERF.el); }
  const st = R.stats(), mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) + ' MB' : '';
  PERF.el.textContent = Math.round(PERF.n * 2) + ' qps · draw ' + (PERF.ms / PERF.n).toFixed(1) + ' ms · base ' + st.baseCount + ' (' + st.base + 'px) · dpr ' + st.dpr + ' · ' + R.view.mode + (R.view.sat ? '+sat' : '') + ' z' + R.view.z.toFixed(1) + ' ' + mem;
  PERF.n = 0; PERF.ms = 0;
}
function loop(ts) {
  glide(ts);
  const t0 = performance.now(); R.draw(S); perfHud(ts, performance.now() - t0);
  // pedalada: 4 quadros por volta, cadência que acompanha a velocidade; parado, quadro fixo
  const v = S.fix ? (S.fix.v || 0) : 0, moving = v > 0.8 && gps.running();
  const f = moving ? Math.floor(ts / (60000 / Math.min(95, 60 + v * 3) / 4)) % 4 : 0;
  if (rider3d && rider3d.isReady()) { if (R.riderMoved()) R.drawRider(0); rider3d.render(R.riderInfo(), moving ? v : 0, ts); }
  else if (f !== riderFrame || R.riderMoved()) { riderFrame = f; R.drawRider(f); }
  requestAnimationFrame(loop);
}

function toggleSim() { if (gps.simulating()) { stopNavigation(); $('btnSim').classList.remove('on'); return; } startSim(22, S.proj.dist); }
function startSim(kmh, from) {
  stopNavigation(); if (S.session.state === 'idle') session.start(S.session, Date.now()); else if (S.session.state === 'paused') session.resume(S.session, Date.now());
  S.follow = true; $('btnFollow').classList.add('on'); R.setView(null, null, 19); S.gpsMsg = 'Simulação ' + kmh + ' km/h'; $('btnSim').classList.add('on');
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
    const S2 = { map: S.map, routes: S.routes, stage: st, paradas, proj: { idx: 0, dist: 0, off: 0 }, fix: null, scaleBottom: 8, mode: 'full', showStart: false };
    PV = { R2, S2 }; requestAnimationFrame(() => { R2.invalidate(); R2.draw(S2); });
    // maquete 3D da etapa (relevo real); sem DEM/WebGL fica o mapa plano
    const dioBox = $('pvBody').querySelector('.dio'), ctl = dioBox.querySelector('.dio-ctl');
    const showView = v => { ctl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); $('pvDio').hidden = v === 'map'; $('pvMap').hidden = v !== 'map'; if (v === 'map') { R2.resize(); R2.invalidate(); R2.draw(S2); if (diorama) diorama.stop(); } else if (diorama) { diorama.setSat(v === 'sat'); } };
    ctl.querySelectorAll('button').forEach(b => b.onclick = () => showView(b.dataset.v));
    const hint = dioBox.querySelector('.dio-hint');
    if (dem.available()) import('./diorama.js').then(m => { diorama = m; return m.build($('pvDio'), st, paradas, key).then(okd => { if (!okd) { showView('map'); ctl.hidden = true; } else { hint.textContent = 'arraste para girar · toque duplo liga o giro'; if (key === S.stage.key && S.proj && S.proj.dist > 0) diorama.setProgress(S.proj.dist); } }); });
    else { showView('map'); ctl.hidden = true; }
    import('./render.js').then(m => m.drawProfile($('pvProf'), st, 0, S.theme, { labels: true, paradas }));
  }
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
}
function showReport(r) {
  if (!r) { alert('Sem relatório desta etapa ainda.'); return; }
  $('repBody').innerHTML = report.render(r, report.list());
  const sh = report.share(r, S.log);
  $('repShare').onclick = async () => { try { if (navigator.share) await navigator.share({ title: r.name, text: sh.text }); else { await navigator.clipboard.writeText(sh.text); alert('Resumo copiado.'); } } catch (e) { } };
  $('repGpx').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([sh.gpx], { type: 'application/gpx+xml' })); a.download = 'etape-' + r.stageKey + '.gpx'; a.click(); };
  $('dlgReport').showModal();
}
window.addEventListener('DOMContentLoaded', init);
