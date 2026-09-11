// Étape Navegar · auto.js (Cinema v2 · gatilhos automáticos, aprovados em 07/09/2026)
// Quem aperta continua sendo o Pedro; isto só grava sozinho nos momentos que a viagem já sabe que valem: começo da subida
// (Rosto 30 s), topo (Rosto 20 s), "grava agora" da descida (Estrada até a rampa aplainar, teto 6 min), flamme rouge /
// chegada (Estrada 90 s), coração alto (Rosto 20 s, no máximo a cada 10 min). Liga por S.prefs.autoRec (viagem: ligado;
// Diário/livre: desligado) no menu Mais. Só com a saída em andamento; nunca interrompe um REC manual.
import * as native from './native.js?v=c8177a80';
import * as cinema from './cinema.js?v=c8177a80';
import * as voice from './voice.js?v=c8177a80';
import * as store from './store.js?v=c8177a80';

let S = null; const timers = {}; let lastHr = 0; let flat = 0; const auto = { estrada: false, rosto: false }; let enteredByAuto = false;

export function init(state) {
  S = state;
  document.addEventListener('etape:guide', e => onGuide(e.detail || {}));
  document.addEventListener('etape:rec', e => { const d = e.detail || {}; if (d.kind === 'stop' || d.kind === 'error' || d.kind === 'off') { auto[d.slot || 'estrada'] = false; clearTimeout(timers[d.slot || 'estrada']);
    // o Cinema foi aberto por um gatilho automático: quando o último clipe automático termina, a página volta ao mapa
    if (enteredByAuto && !S.rec.estrada && !S.rec.rosto) { enteredByAuto = false; setTimeout(() => { if (S.cinema && !S.rec.estrada && !S.rec.rosto) cinema.exit(); }, 800); } } });
  document.addEventListener('etape:cinema', e => { const d = e.detail || {}; if (d.kind === 'exit') { enteredByAuto = false; ['estrada', 'rosto'].forEach(sl => { auto[sl] = false; clearTimeout(timers[sl]); }); } });
}
// padrão avaliado na hora (S.free/S.diario só existem depois do init): viagem ligado, Diário/livre desligado
export function pref() { return S.prefs.autoRec == null ? !(S.free || S.diario) : !!S.prefs.autoRec; }
export function on() { return !!(S && pref() && S.native && S.session && S.session.state === 'running'); }
export function toggle() { S.prefs.autoRec = !pref(); store.setPrefs(S.prefs); voice.banner('REC automático ' + (S.prefs.autoRec ? 'ligado' : 'desligado'), 3, S.prefs.autoRec ? 'subida, topo, descida, chegada' : ''); return S.prefs.autoRec; }

// grava `slot` por `sec` segundos, sem mexer num REC que o Pedro já ligou
function shoot(slot, sec, why) {
  if (!on() || S.rec[slot]) return;
  const wasIn = S.cinema;
  if (cinema.rec(slot, { auto: true }) !== 'ok') return;   // recusado (quente, sem espaço…): não marca nada, não arma timer
  if (!wasIn) enteredByAuto = true;
  auto[slot] = true; document.dispatchEvent(new CustomEvent('etape:auto', { detail: { slot, why, sec } }));
  const other = slot === 'rosto' ? 'estrada' : 'rosto';
  voice.banner('REC automático · ' + why, 3, (slot === 'rosto' ? 'frontal' : 'estrada') + (S.rec[other] ? ' · ' + other + ' segue' : ''));
  clearTimeout(timers[slot]); timers[slot] = setTimeout(() => { if (auto[slot] && S.rec[slot]) native.recStop(slot); }, sec * 1000);
}
function onGuide(ev) {
  if (!on()) return;
  if (ev.kind === 'climbStart') shoot('rosto', 30, 'subida');
  if (ev.kind === 'summit') shoot('rosto', 20, 'topo');
  if (ev.kind === 'rec') { shoot('estrada', ev.sub && /chegada/.test(ev.sub) ? 90 : 360, ev.sub && /chegada/.test(ev.sub) ? 'chegada' : 'descida'); }
}
// chamado a cada posição: descida automática para quando a rampa aplaina; coração alto dispara o rosto
export function tick() {
  if (!on()) return;
  if (auto.estrada && S.rec.estrada && S.live && S.live.grade != null && S.live.grade > -2) { flat = (flat || 0) + 1; if (flat >= 60) { native.recStop('estrada'); flat = 0; } } else flat = 0;
  const hr = S.sensors && S.sensors.hr; const lim = S.prefs.hrTrigger || 165;
  if (hr && hr >= lim && Date.now() - lastHr > 600000) { lastHr = Date.now(); shoot('rosto', 20, hr + ' bpm'); }
}
