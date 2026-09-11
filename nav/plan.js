// Étape Navegar · plan.js
// Diário (São Paulo): rotas A→B com alternativas. Três rotas sobre o grafo de bike (router.js): a mais curta, a que passa
// mais tempo em ciclovia ou ciclofaixa, e a terceira com menos (ou mais) subida, escolhida pelo Pedro. Cada rota traz
// distância, subida (pelo relevo), tempo estimado pela média das últimas saídas e a parte em ciclovia. A rota escolhida vira
// uma etapa igual às da viagem (pontos, perfil, subidas, superfícies = ciclovia/faixa/rua, bornes de partida e chegada,
// curvas), para a orientação, a fita e o relatório funcionarem sem mudar nada. Lugares guardados e busca por nome de via
// ou de ponto do mapa, tudo offline.
import * as router from './router.js';
import * as dem from './dem.js';
import * as store from './store.js';
import * as track from './track.js';
import { haversine } from './geo.js';

export const PROFILES = { shortest: 'Mais curta', bike: 'Pela ciclovia', climbLess: 'Menos subida', climbMore: 'Mais subida' };

// ---- lugares guardados (Casa, Trabalho… vêm do build; o resto o Pedro guarda no app)
export function places() { const own = store.get('places', null); return own || (window.PLACES || []).map(p => ({ ...p })); }
export function savePlace(name, lat, lon) {
  const list = places().filter(p => norm(p.name) !== norm(name)); list.unshift({ name, lat: +lat.toFixed(5), lon: +lon.toFixed(5) });
  store.set('places', list.slice(0, 30)); return list;
}
export function forgetPlace(name) { store.set('places', places().filter(p => norm(p.name) !== norm(name))); }
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// ---- busca: lugares guardados, nomes de via (ponto médio da via) e pontos do mapa; até 8 resultados, os que começam com o texto primeiro
export function search(map, q) {
  q = norm(q); const out = [], seen = new Set();
  const add = (name, lat, lon, kind) => { const n = norm(name); if (!n || seen.has(n)) return; seen.add(n); out.push({ name, lat, lon, kind, rank: n.startsWith(q) ? 0 : 1 }); };
  for (const p of places()) if (!q || norm(p.name).includes(q)) add(p.name, p.lat, p.lon, 'lugar');
  if (q.length >= 3 && map) {
    for (const w of map.ways) { if (!w.n || !norm(w.n).includes(q)) continue; const m = w.p[w.p.length >> 1]; add(w.n, m[0], m[1], 'via'); if (out.length > 40) break; }
    for (const p of map.pois) { if (!p.n || !norm(p.n).includes(q)) continue; add(p.n, p.lat, p.lon, p.k); if (out.length > 60) break; }
  }
  out.sort((a, b) => a.rank - b.rank || (a.kind === 'lugar' ? -1 : 0) - (b.kind === 'lugar' ? -1 : 0) || a.name.length - b.name.length);
  return out.slice(0, 8);
}

// ---- média das últimas saídas em SP (km/h) para o tempo estimado; sem histórico, 16 km/h
export function typicalSpeed() {
  const rs = Object.values(store.reports()).filter(r => r && /^SP/.test(r.stageKey || '') && r.avg > 6).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)).slice(0, 5);
  if (!rs.length) return 16;
  return rs.reduce((a, r) => a + r.avg, 0) / rs.length;
}

