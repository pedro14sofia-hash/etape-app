// Étape Navegar · entrada.js (U2, plano 2026-09-08)
// As duas telas de entrada: Primeira vez (as quatro permissões, em sequência) e Conteúdo novo pelo Wi-Fi.
// Fora da casca só a localização é de verdade; as outras três dependem da ponte e aparecem desabilitadas com
// o motivo escrito, como em ajustes.js. O módulo não alcança o app.js: tudo pelo contexto.
import * as store from './store.js';
import { semCasca } from './ajustes.js';
import * as native from './native.js';

let ctx = null;
const $ = id => document.getElementById(id);

// ---- Primeira vez
const PERMISSOES = [
  { id: 'local', titulo: 'Localização', sub: 'onde você está no traçado, o tempo todo, mesmo com a tela apagada',
    motivo: () => '', pedir: () => new Promise(res => {
      if (!navigator.geolocation) return res('negado');
      navigator.geolocation.getCurrentPosition(() => res('concedido'), () => res('negado'), { timeout: 10000 });
    }) },
  // item 1 da revisão final (u2-largada): o motivo destas três linhas testa dois portões — a casca (semCasca) e,
  // com a casca presente, o método de pedido de verdade (native.disponivel). O segundo portão continua valendo:
  // se um dia a casca aparecer sem um destes métodos, a linha se desabilita sozinha em vez de mentir.
  // U7 (09/09): os três `pedir()` deixaram de ser substitutos e falam com o Android. O de "Acesso a notificações"
  // abre uma TELA do sistema em vez de um diálogo — ele pode demorar minutos, e quem responde é o onResume da casca.
  { id: 'avisos', titulo: 'Avisos', sub: 'a voz e as placas do pedal',
    motivo: () => semCasca('os avisos vêm da casca') || (native.disponivel('pedirAvisos') ? '' : 'a casca ainda não sabe pedir isso'),
    pedir: () => native.pedirPermissao('pedirAvisos') },
  { id: 'camera', titulo: 'Câmera e microfone', sub: 'o Cinema: 4K na guia, som do vento e da estrada',
    motivo: () => semCasca('o Cinema só existe no aparelho') || (native.disponivel('pedirCamera') ? '' : 'a casca ainda não sabe pedir isso'),
    pedir: () => native.pedirPermissao('pedirCamera') },
  { id: 'musica', titulo: 'Acesso a notificações', sub: 'a faixa que está tocando aparece na fita; é o portão de toda a música',
    motivo: () => semCasca('o acesso a notificações só existe no aparelho') || (native.disponivel('pedirNotificacoes') ? '' : 'a casca ainda não sabe pedir isso'),
    pedir: () => native.pedirPermissao('pedirNotificacoes'),
    // esta nao abre um dialogo: abre uma TELA do sistema, onde o ciclista procura o Etape numa lista.
    // Vinte segundos estourariam sempre; dois minutos e o tempo de fazer isso sem pressa.
    prazo: 120000 }
];

function estados() { return store.get('perm', {}); }
function gravaEstado(id, v) { const e = estados(); e[id] = v; store.set('perm', e); }

function montaPrimeira() {
  const el = $('pvPermLista'); el.innerHTML = '';
  const st = estados();
  for (const p of PERMISSOES) {
    const motivo = p.motivo();
    const d = document.createElement('div');
    d.className = 'aj-linha' + (motivo ? ' off' : '');
    d.innerHTML = '<div class="aj-t"><b></b><span></span></div>';
    d.querySelector('b').textContent = p.titulo;
    d.querySelector('span').textContent = motivo || p.sub;
    const b = document.createElement('button');
    b.className = 'aj-txt'; b.type = 'button';
    const pinta = v => { b.textContent = v === 'concedido' ? 'Pronto' : v === 'negado' ? 'De novo' : 'Permitir'; d.classList.toggle('ok', v === 'concedido'); };
    pinta(st[p.id]);
    if (motivo) b.disabled = true;
    else b.onclick = async () => {
      b.disabled = true; b.textContent = 'Pedindo…';
      // O `timeout` do getCurrentPosition (linha da PERMISSOES) não corre enquanto o diálogo
      // nativo do Chrome está aberto e sem resposta: se o ciclista clica em "Permitir" e
      // ignora o diálogo, nenhum callback chega e a promessa de p.pedir() nunca resolve.
      // Por isso corremos aqui um prazo em JavaScript (20s) contra ela; sem isso o botão
      // fica preso em "Pedindo…" para sempre. Não tire este prazo achando que a opção da
      // API já cobre o caso — ela não cobre.
      let venceu = false;
      const prazo = new Promise(res => setTimeout(() => { venceu = true; res(); }, p.prazo || 20000));
      const v = await Promise.race([p.pedir(), prazo]);
      if (venceu) {
        // Não sabemos a resposta: não gravamos nada (gravar 'negado' seria mentira) e
        // devolvemos a linha ao estado de quem ainda não respondeu. Se a resposta real do
        // navegador chegar depois, ela é ignorada aqui — não há mais nada esperando por ela,
        // então não reabre nem regrava uma linha que já pode ter sido remontada.
        b.disabled = false; b.textContent = 'Permitir';
        return;
      }
      gravaEstado(p.id, v); b.disabled = false; pinta(v);
    };
    d.appendChild(b);
    el.appendChild(d);
  }
}

