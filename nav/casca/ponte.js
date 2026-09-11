// Étape Navegar · casca/ponte.js — a única porta para window.EtapeNative e window.EtapeEvents (ADR-0006).
// Uma Capacidade (CONTEXT.md) fala com a casca só por aqui: chama() nunca lança, json() nunca devolve lixo, e os
// eventos que o Kotlin dispara em window.EtapeEvents chegam por ao(). Sem casca, tudo responde vazio.
const ouvintes = new Map();

export function B() { return window.EtapeNative || null; }
export function presente() { return !!B(); }
export function tem(nome) { try { const b = B(); return !!b && typeof b[nome] === 'function'; } catch (e) { return false; } }
export function faltam(nomes) { return presente() ? nomes.filter(n => !tem(n)) : []; }
export function chama(nome, ...args) { try { const b = B(); return b && typeof b[nome] === 'function' ? b[nome](...args) : undefined; } catch (e) { return undefined; } }
export function json(nome, ...args) { const r = chama(nome, ...args); if (r == null || r === '') return null; try { return JSON.parse(r); } catch (e) { return null; } }

export function ao(evento, cb) {
  if (!ouvintes.has(evento)) ouvintes.set(evento, new Set());
  ouvintes.get(evento).add(cb);
  return () => { const s = ouvintes.get(evento); if (s) s.delete(cb); };
}
export function emite(evento, ...args) {
  const s = ouvintes.get(evento); if (!s) return;
  for (const cb of [...s]) { try { cb(...args); } catch (e) { console.error('casca:' + evento, e); } }
}
// os quinze nomes que NativeBridge.kt chama em window.EtapeEvents (fix, key, ... energia). Um nome novo no Kotlin
// entra aqui — e o casca_test.py estatico nao ve isto: e o unico ponto do espelho que continua a mao.
export const EVENTOS = ['fix', 'key', 'photo', 'baro', 'light', 'thermal', 'rec', 'update', 'music', 'night', 'drive', 'rotate', 'away', 'perm', 'energia'];
export function ligar() {
  if (window.EtapeEvents && window.EtapeEvents.__ponte) return;
  const t = { __ponte: true };
  for (const n of EVENTOS) t[n] = (...a) => emite(n, ...a);
  window.EtapeEvents = t;
}
