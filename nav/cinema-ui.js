// Étape Navegar · cinema-ui.js (Anna · a tela do Cinema, a faixa da música, aprovadas em 07/09/2026)
// A câmera ocupa a tela (a página fica transparente: a prévia nativa está por baixo). Por cima, o placar da transmissão:
// barra de cima (etapa, km, relógio, REC), tulipa e distância, bússola de luz, seletor Nitidez/Aberto, contador de clipes,
// dois botões de REC do lado da mão direita (um toque começa, outro termina), e embaixo velocidade, rampa, bpm e o lugar. Um toque na imagem esconde tudo
// menos os botões. Em pé ou deitada pelo acelerômetro da casca (a atividade é travada em pé: a sobreposição gira por CSS).
// Fora do Cinema: a faixa da música na Fita, abaixo do cabeçalho, só quando há uma sessão de mídia.
import * as native from './native.js?v=c8177a80';
import * as cinema from './cinema.js?v=c8177a80';
import * as music from './music.js?v=c8177a80';
import * as sensors from './sensors.js?v=c8177a80';
import { svgArrow } from './ui.js?v=c8177a80';

let S = null, timer = 0, rot = 0, bare = false, toggleBareFn = null;
export function toggleBare() { if (toggleBareFn) toggleBareFn(); }   // volume baixo segurado no Cinema: mostra ou esconde o placar
const $ = id => document.getElementById(id);
const n0 = v => Math.round(v).toLocaleString('pt-BR');
const fmt1 = v => (Math.round(v * 10) / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pad = v => String(v).padStart(2, '0');

export function init(state) {
  S = state;
  const root = $('cinema'); if (!root) return;
  document.addEventListener('etape:cinema', e => { const k = e.detail.kind; if (k === 'enter') show(); if (k === 'exit') hide(); render(); });
  document.addEventListener('etape:rec', render);
  document.addEventListener('etape:music', e => musicBar(e.detail));
  document.addEventListener('etape:rotate', e => { rot = +e.detail || 0; applyRot(); });
  $('cnEstrada').onclick = () => cinema.rec('estrada');
  $('cnRosto').onclick = () => cinema.rec('rosto');
  $('cnNitidez').onclick = () => cinema.setMode('nitidez');
  $('cnAberto').onclick = () => cinema.setMode('aberto');
  // Modo Foto: chave Vídeo/Foto no alto à direita; seletor de modos no lugar do Nitidez/Aberto
  $('cnVideo').onclick = () => cinema.setFoto(false); $('cnFoto').onclick = () => cinema.setFoto(true);
  for (const m of cinema.FOTO_MODES) $('cnF_' + m).onclick = () => cinema.setFotoMode(m);
  $('cnArrasto').onclick = () => cinema.setFotoCfg('arrasto'); $('cnRastro').onclick = () => cinema.setFotoCfg('rastro');
  $('cnProbe').onclick = () => cinema.probe();
  $('cnMedir').onclick = () => { cinema.setMedir(!cinema.medir()); render(); };
  $('cnMark').onclick = () => cinema.mark();
  let bareTimer = 0; const setBare = b => { bare = b; root.classList.toggle('bare', bare); };
  toggleBareFn = () => { setBare(!bare); clearTimeout(bareTimer); if (!bare) bareTimer = setTimeout(() => setBare(true), 8000); };
  $('cnTap').onclick = toggleBareFn;
  $('cnExit').onclick = () => cinema.exit();
  $('mbToggle').onclick = e => { e.stopPropagation(); music.toggle(); };
  $('mbNext').onclick = e => { e.stopPropagation(); music.next(); };
  musicBar();
}
function show() { $('cinema').hidden = false; bare = true; $('cinema').classList.add('bare'); rot = native.rotation(); applyRot(); render(); if (!timer) timer = setInterval(render, 250); }
function hide() { $('cinema').hidden = true; if (timer) { clearInterval(timer); timer = 0; } }
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
  $('cnRec').hidden = !recs.length; if (recs.length) { const s = Math.floor((Date.now() - at) / 1000); $('cnRecT').textContent = pad(Math.floor(s / 60)) + ':' + pad(s % 60); }
  // botões
  for (const [id, slot, label, sub] of [['cnEstrada', 'estrada', 'Estrada', S.prefs.cineMode === 'aberto' ? 'ultrawide · toque para gravar' : 'principal · toque para gravar'], ['cnRosto', 'rosto', 'Rosto', 'frontal · toque para gravar']]) {
    const b = $(id), r = S.rec[slot]; b.classList.toggle('on', !!r);
    if (!cinema.foto()) b.querySelector('span').textContent = r ? 'gravando · toque para parar' : sub;
  }
  const th = native.thermal ? native.thermal() : 0; $('cinema').classList.toggle('warm', th === 2); $('cinema').classList.toggle('hot', th >= 3);
  $('cnHot').hidden = th < 3; $('cnEstrada').disabled = th >= 3; $('cnRosto').disabled = th >= 3;
  // medir (item 3): zebra vem do shader; aqui ficam a grade de terços e o histograma medido no quadro
  $('cnMark').hidden = !(S.rec.estrada || S.rec.rosto);
  const med = cinema.medir();
  $('cnMedir').setAttribute('aria-pressed', String(med)); $('cnGrid').hidden = !med; $('cnMeter').hidden = !med;
  if (med) drawHist();
  // Modo Foto: chave, seletor de modos, botões como disparadores, linha de nível nos modos parados
  const foto = cinema.foto(); const fm = S.prefs.fotoMode || 'movimento'; const fc = S.prefs.fotoCfg || 'arrasto';
  $('cinema').classList.toggle('foto', foto);
  $('cnVideo').classList.toggle('on', !foto); $('cnFoto').classList.toggle('on', foto); $('cnVideo').setAttribute('aria-pressed', String(!foto)); $('cnFoto').setAttribute('aria-pressed', String(foto));
  $('cnMode').hidden = foto; $('cnFotoMode').hidden = !foto; $('cnFotoCfg').hidden = !foto || fm !== 'velocidade';
  if (foto) { for (const m of cinema.FOTO_MODES) $('cnF_' + m).classList.toggle('on', fm === m); $('cnArrasto').classList.toggle('on', fc === 'arrasto'); $('cnRastro').classList.toggle('on', fc === 'rastro');
    const busy = S.fotoBusy && Date.now() - S.fotoBusy.at < 8000;
    const subE = fm === 'movimento' ? 'rajada de 6 · 1/1000' : fm === 'velocidade' ? (fc === 'rastro' ? 'rastro · 8 quadros somados' : 'arrasto · 1/30') : 'três exposições + RAW';
    $('cnEstrada').querySelector('span').textContent = busy && S.fotoBusy.slot === 'estrada' ? 'revelando…' : subE; $('cnRosto').querySelector('span').textContent = busy && S.fotoBusy.slot === 'rosto' ? 'revelando…' : 'frontal · rajada de 4';
    const lv = $('cnLevel'); lv.hidden = fm !== 'paisagem'; if (!lv.hidden) { const r = native.roll(); lv.style.transform = 'translate(-50%,-50%) rotate(' + (-r).toFixed(1) + 'deg)'; lv.classList.toggle('ok', Math.abs(r) < 1); }
    const fotos = (S.session && S.session.marks || []).filter(m => m.kind === 'foto').length; $('cnCount').textContent = 'fotos ' + pad(fotos) + (render._free || '');
  } else $('cnLevel').hidden = true;
  // seletor
  const ab = S.prefs.cineMode === 'aberto'; $('cnNitidez').classList.toggle('on', !ab); $('cnAberto').classList.toggle('on', ab); $('cnNitidez').setAttribute('aria-pressed', String(!ab)); $('cnAberto').setAttribute('aria-pressed', String(ab));
  $('cnMode').classList.toggle('locked', !!S.rec.estrada);
  // contador e espaço
  const clips = (S.session && S.session.marks || []).filter(m => m.kind === 'clipe').length + recs.length;
  if (Date.now() - (render._stAt || 0) > 10000) { render._stAt = Date.now(); try { const stg = native.storage ? native.storage() : null; render._free = stg && stg.freeMB ? ' · ' + (stg.freeMB / 1024).toFixed(0) + ' GB livres' : ''; } catch (e) { render._free = ''; } }   // StatFs a cada 10 s, não a 4 Hz
  if (!cinema.foto()) $('cnCount').textContent = 'clipes ' + pad(clips) + (render._free || '');
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
function musicBar(ev) {
  const bar = $('musicBar'); if (!bar || !S) return;
  const m = ev || S.music || native.musicState(); const on = !!(m && m.granted && m.title);
  bar.hidden = !on; document.body.classList.toggle('hasmusic', on);
  if (!on) return;
  $('mbTitle').textContent = m.title; $('mbArtist').textContent = m.artist || String(m.app || '').replace('com.google.android.apps.', '');
  $('mbToggle').textContent = m.playing ? '❚❚' : '▶'; $('mbToggle').setAttribute('aria-label', m.playing ? 'Pausar' : 'Tocar'); $('mbToggle').classList.toggle('y', !!m.playing);
}


// ---- histograma da prévia: 32 barras medidas no próprio quadro (não é estimativa), mais o quanto está estourado
function drawHist() {
  const st = native.previewStats(); const cv = $('cnHist'); if (!st || !cv) return;
  const g = cv.getContext('2d'); const w = cv.width, h = cv.height;
  g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, w, h);
  const max = Math.max(1, ...st.hist); const bw = w / st.hist.length;
  for (let i = 0; i < st.hist.length; i++) {
    const bh = Math.round(h * st.hist[i] / max);
    g.fillStyle = i >= 30 ? '#FF3B3B' : i <= 1 ? '#4A90D9' : 'rgba(255,255,255,.85)';
    g.fillRect(i * bw, h - bh, Math.max(1, bw - 0.5), bh);
  }
  const clip = (st.clip / 10).toFixed(1), dark = (st.dark / 10).toFixed(1);
  const el = $('cnClip'); el.textContent = 'estourado ' + clip + '% · afogado ' + dark + '%';
  el.classList.toggle('hot', st.clip > 20);
}
