// Étape Navegar · cinema-ui.js (Anna · a tela do Cinema, a faixa da música, aprovadas em 07/09/2026)
// A câmera ocupa a tela (a página fica transparente: a prévia nativa está por baixo). Por cima, o placar da transmissão:
// barra de cima (etapa, km, relógio, REC), tulipa e distância, bússola de luz, seletor Nitidez/Aberto, contador de clipes,
// dois botões de REC do lado da mão direita, e embaixo velocidade, rampa, bpm e o lugar. Um toque na imagem esconde tudo
// menos os botões. Em pé ou deitada pelo acelerômetro da casca (a atividade é travada em pé: a sobreposição gira por CSS).
// Fora do Cinema: a faixa da música na Fita, abaixo do cabeçalho, só quando há uma sessão de mídia.
import * as native from './native.js';
import * as cinema from './cinema.js';
import * as music from './music.js';
import * as sensors from './sensors.js';
import { svgArrow } from './ui.js';

let S = null, timer = 0, rot = 0, bare = false;
const $ = id => document.getElementById(id);
const n0 = v => Math.round(v).toLocaleString('pt-BR');
const fmt1 = v => (Math.round(v * 10) / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pad = v => String(v).padStart(2, '0');

export function init(state) {
  S = state;
  const root = $('cinema'); if (!root) return;
  document.addEventListener('etape:cinema', e => { const k = e.detail.kind; if (k === 'enter') show(); if (k === 'exit') hide(); render(); });
  document.addEventListener('etape:rec', render);
  document.addEventListener('etape:music', musicBar);
  document.addEventListener('etape:rotate', e => { rot = +e.detail || 0; applyRot(); });
  $('cnEstrada').onclick = () => cinema.rec('estrada');
  $('cnRosto').onclick = () => cinema.rec('rosto');
  $('cnNitidez').onclick = () => cinema.setMode('nitidez');
  $('cnAberto').onclick = () => cinema.setMode('aberto');
  $('cnTap').onclick = () => { bare = !bare; root.classList.toggle('bare', bare); };
  $('cnExit').onclick = () => cinema.exit();
  $('mbToggle').onclick = e => { e.stopPropagation(); music.toggle(); };
  $('mbNext').onclick = e => { e.stopPropagation(); music.next(); };
  musicBar();
}
function show() { $('cinema').hidden = false; document.documentElement.classList.add('cinema'); bare = false; $('cinema').classList.remove('bare'); rot = native.rotation(); applyRot(); render(); if (!timer) timer = setInterval(render, 250); }
function hide() { $('cinema').hidden = true; document.documentElement.classList.remove('cinema'); if (timer) { clearInterval(timer); timer = 0; } }
function applyRot() { const r = $('cinema'); r.classList.toggle('land', rot === 90 || rot === 270); r.classList.toggle('r270', rot === 270); r.classList.toggle('r180', rot === 180); }

// ---- o placar
function render() {
  if (!S || !S.cinema) return;
  const st = S.stage || {}, live = S.live || {}, sen = S.sensors || sensors.current() || {}, d = S.proj && S.proj.dist || 0;
  const code = S.diario || S.free ? 'SP' : (st.key && /^\d/.test(String(st.key)) ? 'E' + st.key : String(st.key || '')); const nm = st.name && !st.name.toUpperCase().startsWith(code) ? ' · ' + st.name : (st.name ? ' · ' + st.name.replace(/^SP\s*·\s*/i, '') : '');
  $('cnName').textContent = code + nm;
  const now = new Date(); $('cnSub').textContent = 'KM ' + fmt1(d / 1000) + ' · ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
  // REC: relógio do clipe mais antigo em curso
  const recs = ['estrada', 'rosto'].filter(k => S.rec[k]); const at = recs.length ? Math.min(...recs.map(k => S.rec[k].at)) : 0;
  $('cnRec').hidden = !recs.length; if (recs.length) { const s = Math.min(30, Math.floor((Date.now() - at) / 1000)); $('cnRecT').textContent = pad(Math.floor(s / 60)) + ':' + pad(s % 60) + ' / 30'; }
  // botões
  for (const [id, slot, label, sub] of [['cnEstrada', 'estrada', 'Estrada', S.prefs.cineMode === 'aberto' ? 'ultrawide · 30 s' : 'principal · 30 s'], ['cnRosto', 'rosto', 'Rosto', 'frontal · 30 s']]) {
    const b = $(id), r = S.rec[slot]; b.classList.toggle('on', !!r);
    b.querySelector('span').textContent = r ? 'gravando · toque para parar' : sub;
  }
  const th = native.thermal ? native.thermal() : 0; $('cinema').classList.toggle('warm', th === 2); $('cinema').classList.toggle('hot', th >= 3);
  $('cnHot').hidden = th < 3;
  // seletor
  $('cnNitidez').classList.toggle('on', S.prefs.cineMode !== 'aberto'); $('cnAberto').classList.toggle('on', S.prefs.cineMode === 'aberto');
  $('cnMode').classList.toggle('locked', !!S.rec.estrada);
  // contador e espaço
  const clips = (S.session && S.session.marks || []).filter(m => m.kind === 'clipe').length + recs.length;
  let free = ''; try { const stg = native.storage ? native.storage() : null; if (stg && stg.freeMB) free = ' · ' + (stg.freeMB / 1024).toFixed(0) + ' GB livres'; } catch (e) { }
  $('cnCount').textContent = 'clipes ' + pad(clips) + free;
  // tulipa
  const tn = S.next && S.next.turn, ahead = tn ? tn.dist - d : null;
  $('cnTulipa').hidden = !tn || ahead > 2000; if (tn && ahead <= 2000) { $('cnArrow').innerHTML = svgArrow(tn.kind || tn.dir, tn.dir); $('cnTDist').textContent = ahead < 950 ? Math.round(ahead / 10) * 10 + ' m' : fmt1(ahead / 1000) + ' km'; $('cnTDir').textContent = (tn.dir || tn.short || '').toString().toUpperCase().slice(0, 14); }
  // sol
  const sun = S.sun; const sb = $('cnSun'); sb.hidden = !sun || sun.where === 'noite' || sun.rel == null;
  if (!sb.hidden) { $('cnSunDot').setAttribute('transform', 'rotate(' + sun.rel + ' 20 20)'); sb.classList.toggle('golden', !!sun.golden); $('cnSunTxt').textContent = sun.golden ? 'luz boa' : (sun.lowIn != null && sun.lowIn <= 30 ? 'luz boa em ' + sun.lowIn + ' min' : 'sol ' + (sun.where === 'costas' ? 'nas costas' : sun.where === 'frente' ? 'de frente' : 'de lado')); }
  // embaixo
  const v = live.v != null ? live.v : (S.fix && S.fix.v != null ? S.fix.v * 3.6 : 0); $('cnV').textContent = n0(v);
  const g = live.grade != null ? +live.grade : 0; const ge = $('cnG'); ge.textContent = fmt1(g) + ' %'; ge.classList.toggle('ochre', g >= 6 && g < 9); ge.classList.toggle('red', g >= 9);
  $('cnHr').hidden = !sen.hr; if (sen.hr) $('cnHrV').textContent = sen.hr;
  const cl = live.climb, rem = cl ? Math.max(0, cl.to - d) : null;
  const bits = []; if (S.place) bits.push(S.place.toUpperCase()); if (cl && cl.name) bits.push(cl.name.toUpperCase() + (cl.top ? ' · ' + n0(cl.top) + ' M' : '') + (rem != null ? ' · FALTAM ' + fmt1(rem / 1000) + ' KM' : ''));
  $('cnPlace').textContent = bits.join(' · ');
}

// ---- a faixa da música (Fita de papel)
function musicBar() {
  const bar = $('musicBar'); if (!bar || !S) return;
  const m = S.music || native.musicState(); const on = !!(m && m.granted && m.title);
  bar.hidden = !on; document.body.classList.toggle('hasmusic', on);
  if (!on) return;
  $('mbTitle').textContent = m.title; $('mbArtist').textContent = m.artist || m.app.replace('com.google.android.apps.', '');
  $('mbToggle').textContent = m.playing ? '❚❚' : '▶'; $('mbToggle').classList.toggle('y', !!m.playing);
}
