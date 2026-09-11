// Étape Navegar · ajustes.js (U1, plano 2026-09-08)
// Os nove painéis do mapa de telas, no lugar do diálogo plano de 21 itens que misturava ação com preferência.
// O módulo é dono de tudo: a lista, a navegação e as primitivas de linha que os painéis reusam. O app.js só chama
// init(). Fora da casca (Chrome), toda linha que dependa da ponte aparece desabilitada com o motivo escrito.
import * as store from './store.js?v=1a47c3a9';
import * as voice from './voice.js?v=1a47c3a9';
import * as sensors from './sensors.js?v=1a47c3a9';
import { tzParts } from './geo.js?v=1a47c3a9';
import * as native from './native.js?v=1a47c3a9';   // U7: as quatro linhas de estado do aparelho leem a ponte por aqui

let S = null, ctx = null, dlg = null, lista = null, telaPainel = null;
const paineis = [];   // { id, titulo, construir }
const $ = id => document.getElementById(id);

// motivo quando a ponte não existe; '' quando existe. Usado por toda linha que dependa da casca.
export function semCasca(motivo) { return window.EtapeNative ? '' : (motivo || 'só no aparelho'); }

function grava() { store.setPrefs(S.prefs); }

// ---- primitivas de linha. Todas têm o mesmo esqueleto: título, subtítulo e um controle à direita.
function linha(el, o, controle) {
  const d = document.createElement('div');
  d.className = 'aj-linha' + (o.indisponivel ? ' off' : '');
  d.innerHTML = '<div class="aj-t"><b></b><span></span></div>';
  d.querySelector('b').textContent = o.titulo;
  d.querySelector('span').textContent = o.indisponivel || o.sub || '';
  d.appendChild(controle);
  el.appendChild(d);
  return d;
}
export function linhaToggle(el, o) {
  const b = document.createElement('button');
  b.className = 'aj-sw'; b.type = 'button';
  const pinta = v => { b.classList.toggle('on', !!v); b.setAttribute('aria-pressed', String(!!v)); b.textContent = v ? 'Ligado' : 'Desligado'; };
  pinta(o.valor);
  if (o.indisponivel) b.disabled = true;
  // o.semGravarPrefs (desligado por padrão): para painéis que já gravam o próprio estado em outra chave do store
  // (o Antes e depois grava em check:<dia>, não em prefs). Sem isto todo toque gravaria também o blob inteiro de
  // preferências, sem nada ter mudado nele — os nove painéis antigos não passam a opção, então continuam iguais.
  else b.onclick = () => { o.valor = !o.valor; pinta(o.valor); o.onMuda(o.valor); if (!o.semGravarPrefs) grava(); };
  return linha(el, o, b);
}
export function linhaOpcoes(el, o) {
  const g = document.createElement('div'); g.className = 'aj-op';
  const bs = o.opcoes.map(([v, rot]) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = rot;
    b.classList.toggle('on', v === o.valor); b.setAttribute('aria-pressed', String(v === o.valor));
    if (o.indisponivel) b.disabled = true;
    else b.onclick = () => { if (v === o.valor) return; o.valor = v; bs.forEach((x, i) => { const on = o.opcoes[i][0] === v; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); }); o.onMuda(v); grava(); };
    g.appendChild(b); return b;
  });
  return linha(el, o, g);
}
export function linhaNumero(el, o) {
  const g = document.createElement('div'); g.className = 'aj-num';
  const menos = document.createElement('button'), val = document.createElement('b'), mais = document.createElement('button');
  menos.type = mais.type = 'button'; menos.textContent = '−'; mais.textContent = '+';
  menos.setAttribute('aria-label', 'Diminuir ' + o.titulo); mais.setAttribute('aria-label', 'Aumentar ' + o.titulo);
  const pinta = () => { val.textContent = o.valor + (o.unidade ? ' ' + o.unidade : ''); };
  const muda = k => { const n = Math.min(o.max, Math.max(o.min, +(o.valor + k * o.passo).toFixed(2))); if (n === o.valor) return; o.valor = n; pinta(); o.onMuda(n); grava(); };
  pinta();
  if (o.indisponivel) { menos.disabled = mais.disabled = true; } else { menos.onclick = () => muda(-1); mais.onclick = () => muda(1); }
  g.append(menos, val, mais);
  return linha(el, o, g);
}
export function linhaTexto(el, o) {
  const b = document.createElement('button'); b.className = 'aj-txt'; b.type = 'button';
  // U8: o valor mostrado embaixo do titulo era escrito UMA vez, na montagem. Colar um link de playlist deixava a
  // linha mostrando o antigo — ou nada, se antes estava vazia, porque o <small> nem chegava a existir. O elemento
  // passa a existir sempre e a ser repintado junto com o botao.
  const val = document.createElement('small'); val.className = 'aj-val';
  const pinta = () => { b.textContent = o.valor ? 'Trocar' : 'Definir'; val.textContent = o.valor || ''; val.hidden = !o.valor; };
  pinta();
  if (o.indisponivel) b.disabled = true;
  // U8: guarda de valor igual, como linhaOpcoes e linhaNumero ja tinham. Sem ela, abrir a caixa e tocar em Guardar
  // sem mudar nada gravava as preferencias e disparava o onMuda — trabalho e escrita em disco por nada.
  else b.onclick = async () => {
    const v = await ctx.perguntar(o.titulo, o.dica || '', o.valor || '');
    if (v == null) return;
    const novo = v.trim();
    if (novo === (o.valor || '')) return;
    o.valor = novo; pinta(); o.onMuda(o.valor); grava();
  };
  const d = linha(el, o, b);
  d.querySelector('.aj-t').appendChild(val);
  return d;
}
export function linhaInfo(el, o) {
  let controle;
  if (o.acao) {
    controle = document.createElement('button'); controle.className = 'aj-txt'; controle.type = 'button'; controle.textContent = o.acao;
    if (o.indisponivel) controle.disabled = true; else controle.onclick = () => o.onAcao();
  } else { controle = document.createElement('b'); controle.className = 'aj-info'; controle.textContent = o.valor || ''; }
  return linha(el, o, controle);
}

