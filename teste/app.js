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
import * as weather from './weather.js';
import * as sensors from './sensors.js';
let rider3d = null, diorama = null, router = null, t3d = null;   // t3d: vista 3ª pessoa em WebGL (terrain3d.js), carregada ao ligar o 3D   // router: recálculo offline (graph.json), carregado 4 s depois de abrir   // módulos WebGL (three.js) carregados sob demanda

const $ = id => document.getElementById(id);
const code = k => /^\d/.test(k) ? 'E' + k : k;
const S = { map: null, routes: null, stage: null, paradas: [], proj: { idx: 0, dist: 0, off: 0 }, fix: null, prev: null, off: false, offSince: 0, session: null, log: [], fuel: null, fuelPlan: null, live: null, eta: null, next: {}, follow: true, mode: 'full', tab: 'tele', theme: 'day', prefs: store.prefs(), scaleBottom: 380, hist: [], planArrival: null };
let R, panelTimer = null;

export function init() {
  S.map = loadMap(); S.routes = loadRoutes(); S.allParadas = loadParadas();
  R = createRenderer($('map'), $('rider'));
  // ciclista 3D em WebGL na camada própria; sem WebGL, fica o desenho 2D
  if (/[?&]debug=1/.test(location.search)) { window.__etape = { R, S, gps, track, guide, onFix, t3d: () => t3d }; window.__errs = []; window.addEventListener('error', e => window.__errs.push(String(e.message))); window.addEventListener('unhandledrejection', e => window.__errs.push('promise: ' + String(e.reason))); }
  // avatar 3D (models/avatar.glb com rig procedural) ligado por padrão; ?r3d=0 desliga (bike 2D), ?r3d=1 força o procedural de tubos
  const r3dq = (location.search.match(/[?&]r3d=(\d)/) || [])[1];
  if (r3dq !== '0') import('./rider3d.js').then(async m => {   // avatar 3D ligado por padrão (pedido do Pedro em 06/09, no tamanho do ícone 2D); ?r3d=0 desliga, ?r3d=1 procedural
    if (!m.init($('rider3d'))) return;
    const okModel = r3dq === '1' ? false : await m.loadModel('./models/avatar.glb');
    if (okModel || r3dq === '1') { rider3d = m; R.setRiderExternal(true); size3d(); R.invalidate(); }
  });
  const sel = $('stageSel'); for (const k in S.routes.stages) { const o = document.createElement('option'); o.value = k; o.textContent = code(k); sel.appendChild(o); }
  sel.onchange = () => selectStage(sel.value);
  ui.bindGestures($('map'), R, () => { S.showCtl(0); if (S.follow) { S.follow = false; $('btnFollow').classList.remove('on'); if (R.view.mode === '2d') R.setView(null, null, null, 0); } }, () => { S.userZoomAt = Date.now(); }, () => { S.rotLock = true; $('btnFollow').classList.add('pulse'); });
  // zoom manual desliga o zoom automático por 45 s
  const zoomBtn = dz => { S.userZoomAt = Date.now(); const { W, H } = R.size(); ui.zoomAnim(R, R.view.z + dz, W / 2, H * R.view.anchorY); };
  $('zin').onclick = () => zoomBtn(0.7); $('zout').onclick = () => zoomBtn(-0.7);
  $('map').addEventListener('wheel', () => { S.userZoomAt = Date.now(); }); $('map').addEventListener('pointerdown', e => { if (e.isPrimary === false) S.userZoomAt = Date.now(); });
  $('btnFollow').onclick = () => { if (t3d && S.cam3d) t3d.recenter(); S.follow = true; S.rotLock = false; S.hideCtl(); $('btnFollow').classList.add('on'); $('btnFollow').classList.remove('pulse'); S.userZoomAt = 0; const p = S.pos || S.fix; if (p) { const head = S.pos ? S.pos.head : ((S.fix.head || 0) * Math.PI / 180); const rot = (R.view.mode !== '2d' || S.prefs.orientation === 'heading') ? -head : 0; R.animateTo({ cx: mercX(p.lon), cy: mercY(p.lat), z: R.view.mode === '2d' ? (S.zoomTarget || 19) : R.view.z, rot }, 500); } };
  $('btnVoice').onclick = () => { const on = voice.isMuted(); if (on) voice.unmute(); else voice.mute(); S.prefs.voice = on; store.setPrefs(S.prefs); $('btnVoice').classList.toggle('on', on); if (on) voice.say('Voz ligada.', 2); };
  $('btnTheme').onclick = () => { S.prefs.theme = S.theme === 'night' ? 'day' : 'night'; store.setPrefs(S.prefs); applyTheme(); };
  // controles escondidos por padrão: um toque no mapa mostra por 8 s; arrastar mostra até recentralizar
  const ctl = $('ctl'); ctl.classList.add('hide'); let ctlTimer = 0;
  const showCtl = (ms) => { ctl.classList.remove('hide'); clearTimeout(ctlTimer); if (ms) ctlTimer = setTimeout(() => { if (S.follow) ctl.classList.add('hide'); }, ms); };
  const hideCtl = () => { clearTimeout(ctlTimer); ctlTimer = setTimeout(() => { if (S.follow) ctl.classList.add('hide'); }, 1500); };
  S.showCtl = showCtl; S.hideCtl = hideCtl;
  let tapAt = null; $('map').addEventListener('pointerdown', e => { tapAt = [e.clientX, e.clientY, Date.now()]; }); $('map').addEventListener('pointerup', e => { if (tapAt && Math.hypot(e.clientX - tapAt[0], e.clientY - tapAt[1]) < 12 && Date.now() - tapAt[2] < 400) { if (ctl.classList.contains('hide')) showCtl(8000); else if (S.follow) ctl.classList.add('hide'); } tapAt = null; });
  ctl.addEventListener('pointerdown', () => showCtl(8000));
  $('btnCam').onclick = () => setCam(S.prefs.cam === 'tp' ? '2d' : 'tp');
  $('btnSos').onclick = showSos; $('btnMark').onclick = () => markPlace(); $('sosMark').onclick = () => { markPlace(); $('dlgSos').close(); };
  $('btnSens').onclick = async () => { if (sensors.connected()) { sensors.disconnect(); $('btnSens').classList.remove('on'); S.sensors = null; refresh(); return; } if (!sensors.supported()) { voice.banner('Bluetooth indisponível neste navegador', 2); return; } try { const nm = await sensors.connect(); $('btnSens').classList.add('on'); voice.banner('Sensor ligado', 3, nm || ''); } catch (e) { voice.banner('Sem sensor', 2, (e && e.message || '').slice(0, 60)); } };
  sensors.onData(d => { S.sensors = d; refresh(); });
  $('btnSession').onclick = toggleSession; $('btnSim').onclick = toggleSim; $('btnReset').onclick = resetStage;
  if (/[?&](debug|sim)=/.test(location.search)) document.body.classList.add('dev');
  setTimeout(() => { import('./router.js').then(async m => { if (await m.load('graph.json')) router = m; }).catch(() => { }); }, 4000);
  $('btnMenu').onclick = () => { $('menuSt').textContent = (S.stage.name || '') + ' · ' + session.label(S.session.state).toLowerCase(); $('dlgMenu').showModal(); };
  // encerrar em dois toques: o primeiro arma por 5 s, o segundo encerra
  let finishArm = 0; const fb = $('btnFinish');
  fb.onclick = () => { if (S.session.state === 'idle') { voice.banner('Nenhuma etapa em andamento', 3); return; } if (Date.now() - finishArm < 5000) { finishArm = 0; fb.classList.remove('armed'); $('dlgMenu').close(); finishStage(true); return; } finishArm = Date.now(); fb.classList.add('armed'); fb.querySelector('b').textContent = 'Toque de novo para encerrar'; setTimeout(() => { fb.classList.remove('armed'); fb.querySelector('b').textContent = 'Encerrar etapa'; }, 5000); };
  $('btnBrief').onclick = showBriefing; $('btnReport').onclick = () => { $('dlgMenu').close(); showReport(report.list()[S.stage.key]); };
  document.querySelectorAll('#tabs div').forEach(d => d.onclick = () => { ui.setTab(S, d.dataset.tab); S.prefs.tab = d.dataset.tab; store.setPrefs(S.prefs); refresh(); });
  $('grab').onclick = () => setMode(S.mode === 'full' ? 'resumo' : 'full');
  $('btnMode').onclick = () => setMode(S.mode === 'full' ? 'resumo' : 'full');
  // câmera: 2D → 3ª pessoa → 1ª pessoa; satélite liga/desliga (e baixa a etapa para offline na primeira vez)
  $('btnSat').onclick = async () => {
    if (!sat.available()) { voice.banner('Satélite indisponível nesta versão', 3); return; }
    const on = !S.prefs.sat; S.prefs.sat = on; store.setPrefs(S.prefs); R.setSat(on); if (t3d) t3d.setSat(on); $('btnSat').classList.toggle('on', on);
    if (on && sat.hasStage(S.stage.key) && !store.get('satdl:' + S.stage.key, false) && navigator.onLine) {
      voice.banner('Baixando satélite da etapa', 3);
      await sat.prefetch(S.stage.key, (d, t) => { S.gpsMsg = 'satélite ' + Math.round(d / t * 100) + ' %'; refresh(); });
      store.set('satdl:' + S.stage.key, true); S.gpsMsg = 'satélite da etapa guardado'; refresh(); R.invalidate();
    }
  };
  dem.loadIndex('dem/index.json').then(ix => { if (ix) R.invalidate(); });
  sat.loadIndex('sat/index.json').then(ix => { if (ix && ix.attribution) $('attr').textContent = '© OpenStreetMap contributors · ' + ix.attribution; return ix; }).then(ix => { if (ix) { R.setSat(!!S.prefs.sat); $('btnSat').classList.toggle('on', !!S.prefs.sat); $('btnSat').hidden = false; } else $('btnSat').hidden = true; setCam(S.prefs.cam || '2d'); });
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
  window.addEventListener('resize', () => { R.resize(); measurePanel(); if (t3d && S.cam3d) t3d.resize($('gl').clientWidth, $('gl').clientHeight, window.devicePixelRatio || 1, R.view.hv); });
  { // gestos no 3D: arrastar orbita em volta do ciclista (volta sozinho ao rumo), pinça muda a distância, toque mostra os controles
    const gl = $('gl'), ptrs = new Map(); let t0 = 0, p0 = null, pinch = 0;
    gl.addEventListener('pointerdown', e => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); try { gl.setPointerCapture(e.pointerId); } catch (err) { } if (ptrs.size === 1) { t0 = performance.now(); p0 = [e.clientX, e.clientY]; } if (ptrs.size === 2) { const a = [...ptrs.values()]; pinch = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); } });
    gl.addEventListener('pointermove', e => { if (!ptrs.has(e.pointerId) || !t3d) return; const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 1) t3d.orbit(-(e.clientX - prev[0]) * 0.006, (e.clientY - prev[1]) * 0.004);
      else if (ptrs.size === 2 && pinch) { const a = [...ptrs.values()], d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); if (d > 0) t3d.zoomBy(d / pinch); pinch = d; } });
    const up = e => { const was = ptrs.size; ptrs.delete(e.pointerId); if (was === 1 && p0 && performance.now() - t0 < 300 && Math.hypot(e.clientX - p0[0], e.clientY - p0[1]) < 12) S.showCtl(0); if (!ptrs.size) { p0 = null; pinch = 0; if (t3d) t3d.release(); } };
    gl.addEventListener('pointerup', up); gl.addEventListener('pointercancel', up);
    gl.addEventListener('wheel', e => { e.preventDefault(); if (t3d) { t3d.zoomBy(e.deltaY < 0 ? 1.1 : 0.9); t3d.release(); } }, { passive: false });
  }
  R.resize();
  window.addEventListener('resize', size3d);
  selectStage(store.get('stage', '1'));
  ui.setTab(S, S.prefs.tab || 'tele'); setMode(typeof S.prefs.mode === 'string' ? S.prefs.mode : 'full');
  requestAnimationFrame(loop);
  // dentro do app Étape (quadro): a etapa vem por mensagem e o service worker é o da raiz
  $('dlgPreview').addEventListener('close', () => { if (diorama) diorama.dispose(); });
  if (window !== window.parent) { try { parent.postMessage({ etape: 'ready' }, '*'); } catch (e) { } }   // avisa o guia que já aceita selectStage
  window.addEventListener('message', e => { const m = e.data || {}; if (m.etape === 'selectStage' && m.key && S.routes.stages[m.key] && m.key !== S.stage.key) selectStage(m.key); if (m.etape === 'resize') { R.resize(); measurePanel(); size3d(); } });
  const inFrame = window.parent && window.parent !== window;
  if (!inFrame && 'serviceWorker' in navigator && location.protocol.startsWith('http') && !new URLSearchParams(location.search).get('nosw')) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
    navigator.serviceWorker.ready.then(r => { if (navigator.onLine && r.active) r.active.postMessage({ type: 'fillSat', base: './' }); }).catch(() => { });
    navigator.serviceWorker.addEventListener('message', e => { const m = e.data || {}; if (m.type === 'satProgress') { S.gpsMsg = m.done >= m.total ? 'satélite completo' : 'satélite ' + Math.round(m.done / m.total * 100) + ' %'; refresh(); } });
    // versão nova instalada: recarrega quando não há etapa rodando
    let had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && S.session && S.session.state !== 'running') location.reload(); had = true; });
  }
  const q = new URLSearchParams(location.search);
  if (q.get('stage')) selectStage(q.get('stage'));
  if (q.get('mode')) setMode(q.get('mode'));
  if (q.get('theme')) { S.prefs.theme = q.get('theme'); applyTheme(); }
  if (q.get('cam') === 'tp') S.prefs.cam = 'tp'; else if (!S.prefs.cam || S.prefs.cam === 'fp') S.prefs.cam = '2d';   // 2D por padrão; 3ª pessoa opcional; 1ª pessoa removida
  if (q.get('sat')) S.prefs.sat = q.get('sat') === '1';
  if (q.get('z')) { S.userZoomAt = Date.now() + 1e9; setTimeout(() => R.setView(null, null, +q.get('z')), 600); }   // zoom fixo para testes e gravações
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
  S.proj = { idx: 0, dist: 0, off: 0 }; S.fix = null; S.prev = null; S.pos = null; S.viewTarget = null; S.zoomTarget = null; S.globalAt = 0; S.offSince = 0; S.hotelCued = false; S.services = null; S.toiletCueAt = 0; S.off = false; S.climbId = null; S.surface = ''; S.flamme = false; S.hist = [];
  if (S.log.length) { const l = S.log[S.log.length - 1]; S.proj = track.project(S.stage, l.lat, l.lon, track.idxAtDist(S.stage, l.dist)); }
  // tela inicial: a bike na porta do hotel (ou onde parou), no zoom de rua, com o rumo da largada
  S.eta = null; S.etaAt = 0; S.vsPlan = null; S.live = null; S.fuelStatus = null; S.light = null;
  const p0 = track.pointAt(S.stage, S.proj.dist), b0 = track.bearingAt(S.stage, S.proj.dist);
  R.centerOn(p0[0], p0[1]); R.setView(null, null, R.view.mode === '2d' ? 18.5 : 16, S.prefs.orientation === 'heading' ? -b0 * Math.PI / 180 : 0); if (R.view.mode === '2d') R.view.anchorY = 0.45; S.follow = true; $('btnFollow').classList.add('on');
  S.next = guide.nextCue(S); S.live = telemetry.live(S.log, S.stage, S.session, Date.now(), session.movingTime(S.session, Date.now()));
  if (!S.log.length) S.live = { ...S.live, v: 0, avg: 0, vam: 0, grade: track.gradeAt(S.stage, 0, 200) };
  applyTheme(); refresh(); measurePanel(); if (t3d) t3d.setStage(S.stage);
  if (S.session.state === 'running') startNavigation(true);
}
function measurePanel() { S.scaleBottom = $('panel').offsetHeight + 8; $('attr').style.bottom = (S.scaleBottom + 4) + 'px'; R.view.hv = Math.max(0, $('map').clientHeight - $('panel').offsetHeight); if (t3d && S.cam3d) t3d.setVisible(R.view.hv); R.invalidate(); }
function setCam(c) {
  c = c === 'tp' ? 'tp' : '2d'; S.prefs.cam = c; store.setPrefs(S.prefs);
  const b = $('btnCam'); if (b) { b.textContent = c === 'tp' ? '3ª' : '2D'; b.classList.toggle('on', c === 'tp'); }
  R.view.anchorY = S.mode === 'resumo' ? 0.6 : 0.45;
  if (c === 'tp') {
    S.follow = true; $('btnFollow').classList.add('on');
    const show = () => { $('gl').hidden = false; $('rider').hidden = true; $('rider3d').hidden = true; t3d.resize($('gl').clientWidth, $('gl').clientHeight, window.devicePixelRatio || 1, R.view.hv); S.cam3d = true; };
    if (t3d) { show(); return; }
    import('./terrain3d.js').then(m => {
      if (!m.init($('gl'))) { voice.banner('3D indisponível neste aparelho', 2); setCam('2d'); return; }
      t3d = m; t3d.setStage(S.stage); t3d.setTheme(S.theme === 'night'); t3d.setSat(!!S.prefs.sat); t3d.loadAvatar('./models/avatar.glb'); show();
    }).catch(e => { voice.banner('3D indisponível', 2, (e && e.message || '').slice(0, 60)); setCam('2d'); });
  } else { S.cam3d = false; $('gl').hidden = true; $('rider').hidden = false; $('rider3d').hidden = false; }
  R.invalidate();
}
function setMode(m) { ui.setMode(S, m); S.prefs.mode = m; store.setPrefs(S.prefs); document.body.classList.toggle('full', m !== 'resumo'); if (R.view.mode === '2d') R.view.anchorY = m === 'resumo' ? 0.6 : 0.45; $('btnMode').textContent = m === 'resumo' ? '▴' : '▾'; $('btnMode').classList.toggle('on', m === 'resumo'); refresh(); measurePanel(); }
function applyTheme() { S.theme = ui.theme(S.prefs.theme, S); R.setTheme(S.theme); if (t3d) t3d.setTheme(S.theme === 'night'); }

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
// cidade/vila atual: nó "place" mais próximo, cada tipo com o seu raio (cidade 4 km, town 2,5 km, vila 1,2 km, lugarejo 600 m)
const PLACE_R = { 'place:city': 4000, 'place:town': 2500, 'place:village': 1200, 'place:hamlet': 600 };
let placeAt = 0;
function updatePlace(now) {
  const p = S.pos || S.fix; if (!p || now - placeAt < 2500) return; placeAt = now;
  const near = poisNear(S.map.poiIndex, p.lat, p.lon, 4000, Object.keys(PLACE_R));
  let best = null, bs = 1;
  for (const c of near) { const s = c.d / PLACE_R[c.poi.k]; if (s < bs) { bs = s; best = c; } }
  const name = best ? best.poi.n : '';
  if (name !== S.place) { S.place = name; refresh(); }
}
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
    const smp = telemetry.sample(fix, S.stage, S.proj, null); const sn = sensors.current(); if (sn.hr) smp.hr = sn.hr; if (sn.cad) smp.cad = sn.cad; if (sn.pwr) smp.pwr = sn.pwr; telemetry.record(S.log, smp, S.stage.key);
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
  rerouteTick(fix, now, events);
  updatePlace(now);
  S.next = guide.nextCue(S);
  // longe da etapa (> 50 km, ex.: testando em casa): o mapa fica na largada e não segue o GPS
  if ((S.proj.off || 0) > 50000) { S.viewTarget = null; S.pos = null; if (!S.farNoted) { S.farNoted = true; S.gpsMsg = 'longe da etapa · mapa na largada'; } R.invalidate(); refresh(); return; }
  // modelo de movimento (estilo Waze): o fix vira um alvo; o loop prevê a posição ao longo da estrada e desliza até ela
  const onRoad = (S.proj.off || 0) <= 30 && !S.off, v0 = fix.v || 0;
  // satélite progressivo: aquece os tiles dos próximos 800 m no nível em uso
  if (S.prefs.sat && onRoad) { try { sat.warmAhead(S.stage, S.proj.dist, 800, R.view.z); } catch (e) { } }
  if (S.gpsMsg === 'GPS perdido · estimando') { S.gpsMsg = 'GPS ligado'; }
  const T = { lat: fix.lat, lon: fix.lon, v: v0, head: (fix.head || 0) * Math.PI / 180, dist: S.proj.dist || 0, on: onRoad, t: Date.now() };
  const prev = S.viewTarget; S.viewTarget = T;
  const jump = !S.pos || !prev || Date.now() - prev.t > 60000 || haversine(S.pos.lat, S.pos.lon, fix.lat, fix.lon) > 150;
  if (jump) { const p = onRoad ? track.pointAt(S.stage, T.dist) : [fix.lat, fix.lon]; S.pos = { lat: p[0], lon: p[1], head: onRoad ? track.bearingAt(S.stage, T.dist) * Math.PI / 180 : T.head, dist: T.dist }; if (S.follow) snapView(); }
  // zoom automático pela velocidade (2D): parado 19 · normal 18,2 · descida rápida 17,4; desliza no loop, e só sem zoom manual recente
  if (S.follow && R.view.mode === '2d' && now - (S.userZoomAt || 0) > 45000) S.zoomTarget = Math.min(R.maxZ(), v0 < 3 ? 19 : v0 < 9 ? 18.2 : 17.4); else S.zoomTarget = null;
  R.invalidate(); refresh();
}
// Recálculo de rota (estilo Waze): fora da rota confirmada, entre 60 m e 3 km do traçado, com o grafo carregado, calcula
// o caminho da posição até um ponto do traçado 300 m à frente de onde saiu; refaz a cada 30 s ou se a posição mudou
// 120 m; anuncia as curvas do caminho de volta; some ao voltar à fita amarela.
function rerouteTick(fix, now, events) {
  const off = S.proj.off || 0; const mine = [];
  if (!S.off || off < 60 || off > 3000 || !router || !router.available() || S.session.state !== 'running') { if (S.reroute && !S.off) { S.reroute = null; R.invalidate(); } return; }
  const rr = S.reroute;
  const stale = !rr || now - rr.at > 30000 || haversine(rr.from[0], rr.from[1], fix.lat, fix.lon) > 120;
  if (stale) {
    // alvo: 300 m à frente do ponto do traçado mais próximo de verdade (busca global; S.proj pode estar velho fora da rota)
    const g = track.project(S.stage, fix.lat, fix.lon, -1); const tgtD = Math.min(S.stage.total, Math.max(g.dist, S.proj.dist || 0) + 300), tgt = track.pointAt(S.stage, tgtD);
    let res = null; try { res = router.route(fix.lat, fix.lon, tgt[0], tgt[1]); } catch (e) { res = null; }
    if (res && res.pts.length > 1) {
      const cum = [0]; for (let i = 1; i < res.pts.length; i++) cum.push(cum[i - 1] + haversine(res.pts[i - 1][0], res.pts[i - 1][1], res.pts[i][0], res.pts[i][1]));
      const pseudo = { pts: res.pts, cum, total: cum[cum.length - 1] };
      const turns = track.detectTurns(pseudo, 35, 12, 30);
      const first = !rr;
      S.reroute = { pts: res.pts, cum, total: pseudo.total, turns, at: now, from: [fix.lat, fix.lon], tgtD, proj: { idx: 0, dist: 0, off: 0 } };
      if (first) { voice.clearBanner(); mine.push({ kind: 'reroute', level: 2, text: 'Recalculando', sub: (pseudo.total >= 1000 ? (pseudo.total / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(pseudo.total) + ' m') + ' até voltar ao traçado', speak: 'Recalculando. ' + (pseudo.total >= 1000 ? (pseudo.total / 1000).toFixed(1).replace('.', ',') + ' quilômetros' : Math.round(pseudo.total / 50) * 50 + ' metros') + ' até a rota.' }); }
      R.invalidate();
    } else if (rr) { S.reroute = null; R.invalidate(); }
  }
  // curvas do caminho de volta
  const r2 = S.reroute; if (!r2) return;
  const pr = track.project(r2, fix.lat, fix.lon, r2.proj.idx); if (pr.off < 80) r2.proj = pr;
  for (const t of r2.turns) {
    const ahead = t.dist - r2.proj.dist;
    if (ahead > 0 && ahead < 320 && !t.a300) { t.a300 = true; mine.push({ kind: 'turn300', level: 2, text: t.short || t.txt, sub: 'em 300 m · volta à rota', speak: 'Em 300 metros, ' + t.txt + '.', turn: t }); }
    if (ahead > 0 && ahead < 60 && !t.a50) { t.a50 = true; mine.push({ kind: 'turn50', level: 1, text: t.short || t.txt, sub: 'agora · volta à rota', speak: t.txt.charAt(0).toUpperCase() + t.txt.slice(1) + ' agora.', turn: t, hold: 8000 }); }
  }
  for (const ev of mine) handleEvent(ev);
}
function handleEvent(ev) {
  if (ev.kind === 'checkpoint' || ev.kind === 'arrival') { const prog = store.progress(S.stage.key); if (!prog.done.includes(ev.cp.id)) prog.done.push(ev.cp.id); store.setProgress(S.stage.key, prog); session.mark(S.session, 'borne', { id: ev.cp.id, dist: ev.cp.dist }); }
  const POIS = '<svg class="flag" viewBox="0 0 36 26"><rect width="36" height="26" fill="#fff" stroke="#000"/><g fill="#E10D0D"><circle cx="7" cy="6" r="3.2"/><circle cx="20" cy="6" r="3.2"/><circle cx="33" cy="6" r="3.2"/><circle cx="13.5" cy="15" r="3.2"/><circle cx="26.5" cy="15" r="3.2"/><circle cx="7" cy="24" r="3.2"/><circle cx="20" cy="24" r="3.2"/><circle cx="33" cy="24" r="3.2"/></g></svg>';
  const FLAMME = '<svg class="flag" viewBox="0 0 36 26"><rect x="3" y="1" width="3" height="24" fill="#fff"/><path d="M6 2h26l-6 7 6 7H6z" fill="#fff"/><text x="17" y="14" font-family="Barlow Condensed" font-weight="900" font-size="12" fill="#E10D0D" text-anchor="middle">1</text></svg>';
  const MUSETTE = '<svg class="flag" viewBox="0 0 36 26"><path d="M1 25L6 1h29l-5 24z" fill="#B9BCC2" stroke="#000"/><path d="M15 8h7l3 12H12z" fill="#fff"/></svg>';
  if (ev.kind === 'sight') { ev.right = '<button class="mini-btn vert" data-done="' + ev.parada.id + '">Feito</button>'; }
  if (ev.kind === 'climbStart' && ev.cat) ev.right = '<span class="plate' + (ev.cat === 'HC' ? ' hc' : '') + '">' + ev.cat + '</span>';
  if (ev.kind === 'summit') ev.right = POIS;
  if (ev.kind === 'flamme') ev.right = FLAMME;
  if (ev.kind === 'shopWindow') ev.right = MUSETTE;
  if (ev.kind === 'offRoute' && ev.off != null) ev.right = '<span class="pill">' + (ev.off > 5000 ? Math.round(ev.off / 1000) + ' km' : Math.round(ev.off) + ' m') + '</span>';
  if (ev.kind === 'backOnRoute') ev.right = '<span class="pill vert">✓</span>';
  if (ev.kind === 'refill') ev.right = '<span class="pill bleu">' + Math.round(S.waterAhead || 0) + ' m</span>';
  if (ev.kind === 'checkpoint' && ev.cp) ev.right = '<span class="pill">' + ev.cp.kmLabel + '</span>';
  if (ev.kind === 'hotel') ev.right = '<span class="pill">' + (ev.km || 0).toFixed(1).replace('.', ',') + ' km</span>';
  if (ev.kind === 'toilets') ev.right = '<span class="pill bleu">' + Math.round((ev.m || 0) / 50) * 50 + ' m</span>';
  if (ev.kind === 'bikeshop') ev.right = '<span class="pill vert">' + (ev.m >= 1000 ? (ev.m / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(ev.m / 50) * 50 + ' m') + '</span>';
  if (ev.kind === 'rec') ev.right = '<span class="pill rouge">● REC</span>';
  if (ev.kind === 'reroute') ev.right = '<span class="pill bleu">↻</span>';
  if (ev.kind === 'offRoute' && ev.off > 5000 && !/\/teste\//.test(location.pathname)) ev.right = '<a class="mini-btn" href="../teste/" target="_top">Rota de teste</a>';
  else if (ev.kind === 'offRoute' && ev.rel != null) ev.right = '<span class="arr"><svg viewBox="0 0 40 40" style="transform:rotate(' + Math.round(ev.rel) + 'deg)" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 34V8M10 18l10-10 10 10"/></svg></span><span class="pill">' + Math.round(ev.off) + ' m</span>';
  if (ev.kind === 'drink') ev.right = '<button class="mini-btn" data-fuel="drink">Bebi</button>';
  if (ev.kind === 'eat') ev.right = '<button class="mini-btn" data-fuel="eat">Comi</button>';
  if (ev.kind === 'arrival') { ev.right = '<button class="mini-btn" data-finish>Encerrar</button>'; ev.hold = 120000; ev.level = 1; }
  if (ev.kind === 'turn300' || ev.kind === 'turn50') ev.right = '<span class="arr">' + ui.svgArrow(ev.turn.kind || ev.turn.dir, ev.turn.dir) + '</span>';
  if (ev.kind === 'climbStart' || ev.kind === 'summit') session.mark(S.session, ev.kind, { dist: S.proj.dist });
  voice.announce(ev);
  const ff = $('cue').querySelector('[data-fuel]'); if (ff) ff.onclick = e => { e.stopPropagation(); confirmFuel(ff.dataset.fuel); };
  const fb = $('cue').querySelector('[data-finish]'); if (fb) fb.onclick = e => { e.stopPropagation(); voice.clearBanner(); finishStage(true); };
  const b = $('cue').querySelector('[data-done]'); if (b) b.onclick = e => { e.stopPropagation(); const p = S.paradas.find(x => x.id === b.dataset.done); if (p) { p.done = true; const prog = store.progress(S.stage.key); prog.sights.push(p.id); store.setProgress(S.stage.key, prog); } voice.clearBanner(); };
}
// SOS: números da França, posição atual para ditar, ligar/compartilhar, hotel do dia
function showSos() {
  const fix = S.fix, p = S.pos || fix, d = (S.routes.days || {})[S.stage.key] || {}, hotel = d.hotel || {};
  const km = (S.proj.dist / 1000).toFixed(1).replace('.', ','), cp = S.stage.cps.slice().reverse().find(c => c.dist <= S.proj.dist + 100) || S.stage.cps[0];
  const ele = Math.round(track.elevationAt(S.stage, S.proj.dist));
  const pos = p ? p.lat.toFixed(5) + ', ' + p.lon.toFixed(5) : 'sem GPS';
  const maps = p ? 'https://maps.google.com/?q=' + p.lat.toFixed(5) + ',' + p.lon.toFixed(5) : '';
  $('sosBody').innerHTML = '<div class="sos-nums"><a class="pri" href="tel:112"><b>112</b><span>Emergência europeia</span></a><a href="tel:15"><b>15</b><span>SAMU · médico</span></a><a href="tel:18"><b>18</b><span>Bombeiros</span></a><a href="tel:17"><b>17</b><span>Polícia</span></a></div>' +
    '<div class="sos-pos"><b>' + pos + '</b><span>km ' + km + ' da ' + S.stage.name.replace(/^E\S+ /, '') + ' · ' + (cp ? 'perto de ' + cp.name : '') + ' · ' + ele + ' m</span><div class="acts"><button id="sosCopy">Copiar posição</button><button id="sosShare">Compartilhar</button></div></div>' +
    '<div class="sos-card"><b>Diga ao operador</b>"Je suis cycliste, j\'ai besoin d\'aide. Ma position: ' + pos + '." · Route: ' + (cp ? cp.full || cp.name : '') + '</div>' +
    (hotel.nome ? '<div class="sos-card"><b>Hotel de hoje</b>' + hotel.nome + '<br>' + (hotel.end || '') + (hotel.tel ? '<br>' + (hotel.tel.replace(/[^\d]/g, '').length >= 8 ? '<a href="tel:' + hotel.tel.split('·')[0].replace(/[^+\d]/g, '') + '">' + hotel.tel + '</a>' : hotel.tel) : '') + '</div>' : '') +
    (d.hospital ? '<div class="sos-card"><b>Hospital mais perto</b>' + d.hospital + '</div>' : '');
  $('sosCopy').onclick = async () => { try { await navigator.clipboard.writeText(pos + ' ' + maps); voice.banner('Posição copiada', 3); } catch (e) { } };
  $('sosShare').onclick = async () => { try { if (navigator.share) await navigator.share({ title: 'Minha posição', text: 'Estou aqui: ' + pos + ' (km ' + km + ') ' + maps }); } catch (e) { } };
  $('dlgSos').showModal();
}
function markPlace() {
  const p = S.pos || S.fix; if (!p) { voice.banner('Sem posição ainda', 2); return; }
  session.mark(S.session, 'lugar', { lat: p.lat, lon: p.lon, dist: S.proj.dist, ele: Math.round(track.elevationAt(S.stage, S.proj.dist)) });
  voice.banner('Lugar marcado', 3, 'km ' + (S.proj.dist / 1000).toFixed(1).replace('.', ',') + ' · vai para o relatório e o GPX'); R.invalidate();
}
function refresh() { if (panelTimer) return; panelTimer = setTimeout(() => { panelTimer = null; try { ui.panel(S); } catch (e) { console.error(e); } const h = $('panel').offsetHeight + 8; if (h !== S.scaleBottom) { measurePanel(); R.invalidate(); } }, 120); }
function size3d() { if (!rider3d) return; const c = $('rider3d'); rider3d.resize(c.clientWidth, c.clientHeight, Math.min(window.devicePixelRatio || 1, 2)); }
let riderFrame = -1, lastGlide = 0;
function headingRot() { if (S.rotLock) return R.view.rot; return (R.view.mode !== '2d' || S.prefs.orientation === 'heading') ? -S.pos.head : 0; }
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
  if (lost && !(T.on && T.v > 2 && age < 45)) { if (lost && S.gpsMsg === 'GPS ligado' && gps.running() && T.v > 0.5) { S.gpsMsg = 'GPS perdido · estimando'; refresh(); voice.banner('GPS perdido', 2, 'estimando pela rota', '<span class="pill">~</span>', 0, 'gps'); } if (age > 45) return; }
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
  if (!/[?&]hud=1/.test(location.search)) return;   // medidor de desempenho só com ?hud=1
  PERF.n++; PERF.ms += ms;
  if (ts - PERF.last < 500) return; PERF.last = ts;
  if (!PERF.el) { PERF.el = document.createElement('div'); PERF.el.id = 'perf'; PERF.el.style.cssText = 'position:fixed;left:8px;top:64px;z-index:50;font:600 12px/1.3 monospace;background:rgba(23,25,28,.8);color:#FFFF00;padding:4px 6px;border-radius:4px;pointer-events:none;white-space:pre'; document.body.appendChild(PERF.el); }
  const st = R.stats(), mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) + ' MB' : '';
  if (S.cam3d && t3d) { const g = t3d.getStats(); PERF.el.textContent = Math.round(PERF.n * 2) + ' qps · 3D ' + g.ms + ' ms (+' + g.upd + ' prep) · ' + g.tri + ' tri · ' + g.calls + ' calls · dpr ' + g.dpr + ' · buracos ' + g.holes + ' · sat faltando ' + g.miss + ' ' + mem; PERF.n = 0; PERF.ms = 0; return; }
  PERF.el.textContent = Math.round(PERF.n * 2) + ' qps · draw ' + (PERF.ms / PERF.n).toFixed(1) + ' ms · base ' + st.baseCount + ' (' + st.base + 'px) · dpr ' + st.dpr + ' · ' + R.view.mode + (R.view.sat ? '+sat' : '') + ' z' + R.view.z.toFixed(1) + ' ' + mem;
  PERF.n = 0; PERF.ms = 0;
}
function loop(ts) {
  try {
  glide(ts);
  if (S.cam3d && t3d) {
    if (!t3d.isReady()) { voice.banner('3D indisponível neste aparelho', 2); setCam('2d'); }
    else { if (ts - (loop._t3d || 0) >= 15.5) { loop._t3d = ts; const t0 = performance.now(); t3d.update(S, ts); perfHud(ts, performance.now() - t0); } requestAnimationFrame(loop); return; }   // 3D: no máximo 60 qps (a tela do S23 é 120 Hz)
  }
  const t0 = performance.now(); R.draw(S); perfHud(ts, performance.now() - t0);
  // pedalada: 4 quadros por volta, cadência que acompanha a velocidade; parado, quadro fixo
  const v = S.fix ? (S.fix.v || 0) : 0, moving = v > 0.8 && gps.running();
  const f = moving ? Math.floor(ts / (60000 / Math.min(95, 60 + v * 3) / 4)) % 4 : 0;
  if (rider3d && rider3d.isReady()) { if (R.riderMoved()) R.drawRider(0); rider3d.render(R.riderInfo(), moving ? v : 0, ts); }
  else if (f !== riderFrame || R.riderMoved()) { riderFrame = f; R.drawRider(f); }
  } catch (e) { if (window.__errs) window.__errs.push('loop: ' + (e && e.message)); if (!loop._err) { loop._err = 1; console.error(e); } }   // um erro num quadro não pode matar o loop
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
    { const d = (S.routes.days || {})[key] || {}, hh = s => { const m = /(\d+)h/.exec(s || ''); return m ? +m[1] : null; };
      const wxEl = $('pvWx'); const render = w => { if (wxEl) wxEl.innerHTML = weather.html(weather.summary(w, st, hh(d.saida), hh(d.chegada)), key); };
      render(weather.cached(key)); weather.fetchStage(st, key).then(w => { if (w) render(w); }); }
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
