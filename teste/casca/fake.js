// Étape Navegar · casca/fake.js — o segundo adapter da casca: um window.EtapeNative em JS, para o app web rodar no PC
// como se estivesse no guidão. So carrega com ?casca=fake. Reproduz um Roteiro (CONTEXT.md): eventos temporizados
// que o Kotlin dispararia em window.EtapeEvents. Implementa so o que as Capacidades ja migradas usam; o que falta
// aparece em estado().faltam de cada uma — e e isso que o fake deve mostrar, nao esconder.
import * as ponte from './ponte.js';

export const E = {
  dona: true, travado: false, pin: '1234', esperaMs: 0,
  update: { phase: 'idle', detail: '' }, permitido: true,
  version: { name: 'fake', code: 0, owner: true }, conteudo: { version: 'fake', files: 12 },
  bateria: { level: 80, charging: false }, espaco: { freeMB: 4096, contentMB: 300 }, thermal: 0
};

const metodos = {
  // Quiosque
  kioskOwner: () => E.dona, kioskLocked: () => E.dona && E.travado, kioskCheck: p => p === E.pin, kioskWait: () => E.esperaMs,
  kioskLock: () => { E.travado = true; }, kioskUnlock: p => (p === E.pin ? (E.travado = false, true) : false),
  kioskPin: (c, n) => (c === E.pin && n.length >= 4 ? (E.pin = n, true) : false),
  kioskReset: p => (p === E.pin ? (E.dona = false, E.travado = false, true) : false), reboot: () => true,
  // Atualização
  updateCheck: () => { tocar({ ev: 'update', st: { phase: 'checking', detail: '' } }); return true; },
  updateState: () => JSON.stringify(E.update), updateAllowed: () => E.permitido,
  version: () => JSON.stringify(E.version), conteudo: () => JSON.stringify(E.conteudo),
  // o mínimo que native.init() toca ao ligar
  hasBaro: () => false, brightness: () => { }, keepOn: () => { }, thermal: () => E.thermal,
  battery: () => JSON.stringify(E.bateria), storage: () => JSON.stringify(E.espaco), cineCadencia: () => { }
};

export function tocar(ev) {
  if (ev.set) { Object.assign(E, ev.set); return; }
  if (ev.ev === 'update' && ev.st) E.update = ev.st;
  const f = window.EtapeEvents && window.EtapeEvents[ev.ev];
  if (f) f(...(ev.args || [ev.st]));
}

export async function instalar(nome) {
  window.EtapeNative = metodos;
  window.__cascaFake = { E, tocar };
  ponte.ligar();
  if (!nome) return;
  const r = await fetch('./casca/roteiros/' + nome + '.json'); if (!r.ok) throw new Error('roteiro ' + nome + ' nao existe');
  for (const ev of await r.json()) setTimeout(() => tocar(ev), (+ev.t || 0) * 1000);
}
