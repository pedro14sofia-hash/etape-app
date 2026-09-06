// Étape Navegar · diario.js
// Tela 01 do Diário: destino e três rotas. A folha responde de onde, para onde e por qual caminho; o mapa mostra as três
// rotas inteiras (a escolhida em amarelo, as outras em cinza tracejado); a única ação é o botão da sessão, que já diz a
// hora de chegada. A rota escolhida vira a etapa do dia (plan.stageFromRoute) e a orientação segue igual à da viagem.
// A terceira rota alterna entre "menos subida" e "mais subida" (decisão do Pedro, 06/09/2026).
import * as plan from './plan.js';
import * as router from './router.js';
import * as dem from './dem.js';
import * as store from './store.js';
import * as voice from './voice.js';
import { haversine } from './geo.js';

let C = null;   // contexto do app: { S, $, refresh, setMode, setTab, activate(stage), restoreFree(), fitTo(pts), pos() }
const D = { dest: null, from: null, alts: null, sel: 'shortest', third: null, q: '', busy: false };
const fmtKm1 = m => (m / 1000).toFixed(1).replace('.', ',');
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function init(ctx) { C = ctx; D.third = store.get('third', 'climbLess'); }
export function active() { return !!D.dest; }
export function ready() { return router.available() && dem.available(); }
export function state() { return D; }

// abre a folha Destino (aba 'dest', modo completo)
export function open() {
  const S = C.S; if (S.session.state !== 'idle') { voice.banner('Encerre a saída para mudar o destino', 3); return; }
  C.setTab('dest'); C.setMode('full'); render();
}
export function close() { const S = C.S; if (S.session.state === 'idle' && S.diario) { D.dest = null; D.alts = null; S.alts = null; S.destEta = null; C.restoreFree(); } C.setMode('resumo'); }

// posição de partida: GPS, senão a última posição guardada, senão o primeiro lugar (Casa)
function fromPos() {
  const S = C.S, p = C.pos();
  if (p) { const near = plan.places().find(x => haversine(x.lat, x.lon, p.lat, p.lon) < 80); return { name: near ? near.name : (S.place || 'Onde estou'), lat: p.lat, lon: p.lon, gps: true }; }
  const last = store.get('lastpos', null); if (last) return { name: last.place || 'Última posição', lat: last.lat, lon: last.lon };
  const pl = plan.places()[0]; return pl ? { name: pl.name, lat: pl.lat, lon: pl.lon } : null;
}

