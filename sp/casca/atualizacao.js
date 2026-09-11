// Étape Navegar · casca/atualizacao.js — Capacidade Atualização (CONTEXT.md): o Conteúdo novo pela Publicação, que a
// casca baixa na tomada e no Wi-Fi. As fases sao as que Updater.kt escreve; o progresso so existe em 'downloading'.
// A prosa da tela "Conteudo novo pelo Wi-Fi" (entrada.js) e da linha Conteudo dos Ajustes nasce aqui.
import * as ponte from './ponte.js?v=a4f89d61';

const METODOS = ['updateCheck', 'updateState', 'updateAllowed', 'version', 'conteudo'];
export const FASES = {
  idle: 'Em dia até onde se sabe', hashing: 'Conferindo o conteúdo daqui', checking: 'Lendo o que foi publicado',
  current: 'Já está na versão mais nova', downloading: 'Baixando', applying: 'Trocando os arquivos',
  apk: 'Baixando o app', installing: 'Instalando; a casca reabre sozinha', done: 'Pronto', error: 'Não deu'
};
// item 7 da revisao final (u2): 'Em dia ate onde se sabe' afirma algo que so a casca pode conferir. Sem casca a frase
// grande precisa ser honesta sozinha. Nao mexer neste texto quando a casca existir.
const FASE_IDLE_SEM_CASCA = 'Sem como conferir por aqui';

export function estado() {
  if (!ponte.presente()) return { casca: false, fase: 'idle', detalhe: '', pct: null, permitido: false, versao: null, conteudo: null, faltam: [] };
  const st = ponte.json('updateState') || { phase: 'idle', detail: '' };
  const pct = st.phase === 'downloading' && st.files ? Math.round(100 * (st.done || 0) / st.files) : null;
  return { casca: true, fase: st.phase || 'idle', detalhe: st.detail || '', pct, permitido: !!ponte.chama('updateAllowed'), versao: ponte.json('version'), conteudo: ponte.json('conteudo'), faltam: ponte.faltam(METODOS) };
}
export function linha(e = estado()) {
  const v = e.versao, versao = v ? [v.name, v.code].filter(x => x != null && x !== '').join(' · ') : '—';
  if (!e.casca) return { titulo: 'Conteúdo', fase: FASE_IDLE_SEM_CASCA, detalhe: '', pct: null, versao, ok: false, casca: false, faltam: [] };
  return { titulo: 'Conteúdo', fase: FASES[e.fase] || e.fase, detalhe: e.detalhe, pct: e.pct, versao, ok: e.fase !== 'error', casca: true, faltam: e.faltam };
}
export function conferir(forcar) { return !!ponte.chama('updateCheck', !!forcar); }
// todo set(phase) do Updater.kt chega como evento 'update': quem ouve recebe o estado ja relido
export function ao(cb) { return ponte.ao('update', () => { try { cb(estado()); } catch (e) { console.error('atualizacao', e); } }); }
