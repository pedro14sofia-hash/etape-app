// Étape Navegar · cinema.js (Cinema pacotes 3 e 4 · máquina de estado, sem tela)
// O Cinema só existe dentro de uma sessão em andamento: entra e sai pelo botão lateral (duplo clique registrado na One UI →
// a casca recebe a chamada com o app na frente → tecla 'side'). Dois botões de REC, um por câmera: Estrada (traseira, modo
// Nitidez ou Aberto) e Rosto (frontal). Início e fim do clipe são manuais (um toque começa, outro termina; decisão do Pedro em 07/09). Comandos físicos: controle BLE de dois botões
// (teclas configuráveis em S.prefs.keys), volume como reserva dentro do Cinema. Voz "gravando" no início, bipe no fim.
// A tela do Cinema é da Anna: aqui só o estado (S.cinema, S.rec, S.sun) e o evento 'etape:cinema' no document.
import * as native from './native.js?v=1a47c3a9';
import * as voice from './voice.js?v=1a47c3a9';
import * as session from './session.js?v=1a47c3a9';
import * as store from './store.js?v=1a47c3a9';
import { light, minutesUntil } from './solar.js?v=1a47c3a9';

let S = null, lastKeyName = '';
const DEFAULT_KEYS = { rec1: 'enter', rec2: 'dpad', mode: '' };   // controle BLE em modo Android manda ENTER/DPAD_CENTER; modo iOS manda volume

export function init(state) {
  S = state; S.cinema = false; S.rec = { estrada: null, rosto: null }; S.sun = null;
  S.prefs.cineMode = S.prefs.cineMode || 'nitidez';
  S.prefs.keys = { ...DEFAULT_KEYS, ...(S.prefs.keys || {}) };
  document.addEventListener('etape:rec', e => { const d = e.detail || {}; if (/^(foto|fotoWarn|fotoErro|probe)$/.test(d.kind)) onFoto(d); else onRec(d); });
  // segundo plano: a casca fecha as câmeras (onPause); a tela sai do Cinema para não ficar transparente e sem prévia
  // tela apagada: sai da tela do Cinema (a casca solta a prévia sozinha), mas o clipe continua
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.cinema) exit(); });
}
export function active() { return !!(S && S.cinema); }
export function available() { return !!(S && S.native); }

