// Étape Navegar · casca/quiosque.js — Capacidade Quiosque (CONTEXT.md): travar e liberar o aparelho com PIN, reiniciar,
// devolver o aparelho ao normal. Sem casca, ou com casca que nao e dona do aparelho, tudo responde vazio e nenhum
// comando faz nada. A prosa das telas (Ajustes > Aparelho, o toque longo no relogio) nasce aqui, em linha().
import * as ponte from './ponte.js';

const METODOS = ['kioskOwner', 'kioskLocked', 'kioskCheck', 'kioskWait', 'kioskLock', 'kioskUnlock', 'kioskPin', 'kioskReset', 'reboot'];
const TITULO = 'Travar o aparelho';

export function estado() {
  if (!ponte.presente()) return { casca: false, dona: false, travado: false, esperaMs: 0, faltam: [] };
  return { casca: true, dona: !!ponte.chama('kioskOwner'), travado: !!ponte.chama('kioskLocked'), esperaMs: +ponte.chama('kioskWait') || 0, faltam: ponte.faltam(METODOS) };
}
export function linha(e = estado()) {
  if (!e.casca) return { titulo: TITULO, detalhe: 'só no aparelho', ok: false, casca: false, faltam: [] };
  if (!e.dona) return { titulo: TITULO, detalhe: 'a casca não é dona do aparelho', ok: false, casca: true, faltam: e.faltam };
  return { titulo: TITULO, detalhe: e.travado ? 'travado: só o Étape' : 'só o Étape, PIN para sair', ok: true, casca: true, faltam: e.faltam };
}
export function textoEspera(e = estado()) { return e.esperaMs > 0 ? ' · espere ' + Math.ceil(e.esperaMs / 1000) + ' s' : ''; }

export function pinOk(pin) { return !!ponte.chama('kioskCheck', String(pin == null ? '' : pin).trim()); }
export function travar() { if (!estado().dona) return false; ponte.chama('kioskLock'); return true; }
export function destravar(pin) { return !!ponte.chama('kioskUnlock', String(pin == null ? '' : pin).trim()); }
export function trocarPin(atual, novo) { return !!ponte.chama('kioskPin', String(atual), String(novo)); }
export function resetar(pin) { return !!ponte.chama('kioskReset', String(pin == null ? '' : pin).trim()); }
export function reiniciar() { return !!ponte.chama('reboot', ''); }

// O Kotlin nao emite evento de quiosque: a sonda e interna, 2 s, e so enquanto alguem ouve.
const assinantes = new Set(); let sonda = 0, ultimo = '';
export function ao(cb) {
  assinantes.add(cb);
  if (!sonda) { ultimo = JSON.stringify(estado()); sonda = setInterval(() => { const e = estado(), s = JSON.stringify(e); if (s !== ultimo) { ultimo = s; for (const f of [...assinantes]) { try { f(e); } catch (err) { console.error('quiosque', err); } } } }, 2000); }
  return () => { assinantes.delete(cb); if (!assinantes.size) { clearInterval(sonda); sonda = 0; } };
}