export function chooseByName(name) { const p = plan.search(C.S.map, name)[0]; if (p) setDest(p); return !!p; }
function setDest(p) {
  D.dest = { name: p.name, lat: p.lat, lon: p.lon }; D.q = ''; D.from = fromPos();
  if (!D.from) { voice.banner('Sem posição de partida', 2); return; }
  if (!ready()) { D.alts = null; render(); voice.banner('Carregando o mapa de rotas', 3); waitReady(); return; }
  compute();
}
function waitReady() { if (waitReady._t) return; waitReady._t = setInterval(() => { if (ready()) { clearInterval(waitReady._t); waitReady._t = 0; if (D.dest && !D.alts) compute(); } }, 500); }
function compute() {
  D.busy = true; render();
  // relevo da caixa entre partida e destino carregado antes: sem ele a subida sai zero e as rotas por subida viram a mais curta
  const f = D.from, t = D.dest, m = 0.01, box = [Math.min(f.lat, t.lat) - m, Math.min(f.lon, t.lon) - m, Math.max(f.lat, t.lat) + m, Math.max(f.lon, t.lon) + m];
  let warm = Promise.resolve(); try { warm = dem.ensure(dem.tilesFor(box)); } catch (e) { }
  warm.then(() => new Promise(r => setTimeout(r, 30))).then(() => {
    const t0 = performance.now(); let alts = null; try { alts = plan.routes(D.from, D.dest, D.third); } catch (e) { alts = null; } D.ms = Math.round(performance.now() - t0);
    D.busy = false; D.alts = alts;
    if (!alts || !alts.some(a => !a.fail)) { voice.banner('Sem caminho até ' + D.dest.name, 2, 'longe do mapa de rotas?'); render(); return; }
    if (!alts.find(a => a.key === D.sel && !a.fail)) D.sel = alts.find(a => !a.fail).key;
    select(D.sel);
  });
}
function select(key) {
  const S = C.S, a = D.alts.find(x => x.key === key && !x.fail); if (!a) return; D.sel = key;
  for (const x of D.alts) x.sel = x.key === key;
  const st = plan.stageFromRoute(a, D.from, D.dest, 'SP');
  C.activate(st);
  S.alts = D.alts; S.destEta = etaOf(a); S.diario = true;
  render(); C.refresh();
  requestAnimationFrame(() => setTimeout(() => C.fitTo(st.pts), 60));   // depois de a folha crescer com as três rotas
}
function etaOf(a) { const d = new Date(Date.now() + a.time * 1000); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
export function setThird(k) { D.third = k; store.set('third', k); if (D.dest && D.alts) { D.alts = D.alts.filter(a => a.key === 'shortest' || a.key === 'bike'); compute(); } else render(); }

// ---- a folha
function render() {
  const $ = C.$, el = $('destBody'); if (!el) return;
  const S = C.S, from = D.from || fromPos();
  const places = plan.places(), res = D.q.length >= 2 ? plan.search(S.map, D.q) : [];
  let h = `<div class="lbl">De · ${esc(from ? from.name : 'sem posição')}</div>
  <div class="field"><input id="destQ" type="search" placeholder="Para onde?" value="${esc(D.dest ? D.dest.name : D.q)}" autocomplete="off" enterkeyhint="search"><button id="destClr" aria-label="Limpar"${D.dest || D.q ? '' : ' hidden'}>×</button></div>`;
  if (res.length && !D.dest) h += `<ul class="dres">${res.map((r, i) => `<li data-r="${i}"><b>${esc(r.name)}</b><span>${r.kind === 'lugar' ? 'guardado' : r.kind === 'via' ? 'via' : esc(r.kind)}</span></li>`).join('')}</ul>`;
  else if (!D.dest) h += `<div class="chips">${places.map((p, i) => `<button data-p="${i}">${esc(p.name)}</button>`).join('')}<button id="destSave" class="ghost">+ guardar aqui</button><button id="destFree" class="ghost">Navegar livre</button></div>`;
  if (D.dest) {
    h += `<div class="lbl row3l"><span>Três rotas</span><span class="third"><button data-third="climbLess"${D.third === 'climbLess' ? ' class="on"' : ''}>Menos subida</button><button data-third="climbMore"${D.third === 'climbMore' ? ' class="on"' : ''}>Mais subida</button></span></div>`;
    if (D.busy || !D.alts) h += `<div class="note">calculando as rotas…</div>`;
    else h += `<div class="rows">${D.alts.map(a => a.fail ? `<div class="row fail"><b>${esc(a.label)}</b><span>sem caminho</span></div>` : a.same ? `<div class="row same"><b>${esc(a.label)}</b><span>igual à ${esc(plan.PROFILES[a.same]).toLowerCase()}</span></div>` :
      `<div class="row${a.sel ? ' on' : ''}" data-k="${a.key}"><b>${esc(a.label)}</b><div class="t">${plan.fmtTime(a.time)}</div><span>${fmtKm1(a.len)} km · ${a.flat ? 'relevo indisponível' : a.up + ' m de subida'}${a.bikePct ? ' · ciclovia em ' + a.bikePct + ' %' : ' · sem ciclovia'}</span><div class="bar"><i style="width:${a.bikePct}%"></i></div></div>`).join('')}</div>`;
    h += `<div class="note">Tocar numa rota troca a amarela no mapa e a hora no botão. Partir abre a tela "Antes de sair".</div>`;
  }
  el.innerHTML = h;
  const q = $('destQ');
  if (q) { q.oninput = () => { D.q = q.value; if (D.dest) { D.dest = null; D.alts = null; S.alts = null; } render(); const q2 = $('destQ'); if (q2) { q2.focus(); q2.setSelectionRange(q2.value.length, q2.value.length); } };
    q.onkeydown = e => { if (e.key === 'Enter') { const r = plan.search(S.map, q.value)[0]; if (r) setDest(r); e.preventDefault(); } }; }
  const clr = $('destClr'); if (clr) clr.onclick = () => { D.q = ''; close(); D.dest = null; D.alts = null; S.alts = null; C.setTab('dest'); C.setMode('full'); render(); };
  el.querySelectorAll('[data-r]').forEach(li => li.onclick = () => setDest(res[+li.dataset.r]));
  el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => setDest(places[+b.dataset.p]));
  el.querySelectorAll('[data-k]').forEach(r => r.onclick = () => select(r.dataset.k));
  el.querySelectorAll('[data-third]').forEach(b => b.onclick = () => setThird(b.dataset.third));
  const fr = $('destFree'); if (fr) fr.onclick = () => { D.q = ''; close(); };
  const sv = $('destSave'); if (sv) sv.onclick = () => { const p = C.pos(); if (!p) { voice.banner('Sem posição ainda', 2); return; } const name = prompt('Nome deste lugar (ex.: Casa, Trabalho)'); if (!name) return; plan.savePlace(name.trim(), p.lat, p.lon); voice.banner('Lugar guardado', 3, name.trim()); render(); };
}
