// Étape Navegar · voice.js
// Voz em pt-BR, faixa de aviso (três níveis), borda vermelha e vibração.
import * as native from './native.js';
let muted = false, bannerTimer = null, edgeTimer = null, holdUntil = 0, curLevel = 9, curUntil = 0;
const $ = id => document.getElementById(id);

export function mute() { muted = true; try { speechSynthesis.cancel(); } catch (e) { } }
export function unmute() { muted = false; }
export function isMuted() { return muted; }

let lastSaid = '', lastLevel = 3;
export function last() { return lastSaid; }
// nível da faixa ativa agora (9 = nenhuma): o volume baixo dispensa um aviso vermelho
export function activeLevel() { return curUntil > Date.now() ? curLevel : 9; }
// repete a última instrução (volume baixo sem nada pendente); false quando não há o que repetir
export function repeat() { if (!lastSaid) return false; banner(lastSaid, 3, 'repetindo'); say(lastSaid, Math.max(2, lastLevel), true); return true; }
export function say(text, level = 3, isRepeat = false) {
  if (!isRepeat && level <= 2 && text && String(text).length > 3) { lastSaid = String(text); lastLevel = level; }   // o que vale repetir: instruções e avisos, não a conversa de nível 3
  if (muted) return;
  if (native.hasTts()) { if (level <= 2 || !native.speaking()) native.speak(text, level === 1, level); return; }   // casca: voz do Android, offline
  if (!('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text); u.lang = 'pt-BR'; u.rate = 1.05; u.pitch = 1;
    if (level <= 2 || !speechSynthesis.speaking) { if (level === 1) speechSynthesis.cancel(); speechSynthesis.speak(u); }
  } catch (e) { }
}
// faixa: nível 1 fica até `hold` ms (ou até clear); 2 some em 8 s; 3 em 5 s
export function banner(text, level = 3, sub = '', right = '', hold = 0, kind = '') {
  const el = $('cue'); if (!el) return;
  const now = Date.now();
  if (level > curLevel && curUntil > now) return;    // crítica 06/09: aviso mais fraco não cobre um mais forte ainda ativo (nível 2 dura 8 s)
  el.className = 'cue l' + level + (kind ? ' k-' + kind : '') + ' show'; el.setAttribute('aria-live', level === 1 ? 'assertive' : 'polite');
  el.innerHTML = '<div class="bar"></div><div class="ct"><b>' + esc(text) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>' + (right ? '<div class="r">' + right + '</div>' : '');
  clearTimeout(bannerTimer);
  const ms = level === 1 ? (hold || 12000) : level === 2 ? 8000 : 5000;
  holdUntil = level === 1 ? now + ms : 0; curLevel = level; curUntil = now + ms;
  bannerTimer = setTimeout(() => { el.classList.remove('show'); holdUntil = 0; curLevel = 9; curUntil = 0; }, ms);
  if (level === 1) flashEdge(3000);
}
export function clearBanner() { const el = $('cue'); if (el) el.classList.remove('show'); holdUntil = 0; curLevel = 9; curUntil = 0; }
export function flashEdge(ms) { const e = $('edge'); if (!e) return; e.classList.add('show'); clearTimeout(edgeTimer); edgeTimer = setTimeout(() => e.classList.remove('show'), ms); }
export function vibrate(level) {
  if (!navigator.vibrate) return;
  try { if (level === 1) navigator.vibrate([400, 100, 400]); else if (level === 2) navigator.vibrate([120, 80, 120]); } catch (e) { }
}
// atalho: evento completo (faixa + voz + vibração)
export function announce(ev) {
  banner(ev.text, ev.level, ev.sub || '', ev.right || '', ev.hold || 0, ev.kind || '');
  vibrate(ev.level);
  if (ev.level === 1) native.toFront();   // a casca por fora: um aviso vermelho traz o Étape à frente de qualquer app
  if (ev.voice !== false) say(ev.speak || ev.text, ev.level);
}
function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