// ---- registro e navegação
export function painel(id, titulo, construir) { paineis.push({ id, titulo, construir }); }

function mostrarLista() {
  telaPainel.hidden = true; lista.hidden = false;
  $('ajTitulo').textContent = 'Ajustes'; $('ajVoltar').hidden = true;
}
function abrirPainel(p) {
  lista.hidden = true; telaPainel.hidden = false; telaPainel.innerHTML = '';
  $('ajTitulo').textContent = p.titulo; $('ajVoltar').hidden = false;
  try { p.construir(telaPainel); }
  catch (e) { telaPainel.textContent = 'Este painel falhou ao abrir: ' + e.message; console.error(e); }
}
function montarLista() {
  lista.innerHTML = '';
  for (const p of paineis) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'aj-item';
    b.innerHTML = '<b></b><span>›</span>'; b.querySelector('b').textContent = p.titulo;
    b.onclick = () => abrirPainel(p);
    lista.appendChild(b);
  }
}

export function abrir() { montarLista(); mostrarLista(); if (!dlg.open) dlg.showModal(); }
// U7: abrir direto num painel. A gaveta oferece "Aparelho · rede, bateria e energia" e precisa cair NO painel, nao
// na lista — prometer um lugar e entregar outro e o tipo de coisa que se paga no guidao. Id desconhecido cai na lista.
export function abrirEm(id) {
  montarLista();
  const p = paineis.find(x => x.id === id);
  if (p) abrirPainel(p); else mostrarLista();
  if (!dlg.open) dlg.showModal();
}
export function fechar() { if (dlg.open) dlg.close(); }

