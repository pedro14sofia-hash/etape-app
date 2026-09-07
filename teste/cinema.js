// Étape Navegar · cinema.js (Cinema pacotes 3 e 4 · máquina de estado, sem tela)
// O Cinema só existe dentro de uma sessão em andamento: entra e sai pelo botão lateral (duplo clique registrado na One UI →
// a casca recebe a chamada com o app na frente → tecla 'side'). Dois botões de REC, um por câmera: Estrada (traseira, modo
// Nitidez ou Aberto) e Rosto (frontal). Início e fim do clipe são manuais (um toque começa, outro termina; decisão do Pedro em 07/09). Comandos físicos: controle BLE de dois botões
// (teclas configuráveis em S.prefs.keys), volume como reserva dentro do Cinema. Voz "gravando" no início, bipe no fim.
// A tela do Cinema é da Anna: aqui só o estado (S.cinema, S.rec, S.sun) e o evento 'etape:cinema' no document.
import * as native from './native.js';
import * as voice from './voice.js';
import * as session from './session.js';
import * as store from './store.js';
import { light, minutesUntil } from './solar.js';

let S = null, lastKeyName = '';
const DEFAULT_KEYS = { rec1: 'enter', rec2: 'dpad', mode: '' };   // controle BLE em modo Android manda ENTER/DPAD_CENTER; modo iOS manda volume

export function init(state) {
  S = state; S.cinema = false; S.rec = { estrada: null, rosto: null }; S.sun = null;
  S.prefs.cineMode = S.prefs.cineMode || 'nitidez';
  S.prefs.keys = { ...DEFAULT_KEYS, ...(S.prefs.keys || {}) };
  document.addEventListener('etape:rec', e => onRec(e.detail || {}));
  // segundo plano: a casca fecha as câmeras (onPause); a tela sai do Cinema para não ficar transparente e sem prévia
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.cinema) exit(); });
}
export function active() { return !!(S && S.cinema); }
export function available() { return !!(S && S.native); }

// ---- entrar e sair
export function enter() {
  if (!available()) { voice.banner('Cinema só na casca', 2); return false; }
  if (!S.session || S.session.state !== 'running') { voice.banner('Cinema só com a saída em andamento', 3, 'toque em Partir primeiro'); return false; }
  if (S.cinema) return true;
  if (!native.cinemaPreview(true, false)) { voice.banner('Câmera sem permissão', 2); return false; }
  native.previewLook(S.prefs.previewLook !== false, S.prefs.cineLook || 1);
  S.cinema = true; document.documentElement.classList.add('cinema'); emit('enter');
  voice.say('Cinema', 3);
  // enquadramento do dia: na primeira entrada do dia, a frontal aparece numa janela por 8 s para ajustar o suporte
  const today = new Date().toISOString().slice(0, 10);
  if (S.prefs.frameDay !== today) { S.prefs.frameDay = today; store.setPrefs(S.prefs); native.cinemaFrame(true); voice.banner('Enquadramento do dia', 8, 'ajuste o suporte: estrada e rosto'); setTimeout(() => native.cinemaFrame(false), 8000); }
  return true;
}
export function frame(on) { native.cinemaFrame(on); }
export function setLook(look) { S.prefs.cineLook = look; store.setPrefs(S.prefs); native.previewLook(S.prefs.previewLook !== false, look); native.nightLook(look); emit('look'); }
export function togglePreviewLook() { S.prefs.previewLook = S.prefs.previewLook === false; store.setPrefs(S.prefs); native.previewLook(S.prefs.previewLook, S.prefs.cineLook || 1); return S.prefs.previewLook; }
export function exit() {
  if (!S.cinema) return;
  ['estrada', 'rosto'].forEach(slot => { if (S.rec[slot]) native.recStop(slot); });
  native.cinemaPreview(false, false);
  S.cinema = false; document.documentElement.classList.remove('cinema'); emit('exit');
}
export function toggle() { if (S.cinema) exit(); else enter(); }
export function setMode(m) { if (m !== 'nitidez' && m !== 'aberto') return; S.prefs.cineMode = m; store.setPrefs(S.prefs); if (S.cinema && !S.rec.estrada) native.camOpen('estrada', m); emit('mode'); }

