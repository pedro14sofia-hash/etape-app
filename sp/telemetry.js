// Étape Navegar · telemetry.js
// Telemetria: amostras a 5 s, números da tela, VAM, gradiente, registro do dia, GPX.
import { elevationAt, climbRemaining, gradeAt, gradeAhead, climbAt } from './track.js?v=1a47c3a9';
import * as store from './store.js?v=1a47c3a9';
import * as logdb from './logdb.js?v=1a47c3a9';   // U6 Fase 3: o registro do dia vive no IndexedDB

export function sample(fix, stage, proj, prev) {
  const ele = Math.round(elevationAt(stage, proj.dist));
  const s = { t: fix.t, lat: +fix.lat.toFixed(5), lon: +fix.lon.toFixed(5), ele, dist: Math.round(proj.dist), v: +(fix.v || 0).toFixed(2), off: Math.round(proj.off) };
  // U8 (10/09): a precisao do fix era recebida pelo onFix e jogada fora. Sem ela nao da para separar, depois, um
  // ponto bom de um ruim — e a auditoria de um dia de sinal ruim fica no escuro. Medido no primeiro passeio real:
  // um unico salto de 4,6 km entrou no registro (o GPS reencontrando sinal), e so o teto de 400 m o segurou; com o
  // `acc` gravado da para ver o salto chegando, em vez de descobri-lo pela distancia. Inteiro, um numero por
  // amostra: metros, sem casa decimal. Ausente quando o aparelho nao informa — nunca zero, que seria mentira.
  if (fix.acc > 0) s.acc = Math.round(fix.acc);
  s.grade = +gradeAt(stage, proj.dist, 100).toFixed(1);
  return s;
}
// registro: guarda uma amostra a cada 5 s; escreve no store a cada 30 s
export function record(log, s, stageKey, force) {
  const last = log[log.length - 1];
  if (!last || s.t - last.t >= 5000 || force) {
    log.push(s);
    // U6 Fase 3: uma amostra por put no IndexedDB, custo constante. O caminho antigo — reserializar o log INTEIRO
    // a cada 30 s, 435 KB de JSON.stringify por meio minuto no fim de uma etapa — vira reserva, para quando o
    // IndexedDB nao existe (aba privada, armazenamento bloqueado).
    if (logdb.available()) logdb.append(stageKey, s);
    else if (force || !record._w || s.t - record._w > 30000) { store.setLog(stageKey, log); record._w = s.t; }
    return true;
  }
  return false;
}
export function vam(log, seconds) {
  if (log.length < 2) return 0;
  const now = log[log.length - 1].t; let i = log.length - 1;
  while (i > 0 && now - log[i].t < seconds * 1000) i--;
  const dt = (now - log[i].t) / 1000; if (dt < 60) return 0;
  let up = 0; for (let j = i + 1; j < log.length; j++) { const d = log[j].ele - log[j - 1].ele; if (d > 0) up += d; }
  return Math.round(up / dt * 3600);
}
// máxima, altitude máxima e subida acumulada: guardadas no próprio registro e adiantadas só com as amostras novas.
// Antes o live() varria o log inteiro a cada fix — no fim de uma etapa de 6 h são 4.300 amostras por segundo, gastas
// para recalcular três acumuladores. Orçamento térmico jogado fora num aparelho que já baixa o 3D quando esquenta
// (auditoria de 07/09, item B8). Se o log encolher (etapa nova, registro despejado), o acumulador se refaz sozinho.
function acumulado(log) {
  let a = log.__acc;
  if (!a || a.n > log.length) a = log.__acc = { n: 0, vmax: 0, maxEle: 0, up: 0 };
  for (let i = a.n; i < log.length; i++) {
    const q = log[i];
    if (q.v > a.vmax) a.vmax = q.v;
    if (q.ele > a.maxEle) a.maxEle = q.ele;
    if (i && q.ele > log[i - 1].ele) a.up += q.ele - log[i - 1].ele;
  }
  a.n = log.length;
  return a;
}
export function live(log, stage, session, now, movingSec) {
  const s = log[log.length - 1] || { dist: 0, v: 0, ele: elevationAt(stage, 0), grade: 0 };
  const { vmax, maxEle, up } = acumulado(log);
  // média em movimento: distância desde a primeira amostra da sessão sobre o tempo em movimento, só depois de 2 min
  const first = log[0] || s, avg = movingSec > 120 ? Math.max(0, s.dist - first.dist) / movingSec : 0;
  const cl = climbAt(stage, s.dist);
  return { v: s.v * 3.6, avg: avg * 3.6, vmax: vmax * 3.6, grade: s.grade, gradeAhead: gradeAhead(stage, s.dist, 500), vam: vam(log, 300), ele: s.ele, maxEle, up, upRem: climbRemaining(stage, s.dist), climb: cl, climbPct: cl ? Math.min(1, Math.max(0, (s.dist - cl.from) / (cl.to - cl.from))) : 0, climbLeft: cl ? Math.max(0, cl.to - s.dist) : 0 };
}
export function toGpx(samples, meta) {
  const pts = samples.map(s => `<trkpt lat="${s.lat}" lon="${s.lon}"><ele>${s.ele}</ele><time>${new Date(s.t).toISOString()}</time></trkpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Étape Navegar" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>${esc(meta.name || 'Étape')}</name><trkseg>\n${pts}\n</trkseg></trk>\n</gpx>`;
}
function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