// ---- perfil pelo relevo: um ponto a cada 25 m, suavizado (constante 150 m) com histerese de 3 m, como no modo livre
function profileOf(pts, cum) {
  const total = cum[cum.length - 1], st = { pts, cum }, prof = []; let eleSm = null, eleOut = null, up = 0;
  const ok = dem.available();
  for (let d = 0; d <= total; d += 25) {
    const p = track.pointAt(st, d); let e = null; try { e = ok ? dem.elevation(p[0], p[1]) : null; } catch (err) { e = null; }
    if (e == null) continue;
    eleSm = eleSm == null ? e : eleSm + (e - eleSm) * Math.min(1, 25 / 150); if (eleOut == null || Math.abs(eleSm - eleOut) > 3) eleOut = eleSm;
    prof.push([+(d / 1000).toFixed(4), Math.round(eleOut * 10) / 10]);
  }
  if (prof.length < 2) return { prof: [[0, 745], [Math.max(0.001, total / 1000), 745]], up: 0, flat: true };
  if (prof[prof.length - 1][0] < total / 1000) prof.push([+(total / 1000).toFixed(4), prof[prof.length - 1][1]]);
  for (let i = 1; i < prof.length; i++) { const dz = prof[i][1] - prof[i - 1][1]; if (dz > 0) up += dz; }
  return { prof, up: Math.round(up) };
}
// subidas do perfil: rampa ≥ 2,5 % sustentada, fim depois de 300 m sem subir; ganho ≥ 25 m e ≥ 300 m; categoria pelo ganho e pela rampa
function category(len, gain) {
  const pct = len > 0 ? gain / len * 100 : 0, score = gain * Math.max(1, pct / 4);
  if (gain >= 800) return 'HC'; if (gain >= 400 || score >= 900) return '1'; if (gain >= 200 || score >= 450) return '2'; if (gain >= 100 || score >= 200) return '3'; if (gain >= 40 && len >= 300) return '4'; return '';
}
function climbsOf(prof) {
  const out = []; let a = null, top = null, topEle = -1e9;
  const close = () => { if (a == null || top == null) return; const len = (prof[top][0] - prof[a][0]) * 1000, gain = prof[top][1] - prof[a][1]; if (gain >= 25 && len >= 300) out.push({ id: 'c' + out.length, name: 'Subida ' + (out.length + 1), from: Math.round(prof[a][0] * 1000), to: Math.round(prof[top][0] * 1000), len: Math.round(len), gain: Math.round(gain), pct: +(gain / len * 100).toFixed(1), cat: category(len, gain) || '4', topEle: prof[top][1], n: out.length + 1 }); a = null; top = null; topEle = -1e9; };
  for (let i = 1; i < prof.length; i++) {
    const dd = (prof[i][0] - prof[i - 1][0]) * 1000, g = dd > 0 ? (prof[i][1] - prof[i - 1][1]) / dd * 100 : 0;
    if (a == null) { if (g >= 2.5) { a = i - 1; top = i; topEle = prof[i][1]; } continue; }
    if (prof[i][1] > topEle) { topEle = prof[i][1]; top = i; }
    if ((prof[i][0] - prof[top][0]) * 1000 > 300 || g <= -2.5) close();
  }
  close();
  return out;
}

// ---- três rotas de from a to. third: 'climbLess' | 'climbMore'
export function routes(from, to, third = 'climbLess') {
  const eleCache = new Map();
  const ele = i => { if (eleCache.has(i)) return eleCache.get(i); const n = router.node(i); let e = null; try { e = n && dem.available() ? dem.elevation(n[0], n[1]) : null; } catch (err) { e = null; } eleCache.set(i, e); return e; };
  const v = typicalSpeed(), out = [];
  for (const key of ['shortest', 'bike', third]) {
    let res = null; try { res = router.route(from.lat, from.lon, to.lat, to.lon, 40000, { profile: key, ele }); } catch (e) { res = null; }
    if (!res || !res.pts || res.pts.length < 2) { out.push({ key, label: PROFILES[key], fail: true }); continue; }
    const cum = [0]; for (let i = 1; i < res.pts.length; i++) cum.push(cum[i - 1] + haversine(res.pts[i - 1][0], res.pts[i - 1][1], res.pts[i][0], res.pts[i][1]));
    const { prof, up, flat } = profileOf(res.pts, cum);
    const same = out.find(o => !o.fail && Math.abs(o.len - res.len) < 25 && Math.abs(o.up - up) <= 3);
    out.push({ key, label: PROFILES[key], pts: res.pts, cum, len: res.len, up, flat: !!flat, prof, segs: res.segs || [], bikeM: res.bikeM || 0, laneM: res.laneM || 0,
      bikePct: Math.round(((res.bikeM || 0) + (res.laneM || 0)) / Math.max(1, res.len) * 100), time: res.len / 1000 / v * 3600, same: same ? same.key : null });
  }
  return out;
}