// ---- entrar e sair
let frameTimer = 0;
export function enter(opts) {
  opts = opts || {};
  if (!available()) { voice.banner('Cinema só no app do celular', 2, 'aberto no navegador, sem câmera'); return false; }
  if (S.cinema) return true;
  if (!S.session || S.session.state !== 'running') voice.banner('Cinema sem saída em andamento', 3, 'filma, mas não entra no relatório do dia');   // decisão 4 (07/09): filmar parado, na vila, antes de Partir
  if (!native.cinemaPreview(true, false)) { voice.banner('Câmera sem permissão', 2); return false; }
  native.previewLook(S.prefs.previewLook !== false, S.prefs.cineLook || 1);
  native.previewZebra(S.prefs.cineMedir ? 0.92 : 0);
  if (S.prefs.cineFoto) native.photoMode('estrada', true);
  S.cinema = true; document.documentElement.classList.add('cinema'); emit('enter');
  voice.say('Cinema', 3);
  // enquadramento do dia: na primeira entrada do dia, a frontal aparece numa janela por 8 s para ajustar o suporte
  const today = new Date().toISOString().slice(0, 10);
  if (!opts.auto && S.prefs.frameDay !== today) { S.prefs.frameDay = today; store.setPrefs(S.prefs); native.cinemaFrame(true); voice.banner('Enquadramento do dia', 3, 'ajuste o suporte: estrada e rosto'); clearTimeout(frameTimer); frameTimer = setTimeout(() => native.cinemaFrame(false), 8000); }
  return true;
}
export function frame(on) { native.cinemaFrame(on); }
// medir (item 3 da revisão): zebra nas altas luzes + grade de terços + histograma. Só na tela, não toca no arquivo.
export function medir() { return !!S.prefs.cineMedir; }
// item 7: "isto foi bom" — marca o instante na telemetria do clipe; a noite escolhe o trecho em volta da marca
export function mark() {
  if (!S.rec.estrada && !S.rec.rosto) { voice.banner('Marca só durante o REC', 3); return false; }
  native.mark(); native.beep('mark'); if (S.session) session.mark(S.session, 'bom', { dist: S.proj ? S.proj.dist : 0 });
  voice.banner('Marcado', 3, 'a noite vai montar em volta deste instante'); return true;
}
export function setMedir(on) {
  S.prefs.cineMedir = !!on; store.setPrefs(S.prefs); native.previewZebra(on ? 0.92 : 0); emit('medir');
}
// ---- Modo Foto v0 (estudo aprovado em 07/09): chave dentro do Cinema; nada dispara sozinho
export const FOTO_MODES = ['movimento', 'velocidade', 'paisagem'];
export const FOTO_LABEL = { movimento: 'Em movimento', velocidade: 'Velocidade', paisagem: 'Paisagem' };
export function foto() { return !!S.prefs.cineFoto; }
export function setFoto(on) {
  on = !!on; if (S.prefs.cineFoto === on) return;
  if (on && (S.rec.estrada || S.rec.rosto)) { voice.banner('Pare o REC antes de passar para Foto', 3); return; }
  S.prefs.cineFoto = on; store.setPrefs(S.prefs); native.photoMode('estrada', on); native.photoMode('rosto', on); if (S.cinema) voice.say(on ? 'Foto' : 'Vídeo', 3); emit('foto');
}
export function setFotoMode(m) { if (!FOTO_MODES.includes(m)) return; S.prefs.fotoMode = m; store.setPrefs(S.prefs); emit('foto'); }
export function setFotoCfg(c) { S.prefs.fotoCfg = c === 'rastro' ? 'rastro' : 'arrasto'; store.setPrefs(S.prefs); emit('foto'); }
function teleSnap() {
  const p = S.pos, f = S.fix, live = S.live || {}, sen = S.sensors || {};
  return { place: S.place || '', ele: native.alt() != null ? Math.round(native.alt()) : (live.ele != null ? Math.round(live.ele) : null), v: f && f.v != null ? +(f.v * 3.6).toFixed(1) : (live.v != null ? +live.v.toFixed(1) : null), grade: live.grade != null ? +(+live.grade).toFixed(1) : null, hr: sen.hr || null, lat: p ? +p.lat.toFixed(6) : null, lon: p ? +p.lon.toFixed(6) : null, stage: S.stage ? S.stage.name : '', dist: Math.round(S.proj && S.proj.dist || 0), t: Date.now() };
}
// disparo: Estrada (traseira, no modo escolhido) ou Rosto (frontal, rajada de 4). Devolve 'ok' ou o motivo.
export function shoot(slot, opts) {
  if (!S.cinema) { if (!enter()) return 'sem cinema'; }
  if (!foto()) return 'em vídeo';
  const tele = teleSnap(); const v = tele.v || 0;
  const mode = slot === 'rosto' ? 'rosto' : (S.prefs.fotoMode || 'movimento'); const cfg = mode === 'velocidade' ? (S.prefs.fotoCfg || 'arrasto') : '';
  if (slot === 'rosto') { native.photoMode('rosto', true); native.camOpen('rosto', 'rosto_qhd'); }   // a frontal abre sem janela (prévia descartável); a janela do rosto é só para enquadrar
  let r = native.shoot(slot, mode, cfg, v, tele);
  const tries = (opts && opts.retry) || 0;
  if (slot === 'rosto' && (r === 'câmera fechada' || r === 'sem sessão') && tries < 3) {   // a frontal ainda está abrindo: tenta de novo em 1,5 s, até 3 vezes
    if (!tries) voice.banner('Abrindo a frontal…', 3); setTimeout(() => shoot('rosto', { retry: tries + 1 }), 1500); return 'abrindo';
  }
  if (r === 'ok') { native.beep('shot'); S.fotoBusy = { slot, at: Date.now() }; emit('foto'); }
  else voice.banner(({ 'ainda revelando': 'Espere: revelando a anterior', 'sem espaço': 'Sem espaço para fotos', 'gravando vídeo': 'Pare o REC para fotografar', 'câmera fechada': 'Câmera fechada: abra o Cinema', 'sem sessão': 'Câmera preparando; tente de novo' })[r] || 'Foto recusada', 2, r);
  return r;
}
function onFoto(ev) {
  if (ev.kind === 'foto') { S.fotoBusy = null; const c = ev.clip || {}; if (c.slot === 'rosto') native.cinemaFrame(false); /* a frontal fecha depois da foto: duas câmeras com leitor de 12 MP pesam no HAL */ if (S.session) session.mark(S.session, 'foto', { name: c.name, mode: c.mode, cfg: c.cfg, files: c.files, lat: c.tele && c.tele.lat, lon: c.tele && c.tele.lon, place: c.tele && c.tele.place }); voice.banner('Foto · ' + (FOTO_LABEL[c.mode] || c.mode) + (c.cfg ? ' · ' + c.cfg : ''), 3, (c.warn ? c.warn + ' · ' : '') + (c.files && c.files.length > 1 ? c.files.length + ' arquivos' : '1/' + (c.expUs ? Math.round(1000000 / c.expUs) : '?') + ' s · ISO ' + c.iso)); emit('foto'); }
  if (ev.kind === 'fotoWarn') voice.banner('Luz não dá para a velocidade pedida', 2, String(ev.detail || '').slice(0, 60));
  if (ev.kind === 'fotoErro') { S.fotoBusy = null; voice.banner('Foto falhou', 2, String(ev.detail || '').slice(0, 60)); emit('foto'); }
  if (ev.kind === 'probe') { let d = {}; try { d = JSON.parse(ev.detail); } catch (e) { } const n = (d.vendorRequestKeys || []).length; voice.banner('Teste Samsung: ' + n + ' chaves do fabricante', 3, d.expGotMs != null ? 'pediu 2000 ms, o sensor deu ' + Math.round(d.expGotMs) + ' ms' : (d.error || '')); }
}
export function probe() { if (!S.cinema || !foto()) { voice.banner('Abra o Cinema em Foto para o teste', 3); return; } native.photoProbe('estrada'); }
export function setLook(look) { S.prefs.cineLook = look; store.setPrefs(S.prefs); native.previewLook(S.prefs.previewLook !== false, look); native.nightLook(look); emit('look'); }
export function togglePreviewLook() { S.prefs.previewLook = S.prefs.previewLook === false; store.setPrefs(S.prefs); native.previewLook(S.prefs.previewLook, S.prefs.cineLook || 1); return S.prefs.previewLook; }
export function exit() {
  if (!S.cinema) return;
  // item 4 da revisão: sair da tela do Cinema NÃO encerra o clipe. A casca solta só a prévia e o MP4 segue.
  const wasRec = ['estrada', 'rosto'].filter(slot => S.rec[slot]);
  clearTimeout(frameTimer); native.cinemaFrame(false);
  native.cinemaPreview(false, false);
  if (wasRec.length) voice.banner('Gravando sem a tela', 3, 'toque em REC no Cinema para encerrar');
  S.cinema = false; document.documentElement.classList.remove('cinema'); emit('exit');
}
export function toggle() { if (S.cinema) exit(); else enter(); }
export function setMode(m) { if (m !== 'nitidez' && m !== 'aberto') return; S.prefs.cineMode = m; store.setPrefs(S.prefs); if (S.cinema && !S.rec.estrada) native.camOpen('estrada', m); emit('mode'); }

