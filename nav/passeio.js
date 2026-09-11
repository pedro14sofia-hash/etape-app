// Étape Navegar · passeio.js (07/09/2026, decisão do Pedro: "segue com todas")
// O relatório do passeio + o diário do dia, guardados com os sidecars (cinema/<dia>/diario-HHmm.json) e levados ao Drive
// pela casca como qualquer sidecar. Serve para dois fins: ajustar o Cinema depois do teste de campo (bateria por hora,
// gatilhos, alertas de calor, espaço) e ter o registro do dia fora do aparelho (traçado resumido, marcas, clipes).
import * as native from './native.js?v=c8177a80';
import * as voice from './voice.js?v=c8177a80';

let S = null; const D = { battery: [], events: [], triggers: [] };

export function init(state) {
  S = state;
  document.addEventListener('etape:rec', e => { const d = e.detail || {}; if (['warm', 'hot', 'hd', 'error', 'rec', 'stop', 'foto', 'fotoWarn', 'fotoErro'].includes(d.kind)) D.events.push({ t: Date.now(), kind: d.kind, slot: d.slot || '', detail: String(d.detail || '').slice(0, 80), mode: d.mode || '' }); });
  document.addEventListener('etape:auto', e => { const d = e.detail || {}; D.triggers.push({ t: Date.now(), slot: d.slot, why: d.why, sec: d.sec }); });
  document.addEventListener('etape:night', e => { const d = e.detail || {}; if (d.phase === 'done' || d.phase === 'error') D.events.push({ t: Date.now(), kind: 'noite', detail: String(d.detail || '').slice(0, 80) }); });
  document.addEventListener('etape:drive', e => { const d = e.detail || {}; if (d.phase === 'paused' || d.phase === 'error' || d.phase === 'done') D.events.push({ t: Date.now(), kind: 'drive', detail: String(d.detail || '').slice(0, 80) }); });
}
let lastBat = 0;
// a cada posição: amostra de bateria a cada 5 min (nível, carregando, corrente), só com a saída em andamento
export function tick() {
  if (!S || !S.native || !S.session || S.session.state !== 'running') return;
  const now = Date.now(); if (now - lastBat < 300000) return; lastBat = now;
  try { const b = JSON.parse(native.battery() || '{}'); D.battery.push({ t: now, level: b.level, charging: !!b.charging, mA: b.mA, therm: native.thermal() }); } catch (e) { }
}
export function reset() { D.battery.length = 0; D.events.length = 0; D.triggers.length = 0; lastBat = 0; }
// no encerramento da saída: monta o diário, grava com os sidecars e fala o resumo
export function finish(r) {
  if (!S || !S.native || !S.session) return null;
  const sess = S.session; const t0 = sess.startedAt || Date.now(); const t1 = sess.finishedAt || Date.now();
  const hours = Math.max(0.1, (t1 - t0) / 3600000);
  const bat = D.battery; const drop = bat.length >= 2 ? (bat[0].level - bat[bat.length - 1].level) : null;
  const perHour = drop != null ? +(drop / hours).toFixed(1) : null;
  const clips = (sess.marks || []).filter(m => m.kind === 'clipe');
  const log = S.log || []; const step = Math.max(1, Math.floor(log.length / 600));   // traçado resumido: até 600 pontos
  const track = log.filter((_, i) => i % step === 0).map(p => [p.lat != null ? +p.lat.toFixed(5) : null, p.lon != null ? +p.lon.toFixed(5) : null, p.ele != null ? Math.round(p.ele) : null, p.t]);
  const hot = D.events.filter(e => e.kind === 'hot').length, warm = D.events.filter(e => e.kind === 'warm').length, hd = D.events.filter(e => e.kind === 'hd').length;
  const out = {
    v: 1, day: new Date(t0).toISOString().slice(0, 10), stage: S.stage ? { key: S.stage.key, name: S.stage.name } : null, mode: S.diario ? 'diario' : S.free ? 'livre' : 'viagem',
    startedAt: t0, finishedAt: t1, km: r ? r.km : null, up: r ? r.up : null, moving: r ? r.moving : null, elapsed: r ? r.elapsed : null,
    battery: { samples: bat, perHour, drop, hours: +hours.toFixed(2) },
    clips: clips.map(c => ({ name: c.name, slot: c.slot, mode: c.mode, ms: c.ms, scene: c.scene, at: c.at })),
    fotos: (sess.marks || []).filter(m => m.kind === 'foto').map(f => ({ name: f.name, mode: f.mode, cfg: f.cfg, files: f.files, place: f.place, lat: f.lat, lon: f.lon, at: f.at })),
    triggers: D.triggers, events: D.events, alerts: { hot, warm, hd },
    marks: (sess.marks || []).filter(m => m.kind !== 'clipe' && m.kind !== 'foto'), track,
    autoRec: S.prefs.autoRec, cineLook: S.prefs.cineLook, cineMode: S.prefs.cineMode
  };
  const d = new Date(t0); const name = 'diario-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
  const ok = native.saveReport(out.day, name, JSON.stringify(out));
  const parts = [];
  if (perHour != null) parts.push('bateria ' + perHour + '% por hora');
  parts.push(clips.length + (clips.length === 1 ? ' clipe' : ' clipes') + (D.triggers.length ? ' (' + D.triggers.length + ' automáticos)' : ''));
  if (hot) parts.push(hot + 'x calor'); if (hd) parts.push('1080p por espaço');
  voice.banner('Diário do dia ' + (ok ? 'guardado' : 'não guardado'), 3, parts.join(' · '));
  reset(); return out;
}