// ---- a rota escolhida vira uma etapa: mesmo modelo de track.loadStage, mais superfícies ciclovia/faixa/rua e as bornes A e B
export function stageFromRoute(r, from, to, key = 'SP') {
  const pts = r.pts, cum = r.cum || [0]; if (cum.length !== pts.length) { cum.length = 1; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])); }
  const total = cum[cum.length - 1];
  const pr = r.prof ? { prof: r.prof, up: r.up } : profileOf(pts, cum), prof = pr.prof;
  const upRem = new Array(prof.length); let acc = 0;
  for (let i = prof.length - 1; i > 0; i--) { upRem[i] = acc; const d = prof[i][1] - prof[i - 1][1]; if (d > 0) acc += d; }
  upRem[0] = acc;
  const surfaces = []; for (const s of r.segs || []) { const kind = s[2] === 2 ? 'ciclovia' : s[2] === 1 ? 'faixa' : 'rua'; const last = surfaces[surfaces.length - 1]; if (last && last.kind === kind) last.to = Math.round(s[1]); else surfaces.push({ from: Math.round(s[0]), to: Math.round(s[1]), kind }); }
  const stage = { key, name: from.name + ' → ' + to.name, type: 'blanc', pts, cum, total, prof, upRem, km: +(total / 1000).toFixed(1), up: pr.up, climbs: climbsOf(prof), surfaces, diario: true, origin: from.name, dest: to.name, profile: r.key };
  const last = pts[pts.length - 1];
  stage.cps = [
    { id: 'A', name: from.name, full: from.name, lat: pts[0][0], lon: pts[0][1], ele: Math.round(prof[0][1]), idx: 0, dist: 0, done: true, n: 0, kmLabel: 0, hotel: false, col: false },   // já feita: a placa mostra o destino
    { id: 'B', name: to.name, full: to.name, lat: last[0], lon: last[1], ele: Math.round(prof[prof.length - 1][1]), idx: pts.length - 1, dist: total, done: false, n: 1, kmLabel: Math.round(total / 1000), hotel: false, col: false }];
  stage.turns = track.detectTurns(stage, 35, 12, 40);
  return stage;
}
// fora da rota no Diário: a etapa é refeita = trecho já pedalado (até dist) + posição atual + nova rota até o destino.
// A distância acumulada continua (o registro, a média e a fita não se perdem); o perfil, as subidas, as superfícies e as
// curvas são recalculados; as bornes A (feita) e B continuam.
export function rerouteStage(old, dist, pos, res) {
  const idx = track.idxAtDist(old, Math.max(0, dist)), pts = old.pts.slice(0, Math.max(1, idx)).concat([[pos.lat, pos.lon]], res.pts.slice(1));
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  const d0 = cum[Math.max(1, idx)];
  const segs = old.surfaces.filter(s => s.from < d0).map(s => [s.from, Math.min(s.to, d0), s.kind === 'ciclovia' ? 2 : s.kind === 'faixa' ? 1 : 0]).concat((res.segs || []).map(s => [d0 + s[0], d0 + s[1], s[2]]));
  const from = { name: old.origin || 'Partida' }, to = { name: old.dest || 'Destino' };
  const st = stageFromRoute({ pts, cum, segs, key: old.profile }, from, to, old.key);
  st.cps[0].done = true; st.rerouted = (old.rerouted || 0) + 1;
  return st;
}
// (3) endereço com número: Nominatim, só com internet, limitado à caixa do mapa; devolve {name, lat, lon, kind:'endereço'}
let bboxCache = null;
function bboxOf(map) {
  if (bboxCache) return bboxCache; let s = 90, w = 180, n = -90, e = -180;
  for (const x of map.ways) { if (!x.b) continue; if (x.b[0] < s) s = x.b[0]; if (x.b[1] < w) w = x.b[1]; if (x.b[2] > n) n = x.b[2]; if (x.b[3] > e) e = x.b[3]; }
  return bboxCache = [s, w, n, e];
}
export async function searchOnline(map, q) {
  if (!navigator.onLine) return [];
  const [s, w, n, e] = bboxOf(map);
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=br&bounded=1&viewbox=' + [w, n, e, s].map(x => x.toFixed(4)).join(',') + '&q=' + encodeURIComponent(q);
  const r = await fetch(url, { headers: { 'Accept': 'application/json', 'Accept-Language': 'pt-BR' } }); if (!r.ok) return [];
  const list = await r.json();
  return list.map(x => { const parts = String(x.display_name || '').split(', '); return { name: parts.slice(0, 2).join(', '), sub: parts.slice(2, 4).join(', '), lat: +x.lat, lon: +x.lon, kind: 'endereço' }; });
}
export const fmtTime = s => { const m = Math.round(s / 60); return m < 60 ? m + ' min' : Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0'); };
