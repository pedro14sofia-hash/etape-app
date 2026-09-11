// Étape Navegar · sidecar.js (Cinema pacote 2)
// Enquanto uma câmera grava, manda à casca a telemetria a 10 Hz: posição, velocidade, rumo, rampa, altitude (barômetro quando
// há), coração/cadência/potência, cena (situação do navegador), lugar, próximo evento e distância na etapa. A casca carimba
// com o relógio do sensor e grava <clipe>.tele.jsonl ao lado do vídeo e do giroscópio. Ao começar cada REC, manda o contexto
// da sessão (etapa, modo, lugar) que vai para o manifesto do clipe.
import * as native from './native.js?v=c8177a80';
import * as sensors from './sensors.js?v=c8177a80';
import * as track from './track.js?v=c8177a80';

let S = null, timer = 0; const active = new Set();

export function init(state) {
  S = state;
  document.addEventListener('etape:rec', e => {
    const ev = e.detail || {};
    const slot = ev.slot || 'estrada';
    if (ev.kind === 'rec') { native.recContext(JSON.stringify(context())); active.add(slot); if (!timer) timer = setInterval(tick, 100); tick(); }
    if (ev.kind === 'stop' || ev.kind === 'error' || ev.kind === 'off') { active.delete(slot); if (!active.size && timer) { clearInterval(timer); timer = 0; } }
  });
  document.addEventListener('etape:cinema', e => { if (e.detail && e.detail.kind === 'exit') { active.clear(); if (timer) { clearInterval(timer); timer = 0; } } });
}
export function recording() { return active.size > 0; }

function context() {
  const st = S.stage || {};
  // 8 do desenho do Cinema: o painel nas faixas pretas desenha o PERFIL DA ETAPA na coluna, com um ponto subindo
  // enquanto se sobe. O perfil vai no contexto: 64 alturas ao longo da etapa e o comprimento total. A amostra de
  // telemetria ja leva `dist`, que e a posicao do ponto.
  let total = 0, perfil = null;
  try {
    if (st.cum && st.cum.length > 1) {
      total = Math.round(st.cum[st.cum.length - 1]); perfil = [];
      for (let i = 0; i < 64; i++) perfil.push(Math.round(track.elevationAt(st, total * i / 63)));
    }
  } catch (e) { perfil = null; }
  return { stage: st.key || '', name: st.name || '', diario: !!S.diario, free: !!S.free, mode: S.diario ? 'diario' : S.free ? 'livre' : 'viagem', dest: S.diario && st.dest ? st.dest : '', started: S.session && S.session.startedAt || 0, place: S.place || '', scene: S.situation || '', total, perfil };
}
function tick() {
  if (!S) return;
  const p = S.pos, f = S.fix, live = S.live || {}, sen = S.sensors || sensors.current() || {}, nx = S.next && S.next.turn;
  const o = {
    t: Date.now(), lat: p ? +p.lat.toFixed(6) : null, lon: p ? +p.lon.toFixed(6) : null,
    v: f && f.v != null ? +(f.v * 3.6).toFixed(1) : (live.v != null ? +live.v.toFixed(1) : null), head: p && p.head != null ? Math.round(p.head * 180 / Math.PI) : null,
    grade: live.grade != null ? +(+live.grade).toFixed(1) : null, ele: native.alt() != null ? Math.round(native.alt()) : (live.ele != null ? Math.round(live.ele) : null),
    hr: sen.hr || null, cad: sen.cad || null, pwr: sen.pwr || null,
    scene: S.situation || '', place: S.place || '', dist: Math.round(S.proj && S.proj.dist || 0),
    next: nx ? { d: Math.round(nx.dist - (S.proj && S.proj.dist || 0)), turn: nx.turn || nx.kind || '' } : null,
    climb: live.climb ? { cat: live.climb.cat || '', pct: +(live.climbPct || 0).toFixed(2) } : null
  };
  native.telemetry(JSON.stringify(o));
}