// ---- REC por câmera: liga ou desliga
export function rec(slot, opts) {
  if (!S.cinema) { if (!enter(opts)) return 'sem cinema'; }
  if (foto() && !(opts && opts.auto)) return shoot(slot);   // Modo Foto: o mesmo botão dispara em vez de gravar (gatilhos automáticos nunca fotografam)
  if (S.rec[slot]) { if (!S.rec[slot].pending) { native.recStop(slot); return 'stop'; } return 'pending'; }
  // frontal sempre em 1440p dentro do Cinema: junto com a Estrada em 4K, a frontal em 4K cai para 23 fps, e a ordem dos toques não importa
  const r = native.rec(slot, slot === 'rosto' ? 'rosto_qhd' : S.prefs.cineMode);
  if (r === 'ok') S.rec[slot] = { pending: true, at: Date.now() };   // até o evento rec chegar, um segundo toque não pede de novo
  if (r !== 'ok') { voice.banner(({ quente: 'Aparelho quente: sem REC', 'sem espaço': 'Sem espaço para gravar', 'sem permissão': 'Câmera sem permissão' })[r] || 'REC recusado', 2, r); }
  return r;
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
  if (ev.kind === 'hd') voice.banner('Espaço curto: Nitidez em 1080p', 2, String(ev.detail || '').slice(0, 60));
  if (ev.kind === 'off') { S.rec[slot] = null; emit('off'); }
}

// ---- teclas físicas: 'side' = botão lateral (duplo clique); no Cinema, volume ± = REC Estrada/Rosto; controle BLE pelas prefs
export function onKey(k) {
  lastKeyName = k;
  if (k === 'side') { toggle(); return true; }
  const K = S.prefs.keys;
  if (k === K.rec1) { rec('estrada'); return true; }
  if (k === K.rec2) { rec('rosto'); return true; }
  if (K.mode && k === K.mode) { if (foto()) setFotoMode(FOTO_MODES[(FOTO_MODES.indexOf(S.prefs.fotoMode || 'movimento') + 1) % FOTO_MODES.length]); else setMode(S.prefs.cineMode === 'nitidez' ? 'aberto' : 'nitidez'); return true; }
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
    if (S.sun.golden && S.sun.rel != null && S.sun.where !== 'noite' && S.prefs.goldenNow !== day && new Date().getHours() >= 12) { voice.say('Luz boa agora. Sol ' + (S.sun.where === 'costas' ? 'nas costas' : S.sun.where === 'frente' ? 'de frente' : 'de lado') + '.', 2); S.prefs.goldenNow = day; store.setPrefs(S.prefs); }
  }
}
function emit(kind) { document.dispatchEvent(new CustomEvent('etape:cinema', { detail: { kind, cinema: S.cinema, rec: S.rec, mode: S.prefs.cineMode } })); }
