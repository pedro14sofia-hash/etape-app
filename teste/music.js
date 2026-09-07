// Étape Navegar · music.js (pacote 5 · sem tela)
// O YouTube Music toca; o Étape só comanda pela casca (controle de mídia do Android) e aplica as regras de convivência:
// a voz pede foco de áudio por severidade (na casca), a música PAUSA em cada REC e volta depois, pausa ao encerrar a saída,
// opcionalmente pausa na descida categorizada (viagem: ligado; SP: desligado) e continua parado. Playlist do dia na largada
// (S.prefs.playlists[etapa] = link do YouTube Music). Estado em S.music; evento 'etape:music' no document para a faixa da Anna.
import * as native from './native.js';
import * as voice from './voice.js';
import * as store from './store.js';

let S = null, pausedByRec = 0, pausedByDescent = false, wasPlaying = false;

export function init(state) {
  S = state; S.music = null;
  S.prefs.music = { pauseDescent: !(S.free || S.diario), keepStill: true, ...(S.prefs.music || {}) };
  S.prefs.playlists = S.prefs.playlists || {};
  document.addEventListener('etape:music', e => { S.music = e.detail || null; });
  document.addEventListener('etape:rec', e => {
    const k = (e.detail || {}).kind;
    if (k === 'rec') { if (!pausedByRec) wasPlaying = playing(); pausedByRec++; if (wasPlaying) native.musicPause(); }
    if (k === 'stop' || k === 'error' || k === 'off') { if (pausedByRec > 0) { pausedByRec--; if (!pausedByRec && wasPlaying) { native.musicPlay(); wasPlaying = false; } } }
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
  if (!available() || !S.prefs.music.pauseDescent) return;
  const cat = S.live && S.live.climb && S.live.climb.cat;
  if (sit === 'descida' && !pausedByDescent && playing()) { pausedByDescent = true; native.musicPause(); return; }
  if (sit !== 'descida' && pausedByDescent) { pausedByDescent = false; if (!pausedByRec) native.musicPlay(); }
}