export function init(estado, contexto) {
  S = estado; ctx = contexto || {};
  dlg = $('dlgMenu'); lista = $('ajLista'); telaPainel = $('ajPainel');
  if (!dlg || !lista || !telaPainel) return;
  $('ajVoltar').onclick = mostrarLista;
  $('ajLargada').onclick = () => { fechar(); if (ctx.abrirLargada) ctx.abrirLargada(); };
  $('ajRelatorio').onclick = () => { fechar(); if (ctx.abrirRelatorio) ctx.abrirRelatorio(); };
  painel('tela', 'Tela', el => {
    linhaOpcoes(el, { titulo: 'Tela', sub: 'no pedal, sempre ligada; parado, apaga sozinha', valor: S.prefs.screen,
      opcoes: [['sempre', 'Sempre ligada'], ['economia', 'Apaga sozinha']],
      onMuda: v => { S.prefs.screen = v; if (ctx.aplicarTela) ctx.aplicarTela(); } });
    linhaOpcoes(el, { titulo: 'Tema', sub: 'automático segue o sol da região', valor: S.prefs.theme,
      opcoes: [['auto', 'Auto'], ['day', 'Dia'], ['night', 'Noite']],
      onMuda: v => { S.prefs.theme = v; if (ctx.aplicarTema) ctx.aplicarTema(); } });
    linhaToggle(el, { titulo: 'Brilho pelo sensor de luz', sub: 'sombra 40 %, sol 100 %', valor: S.prefs.brilhoAuto,
      indisponivel: semCasca('o sensor de luz é da casca'),
      onMuda: v => { S.prefs.brilhoAuto = v; } });
    linhaOpcoes(el, { titulo: 'Chão sem satélite', sub: 'Estúdio é o padrão; Carta lê melhor no sol a pino', valor: S.prefs.chao,
      opcoes: [['estudio', 'Estúdio'], ['carta', 'Carta']],
      indisponivel: (ctx.chaoDisponivel && ctx.chaoDisponivel()) ? '' : 'o mapa ainda não muda com esta opção',
      onMuda: v => { S.prefs.chao = v; if (ctx.aplicarChao) ctx.aplicarChao(v); } });
  });
  painel('voz', 'Voz', el => {
    linhaToggle(el, { titulo: 'Avisos falados', sub: 'curvas, cols, paradas, abastecimento', valor: S.prefs.voice,
      onMuda: v => { S.prefs.voice = v; if (v) voice.unmute(); else voice.mute(); } });
    linhaOpcoes(el, { titulo: 'Sobre a música', sub: 'aviso importante pausa; os outros abaixam', valor: S.prefs.vozMusica,
      opcoes: [['pausa', 'Pausa'], ['abaixa', 'Abaixa']],
      indisponivel: 'a casca decide isso por enquanto',
      onMuda: v => { S.prefs.vozMusica = v; } });
  });
  painel('musica', 'Música', el => {
    // U8: esta linha dizia "Ligado" so porque a casca existia, sem olhar se a permissao foi dada. Medido no S23:
    // `enabled_notification_listeners` NAO tinha o Etape, e a linha dizia Ligado assim mesmo — no portao de toda a
    // musica. Agora pergunta ao aparelho, e quando esta desligada oferece o caminho de ligar.
    const ouve = window.EtapeNative && native.ouveNotificacoes && native.ouveNotificacoes();
    linhaInfo(el, { titulo: 'Acesso a notificações', sub: 'é o que deixa ler e controlar o YouTube Music',
      indisponivel: semCasca('a música é lida pela casca'),
      valor: ouve ? 'Ligado' : (window.EtapeNative ? undefined : '—'),
      acao: (window.EtapeNative && !ouve) ? 'Ligar' : undefined,
      onAcao: () => { fechar(); native.pedirPermissao('pedirNotificacoes'); } });
    // U8: `stages[k]` NAO tem campo `name` — em mundo nenhum. O nome mora em `ROUTES.names[k]`, e ja vem com o
    // prefixo ("E1 Clermont → Brioude", "SP Navegacao livre"). Lendo o lugar errado, o nome caia no proprio `k` e o
    // titulo saia "E1 · 1", "E2 · 2" … na Viagem, e "SP · SP" no Diario: nove linhas indistinguiveis no mundo que
    // importa. Estava anotado como defeito de copy do Diario; era o painel inteiro.
    const chaves = S.routes && S.routes.stages ? Object.keys(S.routes.stages) : [];
    for (const k of chaves) {
      const nome = (S.routes.names && S.routes.names[k]) || k;
      linhaTexto(el, { titulo: nome, sub: 'abre sozinha ao Partir',
        dica: 'cole o link do YouTube Music', valor: S.prefs.playlists[k],
        onMuda: v => { S.prefs.playlists[k] = v; } });
    }
    // "Pausar ao gravar" não vira linha: o REC já pausa a música sozinho (music.js, evento etape:rec), sem
    // ler preferência nenhuma para isso. Uma linha aqui acenderia e não mudaria nada.
    linhaToggle(el, { titulo: 'Pausar ao gravar', sub: 'volta quando o clipe termina', valor: true,
      indisponivel: 'o REC já pausa sozinho; nada lê esta opção ainda', onMuda: () => {} });
    linhaToggle(el, { titulo: 'Pausar em descida', sub: 'de categoria, a partir de −4 %', valor: S.prefs.music.pauseDescent,
      onMuda: v => { S.prefs.music.pauseDescent = v; } });
    linhaToggle(el, { titulo: 'Continuar parado', sub: 'a música segue enquanto você está parado', valor: S.prefs.music.keepStill,
      indisponivel: 'nada lê esta opção ainda',
      onMuda: v => { S.prefs.music.keepStill = v; } });
  });
  painel('cinema', 'Cinema', el => {
    linhaOpcoes(el, { titulo: 'Modo padrão da Estrada', sub: 'Nitidez: 4K 10 bits · Aberto: ultrawide', valor: S.prefs.cineMode,
      opcoes: [['nitidez', 'Nitidez'], ['aberto', 'Aberto']], indisponivel: semCasca('a câmera é da casca'),
      onMuda: v => { S.prefs.cineMode = v; } });
    // UC3a: a cadencia da captura. E a unica escolha do Cinema que NAO se desfaz na fabrica — o que foi gravado a 24
    // fica a 24 —, por isso ela mora aqui, com o padrao em 30, e so muda depois do ensaio de SP aprovar. O 1/50
    // existe para a luz artificial francesa, de 50 Hz.
    linhaOpcoes(el, { titulo: 'Cadência', sub: '24 é a cadência de cinema · nenhuma fábrica desfaz depois da captura',
      valor: S.prefs.cineCadencia || '30', indisponivel: semCasca('a câmera é da casca'),
      opcoes: [['30', '30 · 1/60'], ['24-48', '24 · 1/48'], ['24-50', '24 · 1/50']],
      onMuda: v => { S.prefs.cineCadencia = v; native.cineCadencia(v); } });
    linhaOpcoes(el, { titulo: 'Look', sub: 'na prévia e nos filmes da noite', valor: String(S.prefs.cineLook),
      opcoes: [['0', 'Clássico'], ['1', 'Cinema'], ['2', 'Forte'], ['3', 'Arte · Nolan'], ['4', 'Arte · Tarantino']], indisponivel: semCasca('a câmera é da casca'),
      onMuda: v => { S.prefs.cineLook = +v; } });
    linhaToggle(el, { titulo: 'Prévia com o look', sub: 'mostra na tela o que vai para o arquivo', valor: S.prefs.previewLook,
      indisponivel: semCasca('a câmera é da casca'), onMuda: v => { S.prefs.previewLook = v; } });
    linhaToggle(el, { titulo: 'REC automático', sub: 'col, cume, descida, flamme rouge · desligado no Diário',
      valor: S.prefs.autoRec == null ? !(S.free || S.diario) : !!S.prefs.autoRec,   // padrão dinâmico: auto.js decide igual, em pref()
      indisponivel: semCasca('a câmera é da casca'), onMuda: v => { S.prefs.autoRec = v; } });
    linhaNumero(el, { titulo: 'Gatilho de batimento', sub: 'grava o rosto 20 s acima disto', valor: S.prefs.hrTrigger,
      min: 120, max: 200, passo: 5, unidade: 'bpm', indisponivel: semCasca('depende do sensor e da câmera'),
      onMuda: v => { S.prefs.hrTrigger = v; } });
  });
  painel('sensores', 'Sensores', el => {
    const s = S.sensors || {};
    linhaInfo(el, { titulo: 'Batimento', sub: 'cinta ou relógio, por Bluetooth',
      valor: s.hr ? s.hr + ' bpm' : 'Nenhum', acao: 'Procurar',
      onAcao: () => { fechar(); if (ctx.procurarSensor) ctx.procurarSensor(); },
      indisponivel: sensors.supported() ? '' : 'este navegador não tem Bluetooth' });
    linhaInfo(el, { titulo: 'Cadência e potência', sub: 'procura ao Partir', valor: s.cad ? s.cad + ' rpm' : 'Nenhum' });
  });
  painel('eu', 'Eu', el => {
    linhaNumero(el, { titulo: 'Peso', sub: 'aparece na nota de antes de partir, junto das garrafas', valor: S.prefs.weight,
      min: 45, max: 130, passo: 1, unidade: 'kg', onMuda: v => { S.prefs.weight = v; } });
    // Gole e Mordida: sem consumidor. sipMl/biteG do plano de abastecimento vêm da tela Antes de sair
    // (outing.js, metrics:<modo> no localStorage) ou do guia da etapa (fuel.js plan()); nada lê S.prefs.metas.
    linhaNumero(el, { titulo: 'Gole', sub: 'quanto o botão Bebi registra', valor: (S.prefs.metas || {}).sipMl || 150,
      min: 50, max: 400, passo: 25, unidade: 'ml',
      indisponivel: 'quem decide isto hoje é a tela Antes de sair, não este ajuste',
      onMuda: v => { S.prefs.metas = { ...(S.prefs.metas || {}), sipMl: v }; } });
    linhaNumero(el, { titulo: 'Mordida', sub: 'quanto o botão Comi registra', valor: (S.prefs.metas || {}).biteG || 30,
      min: 10, max: 90, passo: 5, unidade: 'g',
      indisponivel: 'quem decide isto hoje é a tela Antes de sair, não este ajuste',
      onMuda: v => { S.prefs.metas = { ...(S.prefs.metas || {}), biteG: v }; } });
    linhaInfo(el, { titulo: 'Meta do Diário', sub: 'a cada hora em movimento', valor: '500 ml · 60 g' });
    linhaInfo(el, { titulo: 'Meta da Viagem', sub: 'pelo tipo do dia', valor: '500–600 ml · 60–70 g' });
  });
  painel('aparelho', 'Aparelho', el => {
    linhaOpcoes(el, { titulo: 'Mundo', sub: 'automático escolhe pela data da viagem e pelo fuso; a troca vale na próxima abertura (a porta do rodapé da Largada atravessa só desta vez, sem mexer aqui)', valor: S.prefs.mundo,
      opcoes: [['auto', 'Auto'], ['nav', 'Viagem'], ['sp', 'Diário']],
      onMuda: v => { S.prefs.mundo = v; store.delAba('mundo:redir'); } });
    linhaInfo(el, { titulo: 'Primeira vez', sub: 'rever as quatro autorizações', acao: 'Rever',
      onAcao: () => { fechar(); if (ctx.abrirPrimeira) ctx.abrirPrimeira(); } });
    linhaInfo(el, { titulo: 'Conteúdo novo', sub: 'mapas, etapas e o app, pelo Wi-Fi', acao: 'Ver',
      onAcao: () => { fechar(); if (ctx.abrirUpdate) ctx.abrirUpdate(); } });
    const fora = semCasca('só no aparelho, fora do navegador');
    // U7 (09/09): as quatro linhas abaixo mostravam um traço desde a U1, esperando a ponte. A ponte chegou.
    // Fora da casca cada uma continua desabilitada, com o motivo escrito — o traço só sobra onde não há resposta.
    const bat = fora ? null : native.bateria();
    linhaInfo(el, { titulo: 'Bateria', sub: bat && bat.charging ? 'carregando' : 'nível e consumo', indisponivel: fora,
      valor: bat ? bat.level + '%' + (bat.mA ? ' · ' + Math.abs(bat.mA) + ' mA' : '') : '—' });
    const esp = fora ? null : native.espaco();
    linhaInfo(el, { titulo: 'Espaço', sub: esp && esp.contentMB > 0 ? 'o conteúdo ocupa ' + esp.contentMB + ' MB' : 'livre no aparelho',
      indisponivel: fora, valor: esp ? (esp.freeMB / 1024).toFixed(1) + ' GB livres' : '—' });
    const cont = fora ? null : native.conteudo();
    linhaInfo(el, { titulo: 'Conteúdo', indisponivel: fora,
      sub: cont && cont.files ? cont.files.toLocaleString('pt-BR') + ' arquivos' : 'versão publicada',
      valor: cont ? (cont.version || 'pelo cabo') : '—' });
    const dr = fora ? null : native.driveResumo();
    linhaInfo(el, { titulo: 'Drive', indisponivel: fora,
      sub: dr && dr.fila ? dr.fila + (dr.fila === 1 ? ' vídeo na fila' : ' vídeos na fila') : 'conta e fila de envio',
      valor: dr ? (dr.conta || 'sem conta') : '—' });
    // U7 (10/09): os seis itens que a U1 apagou voltam aqui — os quatro atalhos de app, "subir pelo celular" e
    // "reiniciar" —, e a trava deixa de ser um traço. Na estrada eles ganham a gaveta (Tarefa 8 do plano da casca);
    // os Ajustes são onde se vai parado, e é onde eles precisam existir enquanto a gaveta não vem.
    const CELL = [0, 2, 5, 10];   // GB por dia; chip francês na viagem. Nunca durante a saída (o Drive já recusa).
    const gb = fora ? 0 : native.driveCellGB();
    linhaOpcoes(el, { titulo: 'Subir pelo celular', sub: 'teto por dia; o Wi-Fi continua sem limite e a saída nunca sobe', indisponivel: fora,
      valor: gb, semGravarPrefs: true, opcoes: CELL.map(g => [g, g ? g + ' GB' : 'Não']),
      onMuda: v => { native.driveCell(+v); voice.banner(+v ? 'Sobe pelo celular até ' + v + ' GB por dia' : 'Só pelo Wi-Fi', 3, +v ? 'fora da saída' : ''); } });

    // Os quatro aparecem sempre, instalados ou nao: o que falta instalar e informacao, nao ausencia. Tres dos quatro
    // ainda faltam no S23 e o Pedro precisa ver isso aqui, nao descobrir em Auvergne.
    for (const a of (fora ? [] : native.apps())) {
      // `indisponivel` e o MOTIVO escrito, nunca um booleano: a linha imprime `o.indisponivel || o.sub`, entao um
      // `true` apareceria na tela como a palavra "true" — foi o que aconteceu, e so o aparelho mostrou.
      linhaInfo(el, { titulo: a.name || a.id, sub: 'abrir no aparelho',
        indisponivel: fora || (a.installed ? '' : 'ainda não está instalado'), acao: 'Abrir',
        // mesmo caminho da gaveta: o Google Maps vai para o fim da etapa e a Música abre na playlist do dia. Duas
        // portas para o mesmo app nao podem levar a lugares diferentes.
        onAcao: () => { fechar(); if (ctx.abrirApp) ctx.abrirApp(a.id); } });
    }

    const travado = fora ? false : native.kioskLocked();
    linhaInfo(el, { titulo: 'Travar o aparelho', sub: travado ? 'travado: só o Étape' : 'só o Étape, PIN para sair',
      indisponivel: fora || (native.kioskOwner() ? '' : 'a casca não é dona do aparelho'), acao: travado ? 'Destravar' : 'Travar',
      onAcao: async () => { const r = await ctx.travar(!travado); if (r != null) { fechar(); } } });
    linhaInfo(el, { titulo: 'Guardar', sub: 'apaga tudo; o botão lateral acorda · na bateria derruba Wi-Fi e Bluetooth',
      indisponivel: fora || (native.disponivel('guardar') ? '' : 'a casca ainda não sabe guardar'), acao: 'Guardar',
      onAcao: () => { fechar(); if (ctx.guardar) ctx.guardar(); } });
    linhaInfo(el, { titulo: 'Desligar', sub: 'o aparelho apaga de vez', indisponivel: fora,
      acao: 'Como', onAcao: () => { fechar(); if (ctx.desligar) ctx.desligar(); } });
    linhaInfo(el, { titulo: 'Reiniciar', sub: 'desliga e liga o aparelho; o Étape volta sozinho', indisponivel: fora,
      acao: 'Reiniciar', onAcao: () => { fechar(); if (ctx.reiniciar) ctx.reiniciar(); } });
    // some da lista normal: irreversível sem reset de fábrica, então só aparece com ?debug=1 (revisão 07/09, mantida na
    // Tarefa 10). Não fica em lugar de destaque.
    if (/[?&]debug=1/.test(location.search)) {
      linhaInfo(el, { titulo: 'Aparelho de volta ao normal', sub: 'tira a trava e o dono do aparelho (PIN) · sem reset de fábrica não volta', valor: '—',
        indisponivel: fora, acao: fora ? undefined : 'Fazer', onAcao: () => { fechar(); if (ctx.aparelhoNormal) ctx.aparelhoNormal(); } });
    }
  });
  painel('mapa', 'Mapa', el => {
    linhaOpcoes(el, { titulo: 'Orientação', sub: 'a rota sobe na tela, ou o norte fica em cima', valor: S.prefs.orientation || 'heading',
      opcoes: [['heading', 'Rumo'], ['north', 'Norte']],
      onMuda: v => { S.prefs.orientation = v; if (ctx.aplicarOrientacao) ctx.aplicarOrientacao(v); } });
    linhaToggle(el, { titulo: 'Satélite', sub: 'quando houver, dentro do corredor', valor: !!S.prefs.sat,
      onMuda: v => { S.prefs.sat = v; if (ctx.aplicarSat) ctx.aplicarSat(v); } });
    linhaOpcoes(el, { titulo: 'Câmera do Pedal', sub: 'de cima, ou atrás do ciclista', valor: S.prefs.cam || '2d',
      opcoes: [['2d', 'Sobrevoo'], ['tp', '3ª pessoa']],
      onMuda: v => { S.prefs.cam = v; if (ctx.aplicarCam) ctx.aplicarCam(v); } });
  });
  // U3.2: checklist de manhã e de noite, só quando o data.js publicou window.CHECK (construção da Auvergne).
  // Registrar aqui, condicionado à existência do dado, é a regra pedida: nenhum "if de mundo" espalhado pelo
  // resto do módulo — no Diário de São Paulo window.CHECK simplesmente não existe e o painel nunca entra na lista.
  if (window.CHECK) painel('antesdepois', 'Antes e depois', el => {
    // chave carrega o dia (fuso da viagem, do relógio — não da etapa em tela): quem usa este painel está com a
    // bike na mão, na porta do hotel, e a data que importa é a de agora, não a etapa que porventura esteja aberta
    // no mapa. Assim a lista de amanhã nasce sempre limpa, sem ninguém precisar desmarcar nada de manhã.
    const p = tzParts(new Date());
    const dia = p.y + '-' + String(p.mo).padStart(2, '0') + '-' + String(p.d).padStart(2, '0');
    // Exceção legítima à regra "nenhuma linha grava o que ninguém lê" (a mesma da tela Primeira vez, entrada.js):
    // aqui quem lê o estado marcado é este próprio painel, ao reconstruir a tela na próxima abertura — não há
    // outro consumidor porque não precisa haver um; o "usar" da preferência é o painel se repintar já marcado.
    const st = store.get('check:' + dia, { manha: {}, noite: {} });
    // achado 1 da revisão: a identidade da marca não pode ser o índice do array. MORNING_ITEMS/NIGHT_ITEMS
    // (build_pocket.py) ainda vão ser editadas antes da viagem — se alguém inserir ou remover um item, os
    // índices de todo mundo abaixo dele deslizam, e uma marca gravada por índice migra em silêncio para o
    // item errado. Numa lista de conferência isso é pior que não ter marca nenhuma: a pessoa confia numa
    // marca que não é dela. Por isso a chave gravada é um resumo determinístico do próprio texto do item —
    // se o texto mudar, o resumo muda junto, e o pior caso é o item editado nascer desmarcado (seguro),
    // nunca marcado por engano no lugar de outro.
    const idDoItem = texto => {
      let h = 5381;
      for (let i = 0; i < texto.length; i++) h = ((h * 33) ^ texto.charCodeAt(i)) >>> 0;
      return h.toString(36);
    };
    const grava = () => store.set('check:' + dia, st);
    const bloco = (titulo, chave, items) => {
      // achado 3: window.CHECK existe mas uma das duas listas pode faltar ou vir malformada (build velho,
      // dado incompleto). Sem checar, o forEach abaixo estoura e o painel inteiro mostra a exceção técnica
      // do abrirPainel(); em vez disso o bloco simplesmente não aparece.
      if (!Array.isArray(items) || !items.length) return;
      const marcados = (st[chave] && typeof st[chave] === 'object') ? st[chave] : {};
      const h = document.createElement('div'); h.className = 'aj-sub'; h.textContent = titulo; el.appendChild(h);
      items.forEach(texto => {
        const id = idDoItem(texto);
        linhaToggle(el, { titulo: texto, valor: !!marcados[id], semGravarPrefs: true,
          onMuda: v => { if (v) marcados[id] = true; else delete marcados[id]; st[chave] = marcados; grava(); } });
      });
    };
    bloco('De manhã, antes de sair', 'manha', window.CHECK.manha);
    bloco('À noite, ao chegar', 'noite', window.CHECK.noite);
  });
  // só em teste (?debug=1): percorrer a etapa sem sair do lugar, e zerar o progresso para recomeçar a prova.
  if (/[?&]debug=1/.test(location.search)) painel('sim', 'Simulação', el => {
    linhaInfo(el, { titulo: 'Simulação', sub: 'percorre a etapa a 22 km/h', acao: 'Rodar', onAcao: () => { fechar(); if (ctx.simular) ctx.simular(); } });
    linhaInfo(el, { titulo: 'Zerar etapa', sub: 'apaga progresso, sessão e registro', acao: 'Zerar', onAcao: () => { fechar(); if (ctx.zerarEtapa) ctx.zerarEtapa(); } });
  });
}