export function precisaPrimeira() { return !store.get('primeira', false); }
export function abrirPrimeira() {
  const dlg = $('dlgPrimeira'); if (!dlg) return;
  montaPrimeira();
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
}

// ---- Conteúdo novo pelo Wi-Fi. As fases são as que Update.kt escreve; o progresso só existe em 'downloading'.
const FASES = {
  idle: 'Em dia até onde se sabe', hashing: 'Conferindo o conteúdo daqui', checking: 'Lendo o que foi publicado',
  current: 'Já está na versão mais nova', downloading: 'Baixando', applying: 'Trocando os arquivos',
  apk: 'Baixando o app', installing: 'Instalando; a casca reabre sozinha', done: 'Pronto', error: 'Não deu'
};
// item 7 da revisão final: 'Em dia até onde se sabe' é uma afirmação sobre um estado que a tela só pode conhecer
// através da ponte que confere o conteúdo publicado — sem casca essa ponte não existe. O motivo pequeno em
// abrirUpdate() já corrige a letra pequena, mas a frase grande é a que se lê primeiro; ela precisa ser honesta
// sozinha, sem a casca. Não mexer neste texto quando a casca existir.
const FASE_IDLE_SEM_CASCA = 'Sem como conferir por aqui';
let upTimer = 0;

function pintaUpdate() {
  const st = native.updateState() || { phase: 'idle', detail: '' };
  const pct = st.phase === 'downloading' && st.files ? Math.round(100 * (st.done || 0) / st.files) : null;
  $('upFase').textContent = (st.phase === 'idle' && !native.available()) ? FASE_IDLE_SEM_CASCA : (FASES[st.phase] || st.phase);
  $('upDet').textContent = st.detail || '';
  const barra = $('upBarra');
  barra.hidden = pct == null;
  if (pct != null) { barra.firstElementChild.style.width = pct + '%'; barra.setAttribute('aria-valuenow', String(pct)); }
  const v = native.version();
  $('upVer').textContent = v ? [v.name, v.code].filter(Boolean).join(' · ') : '—';
}

export function abrirUpdate() {
  const dlg = $('dlgUpdate'); if (!dlg) return;
  const motivo = semCasca('o conteúdo novo chega pela casca') || (ctx.emSaida && ctx.emSaida() ? 'durante uma saída, não' : '');
  $('upMotivo').textContent = motivo;
  $('upMotivo').hidden = !motivo;
  $('upAgora').disabled = !!motivo;
  pintaUpdate();
  if (!dlg.open) dlg.showModal();
  clearInterval(upTimer);
  upTimer = setInterval(pintaUpdate, 1000);
}

export function init(contexto) {
  ctx = contexto || {};
  const dlg = $('dlgPrimeira');
  if (dlg) $('pvPermPronto').onclick = () => { store.set('primeira', true); dlg.close(); if (ctx.aoTerminar) ctx.aoTerminar(); };
  if ($('dlgUpdate')) $('upAgora').onclick = () => { native.updateCheck(true); pintaUpdate(); };
  // achado (revisão): o listener de 'close' vive aqui, registrado uma vez só; abrirUpdate() pode ser chamada
  // de novo com o diálogo já aberto sem acumular um segundo listener pendente.
  if ($('dlgUpdate')) $('dlgUpdate').addEventListener('close', () => { clearInterval(upTimer); upTimer = 0; });
}