// ---- REC por câmera: liga ou desliga
export function rec(slot) {
  if (!S.cinema) { if (!enter()) return; }
  if (S.rec[slot]) { if (!S.rec[slot].pending) native.recStop(slot); return; }
  // frontal sempre em 1440p dentro do Cinema: junto com a Estrada em 4K, a frontal em 4K cai para 23 fps, e a ordem dos toques não importa
  const r = native.rec(slot, slot === 'rosto' ? 'rosto_qhd' : S.prefs.cineMode);
  if (r === 'ok') S.rec[slot] = { pending: true, at: Date.now() };   // até o evento rec chegar, um segundo toque não pede de novo
  if (r !== 'ok') { voice.banner(({ quente: 'Aparelho quente: sem REC', 'sem espaço': 'Sem espaço para gravar', 'sem permissão': 'Câmera sem permissão' })[r] || 'REC recusado', 2, r); }
}
function onRec(ev) {
  const slot = ev.slot || 'estrada';
  if (ev.kind === 'rec') { S.rec[slot] = { name: ev.detail, at: Date.now(), mode: ev.mode }; voice.say(slot === 'rosto' ? 'gravando rosto' : 'gravando', 3); emit('rec'); }
  if (ev.kind === 'stop') {
    S.rec[slot] = null; native.beep('stop'); emit('stop');
    const c = ev.clip || {}, p = S.pos;
    if (S.session) session.mark(S.session, 'clipe', { name: c.name || ev.detail, slot, mode: ev.mode, ms: c.ms || 0, lat: p ? p.lat : null, lon: p ? p.lon : null, dist: S.proj ? S.proj.dist : 0, scene: c.scene || S.situation || '' });
  }
  if (ev.kind === 'error') { if (!S.rec[slot]) return; S.rec[slot] = null; voice.banner('Câmera: erro', 2, String(ev.detail || '').slice(0, 60)); emit('error'); }
  if (ev.kind === 'warm') voice.banner('Aparelho morno', 3, 'gravando mesmo assim');
  if (ev.kind === 'off') { S.rec[slot] = null; emit('off'); }
}

// ---- teclas físicas: 'side' = botão lateral (duplo clique); no Cinema, volume ± = REC Estrada/Rosto; controle BLE pelas prefs
export function onKey(k) {
  lastKeyName = k;
  if (k === 'side') { toggle(); return true; }
  const K = S.prefs.keys;
  if (k === K.rec1) { rec('estrada'); return true; }
  if (k === K.rec2) { rec('rosto'); return true; }
  if (K.mode && k === K.mode) { setMode(S.prefs.cineMode === 'nitidez' ? 'aberto' : 'nitidez'); return true; }
  if (S.cinema && k === 'up') { rec('estrada'); return true; }
  if (S.cinema && k === 'down') { rec('rosto'); return true; }
  return false;   // fora do Cinema, volume ± continuam com marcar lugar e abastecer
}
export function lastKey() { return lastKeyName; }
export function learnKeys(rec1, rec2, mode) { S.prefs.keys = { rec1, rec2, mode: mode || '' }; store.setPrefs(S.prefs); }

// ---- bússola de luz: a cada posição, onde está o sol em relação ao rumo e quanto falta para a luz baixa
export function updateSun() {
  const p = S.pos; if (!p) { S.sun = null; return; }
  const head = p.head != null ? p.head * 180 / Math.PI : null;
  const l = light(p.lat, p.lon, Date.now(), head);
  S.sun = { az: Math.round(l.az), el: Math.round(l.el), rel: l.rel == null ? null : Math.round(l.rel), where: l.where, golden: l.golden, lowIn: l.where === 'noite' ? null : minutesUntil(p.lat, p.lon, Date.now(), 10) };
  // aviso de hora dourada, uma vez por dia: "luz boa em 20 min" e "luz boa agora"
  if (S.session && S.session.state === 'running') {
    const day = new Date().toISOString().slice(0, 10);
    if (S.sun.lowIn != null && S.sun.lowIn > 0 && S.sun.lowIn <= 30 && S.prefs.goldenSoon !== day) { S.prefs.goldenSoon = day; store.setPrefs(S.prefs); voice.say('Luz boa em ' + S.sun.lowIn + ' minutos.', 3); }
    if (S.sun.golden && S.sun.where !== 'noite' && S.prefs.goldenNow !== day && new Date().getHours() >= 12) { S.prefs.goldenNow = day; store.setPrefs(S.prefs); voice.say('Luz boa agora. Sol ' + (S.sun.where === 'costas' ? 'nas costas' : S.sun.where === 'frente' ? 'de frente' : 'de lado') + '.', 3); }
  }
}
function emit(kind) { document.dispatchEvent(new CustomEvent('etape:cinema', { detail: { kind, cinema: S.cinema, rec: S.rec, mode: S.prefs.cineMode } })); }
