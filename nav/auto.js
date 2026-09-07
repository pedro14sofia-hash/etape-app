// Étape Navegar · auto.js (Cinema v2 · gatilhos automáticos, aprovados em 07/09/2026)
// Quem aperta continua sendo o Pedro; isto só grava sozinho nos momentos que a viagem já sabe que valem: começo da subida
// (Rosto 30 s), topo (Rosto 20 s), "grava agora" da descida (Estrada até a rampa aplainar, teto 6 min), flamme rouge /
// chegada (Estrada 90 s), coração alto (Rosto 20 s, no máximo a cada 10 min). Liga por S.prefs.autoRec (viagem: ligado;
// Diário/livre: desligado) no menu Mais. Só com a saída em andamento; nunca interrompe um REC manual.
import * as native from './native.js';
import * as cinema from './cinema.js';
import * as voice from './voice.js';
import * as store from './store.js';

let S = null; const timers = {}; let lastHr = 0; const auto = { estrada: false, rosto: false };

export function init(state) {
  S = state;
  if (S.prefs.autoRec == null) S.prefs.autoRec = !(S.free || S.diario);
  document.addEventListener('etape:guide', e => onGuide(e.detail || {}));
  document.addEventListener('etape:rec', e => { const d = e.detail || {}; if (d.kind === 'stop' || d.kind === 'error' || d.kind === 'off') { auto[d.slot || 'estrada'] = false; clearTimeout(timers[d.slot || 'estrada']); } });
}
export function on() { return !!(S && S.prefs.autoRec && S.native && S.session && S.session.state === 'running'); }
export function toggle() { S.prefs.autoRec = !S.prefs.autoRec; store.setPrefs(S.prefs); voice.banner('REC automático ' + (S.prefs.autoRec ? 'ligado' : 'desligado'), 3, S.prefs.autoRec ? 'subida, topo, descida, chegada' : ''); return S.prefs.autoRec; }

// grava `slot` por `sec` segundos, sem mexer num REC que o Pedro já ligou
function shoot(slot, sec, why) {
  if (!on() || S.rec[slot]) return;
  cinema.rec(slot); auto[slot] = true; voice.banner('REC automático · ' + why, 3, slot === 'rosto' ? 'frontal' : 'estrada');
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
let flat = 0;
