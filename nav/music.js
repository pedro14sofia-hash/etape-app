// Étape Navegar · music.js (pacote 5 · sem tela)
// O YouTube Music toca; o Étape só comanda pela casca (controle de mídia do Android) e aplica as regras de convivência:
// a voz pede foco de áudio por severidade (na casca), a música PAUSA em cada REC e volta depois, pausa ao encerrar a saída,
// opcionalmente pausa na descida categorizada (viagem: ligado; SP: desligado) e continua parado. Playlist do dia na largada
// (S.prefs.playlists[etapa] = link do YouTube Music). Estado em S.music; evento 'etape:music' no document para a faixa da Anna.
import * as native from './native.js?v=c8177a80';
import * as voice from './voice.js?v=c8177a80';
import * as store from './store.js?v=c8177a80';

let S = null, pausedByDescent = false, wasPlaying = false; const recSlots = new Set();

export function init(state) {
  S = state; S.music = null;
  S.prefs.music = { keepStill: true, ...(S.prefs.music || {}) };   // pauseDescent: padrão decidido na hora (viagem sim, Diário/livre não)
  S.prefs.playlists = S.prefs.playlists || {};
  document.addEventListener('etape:music', e => { S.music = e.detail || null; });
  document.addEventListener('etape:rec', e => {
    const ev = e.detail || {}, k = ev.kind, slot = ev.slot || 'estrada';
    if (k === 'rec') { if (!recSlots.size) wasPlaying = playing(); recSlots.add(slot); if (wasPlaying) native.musicPause(); }
    if (k === 'stop' || k === 'error' || k === 'off') { if (!recSlots.has(slot)) return; recSlots.delete(slot); if (!recSlots.size && wasPlaying) { wasPlaying = false; if (!(ev.clip && ev.clip.reason === 'closed')) native.musicPlay(); } }   // fechado pelo segundo plano: não retoma
  });
  S.music = native.musicState();
}
export function available() { return !!(S && S.native && S.music && S.music.granted); }
export function playing() { const m = native.musicState(); return !!(m && m.playing); }
export function toggle() { if (playing()) native.musicPause(); else native.musicPlay(); }
export function next() { native.musicNext(); }
export function prev() { native.musicPrev(); }
export function setPref(k, v) { S.prefs.music[k] = v; store.setPrefs(S.prefs); }
export function setPlaylist(stageKey, url) { S.prefs.playlists[stageKey] = url || ''; store.setPrefs(S.prefs); }

// largada: abre a playlist do dia (ou retoma o que tocava)
export function onStart() {
  if (!available()) return;
  const url = S.stage && S.prefs.playlists[S.stage.key];
  if (url) { native.musicOpen(url); voice.banner('Playlist do dia', 3, 'YouTube Music'); }
}
// encerrar: silêncio para o ritual de chegada
export function onFinish() { if (available() && playing()) native.musicPause(); }
// situação: descida categorizada pausa (preferência); ao acabar a descida, volta
export function onSituation(sit) {
  const pref = S.prefs.music.pauseDescent != null ? S.prefs.music.pauseDescent : !(S.free || S.diario);
  if (!available() || !pref) return;
  // descida de verdade: rampa abaixo de −4 % por trecho (não a curva a 300 m que updateSituation também chama de descida)
  const g = S.live && S.live.grade != null ? +S.live.grade : 0;
  if (sit === 'descida' && g <= -4 && !pausedByDescent && playing()) { pausedByDescent = true; native.musicPause(); return; }
  if (sit !== 'descida' && pausedByDescent) { pausedByDescent = false; if (!recSlots.size) native.musicPlay(); }
}
