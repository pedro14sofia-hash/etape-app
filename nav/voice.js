// Étape Navegar · voice.js
// Voz em pt-BR, faixa de aviso (três níveis), borda vermelha e vibração.
let muted = false, bannerTimer = null, edgeTimer = null, holdUntil = 0;
const $ = id => document.getElementById(id);

export function mute() { muted = true; try { speechSynthesis.cancel(); } catch (e) { } }
export function unmute() { muted = false; }
export function isMuted() { return muted; }

export function say(text, level = 3) {
  if (muted || !('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text); u.lang = 'pt-BR'; u.rate = 1.05; u.pitch = 1;
    if (level <= 2 || !speechSynthesis.speaking) { if (level === 1) speechSynthesis.cancel(); speechSynthesis.speak(u); }
  } catch (e) { }
}
// faixa: nível 1 fica até `hold` ms (ou até clear); 2 some em 8 s; 3 em 5 s
export function banner(text, level = 3, sub = '', right = '', hold = 0, kind = '') {
  const el = $('cue'); if (!el) return;
  const now = Date.now();
  if (level > 1 && holdUntil > now) return;          // não cobre um nível 1 ativo
  el.className = 'cue l' + level + (kind ? ' k-' + kind : '') + ' show';
  el.innerHTML = '<div class="bar"></div><div class="ct"><b>' + esc(text) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>' + (right ? '<div class="r">' + right + '</div>' : '');
  clearTimeout(bannerTimer);
  const ms = level === 1 ? (hold || 12000) : level === 2 ? 8000 : 5000;
  holdUntil = level === 1 ? now + ms : 0;
  bannerTimer = setTimeout(() => { el.classList.remove('show'); holdUntil = 0; }, ms);
  if (level === 1) flashEdge(3000);
}
export function clearBanner() { const el = $('cue'); if (el) el.classList.remove('show'); holdUntil = 0; }
export function flashEdge(ms) { const e = $('edge'); if (!e) return; e.classList.add('show'); clearTimeout(edgeTimer); edgeTimer = setTimeout(() => e.classList.remove('show'), ms); }
export function vibrate(level) {
  if (!navigator.vibrate) return;
  try { if (level === 1) navigator.vibrate([400, 100, 400]); else if (level === 2) navigator.vibrate([120, 80, 120]); } catch (e) { }
}
// atalho: evento completo (faixa + voz + vibração)
export function announce(ev) {
  banner(ev.text, ev.level, ev.sub || '', ev.right || '', ev.hold || 0, ev.kind || '');
  vibrate(ev.level);
  if (ev.voice !== false) say(ev.speak || ev.text, ev.level);
}
function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
