// Étape Navegar · native.js
// Adaptador da casca nativa (window.EtapeNative, N3a). Sem a ponte, tudo continua web. Com ela:
// - barômetro: altitude relativa pela pressão (fórmula barométrica), calibrada devagar pela cota de referência (perfil da
//   rota quando na rota; relevo no modo livre) e rampa "agora" pela altitude do barômetro contra a distância pedalada;
// - brilho automático pelo sensor de luz com piso de 40 % ao sol; tema noite limita a 50 %;
// - tela sempre ligada pela casca (além do Wake Lock da web);
// - estado térmico: acima de "moderado" o app baixa o 3D para 30 qps e desliga o satélite no 3D.
import * as ponte from './casca/ponte.js';
const N = { on: false, p0: 1013.25, offset: null, alt: null, altT: 0, samples: [], grade: null, ok: false, thermal: 0, lux: null, ref: null, refT: 0 };
const H = p => 44330 * (1 - Math.pow(p / N.p0, 1 / 5.255));   // altura barométrica (m) para a pressão p (hPa)
export function available() { return N.on; }
// item 1 da revisão final (u2-largada): o portão certo para uma linha que depende da casca é a existência do
// método que ela vai chamar, não a existência de window.EtapeNative — a casca pode existir e ainda não ter
// exposto o método que uma tela pede (é o caso hoje de qualquer pedido de permissão). Teste honesto por nome.
export function disponivel(nome) { try { return !!(window.EtapeNative && typeof window.EtapeNative[nome] === 'function'); } catch (e) { return false; } }
export function init() {
  const B = window.EtapeNative; if (!B) return false;
  N.on = true;
  // 11/09 (ADR-0006): a tabela window.EtapeEvents passou para casca/ponte.js; aqui ficam so os ouvintes do que ainda
  // nao virou Capacidade. Cada bloco some quando a sua capacidade nascer (plano 2). Os CustomEvent no document sao
  // a forma antiga dos mesmos eventos e somem junto. 'update' ja nao vira CustomEvent: ninguem o ouvia.
  ponte.ligar();
  ponte.ao('fix', (lat, lon, acc, v, head, alt, t) => { if (N.onFix) N.onFix({ t: +t || Date.now(), lat: +lat, lon: +lon, acc: +acc || 0, ele: +alt > -9000 ? +alt : null, speed: +v >= 0 ? +v : null, head: +head >= 0 ? +head : null, src: 'gps' }); });
  ponte.ao('key', (k, dev) => { N.lastKeyDev = String(dev || ''); if (N.onKey) N.onKey(String(k)); });
  ponte.ao('photo', name => { const cb = N.onPhoto; N.onPhoto = null; if (cb) cb(String(name || '')); });
  ponte.ao('baro', (p, t) => onBaro(+p, +t));
  ponte.ao('light', lux => { N.lux = +lux; });
  ponte.ao('thermal', st => { N.thermal = +st; });
  ponte.ao('rec', ev => document.dispatchEvent(new CustomEvent('etape:rec', { detail: ev })));
  ponte.ao('music', st => document.dispatchEvent(new CustomEvent('etape:music', { detail: st })));
  ponte.ao('night', st => { N.night = st; document.dispatchEvent(new CustomEvent('etape:night', { detail: st })); });
  ponte.ao('drive', st => { N.drive = st; document.dispatchEvent(new CustomEvent('etape:drive', { detail: st })); });
  ponte.ao('rotate', deg => { N.rot = +deg || 0; document.dispatchEvent(new CustomEvent('etape:rotate', { detail: N.rot })); });
  ponte.ao('away', id => { N.away = String(id || ''); document.dispatchEvent(new CustomEvent('etape:away', { detail: N.away })); });
  // U7: resposta das tres permissoes que a casca passou a saber pedir. Uma de cada vez — a tela "Primeira vez"
  // pede em sequencia —, e quem nao estava esperando ignora.
  ponte.ao('perm', ok => { const cb = N.onPerm; N.onPerm = null; if (cb) cb(!!ok); });
  ponte.ao('energia', st => { N.energia = st; document.dispatchEvent(new CustomEvent('etape:energia', { detail: st })); });
  try { if (B.hasBaro()) B.baroStart(); } catch (e) { }
  try { B.brightness(-1); B.keepOn(true); } catch (e) { }
  try { N.thermal = +B.thermal() || 0; } catch (e) { }
  return true;
}
function onBaro(p, t) {
  const h = H(p);
  // filtro leve (constante 1,5 s) para tirar o ruído do vento nas aberturas do aparelho
  N.alt = N.alt == null ? h : N.alt + (h - N.alt) * Math.min(1, (t - N.altT) / 1500); N.altT = t;
}
// referência de altitude (m) na distância dist: chamada a cada fix na rota (cota do perfil) ou no modo livre (relevo).
// O offset entre barômetro e referência converge devagar (constante 3 min) e rápido no primeiro minuto.
export function calibrate(refEle, dist, t) {
  if (!N.on || N.alt == null || refEle == null) return;
  const want = refEle - N.alt;
  if (N.offset == null) { N.offset = want; N.refT = t; }
  else { const k = t - N.refT < 60000 ? 0.2 : 0.01; N.offset += (want - N.offset) * k; }
  N.ref = refEle;
  // rampa agora: altitude do barômetro contra a distância pedalada nos últimos 40–60 m
  N.samples.push([dist, N.alt + N.offset, t]); while (N.samples.length > 40) N.samples.shift();
  const last = N.samples[N.samples.length - 1]; let i = N.samples.length - 1; while (i > 0 && last[0] - N.samples[i][0] < 45) i--;
  const a = N.samples[i]; const dd = last[0] - a[0];
  N.grade = dd >= 25 && last[2] - a[2] < 60000 ? (last[1] - a[1]) / dd * 100 : null;
  N.ok = true;
}
export function alt() { return N.ok && N.alt != null && N.offset != null ? N.alt + N.offset : null; }
export function grade() { return N.ok && N.grade != null && isFinite(N.grade) ? Math.max(-30, Math.min(30, N.grade)) : null; }
export function thermal() { return N.thermal; }
export function lux() { return N.lux; }
export function setNight(on) { try { if (N.on) window.EtapeNative.brightnessCap(on ? 0.5 : 1.0); } catch (e) { } }
export function status() { return N.on ? { alt: alt(), grade: grade(), raw: N.alt, offset: N.offset, ref: N.ref, thermal: N.thermal, lux: N.lux, n: N.samples.length } : null; }
// ---- N3b · pedal com a tela apagada: o serviço nativo entrega as posições (1 Hz) mesmo com a tela apagada
export function rideStart(onFix) { if (!N.on) return false; N.onFix = onFix; try { return !!window.EtapeNative.rideStart(); } catch (e) { return false; } }
export function rideStop() { N.onFix = null; try { if (N.on) window.EtapeNative.rideStop(); } catch (e) { } }
// U7: pede uma das tres permissoes da casca e devolve 'concedido' ou 'negado', como a linha da localizacao.
// Sem a casca, ou sem o metodo, a resposta e 'negado' na hora — a tela ja bloqueia o botao antes disso.
// A de acesso a notificacoes abre uma TELA do sistema e pode demorar: quem chama corre o proprio prazo.
export function pedirPermissao(nome) {
  return new Promise(res => {
    if (!disponivel(nome)) return res('negado');
    N.onPerm = ok => res(ok ? 'concedido' : 'negado');
    try { window.EtapeNative[nome](); } catch (e) { N.onPerm = null; res('negado'); }
  });
}
export function keepOn(on) { try { if (N.on) window.EtapeNative.keepOn(!!on); } catch (e) { } }
export function wake(ms = 15000) { try { if (N.on) window.EtapeNative.wake(ms); } catch (e) { } }
// voz do sistema (offline); null quando não há
export function hasTts() { try { return N.on && !!window.EtapeNative.hasTts(); } catch (e) { return false; } }
export function speak(text, flush, level) { try { if (window.EtapeNative.speakAt) window.EtapeNative.speakAt(String(text), !!flush, +level || (flush ? 1 : 3)); else window.EtapeNative.speak(String(text), !!flush); } catch (e) { } }
export function speaking() { try { return !!window.EtapeNative.speaking(); } catch (e) { return false; } }
export function onKey(cb) { N.onKey = cb; }
export function photo(name, cb) { if (!N.on) return false; N.onPhoto = cb; try { window.EtapeNative.photo(String(name)); return true; } catch (e) { N.onPhoto = null; return false; } }
export function saveGpx(name, text) { try { return N.on && !!window.EtapeNative.saveGpx(String(name), String(text)); } catch (e) { return false; } }
// ---- N4 · checklist de partida: bateria, espaço, GPS, barômetro, voz. Cada item {ok, txt}
export async function checklist(S) {
  if (!N.on) return null; const B = window.EtapeNative, out = [];
  try { const b = JSON.parse(B.battery()); out.push({ ok: b.level >= 60 || b.charging, txt: 'Bateria ' + b.level + ' %' + (b.charging ? ' · carregando' : b.level < 60 ? ' · carregue antes de sair' : '') }); } catch (e) { }
  try { const st = JSON.parse(B.storage()); out.push({ ok: st.freeMB > 500, txt: 'Espaço livre ' + (st.freeMB >= 1024 ? (st.freeMB / 1024).toFixed(1) + ' GB' : st.freeMB + ' MB') + ' · conteúdo ' + st.contentMB + ' MB' }); } catch (e) { }
  const f = S.fix || S.pos; const age = S.fix ? (Date.now() - S.fix.t) / 1000 : null;
  out.push({ ok: !!f && (age == null || age < 60) && (!S.fix || (S.fix.acc || 0) <= 30), txt: !f ? 'GPS sem posição ainda' : 'GPS ' + (S.fix && S.fix.acc ? 'a ' + Math.round(S.fix.acc) + ' m' : 'posição única') + (age != null && age > 60 ? ' · há ' + Math.round(age / 60) + ' min' : '') });
  out.push({ ok: N.alt != null, txt: N.alt != null ? 'Barômetro ' + Math.round(N.alt) + ' m brutos' + (N.offset != null ? ' · calibrado' : ' · calibra ao partir') : 'Barômetro sem leitura' });
  out.push({ ok: hasTts(), txt: hasTts() ? 'Voz do sistema pronta' : 'Voz do sistema indisponível' });
  try { const t = +B.thermal(); out.push({ ok: t < 2, txt: 'Temperatura ' + ['normal', 'leve', 'moderada', 'severa', 'crítica'][Math.min(4, t)] }); } catch (e) { }
  // Anna 07/09: as linhas da casca — noite, Drive, app, música, câmeras
  try { const nt = JSON.parse(B.nightState()); const y = new Date(Date.now() - 86400000); const day = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0'); const built = !!B.nightBuilt(day); const clips = JSON.parse(B.nightClips(day)).length;
    out.push({ ok: built || !clips, txt: 'Noite: ' + (nt.phase === 'clip' || nt.phase === 'start' ? 'montando o clipe do dia (' + (nt.done || 0) + '/' + nt.clips + ')' : built ? 'clipe de ontem montado' : clips ? clips + ' clipes de ontem por montar · deixe na tomada' : 'sem clipes de ontem') }); } catch (e) { }
  try { const acct = String(B.driveAccount() || ''); const pend = +B.drivePending() || 0; const ds = JSON.parse(B.driveState());
    out.push({ ok: !!acct && (pend === 0 || ds.phase === 'uploading'), txt: !acct ? 'Drive sem conta · Mais → Drive' : ds.phase === 'uploading' ? 'Drive enviando ' + (ds.file || '') : pend ? 'Drive: ' + pend + ' arquivos por enviar · Wi-Fi + tomada' : 'Drive em dia' }); } catch (e) { }
  try { const v = JSON.parse(B.version()); const us = JSON.parse(B.updateState()); out.push({ ok: us.phase !== 'error', txt: 'App v' + v.code + (us.phase === 'done' ? ' · atualizado, reabra para usar' : us.phase === 'current' ? ' · atual' : us.phase === 'downloading' ? ' · baixando atualização' : us.phase === 'error' ? ' · atualização falhou' : '') }); } catch (e) { }
  try { const n = +B.driveDelivered() || 0; const ds = JSON.parse(B.driveState()); out.push({ ok: true, txt: ds.phase === 'fetching' ? 'Filmes prontos: baixando ' + (ds.file || '') : n ? 'Filmes prontos: ' + n + ' na galeria (Movies/Etape/…/pronto)' : 'Filmes prontos: nenhum ainda (a fábrica devolve pelo Drive)' }); } catch (e) { }
  try { const m = JSON.parse(B.musicState()); out.push({ ok: !!m.granted, txt: !m.granted ? 'Música sem acesso a notificações' : m.title ? 'Música: ' + m.title : 'Música pronta · YouTube Music' }); } catch (e) { }
  try { const c = JSON.parse(B.camCaps()); const back = (c.cameras || []).find(x => x.facing === 'back' && x.ois); const front = (c.cameras || []).find(x => x.facing === 'front'); out.push({ ok: !!back && !!front, txt: 'Câmeras: ' + (back ? 'Nitidez ' + (back.hlg10 ? '10 bits' : '8 bits') : 'sem traseira') + (front ? ' · Rosto pronto' : ' · sem frontal') }); } catch (e) { }
  return out;
}
// ---- N2b · modo dedicado (só com Device Owner)
// U7: os quatro numeros que as linhas mortas dos Ajustes esperavam. Cada um devolve null sem casca — a linha
// ja se desabilita antes disso, e o null e a segunda rede.
export function bateria() { try { return N.on ? JSON.parse(window.EtapeNative.battery()) : null; } catch (e) { return null; } }
export function espaco() { try { return N.on ? JSON.parse(window.EtapeNative.storage()) : null; } catch (e) { return null; } }
export function driveResumo() { try { return N.on ? { conta: String(window.EtapeNative.driveAccount() || ''), fila: +window.EtapeNative.drivePending() || 0 } : null; } catch (e) { return null; } }
// U7 · Cortina e Guardado. `cortinaPronta` avisa que a tela desenhou de verdade — sem ele a Cortina assume em 6 s
// e mostra a saida de emergencia. `guardar` devolve 'ok', 'em pedal' ou o motivo; nunca guarda com uma saida em
// andamento, so apaga a tela e deixa o GPS gravando.
export function cortinaPronta() { try { if (N.on && window.EtapeNative.cortinaPronta) window.EtapeNative.cortinaPronta(); } catch (e) { } }
// U8: o acesso a notificacoes e o portao de toda a musica; a tela precisa do estado de verdade.
export function ouveNotificacoes() { try { return !!(N.on && window.EtapeNative.ouveNotificacoes && window.EtapeNative.ouveNotificacoes()); } catch (e) { return false; } }
export function guardar() { try { return N.on && window.EtapeNative.guardar ? String(window.EtapeNative.guardar()) : 'sem casca'; } catch (e) { return 'erro: ' + e; } }
export function energia() { try { return N.on && window.EtapeNative.energia ? JSON.parse(window.EtapeNative.energia()) : null; } catch (e) { return null; } }
// ---- Cinema pacote 1 · câmera e gravação (só na casca). Eventos viram 'etape:rec' no document, com detail = o JSON da casca
// UC3a: a cadencia do Cinema ('30' | '24-48' | '24-50'). Vale para a proxima sessao de camera; um clipe em
// andamento nao muda de cadencia no meio, que e o certo.
export function cineCadencia(nome) { try { if (N.on && window.EtapeNative.cineCadencia) window.EtapeNative.cineCadencia(String(nome || '30')); } catch (e) { } }
export function cineCadenciaAtual() { try { return N.on && window.EtapeNative.cineCadenciaAtual ? String(window.EtapeNative.cineCadenciaAtual()) : ''; } catch (e) { return ''; } }
export function camCaps() { try { return N.on ? JSON.parse(window.EtapeNative.camCaps()) : null; } catch (e) { return null; } }
export function cinemaPreview(on, top) { try { return N.on && !!window.EtapeNative.cinemaPreview(!!on, !!top); } catch (e) { return false; } }
export function camOpen(slot, mode) { try { return N.on && !!window.EtapeNative.camOpen(slot, mode); } catch (e) { return false; } }
export function rec(slot, mode) { try { return N.on ? String(window.EtapeNative.rec(slot, mode)) : 'sem casca'; } catch (e) { return String(e); } }
export function recStop(slot) { try { if (N.on) window.EtapeNative.recStop(slot); } catch (e) { } }
export function recState() { try { return N.on ? JSON.parse(window.EtapeNative.recState()) : []; } catch (e) { return []; } }
export function telemetry(json) { try { if (N.on) window.EtapeNative.telemetry(json); } catch (e) { } }
export function recContext(json) { try { if (N.on) window.EtapeNative.recContext(json); } catch (e) { } }
export function beep(kind) { try { if (N.on) window.EtapeNative.beep(String(kind || '')); } catch (e) { } }
export function lastKeyDevice() { return N.lastKeyDev || ''; }
// ---- pacote 5 · música
export function musicState() { try { return N.on ? JSON.parse(window.EtapeNative.musicState()) : null; } catch (e) { return null; } }
export function musicPlay() { try { if (N.on) window.EtapeNative.musicPlay(); } catch (e) { } }
export function musicPause() { try { if (N.on) window.EtapeNative.musicPause(); } catch (e) { } }
export function musicNext() { try { if (N.on) window.EtapeNative.musicNext(); } catch (e) { } }
export function musicPrev() { try { if (N.on) window.EtapeNative.musicPrev(); } catch (e) { } }
export function musicOpen(url) { try { return N.on && !!window.EtapeNative.musicOpen(String(url || '')); } catch (e) { return false; } }
// ---- pacote 7 · noite (clipe do dia)
export function nightBuild(day, withData) { try { return N.on && !!window.EtapeNative.nightBuild(String(day), withData !== false); } catch (e) { return false; } }
export function nightState() { try { return N.on ? JSON.parse(window.EtapeNative.nightState()) : null; } catch (e) { return null; } }
export function nightClips(day) { try { return N.on ? JSON.parse(window.EtapeNative.nightClips(String(day))) : []; } catch (e) { return []; } }
export function nightBuilt(day) { try { return N.on && !!window.EtapeNative.nightBuilt(String(day)); } catch (e) { return false; } }
// ---- pacote 8 · Drive
export function driveLink() { try { if (N.on) window.EtapeNative.driveLink(); } catch (e) { } }
export function driveUnlink() { try { if (N.on) window.EtapeNative.driveUnlink(); } catch (e) { } }
export function driveAccount() { try { return N.on ? String(window.EtapeNative.driveAccount()) : ''; } catch (e) { return ''; } }
export function driveSync(force) { try { return N.on && !!window.EtapeNative.driveSync(!!force); } catch (e) { return false; } }
export function driveState() { try { return N.on ? JSON.parse(window.EtapeNative.driveState()) : null; } catch (e) { return null; } }
export function drivePending() { try { return N.on ? +window.EtapeNative.drivePending() : 0; } catch (e) { return 0; } }
export function rotation() { try { return N.on ? (+window.EtapeNative.rotation() || 0) : 0; } catch (e) { return 0; } }
export function storage() { try { return N.on ? JSON.parse(window.EtapeNative.storage()) : null; } catch (e) { return null; } }
// ---- Cinema v1/v2 · prévia com look, enquadramento do dia, look da noite, entrega dos filmes prontos
export function previewLook(on, look) { try { if (N.on) window.EtapeNative.previewLook(!!on, +look || 1); } catch (e) { } }
export function cinemaFrame(on) { try { if (N.on) window.EtapeNative.cinemaFrame(!!on); } catch (e) { } }
export function nightLook(look) { try { if (N.on) window.EtapeNative.nightLook(+look || 1); } catch (e) { } }
export function driveFetch() { try { return N.on && !!window.EtapeNative.driveFetch(); } catch (e) { return false; } }
export function driveDelivered() { try { return N.on ? +window.EtapeNative.driveDelivered() : 0; } catch (e) { return 0; } }
export function openFolder(day, sub) { try { if (N.on) window.EtapeNative.openFolder(String(day || ''), String(sub || '')); } catch (e) { } }
// ---- diário do passeio e subida pelo celular (07/09)
export function battery() { try { return N.on ? window.EtapeNative.battery() : ''; } catch (e) { return ''; } }
export function saveReport(day, name, json) { try { return N.on && !!window.EtapeNative.saveReport(String(day), String(name), json); } catch (e) { return false; } }
export function driveCell(gb) { try { if (N.on) window.EtapeNative.driveCell(+gb || 0); } catch (e) { } }
export function driveCellGB() { try { return N.on ? +window.EtapeNative.driveCellGB() || 0 : 0; } catch (e) { return 0; } }
// ---- Modo Foto v0 (07/09): foto dentro do Cinema
export function photoMode(slot, on) { try { if (N.on) window.EtapeNative.photoMode(String(slot), !!on); } catch (e) { } }
export function shoot(slot, mode, cfg, speedKmh, tele) { try { return N.on ? String(window.EtapeNative.shoot(String(slot), String(mode), String(cfg || ''), +speedKmh || 0, JSON.stringify(tele || {}))) : 'sem casca'; } catch (e) { return 'erro: ' + e; } }
export function photoProbe(slot) { try { if (N.on) window.EtapeNative.photoProbe(String(slot)); } catch (e) { } }
export function roll() { try { return N.on ? +window.EtapeNative.roll() || 0 : 0; } catch (e) { return 0; } }
// ---- a casca por fora (07/09): os quatro apps de fora, a aba amarela, a volta ao Étape, reiniciar
export function apps() { try { return N.on && window.EtapeNative.apps ? JSON.parse(window.EtapeNative.apps()) : []; } catch (e) { return []; } }
export function openApp(id, lat, lon, q) { try { return N.on ? String(window.EtapeNative.openApp(String(id), +lat || 0, +lon || 0, String(q || ''))) : 'sem casca'; } catch (e) { return 'erro: ' + e; } }
export function appReturn(id, min) { try { if (N.on) window.EtapeNative.appReturn(String(id), +min || 0); } catch (e) { } }
export function awayApp() { try { return N.on ? String(window.EtapeNative.awayApp() || '') : ''; } catch (e) { return ''; } }
export function tabText(t) { try { if (N.on && window.EtapeNative.tabText && N.tabLast !== t) { N.tabLast = t; window.EtapeNative.tabText(String(t || '')); } } catch (e) { } }
// U7: o aviso de nivel 2 vai para a aba enquanto outro app esta na frente. So manda quando MUDA — a aba e
// redesenhada a cada segundo pelo relogio da contagem, e reenviar o mesmo texto seria trabalho por nada.
export function tabAviso(t) { try { if (N.on && window.EtapeNative.tabAviso && N.avisoLast !== t) { N.avisoLast = t; window.EtapeNative.tabAviso(String(t || '')); } } catch (e) { } }
export function tabAllowed() { try { return N.on && !!window.EtapeNative.tabAllowed(); } catch (e) { return false; } }
export function toFront() { try { if (N.on && window.EtapeNative.toFront) window.EtapeNative.toFront(); } catch (e) { } }
// ---- item 3 da revisão (08/09): zebra e a medida do quadro na prévia
export function previewZebra(level) { try { if (N.on) window.EtapeNative.previewZebra(+level || 0); } catch (e) { } }
export function previewStats() { try { return N.on ? JSON.parse(window.EtapeNative.previewStats() || 'null') : null; } catch (e) { return null; } }
export function mark() { try { if (N.on) window.EtapeNative.mark(); } catch (e) { } }
