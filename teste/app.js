// Étape Navegar · app.js
// Composição: liga os módulos e controla o ciclo de vida.
import { mercX, mercY, haversine } from './geo.js';
import { loadMap, loadRoutes, loadParadas, poisNear, loadContours } from './data-mod.js';
import { createRenderer, drawFita } from './render.js';
import * as track from './track.js';
import * as gps from './gps.js';
import * as guide from './guide.js';
import * as voice from './voice.js';
import * as ui from './ui.js';
import * as store from './store.js';
import * as logdb from './logdb.js';   // U6 Fase 3: o registro do dia vive no IndexedDB
import * as session from './session.js';
import * as telemetry from './telemetry.js';
import * as fuel from './fuel.js';
import * as report from './report.js';
import * as sat from './sat.js';
import * as dem from './dem.js';
import * as shade from './shade.js';
import * as compass from './compass.js';
import * as weather from './weather.js';
import * as sensors from './sensors.js';
import * as free from './free.js';   // navegação livre (build de São Paulo, window.FREE)
import * as outing from './outing.js';   // tela 02 · antes de sair
import * as plan from './plan.js';   // Diário: rotas A→B e etapa refeita fora da rota
import * as native from './native.js';   // casca nativa (N3a): barômetro, brilho, térmico
import * as sidecar from './sidecar.js';   // Cinema pacote 2: telemetria a 10 Hz ao lado de cada clipe
import * as music from './music.js';   // pacote 5: YouTube Music comandado pela casca, regras de pausa
import * as cinema from './cinema.js';
import * as auto from './auto.js';   // Cinema v2: gatilhos automáticos
import * as passeio from './passeio.js';   // diário do passeio (bateria, gatilhos, alertas) guardado com os sidecars
import * as etapas from './etapas.js';   // U2 · a folha Escolher etapa, no lugar do <select> da fita
import * as cinemaUi from './cinema-ui.js';   // Anna: tela do Cinema e faixa da música   // Cinema pacotes 3 e 4: estado, botões físicos, bússola de luz (a tela é da Anna)
import * as ajustes from './ajustes.js';   // U1: os nove painéis, no lugar do menu plano
import * as entrada from './entrada.js';   // U2 · Primeira vez e Conteúdo novo pelo Wi-Fi

// U2 · o mundo certo sozinho. Viagem e Diário são duas construções (/nav/ e /sp/); existe ainda /teste/, que não
// decide nada. Escolher é redirecionar uma vez, na carga. Regra: hoje dentro da janela da viagem OU fuso europeu
// ⇒ Viagem; senão, Diário. A preferência 'mundo' (Ajustes › Aparelho) manda em tudo quando não é 'auto'.
// revisão 08/09 (tarefa 3, achado 1): mundoAuto não lê mais dado local da construção (ROUTES.days variava de um
// lado para o outro e só não fechava ciclo por acidente); a janela vem de etapas.JANELA_VIAGEM, constante nos dois lados.
// achado (revisão da U2): o teste de moldura (window.parent && window.parent !== window) se repetia igual em três
// pontos deste arquivo; agora só emMoldura() sabe fazer essa pergunta.
function emMoldura() { return !!(window.parent && window.parent !== window); }
function mundoAuto(agora, fuso) {
  if (etapas.dentroDaJanela(agora)) return 'nav';
  return /^Europe\//.test(String(fuso || '')) ? 'nav' : 'sp';
}
// revisão 08/09: o mundo daqui vem do caminho da URL, não de window.FREE (que dá 'nav' também para /teste/, expulsando
// essa construção para /sp/). Fora de /nav/ e /sp/ a função sai sem decidir nada.
function mundoDaqui() { const m = /\/(nav|sp)\/[^/]*$/.exec(location.pathname); return m ? m[1] : null; }
// item 3 (revisão final): ?mundo= atravessa uma vez e não pode virar estado permanente escondido na URL — senão
// qualquer recarga daquela página ignora, calada, a preferência que o ciclista acabou de escolher em Ajustes ›
// Mundo (que promete "vale na próxima abertura"). Chamado só quando decidirMundo() decide NÃO redirecionar
// (forcar === aqui: acabamos de pousar, ou já estávamos aqui) — nunca dispara sozinho, não recarrega, não laça.
function limparMundoDaUrl() {
  const q = new URLSearchParams(location.search);
  if (!q.has('mundo')) return;
  q.delete('mundo');
  const qs = q.toString();
  history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
}
// item 2 (revisão final): a porta do rodapé (largadaRender) monta o endereço do outro mundo preservando a busca
// atual — trocando ou acrescentando só o mundo=. A casca abre o app em .../index.html?nosw=1&debug=1; sem isso
// a porta apagava o nosw=1 e o app registrava o service worker dentro da WebView (um segundo cache que a casca
// nunca previu). Compare com destino(), acima, que já preserva busca e hash no redirecionamento automático.
function enderecoMundo(alvo) {
  const q = new URLSearchParams(location.search);
  q.set('mundo', alvo);
  return '../' + alvo + '/index.html?' + q.toString() + location.hash;
}
// devolve true quando redirecionou (para init() sair na hora: location.replace é assíncrono, e o resto de init()
// rodaria na página condenada — registrando o service worker errado, pedindo localização duas vezes).
function decidirMundo() {
  // achado 3 (tarefa 3): a guarda de moldura vem antes de tudo, inclusive antes do bloco que força por ?mundo=. Uma
  // URL de moldura com mundo= não pode navegar o iframe para fora da construção que o guia escolheu — isso cortaria
  // o postMessage({etape:'ready'}) e deixaria o guia esperando calado. Dentro do guia, quem escolhe o mundo é o guia.
  if (emMoldura()) return false;
  const aqui = mundoDaqui();
  if (!aqui) return false;                                                                 // /teste/ (ou qualquer outra) não decide nada
  const q = new URLSearchParams(location.search);
  const forcar = q.get('mundo');
  const destino = sufixo => '../' + sufixo + '/index.html' + location.search + location.hash;   // achado (revisão): a travessia também levava o search mas descartava o hash
  if (forcar === 'nav' || forcar === 'sp') {                                               // achado 7: ?mundo= força de verdade, não só desliga o automático
    if (forcar === aqui) { limparMundoDaUrl(); return false; }                             // item 3 (revisão final): já pousamos; o parâmetro não fica preso na URL
    location.replace(destino(forcar));                                                    // a busca (e o hash) seguem: a página de destino vê o mesmo ?mundo= e concorda, e para
    return true;
  }
  // achado 1 (tarefa 3): 'debug' saiu desta lista — a casca abre com ?debug=1 (MainActivity START), e se debug desviasse
  // o automático o aparelho nunca trocaria sozinho para a Viagem em 22/out, que é o propósito desta tarefa. Para fixar
  // um mundo em teste use ?mundo=nav ou ?mundo=sp, que já forçam e são explícitos.
  if (/[?&](sim|mode|preview|to|vias|nolargada)=/.test(location.search)) return false;   // entrada dirigida manda mais que a automática
  // achado (revisão da U2): a marca só precisa dizer "já redirecionei nesta sessão" — o valor não é lido em
  // lugar nenhum, então guardar aqui o mundo escolhido seria uma promessa falsa de que alguém o consome depois.
  if (store.getAba('mundo:redir', false)) return false;                                // cinto: um redirecionamento por sessão, nunca dois
  const escolhido = store.prefs().mundo;
  const fuso = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ''; } })();
  const quero = escolhido === 'auto' ? mundoAuto(new Date(), fuso) : escolhido;
  if (quero !== 'nav' && quero !== 'sp') return false;                                     // achado 5: preferência estragada não vira 404 permanente
  if (quero === aqui) return false;
  store.setAba('mundo:redir', true);
  location.replace(destino(quero));
  return true;
}

import * as basemap from './basemap.js';
let diario = null;   // tela 01 · destino e três rotas (diario.js), carregado no build de SP
let rider3d = null, diorama = null, router = null, t3d = null;   // t3d: vista 3ª pessoa em WebGL (terrain3d.js), carregada ao ligar o 3D   // router: recálculo offline (graph.json), carregado 4 s depois de abrir   // módulos WebGL (three.js) carregados sob demanda

const $ = id => document.getElementById(id);
const code = k => /^\d/.test(k) ? 'E' + k : k;
const diaStr = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');   // 'YYYY-MM-DD' local, sem fuso
// item 5 (decisão do Pedro, revisão final): na abertura, se hoje cai na janela da viagem, o app abre sozinho na
// etapa do dia — mas uma escolha manual pela folha (etapas.abrir) feita hoje vale até o fim do dia; só amanhã o
// automático volta a mandar. Guarda a escolha manual (chave + dia) por store.js (única porta de armazenamento).
// Vale só no mundo da viagem: no Diário (window.FREE) não há "etapa de hoje" — a etapa nasce do destino escolhido.
function stageAutoHoje() {
  if (window.FREE) return null;
  const dias = Object.fromEntries(Object.entries((S.routes && S.routes.days) || {}).map(([k, v]) => [k, (v && v.dia) || '']));
  const hoje = etapas.chaveDeHoje(dias, new Date());
  if (!hoje) return null;
  const manual = store.get('stageManual', null);
  if (manual && manual.dia === diaStr(new Date())) return null;   // escolha manual de hoje ainda vale
  return hoje;
}
function selectStageManual(k) {
  if (!window.FREE) store.set('stageManual', { k, dia: diaStr(new Date()) });   // regra vale só no mundo da viagem
  selectStage(k);
}
const S = { map: null, routes: null, stage: null, paradas: [], proj: { idx: 0, dist: 0, off: 0 }, fix: null, prev: null, off: false, offSince: 0, session: null, log: [], fuel: null, fuelPlan: null, live: null, eta: null, next: {}, follow: true, mode: 'full', tab: 'tele', theme: 'day', prefs: store.prefs(), scaleBottom: 380, mask: [], quiet: false, hist: [], planArrival: null };
let R, panelTimer = null;

export function init() {
  if (decidirMundo()) return;   // achado 8: location.replace é assíncrono; sem este retorno o resto de init() rodava na página condenada
  S.map = loadMap(); S.routes = loadRoutes(); S.allParadas = loadParadas();
  R = createRenderer($('map'), $('rider'));
  ajustes.init(S, {
    perguntar: (titulo, dica, valor) => ask(titulo, dica, 'Guardar', { input: true, value: valor }),
    // crítica 06/09: de qualquer lugar de volta à Largada, pelo menu (o Pedal não tinha saída antes disso)
    abrirLargada: () => { const L = $('largada'); if (!L) return; largadaRender(); L.hidden = false; document.body.classList.add('largada'); L.classList.add('ready'); S.quiet = true; measureMask(); R.invalidate(); },
    abrirRelatorio: () => showReport(report.list()[S.stage.key]),
    aplicarTela: () => applyScreen(),
    aplicarTema: () => applyTheme(),
    aplicarChao: v => { if (R && R.setChao) R.setChao(v); R.invalidate(); },
    chaoDisponivel: () => !!(R && R.setChao),   // a frente do mapa ainda não entregou setChao; quando entregar, a linha reabre sozinha
    procurarSensor: () => $('btnSens').click(),
    // Orientação só muda o giro no próximo passo do GPS (headingRot() é lido a cada quadro movido); forçamos aqui
    // para o toque no ajuste ter efeito imediato, mesmo parado.
    aplicarOrientacao: () => { if (S.pos) R.view.rot = headingRot(); R.invalidate(); },
    aplicarSat: v => { R.setSat(v); updateAttr(); if (t3d) t3d.setSat(v); $('btnSat').classList.toggle('on', v); },
    aplicarCam: v => setCam(v),
    simular: () => toggleSim(),
    zerarEtapa: () => resetStage(),
    // U7 (10/09): era `prompt()`, e a casca nao implementa onJsPrompt — dentro do aparelho a janela nunca abria e a
    // acao mais perigosa do app simplesmente nao fazia nada, calada. Agora usa o `ask` da casa, que e o mesmo de
    // todo pedido de PIN daqui.
    aparelhoNormal: async () => { const pin = await ask('Aparelho de volta ao normal', 'PIN · tira a trava E o dono do aparelho; só um reset de fábrica refaz o dono', 'Fazer', { input: true, value: '' }); if (pin == null) return; if (native.kioskReset(String(pin).trim())) voice.banner('Aparelho de volta ao normal', 3, 'sem trava e sem dono; barra e bloqueio voltam'); else voice.banner('PIN errado', 2); },
    // U7: os seis itens que a U1 apagou voltam pelo painel Aparelho; estes tres precisam do app.js.
    ondeEstou: () => { const f = S.fix; return f ? [f.lat, f.lon] : [0, 0]; },
    reiniciar: async () => { const pin = await ask('Reiniciar o aparelho', 'PIN · só funciona com o aparelho no modo dedicado', 'Reiniciar', { input: true, value: '' }); if (pin == null) return; if (!native.reboot(String(pin).trim())) voice.banner('Não reiniciou', 2, 'PIN errado, ou o aparelho não está no modo dedicado'); },
    travar: async on => { if (on) { native.kioskLock(); voice.banner('Aparelho travado', 3, 'só o Étape; PIN para sair'); return true; } const pin = await ask('Destravar o aparelho', 'PIN', 'Destravar', { input: true, value: '' }); if (pin == null) return null; if (native.kioskUnlock(String(pin).trim())) { voice.banner('Aparelho destravado', 3); return false; } voice.banner('PIN errado', 2); return null; },
    abrirPrimeira: () => entrada.abrirPrimeira(),
    abrirUpdate: () => entrada.abrirUpdate(),
  });
  entrada.init({ aoTerminar: () => { if ($('largada') && !$('largada').hidden) largadaRender(); if (diario && diario.retomarLocalizacao) diario.retomarLocalizacao(); },   // item 4 (revisão final): a Primeira vez terminou; se o Diário tinha um pedido de localização pendente, agora sim
                 emSaida: () => !!(S.session && S.session.state !== 'idle') });
  // chão pronto (MapLibre): atrás do parâmetro por ora — sem ele o app segue como hoje (revisão em aberto da Task 7).
  // regiao espelha a mesma regra do build (src/build/build_nav.py): variante sp ou teste -> sp; senão auvergne.
  // window.FREE só é 1 na variante sp; window.ETAPE_TZ é gravado também na teste, então cobre as duas.
  const regiaoChao = window.ETAPE_TZ ? 'sp' : 'auvergne';
  // Task 10: '?chao=gl' liga o chão vetorial, '?chao=canvas' força o desenho antigo; sem parâmetro vale a
  // preferência, que desde 09/09 é 'gl': o chão vetorial é o padrão, com o sim do Pedro. O '?chao=canvas'
  // continua existindo como saída, e é por ele que se compara com o desenho antigo sem desinstalar nada.
  // O chão leva alguns segundos para aparecer no arranque frio, enquanto os primeiros tiles chegam; a tela
  // fica escura nesse intervalo e isso NÃO é defeito — eu mesmo confundi as duas coisas medindo cedo demais.
  // A preferência chama-se chaoMotor, e NÃO prefs.chao: essa já existe desde a U1 e significa o ESTILO do chão
  // (Estúdio ou Carta, em Ajustes › Mapa › "Chão sem satélite"). Reusar o nome faria aquele botão trocar o motor
  // do mapa em silêncio, e o motor trocar o estilo. São duas coisas, e são dois nomes.
  const chaoQ = new URLSearchParams(location.search).get('chao');
  S.chaoGL = chaoQ ? chaoQ === 'gl' : S.prefs.chaoMotor === 'gl';
  if (S.chaoGL) {
    basemap.montar($('chao'), { regiao: regiaoChao, tema: S.theme === 'night' ? 'noite' : 'asfalto', dpr: Math.min(devicePixelRatio || 1, 2) })
      .then(() => { espelharChao(); R.invalidate(); })
      .catch(e => { S.chaoGL = false; if (window.__errs) window.__errs.push('chao: ' + (e && e.message)); console.error(e); R.invalidate(); });
  }
  cinema.init(S); cinemaUi.init(S);
  if (native.init()) { S.native = true; sidecar.init(S); music.init(S); auto.init(S); passeio.init(S); if (/[?&]debug=1/.test(location.search)) console.log('casca nativa: ' + window.EtapeNative.info());
    // a casca por fora (estudo aprovado 07/09) · gramática das teclas: volume cima GUARDA (clique marca o lugar, segurar pula a
    // música; no Cinema, REC Estrada e Nitidez ↔ Aberto); volume baixo RESPONDE ao que a Fita pede (aviso vermelho → dispensa;
    // Bebi/Comi vencido → confirma; folha aberta → fecha; fora do traçado → "sei o caminho"; nada pendente → repete a voz;
    // segurar = tocar/pausar; no Cinema, REC Rosto e placar); lateral ×2 troca de mundo (cinema.onKey). Todo aperto tem som.
    native.onKey(k => {
      if (S.cinema && k === 'up_hold') { cinema.setMode(S.prefs.cineMode === 'nitidez' ? 'aberto' : 'nitidez'); voice.say(S.prefs.cineMode, 3); return; }
      if (S.cinema && k === 'down_hold') { cinemaUi.toggleBare(); return; }
      if (cinema.onKey(k)) return;
      if (k === 'up') { markPlace(); return; }
      if (k === 'up_hold') { if (music.available()) { music.next(); voice.say('próxima', 3); } else native.beep('no'); return; }
      if (k === 'down_hold') { if (music.available()) { const was = music.playing(); music.toggle(); voice.say(was ? 'pausa' : 'toca', 3); } else native.beep('no'); return; }
      if (k === 'down') respond();
    });
    $('btnPhoto').hidden = false;
    $('btnPhoto').onclick = () => { $('dlgMenu').close(); takePhoto(); };
    applyScreen();
    // Cinema no menu Mais (com a casca, dona ou não): Filmes prontos. REC automático e Look moraram aqui e mudaram
    // de casa para o painel Cinema dos Ajustes (Tarefas 5 e 10); a aplicação de fato do look salvo continua aqui.
    if (S.native) {
      native.nightLook(S.prefs.cineLook == null ? 1 : S.prefs.cineLook);
      $('btnPronto').hidden = false; $('btnPronto').onclick = () => { $('dlgMenu').close(); const n = native.driveDelivered(); if (native.driveFetch()) voice.banner('Filmes prontos: ' + n, 3, 'conferindo o Drive; abrindo a galeria'); else voice.banner('Nada novo do Drive', 3, 'sem conta ligada, ou a conferência já está rodando; abrindo a galeria'); native.openFolder('', 'pronto'); };
      document.addEventListener('etape:drive', e => { const d = e.detail || {}; if (d.phase === 'delivered') voice.banner(d.detail || 'Filmes prontos', 3, 'Movies/Etape · pronto'); });
    }
    // N2b · modo dedicado (só com Device Owner): toque longo de 5 s no relógio trava ou libera com PIN. O menu Ajustes
    // → Travar o aparelho (painel Aparelho) ainda não chama isto: é só leitura até o U7 trazer a ponte de volta.
    if (native.kioskOwner()) { const ask = () => { const locked = native.kioskLocked(); const pin = prompt(locked ? 'PIN para liberar o aparelho' : 'PIN para travar o aparelho'); if (pin == null) return;
        if (locked) { if (native.kioskUnlock(pin)) voice.banner('Aparelho liberado', 3, 'barra e bloqueio de volta'); else voice.banner('PIN errado', 2); }
        else { if (native.kioskCheck(pin)) { native.kioskLock(); voice.banner('Aparelho travado', 3, 'segure o relógio por 5 s, ou o volume baixo por 10 s, para liberar'); } else voice.banner('PIN errado' + (native.kioskWait() > 0 ? ' · espere ' + Math.ceil(native.kioskWait() / 1000) + ' s' : ''), 2); } };
      let hold = 0; const clk = $('clock').parentElement; clk.addEventListener('contextmenu', e => e.preventDefault());
      clk.addEventListener('pointerdown', () => { clearTimeout(hold); hold = setTimeout(ask, 5000); });
      ['pointerup', 'pointercancel'].forEach(ev => clk.addEventListener(ev, () => clearTimeout(hold))); } }
  if (document.fonts) Promise.all([document.fonts.load('700 16px "Sofia Sans Semi Condensed"'), document.fonts.load('600 13px "Sofia Sans"')]).then(() => { R.setTheme(S.theme); R.invalidate(); }).catch(() => { });   // rótulos do mapa na fonte do sistema
  // ciclista 3D em WebGL na camada própria; sem WebGL, fica o desenho 2D
  if (/[?&]debug=1/.test(location.search)) { window.__etape = { R, S, gps, track, guide, onFix, t3d: () => t3d, setParado, preOuting, showArrival, finishStage, diario: () => diario, native, cinema, sidecar, music, mundoAuto }; window.__errs = []; window.addEventListener('error', e => window.__errs.push(String(e.message))); window.addEventListener('unhandledrejection', e => window.__errs.push('promise: ' + String(e.reason))); }
  // avatar 3D (models/avatar.glb com rig procedural) ligado por padrão; ?r3d=0 desliga (bike 2D), ?r3d=1 força o procedural de tubos
  const r3dq = (location.search.match(/[?&]r3d=(\d)/) || [])[1];
  if (r3dq !== '0') import('./rider3d.js').then(async m => {   // avatar 3D ligado por padrão (pedido do Pedro em 06/09, no tamanho do ícone 2D); ?r3d=0 desliga, ?r3d=1 procedural
    if (!m.init($('rider3d'))) return;
    const okModel = r3dq === '1' ? false : await m.loadModel('./models/avatar.glb');
    if (okModel || r3dq === '1') { rider3d = m; R.setRiderExternal(true); size3d(); R.invalidate(); }
  });
  etapas.init(S, {
    lista: () => {
      const dias = Object.fromEntries(Object.entries(S.routes.days || {}).map(([k, v]) => [k, (v && v.dia) || '']));   // achado 9: valor nulo em days não pode estourar
      const hoje = etapas.chaveDeHoje(dias, new Date());
      return Object.keys(S.routes.stages).map(k => {
        const st = track.loadStage(S.routes, k), d = (S.routes.days || {})[k] || {};
        return { k, code: code(k), nome: st.name.replace(/^E\S+ /, ''), dia: d.dia || '', tipo: d.tipo ? 'etapa ' + d.tipo : '',
                 maillot: (S.routes.types || {})[k] || 'blanc', km: st.km, up: st.up, hoje: k === hoje };
      });
    },
    selecionar: k => selectStageManual(k),   // item 5: escolha manual pela folha vale até o fim do dia (store 'stageManual')
    verViagem: () => showPreview('trip')
  });
  $('stageBtn').onclick = () => etapas.abrir();
  // Movimentação livre (decisão do Pedro em 08/09, no lugar de "norte fixo ao arrastar" de 05/09):
  // o mapa se comporta como o de um app de navegação comum. Encostar solta a câmera e ela FICA onde
  // o dedo deixou — mesmo centro, mesmo zoom, MESMO RUMO. Nada de saltar para o norte: o salto era
  // um tranco de até 46 graus no primeiro toque, e era o que fazia o arrasto parecer quebrado.
  // Voltar a seguir é só pelo botão de recentralizar, que anima de volta.
  const soltarCamera = () => { if (!S.follow) return; S.follow = false; $('btnFollow').classList.remove('on'); $('btnFollow').classList.add('pulse'); };
  ui.bindGestures($('map'), R,
    () => { S.showCtl(0); soltarCamera(); },
    () => { S.userZoomAt = Date.now(); soltarCamera(); },
    () => { S.rotLock = true; soltarCamera(); });   // girar também solta: senão o rumo para cima desfazia a torção no quadro seguinte
  // zoom manual desliga o zoom automático por 45 s
  const zoomBtn = dz => { S.userZoomAt = Date.now(); const { W, H } = R.size(); ui.zoomAnim(R, R.view.z + dz, W / 2, H * R.view.anchorY); };
  $('zin').onclick = () => zoomBtn(0.7); $('zout').onclick = () => zoomBtn(-0.7);
  $('map').addEventListener('wheel', () => { S.userZoomAt = Date.now(); }); $('map').addEventListener('pointerdown', e => { if (e.isPrimary === false) S.userZoomAt = Date.now(); });
  $('btnFollow').onclick = () => { if (t3d && S.cam3d) t3d.recenter(); S.follow = true; S.rotLock = false; S.hideCtl(); $('btnFollow').classList.add('on'); $('btnFollow').classList.remove('pulse'); S.userZoomAt = 0; const p = S.pos || S.fix; if (p) { const head = S.pos ? S.pos.head : ((S.fix.head || 0) * Math.PI / 180); const rot = (R.view.mode !== '2d' || S.prefs.orientation === 'heading') ? -head : 0; // zoom de volta: o da navegação para a velocidade atual, não 19. Cair no 19 (o teto) a cada
    // recentralizar dava um salto de zoom que ninguém pediu; zoomFor é onde o seguir ia parar sozinho.
    const zVolta = R.view.mode === '2d' ? Math.min(R.maxZ(), S.zoomTarget || zoomFor(S.fix ? (S.fix.v || 0) : 0)) : R.view.z;
    R.animateTo({ cx: mercX(p.lon), cy: mercY(p.lat), z: zVolta, rot }, 500); } };
  $('btnVoice').onclick = () => { const on = voice.isMuted(); if (on) voice.unmute(); else voice.mute(); S.prefs.voice = on; store.setPrefs(S.prefs); $('btnVoice').classList.toggle('on', on); $('btnVoice').setAttribute('aria-pressed', on ? 'true' : 'false'); $('btnVoice').setAttribute('aria-label', on ? 'Voz ligada' : 'Voz desligada'); if (on) voice.say('Voz ligada.', 2); };
  // controles escondidos por padrão: um toque no mapa mostra por 8 s; arrastar mostra até recentralizar
  const ctl = $('ctl'); ctl.classList.add('hide'); let ctlTimer = 0;
  const showCtl = (ms) => { ctl.classList.remove('hide'); clearTimeout(ctlTimer); if (ms) ctlTimer = setTimeout(() => { if (S.follow) ctl.classList.add('hide'); }, ms); };
  const hideCtl = () => { clearTimeout(ctlTimer); ctlTimer = setTimeout(() => { if (S.follow) ctl.classList.add('hide'); }, 1500); };
  S.showCtl = showCtl; S.hideCtl = hideCtl;
  let tapAt = null; $('map').addEventListener('pointerdown', e => { tapAt = [e.clientX, e.clientY, Date.now()]; }); $('map').addEventListener('pointerup', e => { if (tapAt && Math.hypot(e.clientX - tapAt[0], e.clientY - tapAt[1]) < 12 && Date.now() - tapAt[2] < 400) { if (ctl.classList.contains('hide')) showCtl(8000); else if (S.follow) ctl.classList.add('hide'); } tapAt = null; });
  ctl.addEventListener('pointerdown', () => showCtl(8000));
  $('btnCam').onclick = () => setCam(S.prefs.cam === 'tp' ? '2d' : 'tp');
  $('btnSos').onclick = showSos; $('btnMark').onclick = () => markPlace(); $('sosMark').onclick = () => { markPlace(); $('dlgSos').close(); };
  $('btnSens').onclick = async () => { if (sensors.connected()) { sensors.disconnect(); $('btnSens').classList.remove('on'); S.sensors = null; refresh(); return; } if (!sensors.supported()) { voice.banner('Bluetooth indisponível neste navegador', 2); return; } try { const nm = await sensors.connect(); $('btnSens').classList.add('on'); voice.banner('Sensor ligado', 3, nm || ''); } catch (e) { voice.banner('Sensor não conectou', 2, (e && e.message || '').slice(0, 60)); } };
  sensors.onData(d => { S.sensors = d; refresh(); });
  { let lp = 0, fired = false; const sb = $('btnSession');
    sb.addEventListener('pointerdown', () => { if (S.session.state === 'idle') return; fired = false; lp = setTimeout(() => { lp = 0; fired = true; askFinish(); }, 1000); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => sb.addEventListener(ev, () => { if (lp) { clearTimeout(lp); lp = 0; } }));
    sb.onclick = () => { if (fired) { fired = false; return; } toggleSession(); }; }   // crítica 06/09: encerrar é segurar Pausar
  if (/[?&]debug=/.test(location.search)) document.body.classList.add('dev');
  setTimeout(() => { import('./router.js').then(async m => { if (await m.load('graph.json')) router = m; }).catch(() => { }); }, 4000);
  // a casca por fora (07/09): a engrenagem nos controles do mapa é a porta única de Ajustes (o rodapé do Pedal não é exibido)
  $('btnCfg').onclick = () => ajustes.abrir();
  $('btnMenu').onclick = () => ajustes.abrir();
  $('btnBrief').onclick = showBriefing;
  // computador de bordo (F2): três botões fixos no rodapé abrem a folha de cada aba; o mesmo botão fecha
  document.querySelectorAll('.cb button[data-tab]').forEach(b => b.onclick = () => { const t = b.dataset.tab; if (S.mode === 'full' && S.tab === t) setMode('resumo'); else { ui.setTab(S, t); S.prefs.tab = t; store.setPrefs(S.prefs); setMode('full'); } });
  { const bm = $('btnMode'); if (bm) bm.onclick = () => setMode(S.mode === 'full' ? 'resumo' : 'full'); }
  // fita do dia: toque abre o perfil; arrastar para cima entra no modo mapa. A alça do modo mapa (ou arrastar o rodapé para cima) volta
  let fy = null, fx = null;
  $('fita').addEventListener('pointerdown', e => { if (e.target.closest('button,select')) { fy = null; return; } fy = e.clientY; fx = e.clientX; });
  $('fita').addEventListener('pointerup', e => { if (fy == null) return; const dy = e.clientY - fy, dx = e.clientX - fx; fy = null; if (dy < -40 && Math.abs(dx) < 80) setMapMode(true); else if (Math.hypot(dx, dy) < 12) { if (S.mode === 'full' && S.tab === 'prof') setMode('resumo'); else { ui.setTab(S, 'prof'); setMode('full'); } } });
  let hy = null; $('topHandle').addEventListener('pointerdown', e => { hy = e.clientY; }); $('topHandle').addEventListener('pointerup', e => { if (hy == null) return; hy = null; setMapMode(false); });
  // câmera: 2D → 3ª pessoa → 1ª pessoa; satélite liga/desliga (e baixa a etapa para offline na primeira vez)
  $('btnSat').onclick = async () => {
    if (!sat.available()) { voice.banner('Satélite indisponível nesta versão', 3); return; }
    const on = !S.prefs.sat; S.prefs.sat = on; store.setPrefs(S.prefs); R.setSat(on); updateAttr(); if (t3d) t3d.setSat(on); $('btnSat').classList.toggle('on', on);
    if (on && sat.hasStage(S.stage.key) && !store.get('satdl:' + S.stage.key, false) && navigator.onLine) {
      voice.banner('Baixando satélite da etapa', 3);
      await sat.prefetch(S.stage.key, (d, t) => { S.gpsMsg = 'satélite ' + Math.round(d / t * 100) + ' %'; refresh(); });
      store.set('satdl:' + S.stage.key, true); S.gpsMsg = 'satélite da etapa guardado'; refresh(); R.invalidate();
    }
  };
  dem.loadIndex('dem/index.json').then(ix => { if (ix) R.invalidate(); });
  shade.loadIndex('shade/index.json').then(ix => { if (ix) R.invalidate(); });   // sombra do relevo (estudo do mapa, F1)
  loadContours(S.map, 'contours.json').then(ix => { if (ix) R.invalidate(); });   // curvas de nível (só na Auvergne)
  sat.loadIndex('sat/index.json').then(ix => { if (ix && ix.attribution) { S.satAttr = ix.attribution; updateAttr(); } return ix; }).then(ix => { if (ix) { R.setSat(!!S.prefs.sat); $('btnSat').classList.toggle('on', !!S.prefs.sat); $('btnSat').hidden = false; } else $('btnSat').hidden = true; setCam(S.prefs.cam || '2d'); });
  // gestos no painel: vertical alterna completo/resumo; horizontal troca a aba (também no resumo)
  const TABS = ['tele', 'fuel', 'prof']; let gy = null, gx = null;
  $('panel').addEventListener('pointerdown', e => { if (e.target.closest('button,select,.tabs')) return; gy = e.clientY; gx = e.clientX; });
  $('panel').addEventListener('pointerup', e => {
    if (gy == null) return; const dy = e.clientY - gy, dx = e.clientX - gx; gy = gx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { const i = TABS.indexOf(S.tab); const t = TABS[(i + (dx < 0 ? 1 : TABS.length - 1)) % TABS.length]; ui.setTab(S, t); S.prefs.tab = t; store.setPrefs(S.prefs); refresh(); return; }
    if (dy > 40) { if (S.mode === 'full') setMode('resumo'); else setMapMode(true); }   // folha aberta fecha; rodapé só → modo mapa
    else if (dy < -40) { if (S.mapMode) setMapMode(false); else setMode('full'); }
  });
  $('fDrink').onclick = () => confirmFuel('drink'); $('fEat').onclick = () => confirmFuel('eat'); $('fSnooze').onclick = () => { fuel.snooze(S.fuel, 'drink'); fuel.snooze(S.fuel, 'eat'); refresh(); };
  { const md = $('mDrink'), me = $('mEat'); if (md) md.onclick = () => confirmFuel('drink'); if (me) me.onclick = () => confirmFuel('eat'); }
  $('cue').onclick = () => { voice.clearBanner(); };
  $('btnKnow').onclick = () => { S.muteRoute = Date.now() + 600000; voice.clearBanner(); S.reroute = null; $('btnKnow').hidden = true; R.invalidate(); voice.banner('Avisos de rota calados por 10 min', 3, 'volta a avisar ao reencontrar o traçado'); refresh(); };   // tela 05
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
  if (!S.prefs.voice) { voice.mute(); $('btnVoice').classList.remove('on'); $('btnVoice').setAttribute('aria-pressed', 'false'); $('btnVoice').setAttribute('aria-label', 'Voz desligada'); } else $('btnVoice').classList.add('on');
  window.addEventListener('resize', () => { R.resize(); measurePanel(); if (t3d && S.cam3d) t3d.resize($('gl').clientWidth, $('gl').clientHeight, window.devicePixelRatio || 1, R.view.hv); });
  { // gestos no 3D: arrastar orbita em volta do ciclista (volta sozinho ao rumo), pinça muda a distância, toque mostra os controles
    const gl = $('gl'), ptrs = new Map(); let t0 = 0, p0 = null, pinch = 0;
    gl.addEventListener('pointerdown', e => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); try { gl.setPointerCapture(e.pointerId); } catch (err) { } if (ptrs.size === 1) { t0 = performance.now(); p0 = [e.clientX, e.clientY]; } if (ptrs.size === 2) { const a = [...ptrs.values()]; pinch = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); } });
    gl.addEventListener('pointermove', e => { if (!ptrs.has(e.pointerId) || !t3d) return; const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 1) t3d.orbit(-(e.clientX - prev[0]) * 0.006, (e.clientY - prev[1]) * 0.004);
      else if (ptrs.size === 2 && pinch) { const a = [...ptrs.values()], d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); if (d > 0) t3d.zoomBy(d / pinch); pinch = d; } });
    const up = e => { const was = ptrs.size; ptrs.delete(e.pointerId); if (was === 1 && p0 && performance.now() - t0 < 300 && Math.hypot(e.clientX - p0[0], e.clientY - p0[1]) < 12) S.showCtl(0); if (!ptrs.size) { p0 = null; pinch = 0; if (t3d) t3d.release(); } };
    gl.addEventListener('pointerup', up); gl.addEventListener('pointercancel', up);
    gl.addEventListener('wheel', e => { e.preventDefault(); if (t3d) { t3d.zoomBy(e.deltaY < 0 ? 1.1 : 0.9); t3d.release(); } }, { passive: false });
  }
  R.resize();
  window.addEventListener('resize', size3d);
  selectStage(stageAutoHoje() || store.get('stage', '1'));   // item 5: hoje na janela da viagem abre sozinho na etapa do dia, salvo escolha manual de hoje
  if (window.FREE) { document.body.classList.add('free'); S.free = true; free.init(S); S.freeStage = S.stage; S.prefs.cam = '2d'; S.prefs.sat = false; if ($('btnCam')) $('btnCam').hidden = true; $('stageName').textContent = 'Navegação livre'; $('stageSub').textContent = 'São Paulo · sem traçado'; $('stageBtn').disabled = true; $('stageBtn').setAttribute('aria-label', 'Sem etapas para escolher no Diário'); R.centerOn(S.stage.pts[0][0], S.stage.pts[0][1]); R.setView(null, null, 16, 0);
    // Diário: o grafo de rotas carrega já; a folha Destino abre sozinha quando não há saída em andamento
    $('btnDest').hidden = false; $('btnDest').onclick = () => { $('dlgMenu').close(); if (diario) diario.open(); };
    import('./router.js').then(async m => { if (await m.load('graph.json')) router = m; }).catch(() => { });
    const q0 = new URLSearchParams(location.search);
    import('./diario.js').then(m => { diario = m; m.init(diarioCtx()); if (S.session.state === 'idle' && !q0.get('vias') && !q0.get('to')) m.open(); }).catch(e => console.error(e)); }
  ui.setTab(S, S.prefs.tab || 'tele'); setMode('resumo');
  largadaInit();   /* crítica 06/09: abre sempre na fita do stem, a folha é sob demanda */   // F2: em repouso, sem folha aberta
  requestAnimationFrame(loop);
  // dentro do app Étape (quadro): a etapa vem por mensagem e o service worker é o da raiz
  $('dlgPreview').addEventListener('close', () => { if (diorama) diorama.dispose(); });
  if (window !== window.parent) { try { parent.postMessage({ etape: 'ready' }, '*'); } catch (e) { } }   // avisa o guia que já aceita selectStage
  window.addEventListener('message', e => { const m = e.data || {}; if (m.etape === 'selectStage' && m.key && S.routes.stages[m.key]) { if (m.key !== S.stage.key) selectStage(m.key); if (m.preview) setTimeout(() => showPreview(m.key), 150); } /* preview: o guia pede a prévia offline da etapa */ if (m.etape === 'resize') { R.resize(); measurePanel(); size3d(); } });
  const inFrame = emMoldura();
  if (inFrame) { const g = $('btnGuide'); g.hidden = false; g.onclick = () => { $('dlgMenu').close(); try { parent.postMessage({ etape: 'showGuide', view: 'hoje' }, '*'); } catch (e) { } }; }   // volta ao guia por um alvo só (crítica 06/09)
  if (!inFrame && 'serviceWorker' in navigator && location.protocol.startsWith('http') && !new URLSearchParams(location.search).get('nosw')) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
    navigator.serviceWorker.ready.then(r => { if (navigator.onLine && r.active) {
      r.active.postMessage({ type: 'fillSat', base: './' });
      if (S.chaoGL) r.active.postMessage({ type: 'fillChao', base: './', regiao: regiaoChao });
    } }).catch(() => { });
    navigator.serviceWorker.addEventListener('message', e => { const m = e.data || {}; if (m.type === 'satProgress') { S.gpsMsg = m.done >= m.total ? 'satélite completo' : 'satélite ' + Math.round(m.done / m.total * 100) + ' %'; refresh(); } if (m.type === 'chaoProgress' && !m.final) { S.gpsMsg = 'chão ' + (m.total ? Math.round(m.done / m.total * 100) + ' %' : '…'); refresh(); } });
    // versão nova instalada: recarrega quando não há etapa rodando
    let had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && S.session && S.session.state !== 'running') location.reload(); had = true; });
  }
  const q = new URLSearchParams(location.search);
  if (q.get('stage')) selectStage(q.get('stage'));
  if (q.get('mode')) setMode(q.get('mode'));
  if (q.get('theme')) { S.prefs.theme = q.get('theme'); applyTheme(); }
  if (q.get('cam') === 'tp') S.prefs.cam = 'tp'; else if (!S.prefs.cam || S.prefs.cam === 'fp') S.prefs.cam = '2d';   // 2D por padrão; 3ª pessoa opcional; 1ª pessoa removida
  if (q.get('sat')) S.prefs.sat = q.get('sat') === '1';
  if (q.get('z')) { S.userZoomAt = Date.now() + 1e9; setTimeout(() => R.setView(null, null, +q.get('z')), 600); }   // zoom fixo para testes e gravações
  if (q.get('tab')) { ui.setTab(S, q.get('tab')); }
  if (S.free && q.get('vias')) setTimeout(() => { if (S.session.state === 'idle') session.start(S.session, Date.now()); S.follow = true; R.setView(null, null, 18.5); S.gpsMsg = ''; devTag('sim'); free.simulate(q.get('vias').split(','), +q.get('sim') || 22, onFix); }, 800);
  else if (S.free && q.get('to')) { (function tryTo(n) { if (!diario || !diario.ready()) { if (n < 100) setTimeout(() => tryTo(n + 1), 300); return; }
      const at = q.get('at'), pl = at && (window.PLACES || []).find(p => p.name.toLowerCase() === at.toLowerCase()); if (pl) S.pos = { lat: pl.lat, lon: pl.lon, head: 0, dist: 0 };   // ?at=Casa: partida sem GPS (teste)
      diario.open(); if (!diario.chooseByName(q.get('to'))) return;
      if (q.get('sim')) setTimeout(() => { if (S.diario) { S.pos = null; setMode('resumo'); S.follow = true; R.view.anchorY = 0.6; S.userZoomAt = 0; startSim(+q.get('sim') || 18, +(q.get('from') || 0) * 1000); } }, 1200); })(0); }
  else if (q.get('sim')) setTimeout(() => startSim(+q.get('sim') || 22, +(q.get('from') || 0) * 1000), 500);
  if (q.get('preview')) setTimeout(() => showPreview(q.get('preview')), 300);
  // ícones carregam de forma assíncrona: redesenha a prévia quando ficarem prontos
  document.addEventListener('etape:icons', () => { if (PV && $('dlgPreview').open) { PV.R2.invalidate(); PV.R2.draw(PV.S2); } });
}

// U6 Fase 3: o registro vem do IndexedDB, que e assincrono. Enche o MESMO array em vez de trocar a referencia —
// o record() ja tem esse array na mao e continua empurrando amostras nele. So enche se estiver vazio, para nao
// atropelar o que acabou de ser gravado.
function hidrataRegistro(key) {
  if (!logdb.available()) return;
  logdb.load(key).then(arr => {
    if (!arr || !arr.length) return;
    if (S.log && S.log.length) return;
    if (S.stage && S.stage.key !== key) return;   // trocou de etapa enquanto carregava
    S.log.push.apply(S.log, arr);
    refresh();
  }).catch(() => { });
}

export function selectStage(key) {
  if (!S.routes.stages[key]) key = Object.keys(S.routes.stages)[0];
  if (gps.running()) stopNavigation();
  S.stage = track.loadStage(S.routes, key); track.nameTurns(S.stage.turns, S.stage, S.map.index);
  store.set('stage', key);
  { const full = S.stage.name.replace(/^E\S+ /, ''), dest = full.split('→').pop().trim(), kmUp = String(S.stage.km).replace('.', ',') + ' km · ' + Math.round(S.stage.up).toLocaleString('pt-BR') + ' m';   // regra 02: cabeçalho só com o destino; origem e data na folha Perfil
    $('stageName').textContent = dest; $('stageSub').textContent = kmUp; if ($('profName')) { $('profName').textContent = full; $('profSub').textContent = (String(S.allParadas.dias[key] || '').trim() + ' · ' + kmUp).replace(/^· /, ''); } }
  $('stageKey').textContent = code(key); $('stageBtn').textContent = code(key); $('stageCode').className = 'code m-' + S.stage.type;
  S.paradas = S.allParadas.itens.filter(p => p.stage === key).map(p => ({ ...p }));
  S.planArrival = (S.routes.plan || {})[key] || null;
  const prog = store.progress(key); for (const c of S.stage.cps) c.done = prog.done.includes(c.id); for (const p of S.paradas) { p.done = prog.sights.includes(p.id); }
  { const simKey = store.get('sim:on', null); if (simKey) { store.clearStage(simKey); store.del('sim:on'); } }   // crítica 06/09: sessão e progresso de simulação não sobrevivem
  S.session = session.restore(key) || session.create(key);
  S.log = store.log(key); hidrataRegistro(key); S.fuel = fuel.create(key); S.fuelPlan = fuel.plan(S.stage); if ($('largada')) largadaRender();
  S.proj = { idx: 0, dist: 0, off: 0 }; S.fix = null; S.prev = null; S.pos = null; S.viewTarget = null; S.zoomTarget = null; S.globalAt = 0; S.offSince = 0; S.hotelCued = false; S.services = null; S.toiletCueAt = 0; S.off = false; S.climbId = null; S.surface = ''; S.flamme = false; S.hist = [];
  if (S.log.length) { const l = S.log[S.log.length - 1]; S.proj = track.project(S.stage, l.lat, l.lon, track.idxAtDist(S.stage, l.dist)); }
  // tela inicial: a bike na porta do hotel (ou onde parou), no zoom de rua, com o rumo da largada
  S.eta = null; S.etaAt = 0; S.vsPlan = null; S.planSpeed = null; S.live = null; S.fuelStatus = null; S.light = null;
  const p0 = track.pointAt(S.stage, S.proj.dist), b0 = track.bearingAt(S.stage, S.proj.dist);
  R.centerOn(p0[0], p0[1]); R.setView(null, null, R.view.mode === '2d' ? 18.5 : 16, S.prefs.orientation === 'heading' ? -b0 * Math.PI / 180 : 0); if (R.view.mode === '2d') R.view.anchorY = 0.45; S.follow = true; $('btnFollow').classList.add('on');
  S.next = guide.nextCue(S); S.live = telemetry.live(S.log, S.stage, S.session, Date.now(), session.movingTime(S.session, Date.now()));
  if (!S.log.length) S.live = { ...S.live, v: 0, avg: 0, vam: 0, grade: track.gradeAt(S.stage, 0, 200) };
  applyTheme(); refresh(); measurePanel(); if (t3d) t3d.setStage(S.stage);
  if (S.session.state === 'running') startNavigation(true);
}
// etapa sintética (rota do Diário ou o percurso livre): o mesmo reset de selectStage, sem entrada em routes.stages
function activateStage(st, isFree) {
  if (gps.running() && S.session.state === 'idle') stopNavigation();
  S.stage = st;
  if (!isFree) { track.nameTurns(st.turns, st, S.map.index); S.free = false; S.diario = true; document.body.classList.add('diario'); }
  const key = st.key || 'SP';
  $('stageKey').textContent = key; $('stageCode').className = 'code m-' + (st.type || 'blanc');
  if (!isFree) { const kmUp = String(st.km).replace('.', ',') + ' km · ' + Math.round(st.up) + ' m'; const rl = $('rem').nextElementSibling; if (rl) rl.textContent = 'km restam'; const el = $('eta').nextElementSibling; if (el && el.firstChild) el.firstChild.textContent = 'chegada · '; $('stageName').textContent = st.dest || st.name; $('stageSub').textContent = kmUp; if ($('profName')) { $('profName').textContent = st.name; $('profSub').textContent = 'Diário · ' + kmUp; } }
  S.paradas = []; S.planArrival = null;
  { const simKey = store.get('sim:on', null); if (simKey) { store.clearStage(simKey); store.del('sim:on'); } }   // crítica 06/09: sessão e progresso de simulação não sobrevivem
  S.session = session.restore(key) || session.create(key);
  S.log = store.log(key); hidrataRegistro(key); S.fuel = fuel.create(key); S.fuelPlan = fuel.plan(st);
  S.proj = { idx: 0, dist: 0, off: 0 }; S.prev = null; S.pos = null; S.viewTarget = null; S.zoomTarget = null; S.globalAt = 0; S.offSince = 0; S.hotelCued = false; S.services = null; S.toiletCueAt = 0; S.off = false; S.reroute = null; S.muteRoute = 0; S.climbId = null; S.surface = ''; S.flamme = false; S.hist = []; S.parado = false; S.stillAt = null;
  S.eta = null; S.etaAt = 0; S.vsPlan = null; S.planSpeed = null; S.fuelStatus = null; S.ecart = null;
  S.next = guide.nextCue(S); S.live = { ...telemetry.live(S.log, S.stage, S.session, Date.now(), 0), v: 0, avg: 0, vam: 0, grade: 0 };
  refresh(); measurePanel(); R.invalidate(); if (t3d) t3d.setStage(S.stage);
}
function diarioCtx() {
  return { S, $, refresh, setMode, ask, setTab: t => ui.setTab(S, t), pos: () => S.fix || S.pos || null, activate: st => activateStage(st),
    precisaPrimeira: () => entrada.precisaPrimeira(),   // item 4 (revisão final): diario.js não alcança entrada.js; o teste chega pelo contexto
    restoreFree: () => { if (!S.freeStage) return; S.free = true; S.diario = false; S.alts = null; S.destEta = null; activateStage(S.freeStage, true); free.reset(S.freeStage.pts[0]); $('stageName').textContent = 'Navegação livre'; $('stageSub').textContent = 'São Paulo · sem traçado'; },
    fitTo };
}
// enquadra um traçado inteiro na parte visível do mapa (acima da folha, abaixo da fita)
function fitTo(pts) {
  const bb = pts.reduce((a, p) => [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])], [90, 180, -90, -180]);
  const { W, H } = R.size(), hv = Math.max(220, $('map').clientHeight - $('panel').offsetHeight), top = 104;
  const dx = mercX(bb[3]) - mercX(bb[1]), dy = mercY(bb[0]) - mercY(bb[2]);
  const z = Math.log2(Math.min((W - 70) / Math.max(dx, 1e-9), (hv - top - 60) / Math.max(dy, 1e-9)) / 256);
  S.follow = false; $('btnFollow').classList.remove('on'); S.userZoomAt = Date.now() + 1e9; S.zoomTarget = null;
  R.view.anchorY = Math.max(0.2, Math.min(0.6, (top + hv) / 2 / H));
  R.setView((mercX(bb[1]) + mercX(bb[3])) / 2, (mercY(bb[0]) + mercY(bb[2])) / 2, Math.max(11, Math.min(17.5, z)), 0); R.invalidate();
}
// N3b · política da tela: 'sempre' (padrão) ou 'economia' (apaga pelo tempo do aparelho e acende nos avisos de nível 1 e 2)
function applyScreen() { const eco = S.prefs.screen === 'economia'; native.keepOn(!eco); const b = $('btnScreen'); if (b) { b.querySelector('b').textContent = eco ? 'Tela: apaga sozinha' : 'Tela: sempre ligada'; b.querySelector('span').textContent = eco ? 'acende nos avisos; toque para deixar sempre ligada' : 'toque para deixar apagar e acender só nos avisos'; } }
// N3b · foto pela câmera do sistema, gravada com a posição (vai para o relatório e para a galeria em Pictures/Etape)
function takePhoto() {
  const p = S.pos || S.fix; const name = 'etape-' + (S.stage.key || 'SP') + '-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  if (!native.photo(name, file => { if (!file) { voice.banner('Foto cancelada', 3); return; } session.mark(S.session, 'foto', { lat: p ? p.lat : null, lon: p ? p.lon : null, dist: S.proj.dist, file }); voice.banner('Foto guardada', 3, 'km ' + (S.proj.dist / 1000).toFixed(1).replace('.', ',') + ' · Pictures/Etape'); R.invalidate(); })) voice.banner('Câmera indisponível', 2, 'a foto com posição só existe no app do celular');
}
function devTag(txt) { const t = $('devTag'); if (!t) return; t.textContent = txt; t.hidden = !txt; }   // regra 04: estado de simulação é uma placa cinza na fita, só quando ativo
function updateAttr() { const e = $('attr'), sat = S.prefs.sat && S.satAttr; e.textContent = '© OpenStreetMap' + (sat ? ' · ' + S.satAttr.replace(/^©\s*/, '').split(',')[0] : ''); e.title = '© OpenStreetMap contributors' + (sat ? ' · ' + S.satAttr : ''); }   // regra 05: uma linha curta; o texto completo fica no title
function measurePanel() { const rd = $('panel').querySelector('.rodape'); S.scaleBottom = (rd ? rd.offsetHeight : $('panel').offsetHeight) + 8; $('attr').style.bottom = (S.scaleBottom - 2) + 'px'; /* regra 05: na mesma linha da escala, à direita */ R.view.hv = Math.max(0, $('map').clientHeight - (S.scaleBottom - 8)); if (t3d && S.cam3d) t3d.setVisible(R.view.hv); measureMask(); R.invalidate(); }
// clarify 08/09: onde a interface escreve, o chão não escreve. A máscara é medida do próprio DOM (como scaleBottom),
// para não haver constante repetida entre o CSS e o desenho; o render descarta o rótulo que cair dentro dela.
const MASK_SEL = '#fita,#fitaCv,.placa,.ecart,#cue,#panel,#speedo,#grade,#place,#ctl,#btnFollow,#btnKnow,#musicBar,#largada .hd,#largada .blk,#largada .go,#largada .ft';
function measureMask() {
  const cv = $('map'); if (!cv) return; const o = cv.getBoundingClientRect(), out = [];
  for (const el of document.querySelectorAll(MASK_SEL)) {
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue;   // display:none
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    out.push([r.left - o.left - 4, r.top - o.top - 4, r.right - o.left + 4, r.bottom - o.top + 4]);
  }
  S.mask = out;
}
function setCam(c) {
  c = c === 'tp' ? 'tp' : '2d'; S.prefs.cam = c; store.setPrefs(S.prefs);
  const b = $('btnCam'); if (b) { b.textContent = c === 'tp' ? '3ª' : '2D'; b.classList.toggle('on', c === 'tp'); }
  R.view.anchorY = S.mode === 'resumo' ? 0.6 : 0.45;
  if (c === 'tp') {
    S.follow = true; $('btnFollow').classList.add('on');
    const show = () => { $('gl').hidden = false; $('rider').hidden = true; $('rider3d').hidden = true; t3d.resize($('gl').clientWidth, $('gl').clientHeight, window.devicePixelRatio || 1, R.view.hv); S.cam3d = true; };
    if (t3d) { show(); return; }
    import('./terrain3d.js').then(m => {
      if (!m.init($('gl'))) { voice.banner('3D indisponível neste aparelho', 2, 'seguindo em 2D'); setCam('2d'); return; }
      t3d = m; t3d.setStage(S.stage); t3d.setTheme(S.theme === 'night'); t3d.setSat(!!S.prefs.sat); t3d.loadAvatar('./models/avatar.glb'); show();
    }).catch(e => { voice.banner('3D indisponível neste aparelho', 2, (e && e.message || '').slice(0, 60) || 'seguindo em 2D'); setCam('2d'); });
  } else { S.cam3d = false; $('gl').hidden = true; $('rider').hidden = false; $('rider3d').hidden = false; }
  R.invalidate();
}
// auditoria 07/09: a pinça é livre; só trava enquanto a saída está em andamento, para a luva no guidão não dar zoom sem querer
function lockZoom(on) { const vp = document.getElementById('vp'); if (!vp) return; const base = 'width=device-width,initial-scale=1,viewport-fit=cover'; vp.setAttribute('content', on ? base + ',maximum-scale=1,user-scalable=no' : base); }
// harden 07/09: memoria cheia deixa de ser silencio. Um caso conta o que foi apagado, o outro avisa que hoje corre risco.
let cheioAt = 0;
store.onFull((kind, qual) => {
  if (kind === 'freed') { voice.banner('Mem\u00f3ria cheia', 3, 'apaguei o registro de ' + qual + ' para caber o de hoje; o GPX daquela etapa se perdeu'); return; }
  const now = Date.now(); if (now - cheioAt < 600000) return; cheioAt = now;   // a escrita e a cada 30 s: um aviso a cada dez minutos basta
  voice.banner('Mem\u00f3ria cheia', 2, 'o registro de hoje pode n\u00e3o ser guardado; encerre a etapa e envie o GPX');
});
function setMode(m) { ui.setMode(S, m); S.prefs.mode = m; store.setPrefs(S.prefs); document.body.classList.toggle('full', m !== 'resumo'); if (R.view.mode === '2d') R.view.anchorY = m === 'resumo' ? 0.6 : 0.45; $('btnMode').textContent = m === 'resumo' ? '▴' : '▾'; $('btnMode').classList.toggle('on', m === 'resumo'); document.querySelectorAll('.cb button').forEach(b => b.classList.toggle('on', m === 'full' && S.tab === b.dataset.tab)); refresh(); measurePanel(); }
// modo mapa (F2): recolhe a fita e a placa; sobram o mapa, a seta do agora, velocidade, rampa e os botões do rodapé.
// Um aviso de nível 1 traz a fita de volta sozinho.
function setMapMode(on) { S.mapMode = !!on; document.body.classList.toggle('mapmode', S.mapMode); if (S.mapMode) setMode('resumo'); else { refresh(); measurePanel(); } }
function applyTheme() { S.theme = ui.theme(S.prefs.theme, S); R.setTheme(S.theme); if (window !== window.parent) { try { parent.postMessage({ etape: 'theme', night: S.theme === 'night' }, '*'); } catch (e) { } } if (t3d) t3d.setTheme(S.theme === 'night'); if (S.native) native.setNight(S.theme === 'night'); }

export function startNavigation(silent) {
  const ok = gps.start(onFix, e => { S.gpsMsg = 'GPS: ' + (e.message || 'erro'); refresh(); });
  if (!ok) return;
  compass.start(); S.gpsMsg = 'GPS ligado'; S.follow = true; $('btnFollow').classList.add('on'); R.setView(null, null, 19);
  gps.keepAwake(true);
  if (!silent) voice.announce({ level: 3, text: 'Navegação iniciada', sub: S.stage.name, speak: 'Navegação iniciada. ' + S.stage.name.replace(/^E\S+ /, '') });
}
export function stopNavigation() { if (cinema.active()) cinema.exit(); gps.stop(); gps.keepAwake(false); S.gpsMsg = 'GPS desligado'; refresh(); }

export function toggleSession() {
  { const L = $('largada'); if (L) L.hidden = true; document.body.classList.remove('largada'); }
  setTimeout(() => lockZoom(S.session.state === 'running'), 0);
  const now = Date.now(), s = S.session;
  if (s.state === 'idle') {
    const go = () => { session.start(s, Date.now()); startNavigation(); S.alts = null; setMode('resumo'); if (S.diario) { S.follow = true; $('btnFollow').classList.add('on'); S.userZoomAt = 0; R.view.anchorY = 0.6; setMode('resumo'); } refresh(); };
    if (!S.free && !S.diario && !store.get('brief:' + S.stage.key, false)) { showBriefingOnce(); $('dlgPreview').addEventListener('close', () => preOuting(go), { once: true }); }
    else preOuting(go);
  }
  else if (s.state === 'running') { session.pause(s, now, placeNow()); voice.announce({ level: 3, text: 'Pausa', sub: 'GPS segue ligado', speak: 'Pausa.' }); }
  else if (s.state === 'paused') { session.resume(s, now); if (!gps.running()) startNavigation(true); voice.announce({ level: 3, text: 'Retomada', speak: 'Retomando.' }); }
  refresh();
}
// tela 02 · Antes de sair: o que acompanhar nesta saída; toda vez ao tocar em Partir (decisão do Pedro). ?pre=0 pula (testes)
function preOuting(go) {
  const mode = (S.free || S.diario) ? 'diario' : 'viagem', list = outing.load(mode, fuel.plan(S.stage));
  const finish = () => { outing.save(mode, list); outing.apply(S.fuelPlan, list); go(); };
  if (/[?&]pre=0/.test(location.search)) { finish(); return; }
  const dlg = $('dlgPre'), st = S.stage;
  $('preSub').textContent = (st.dest || st.name.replace(/^E\S+ /, '')) + ' · ' + String(st.km).replace('.', ',') + ' km' + (S.destEta ? ' · chegada ' + S.destEta : '') + ' · sai às ' + $('clock').textContent;
  const paint = () => { $('preBody').innerHTML = outing.html(list); outing.bind($('preBody'), list, paint); $('preGo').innerHTML = 'Partir<small>' + outing.summary(list) + '</small>'; };
  const saved = mode === 'diario' && store.get('metrics:' + mode, null);   // clarify 06/09: no dia a dia, só o resumo; Mudar abre a lista
  const paintCompact = () => { const on = list.filter(m => m.on); $('preBody').innerHTML = '<div class="pre-sum"><b>' + (on.length ? outing.summary(list).replace(/^com /, '') : 'sem acompanhamento') + '</b><span>' + (on.map(m => m.name).join(' · ') || 'nenhuma métrica ligada') + '</span><button id="preEdit" type="button">Mudar</button></div>'; $('preEdit').onclick = paint; $('preGo').innerHTML = 'Partir<small>' + outing.summary(list) + '</small>'; };
  if (saved) paintCompact(); else paint();
  $('preNote').textContent = 'Peso ' + S.prefs.weight + ' kg · 2 garrafas de 750 ml' + (mode === 'viagem' ? ' · metas do guia para o tipo desta etapa' : ' · a escolha fica guardada para a próxima saída');
  // N4 · checklist de partida (só com a casca): bateria, espaço, GPS, barômetro, voz, temperatura
  const ck = $('preCheck'); if (ck) { ck.hidden = !S.native; if (S.native) { ck.innerHTML = '<div class="lbl">Aparelho</div><div class="note">conferindo…</div>'; native.checklist(S).then(list => { if (!list) return; ck.innerHTML = '<div class="lbl">Aparelho</div>' + list.map(i => `<div class="ck${i.ok ? '' : ' warn'}"><i>${i.ok ? '✓' : '!'}</i>${String(i.txt).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</div>`).join(''); }); } }
  $('preNone').onclick = () => { for (const m of list) m.on = false; dlg.close(); finish(); };
  $('preGo').onclick = () => { dlg.close(); finish(); };
  if (!dlg.open) dlg.showModal(); dlg.scrollTop = 0;
}
// pergunta em papel (substitui confirm/alert nativos): título, subtítulo, rótulo do sim
export function ask(title, sub, yes, opts = {}) { return new Promise(res => { const d = $('dlgAsk'), inp = $('askIn'); $('askTitle').textContent = title; $('askSub').textContent = sub || ''; $('askYes').textContent = yes || 'Sim'; inp.hidden = !opts.input; inp.value = opts.value || ''; const done = v => { d.close(); res(v); }; $('askYes').onclick = () => done(opts.input ? inp.value.trim() : true); $('askNo').onclick = () => done(opts.input ? null : false); inp.onkeydown = e => { if (e.key === 'Enter') $('askYes').click(); }; d.onclose = null; d.showModal(); if (opts.input) setTimeout(() => inp.focus(), 50); }); }
async function askFinish() { if (S.session.state === 'idle') return; if (await ask('Encerrar a saída?', 'Guarda o registro e gera o relatório do dia.', 'Encerrar')) finishStage(true); }
export function finishStage(force) {
  if (S.session.state === 'idle') return;
  if (!force) { askFinish(); return; }
  session.finish(S.session, Date.now()); stopNavigation(); if (S.native) music.onFinish();
  telemetry.record(S.log, S.log[S.log.length - 1] || telemetry.sample({ t: Date.now(), lat: S.stage.pts[0][0], lon: S.stage.pts[0][1] }, S.stage, S.proj), S.stage.key, true);
  const r = report.build(S.stage, S.session, S.log, S.fuel, S.fuelPlan, S.paradas, S.planArrival);
  if (S.free || S.diario) { const d = new Date(S.session.startedAt || Date.now()); const hm = String(d.getHours()).padStart(2, '0') + 'h' + String(d.getMinutes()).padStart(2, '0'); r.stageKey = 'SP-' + d.toISOString().slice(0, 10) + '-' + hm; r.name = (S.diario ? S.stage.name : 'SP') + ' · ' + d.toLocaleDateString('pt-BR') + ' ' + hm; r.diario = !!S.diario; r.dest = S.diario ? S.stage.dest : null; if (!S.diario) { r.planKm = r.km; r.planUp = r.up; } }
  report.save(r); showArrival(r); if (S.native) try { passeio.finish(r); } catch (e) { }
  if (S.free || S.diario) { const c = S.fix ? [S.fix.lat, S.fix.lon] : S.stage.pts[S.stage.pts.length - 1]; store.clearStage('SP'); S.diario = false; S.alts = null; S.destEta = null; S.free = true; selectStage('SP'); free.reset(c); S.freeStage = S.stage; $('stageName').textContent = 'Navegação livre'; $('stageSub').textContent = 'São Paulo · sem traçado'; }
}
async function resetStage() { if (!(await ask('Zerar a etapa?', 'Apaga o progresso, a saída e o registro desta etapa. Não dá para desfazer.', 'Zerar'))) return; stopNavigation(); store.clearStage(S.stage.key); selectStage(S.stage.key); }
// cidade/vila atual: nó "place" mais próximo, cada tipo com o seu raio (cidade 4 km, town 2,5 km, vila 1,2 km, lugarejo 600 m)
const PLACE_R = { 'place:city': 4000, 'place:town': 2500, 'place:village': 1200, 'place:hamlet': 600 };
let placeAt = 0;
function updatePlace(now) {
  const p = S.pos || S.fix; if (!p || now - placeAt < 2500) return; placeAt = now;
  const near = poisNear(S.map.poiIndex, p.lat, p.lon, 4000, Object.keys(PLACE_R));
  let best = null, bs = 1;
  for (const c of near) { const s = c.d / PLACE_R[c.poi.k]; if (s < bs) { bs = s; best = c; } }
  const name = best ? best.poi.n : '';
  if (name !== S.place) { S.place = name; refresh(); }
}
function placeNow() {
  if (!S.fix) return null;
  const near = poisNear(S.map.poiIndex, S.fix.lat, S.fix.lon, 400, ['place:village', 'place:hamlet', 'place:town', 'bakery', 'water', 'pass', 'shop']);
  const place = near.length ? near[0].poi.n : (S.next.cp ? 'perto de ' + S.next.cp.name : '');
  return { dist: S.proj.dist, lat: S.fix.lat, lon: S.fix.lon, place };
}
// volume baixo: responde à Fita, nesta ordem (o ciclista não precisa saber qual das cinco coisas fez)
function respond() {
  if (voice.activeLevel() === 1) { voice.clearBanner(); native.beep(''); voice.say('ok', 3); return; }
  const F = S.fuelStatus; if (F && S.session.state === 'running' && (F.nextDrinkMin <= 0 || F.nextEatMin <= 0)) { confirmFuel(F.nextDrinkMin <= F.nextEatMin ? 'drink' : 'eat'); voice.say(F.nextDrinkMin <= F.nextEatMin ? 'bebi' : 'comi', 3); return; }
  const dlg = document.querySelector('dialog[open]'); if (dlg) { dlg.close(); native.beep(''); return; }
  if (S.mapMode) { setMapMode(false); native.beep(''); return; }
  const bk = $('btnKnow'); if (bk && !bk.hidden) { bk.click(); return; }
  if (!voice.repeat()) { native.beep('no'); voice.banner('Nada a repetir', 3); }
}
function confirmFuel(kind) { const P = S.fuelPlan || {}; fuel.confirm(S.fuel, P, kind, session.movingTime(S.session, Date.now())); const x = (P.extras || []).find(e => e.id === kind); voice.banner(kind === 'drink' ? 'Bebeu ' + Math.round(P.sipMl || 150) + ' ml' : kind === 'eat' ? 'Comeu ' + Math.round(P.biteG || 30) + ' g' : x ? x.name + ' · ' + x.dose + ' ' + x.unit : 'Registrado', 3); refresh(); }

function onFix(raw) {
  const fix = gps.smooth(raw, S.prev); if (!fix) return;
  const now = fix.t; S.prev = fix; S.fix = fix;
  S.hist.push({ t: now, lat: fix.lat, lon: fix.lon }); while (S.hist.length && now - S.hist[0].t > 600000) S.hist.shift();
  S.speed10 = gps.speedWindow(S.hist, 600);
  const sess = S.session, running = sess.state === 'running';
  if (running) session.trackStill(sess, { ...fix, dist: S.proj.dist }, now, S.next.cp ? 'perto de ' + S.next.cp.name : '');
  if (S.free) { onFixFree(fix, now, running); return; }
  const events = running ? guide.tick(S, fix, now) : (S.proj = track.project(S.stage, fix.lat, fix.lon, S.proj.idx), []);
  if (running && !S.off) {
    const smp = telemetry.sample(fix, S.stage, S.proj, null); const sn = sensors.current(); if (sn.hr) smp.hr = sn.hr; if (sn.cad) smp.cad = sn.cad; if (sn.pwr) smp.pwr = sn.pwr;
    if (S.native && !gps.simulating()) { if ((S.proj.off || 0) < 30) native.calibrate(track.elevationAt(S.stage, S.proj.dist), S.proj.dist, now); const ba = native.alt(), bg = native.grade(); if (ba != null) smp.ele = Math.round(ba); if (bg != null && (fix.v || 0) > 1) smp.grade = +bg.toFixed(1); }
    telemetry.record(S.log, smp, S.stage.key);
    const moving = session.movingTime(sess, now);
    events.push(...fuel.tick(S.fuel, S.fuelPlan, moving, now, { waterAhead: S.waterAhead }));
    events.push(...guide.shopWindow(S, S.speed10, now));
    S.live = telemetry.live(S.log, S.stage, sess, now, moving);
    S.fuelStatus = fuel.status(S.fuel, S.fuelPlan, moving, (S.stage.total - S.proj.dist) / 1000, S.speed10 * 3.6);
    const left = S.paradas.filter(p => p.kind !== 'compras' && p.kind !== 'opcional' && !p.done && !p.skipped && p.km * 1000 > S.proj.dist).reduce((a, p) => a + p.min, 0);
    S.planSpeed = guide.planSpeed(S.stage, S.proj.dist, S.planArrival, left, now);
    // chegada prevista: recalculada a cada 15 min (ou quando ainda não há), não a cada posição
    if (!S.eta || !S.eta.arrival || now - (S.etaAt || 0) > 60000) { const e = guide.eta(S.stage, S.proj.dist, gps.speedWindow(S.hist, 300) || S.speed10, left);   /* crítica 06/09: chegada desde o 1º minuto, média móvel de 5 min */ if (e.arrival) { S.eta = e; S.etaAt = now; S.vsPlan = guide.vsPlan(S.planArrival, e.arrival); } }
    S.light = guide.daylight(new Date(now), fix.lat, fix.lon);
    S.ecart = guide.ecart(S, S.speed10, now, (S.routes.days || {})[S.stage.key]);
    if (S.prefs.theme === 'auto') applyTheme();
  }
  for (const ev of events) handleEvent(ev);
  rerouteTick(fix, now, events);
  updatePlace(now);
  S.next = guide.nextCue(S);
  // tela 05: fora da rota com a volta calculada, a placa mostra a próxima curva da nova rota e a distância até o traçado
  if (S.off && S.reroute && !muted()) { const r2 = S.reroute, t = r2.turns.find(x => x.dist > r2.proj.dist), remR = r2.total - r2.proj.dist; S.next = { cp: { name: 'Volta ao traçado', dist: (S.proj.dist || 0) + remR, reroute: true }, turn: t ? { ...t, dist: (S.proj.dist || 0) + (t.dist - r2.proj.dist) } : null }; }
  updateSituation(now, fix.v || 0); stillUI(now, fix.v || 0); cinema.updateSun(); if (S.native) { auto.tick(); passeio.tick(); }
  if (!gps.simulating() && now - (S.lastPosAt || 0) > 30000) { S.lastPosAt = now; store.set('lastpos:' + ((S.diario || S.free) ? 'sp' : 'tdf'), { lat: fix.lat, lon: fix.lon, place: S.place || '' }); }
  // longe da etapa (> 50 km, ex.: testando em casa): o mapa fica na largada e não segue o GPS
  if ((S.proj.off || 0) > 50000) { S.viewTarget = null; S.pos = null; if (!S.farNoted) { S.farNoted = true; S.gpsMsg = 'longe da etapa · mapa na largada'; } R.invalidate(); refresh(); return; }
  // modelo de movimento (estilo Waze): o fix vira um alvo; o loop prevê a posição ao longo da estrada e desliza até ela
  const onRoad = (S.proj.off || 0) <= 30 && !S.off, v0 = fix.v || 0;
  // satélite progressivo: aquece os tiles dos próximos 800 m no nível em uso
  if (S.prefs.sat && onRoad) { try { sat.warmAhead(S.stage, S.proj.dist, 800, R.view.z); } catch (e) { } }
  if (S.gpsMsg === 'GPS perdido · estimando') { S.gpsMsg = 'GPS ligado'; }
  const T = { lat: fix.lat, lon: fix.lon, v: v0, head: (fix.head || 0) * Math.PI / 180, dist: S.proj.dist || 0, on: onRoad, t: Date.now() };
  const prev = S.viewTarget; S.viewTarget = T;
  const jump = !S.pos || !prev || Date.now() - prev.t > 60000 || haversine(S.pos.lat, S.pos.lon, fix.lat, fix.lon) > 150;
  if (jump) { const p = onRoad ? track.pointAt(S.stage, T.dist) : [fix.lat, fix.lon]; S.pos = { lat: p[0], lon: p[1], head: onRoad ? track.bearingAt(S.stage, T.dist) * Math.PI / 180 : T.head, dist: T.dist }; if (S.follow) snapView(); }
  // zoom automático pela velocidade (2D): parado 19 · normal 18,2 · descida rápida 17,4; desliza no loop, e só sem zoom manual recente
  if (S.follow && R.view.mode === '2d' && now - (S.userZoomAt || 0) > 45000) S.zoomTarget = Math.min(R.maxZ(), zoomFor(v0)); else S.zoomTarget = null;
  R.invalidate(); refresh();
}
// situação da tela (estudo do mapa, D4): parado, descida, subida, urbano ou plano. O render escolhe as camadas por ela
// (RULES em render.js). Troca só depois de 2 s estável, e refaz a base do mapa ao trocar.
function updateSituation(now, v) {
  const g = S.live && S.live.grade != null ? S.live.grade / 100 : 0, turn = S.next && S.next.turn ? S.next.turn.dist - (S.proj.dist || 0) : 1e9;
  let s;
  if (S.session.state !== 'running' || v < 0.8) s = 'parado';
  else if (S.free || S.diario) s = 'urbano';
  else if ((g < -0.04 && v > 5) || (turn < 300 && v > 4)) s = 'descida';
  else if (S.climbId || g > 0.03) s = 'subida';
  else s = 'plano';
  if (s !== S.sitCand) { S.sitCand = s; S.sitSince = now; }
  if (s !== S.situation && now - (S.sitSince || 0) >= 2000) { S.situation = s; R.invalidate(); if (S.native) music.onSituation(s); }
}
// tela 03 · Parado: 30 s abaixo de 2 km/h abre a folha; 3 s acima de 5 km/h fecha e devolve a tela de antes
function stillUI(now, v) {
  if (S.session.state !== 'running') { if (S.parado) setParado(false); S.stillAt = null; return; }
  if (v < 0.55) { if (!S.stillAt) S.stillAt = now; S.moveAt = null; if (!S.parado && now - S.stillAt > 30000) setParado(true); }
  else if (v > 1.4) { if (!S.moveAt) S.moveAt = now; if (S.parado) { if (now - S.moveAt > 3000) { setParado(false); S.stillAt = null; } } else S.stillAt = null; }
}
function setParado(on) {
  S.parado = on;
  if (on) { S.paradoPrev = { mode: S.mode, tab: S.tab }; ui.setTab(S, 'parado'); setMode('full'); }
  else { const p = S.paradoPrev || { mode: 'resumo', tab: S.prefs.tab || 'tele' }; ui.setTab(S, p.tab === 'parado' || p.tab === 'dest' ? 'tele' : p.tab); setMode(p.mode === 'full' && p.tab !== 'parado' && p.tab !== 'dest' ? 'full' : 'resumo'); }
  refresh();
}
const muted = () => !!(S.muteRoute && Date.now() < S.muteRoute);
// zoom automático em 2D (estudo do mapa, D7). Largura da tela em metros a 45° N (390 px): z18,3 ≈ 130 m · z17,8 ≈ 190 m ·
// z17,4 ≈ 250 m · z17,0 ≈ 330 m · z16,6 ≈ 440 m. Parado 18,3 · descida (curva perto ou rampa forte) 17,8 · urbano 17,6 ·
// subida 16,6 (o que vem cabe na tela) · plano 17,4 devagar, 17,0 rápido. Desliza no loop, e só sem zoom manual recente.
function zoomFor(v) { if (v < 0.8) return 18.3; const s = S.situation; if (s === 'descida') return 17.8; if (s === 'urbano') return 17.6; if (s === 'subida') return 16.6; return v < 2.5 ? 17.4 : 17.0; }
// Navegação livre: encaixa na via (free.js), estende o percurso, telemetria e abastecimento iguais aos da etapa
function onFixFree(fix, now, running) {
  const events = free.onFix(fix, now), sess = S.session;
  if (running) {
    const smp = telemetry.sample(fix, S.stage, S.proj, null); const sn = sensors.current(); if (sn.hr) smp.hr = sn.hr; if (sn.cad) smp.cad = sn.cad; if (sn.pwr) smp.pwr = sn.pwr;
    if (S.native && !gps.simulating()) { let ref = null; try { ref = dem.available() ? dem.elevation(fix.lat, fix.lon) : null; } catch (e) { } native.calibrate(ref, S.proj.dist, now); const ba = native.alt(), bg = native.grade(); if (ba != null) smp.ele = Math.round(ba); if (bg != null && (fix.v || 0) > 1) smp.grade = +bg.toFixed(1); }
    telemetry.record(S.log, smp, S.stage.key);
    const moving = session.movingTime(sess, now);
    try { events.push(...fuel.tick(S.fuel, S.fuelPlan, moving, now, {})); } catch (e) { }
    S.live = telemetry.live(S.log, S.stage, sess, now, moving);
    try { S.fuelStatus = fuel.status(S.fuel, S.fuelPlan, moving, 0, S.speed10 * 3.6); } catch (e) { }
    S.light = guide.daylight(new Date(now), fix.lat, fix.lon);
    if (S.prefs.theme === 'auto') applyTheme();
  }
  for (const ev of events) handleEvent(ev);
  updatePlace(now);
  updateSituation(now, fix.v || 0); stillUI(now, fix.v || 0); cinema.updateSun(); if (S.native) { auto.tick(); passeio.tick(); }
  if (!gps.simulating() && now - (S.lastPosAt || 0) > 30000) { S.lastPosAt = now; store.set('lastpos:' + ((S.diario || S.free) ? 'sp' : 'tdf'), { lat: fix.lat, lon: fix.lon, place: S.place || '' }); }
  const v0 = fix.v || 0, pos = S.stage.pts.length ? S.stage.pts[S.stage.pts.length - 1] : [fix.lat, fix.lon];
  const headDeg = free.heading() != null ? free.heading() : (fix.head || 0);
  const T = { lat: pos[0], lon: pos[1], v: v0, head: headDeg * Math.PI / 180, dist: S.proj.dist || 0, on: false, t: Date.now() };
  const prev = S.viewTarget; S.viewTarget = T;
  const jump = !S.pos || !prev || Date.now() - prev.t > 60000 || haversine(S.pos.lat, S.pos.lon, pos[0], pos[1]) > 150;
  if (jump) { S.pos = { lat: pos[0], lon: pos[1], head: T.head, dist: T.dist }; if (S.follow) snapView(); }
  if (S.follow && R.view.mode === '2d' && now - (S.userZoomAt || 0) > 45000) S.zoomTarget = Math.min(R.maxZ(), zoomFor(v0)); else S.zoomTarget = null;
  R.invalidate(); refresh();
}
// Recálculo de rota (estilo Waze): fora da rota confirmada, entre 60 m e 3 km do traçado, com o grafo carregado, calcula
// o caminho da posição até um ponto do traçado 300 m à frente de onde saiu; refaz a cada 30 s ou se a posição mudou
// 120 m; anuncia as curvas do caminho de volta; some ao voltar à fita amarela.
function rerouteTick(fix, now, events) {
  const off = S.proj.off || 0; const mine = [];
  if (muted()) { if (S.reroute) { S.reroute = null; R.invalidate(); } return; }   // tela 05: "sei o caminho"
  // Diário: em vez de voltar ao traçado, a etapa é refeita daqui até o destino (uma vez a cada 30 s, no máximo)
  if (S.diario && S.off && off >= 60 && off <= 3000 && router && router.available() && S.session.state === 'running' && now - (S.rerouteAt || 0) > 30000) {
    S.rerouteAt = now; const dest = S.stage.cps[S.stage.cps.length - 1]; let res = null;
    try { res = router.route(fix.lat, fix.lon, dest.lat, dest.lon, 40000, { profile: S.stage.profile || 'shortest' }); } catch (e) { res = null; }
    if (res && res.pts.length > 1) {
      const st = plan.rerouteStage(S.stage, S.proj.dist || 0, fix, res); track.nameTurns(st.turns, st, S.map.index);
      S.stage = st; S.proj = track.project(st, fix.lat, fix.lon, -1); S.off = false; S.offSince = 0; S.reroute = null; S.services = null; S.eta = null; S.flamme = false;
      $('stageSub').textContent = String(st.km).replace('.', ',') + ' km · ' + Math.round(st.up) + ' m'; if (t3d) t3d.setStage(st);
      voice.clearBanner(); handleEvent({ kind: 'reroute', level: 2, text: 'Nova rota', sub: 'até ' + (st.dest || 'o destino') + ' · ' + ((st.total - S.proj.dist) / 1000).toFixed(1).replace('.', ',') + ' km', speak: 'Nova rota até ' + (st.dest || 'o destino') + '.' });
      R.invalidate(); refresh();
    }
    return;
  }
  if (!S.off || off < 60 || off > 3000 || !router || !router.available() || S.session.state !== 'running') { if (S.reroute && !S.off) { S.reroute = null; R.invalidate(); } return; }
  const rr = S.reroute;
  const stale = !rr || now - rr.at > 30000 || haversine(rr.from[0], rr.from[1], fix.lat, fix.lon) > 120;
  if (stale) {
    // alvo: 300 m à frente do ponto do traçado mais próximo de verdade (busca global; S.proj pode estar velho fora da rota)
    const g = track.project(S.stage, fix.lat, fix.lon, -1); const tgtD = Math.min(S.stage.total, Math.max(g.dist, S.proj.dist || 0) + 300), tgt = track.pointAt(S.stage, tgtD);
    let res = null; try { res = router.route(fix.lat, fix.lon, tgt[0], tgt[1]); } catch (e) { res = null; }
    if (res && res.pts.length > 1) {
      const cum = [0]; for (let i = 1; i < res.pts.length; i++) cum.push(cum[i - 1] + haversine(res.pts[i - 1][0], res.pts[i - 1][1], res.pts[i][0], res.pts[i][1]));
      const pseudo = { pts: res.pts, cum, total: cum[cum.length - 1] };
      const turns = track.detectTurns(pseudo, 35, 12, 30);
      const first = !rr;
      S.reroute = { pts: res.pts, cum, total: pseudo.total, turns, at: now, from: [fix.lat, fix.lon], tgtD, proj: { idx: 0, dist: 0, off: 0 } };
      if (first) { mine.push({ kind: 'reroute', level: 3, text: 'Nova rota', sub: (pseudo.total >= 1000 ? (pseudo.total / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(pseudo.total) + ' m') + ' até voltar ao traçado', speak: 'Recalculando. ' + (pseudo.total >= 1000 ? (pseudo.total / 1000).toFixed(1).replace('.', ',') + ' quilômetros' : Math.round(pseudo.total / 50) * 50 + ' metros') + ' até a rota.' }); }
      R.invalidate();
    } else if (rr) { S.reroute = null; R.invalidate(); }
  }
  // curvas do caminho de volta
  const r2 = S.reroute; if (!r2) return;
  const pr = track.project(r2, fix.lat, fix.lon, r2.proj.idx); if (pr.off < 80) r2.proj = pr;
  for (const t of r2.turns) {
    const ahead = t.dist - r2.proj.dist;
    if (ahead > 0 && ahead < 320 && !t.a300) { t.a300 = true; mine.push({ kind: 'turn300', level: 2, text: t.short || t.txt, sub: 'em 300 m · volta à rota', speak: 'Em 300 metros, ' + t.txt + '.', turn: t }); }
    if (ahead > 0 && ahead < 60 && !t.a50) { t.a50 = true; mine.push({ kind: 'turn50', level: 1, text: t.short || t.txt, sub: 'agora · volta à rota', speak: t.txt.charAt(0).toUpperCase() + t.txt.slice(1) + ' agora.', turn: t, hold: 8000 }); }
  }
  for (const ev of mine) handleEvent(ev);
}
function handleEvent(ev) {
  if (muted() && (ev.kind === 'offRoute' || ev.kind === 'reroute')) return;
  if (S.diario && ev.kind === 'offRoute' && ev.rel != null && router && router.available()) return;   // Diário: a nova rota até o destino substitui o "volte à rota"
  if (ev.kind === 'backOnRoute') S.muteRoute = 0;
  if (ev.kind === 'checkpoint' || ev.kind === 'arrival') { const prog = store.progress(S.stage.key); if (!prog.done.includes(ev.cp.id)) prog.done.push(ev.cp.id); store.setProgress(S.stage.key, prog); session.mark(S.session, 'borne', { id: ev.cp.id, dist: ev.cp.dist }); }
  const POIS = '<svg class="flag" viewBox="0 0 36 26"><rect width="36" height="26" fill="#fff" stroke="#000"/><g fill="#E3202E"><circle cx="7" cy="6" r="3.2"/><circle cx="20" cy="6" r="3.2"/><circle cx="33" cy="6" r="3.2"/><circle cx="13.5" cy="15" r="3.2"/><circle cx="26.5" cy="15" r="3.2"/><circle cx="7" cy="24" r="3.2"/><circle cx="20" cy="24" r="3.2"/><circle cx="33" cy="24" r="3.2"/></g></svg>';
  const FLAMME = '<svg class="flag" viewBox="0 0 36 26"><rect x="3" y="1" width="3" height="24" fill="#fff"/><path d="M6 2h26l-6 7 6 7H6z" fill="#fff"/><text x="17" y="14" font-family="Sofia Sans Semi Condensed" font-weight="900" font-size="12" fill="#E3202E" text-anchor="middle">1</text></svg>';
  const MUSETTE = '<svg class="flag" viewBox="0 0 36 26"><path d="M1 25L6 1h29l-5 24z" fill="#B9BCC2" stroke="#000"/><path d="M15 8h7l3 12H12z" fill="#fff"/></svg>';
  if (ev.kind === 'sight') { ev.right = (S.native ? '<button class="mini-btn" data-photo="1">Foto</button>' : '') + '<button class="mini-btn vert" data-done="' + ev.parada.id + '">Feito</button>'; }
  if (ev.kind === 'climbStart' && ev.cat) ev.right = '<span class="plate' + (ev.cat === 'HC' ? ' hc' : '') + ' ' + ui.catCls(ev.cat) + '">' + ev.cat + '</span>';
  if (ev.kind === 'summit') ev.right = POIS;
  if (ev.kind === 'flamme') ev.right = FLAMME;
  if (ev.kind === 'shopWindow') ev.right = MUSETTE;
  if (ev.kind === 'offRoute' && ev.off != null) ev.right = '<span class="pill">' + (ev.off > 5000 ? Math.round(ev.off / 1000) + ' km' : Math.round(ev.off) + ' m') + '</span>';
  if (ev.kind === 'backOnRoute') ev.right = '<span class="pill vert">✓</span>';
  if (ev.kind === 'refill') ev.right = '<span class="pill bleu">' + Math.round(S.waterAhead || 0) + ' m</span>';
  if (ev.kind === 'checkpoint' && ev.cp) ev.right = '<span class="pill">' + ev.cp.kmLabel + '</span>';
  if (ev.kind === 'hotel') ev.right = '<span class="pill">' + (ev.km || 0).toFixed(1).replace('.', ',') + ' km</span>';
  if (ev.kind === 'toilets') ev.right = '<span class="pill bleu">' + Math.round((ev.m || 0) / 50) * 50 + ' m</span>';
  if (ev.kind === 'bikeshop') ev.right = '<span class="pill vert">' + (ev.m >= 1000 ? (ev.m / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(ev.m / 50) * 50 + ' m') + '</span>';
  if (ev.kind === 'rec') ev.right = '<span class="pill rouge">● REC</span>';
  if (ev.kind === 'reroute') ev.right = '<span class="pill bleu">↻</span>';
  if (ev.kind === 'offRoute' && ev.off > 5000 && !/\/teste\//.test(location.pathname)) ev.right = '<a class="mini-btn" href="../teste/" target="_top">Rota de teste</a>';
  else if (ev.kind === 'offRoute' && ev.rel != null) ev.right = '<span class="arr"><svg viewBox="0 0 40 40" style="transform:rotate(' + Math.round(ev.rel) + 'deg)" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 34V8M10 18l10-10 10 10"/></svg></span><span class="pill">' + Math.round(ev.off) + ' m</span>';
  if (ev.kind === 'drink') ev.right = '<button class="mini-btn" data-fuel="drink">Bebi</button>';
  if (ev.kind === 'eat') ev.right = '<button class="mini-btn" data-fuel="eat">Comi</button>';
  if (ev.kind === 'arrival') { setTimeout(() => finishStage(true), 60); return; }   // tela 04: a chegada confirmada abre o ritual sozinha
  if (ev.kind === 'metric') ev.right = '<button class="mini-btn" data-fuel="' + ev.metric + '">Tomei</button>';
  if (ev.kind === 'turn300' || ev.kind === 'turn50') ev.right = '<span class="arr">' + ui.svgArrow(ev.turn.kind || ev.turn.dir, ev.turn.dir) + '</span>';
  if (ev.kind === 'climbStart' || ev.kind === 'summit') session.mark(S.session, ev.kind, { dist: S.proj.dist });
  document.dispatchEvent(new CustomEvent('etape:guide', { detail: ev }));
  if (ev.level === 1 && S.mapMode) setMapMode(false);
  if (S.native && S.prefs.screen === 'economia' && ev.level <= 2) native.wake(ev.level === 1 ? 20000 : 12000);   // N3b: o aviso acende a tela
  voice.announce(ev);
  const ff = $('cue').querySelector('[data-fuel]'); if (ff) ff.onclick = e => { e.stopPropagation(); confirmFuel(ff.dataset.fuel); };
  const fb = $('cue').querySelector('[data-finish]'); if (fb) fb.onclick = e => { e.stopPropagation(); voice.clearBanner(); finishStage(true); };
  const fp = $('cue').querySelector('[data-photo]'); if (fp) fp.onclick = e => { e.stopPropagation(); takePhoto(); };
  const b = $('cue').querySelector('[data-done]'); if (b) b.onclick = e => { e.stopPropagation(); const p = S.paradas.find(x => x.id === b.dataset.done); if (p) { p.done = true; const prog = store.progress(S.stage.key); prog.sights.push(p.id); store.setProgress(S.stage.key, prog); } voice.clearBanner(); };
}
// U3.1: roteiro do 112, frases (pane, cols, comida, hotel), telefones das hospedagens, seguros e dicas de pronúncia.
// Hierarquia da frase: português em destaque primeiro (o que ele precisa entender, com pressa e talvez machucado),
// francês logo abaixo (o que mostra na tela para o outro ler) e a pronúncia figurada colada nele (o que ele fala).
function sosFrase(t) {
  return '<div class="sos-frase"><b class="sos-pt">' + esc(t[1]) + '</b><span class="sos-fr">' + esc(t[0]) + '</span><i class="sos-pron">' + esc(t[2]) + '</i></div>';
}
function sosGrupo(titulo, arr) {
  return '<div class="sos-grupo"><h4>' + titulo + '</h4>' + arr.map(sosFrase).join('') + '</div>';
}
function sosEmergencia() {
  const E = window.SOS; if (!E) return '';
  const dias = Object.values(S.routes.days || {});
  const vistos = new Set();
  const hoteis = dias.map(d => d.hotel).filter(h => h && h.nome && !vistos.has(h.nome) && vistos.add(h.nome));
  const telHtml = h => h.tel ? (h.tel.replace(/[^\d]/g, '').length >= 8 ? '<a class="sos-tel" href="tel:' + h.tel.split('·')[0].replace(/[^+\d]/g, '') + '">' + esc(h.tel) + '</a>' : '<span class="sos-tel">' + esc(h.tel) + '</span>') : '<span class="sos-tel">—</span>';
  return '<details class="sos-roteiro" open><summary>Roteiro do 112</summary><div class="sos-frases">' + E.roteiro112.map(sosFrase).join('') + '</div></details>' +
    sosGrupo('Pane mecânica', E.pane) + sosGrupo('O col está aberto?', E.cols) + sosGrupo('Comida e água', E.comida) + sosGrupo('No hotel', E.hotelfrases) + sosGrupo('Ligando antes', E.telefone) +
    (hoteis.length ? '<details class="sos-hoteis"><summary>Telefones das hospedagens</summary><table class="sos-tab"><tbody>' + hoteis.map(h => '<tr><td>' + esc(h.nome) + '</td><td>' + telHtml(h) + '</td></tr>').join('') + '</tbody></table></details>' : '') +
    '<div class="sos-card"><b>Riscos e seguros</b><ul>' + E.seguros.map(s => '<li>' + esc(s) + '</li>').join('') + '</ul></div>' +
    '<div class="sos-card"><b>Como ler a pronúncia</b><ul>' + E.dicas.map(s => '<li>' + esc(s) + '</li>').join('') + '</ul></div>';
}
// SOS: números da França, posição atual para ditar, ligar/compartilhar, hotel do dia
function showSos() {
  const fix = S.fix, p = S.pos || fix, d = (S.routes.days || {})[S.stage.key] || {}, hotel = d.hotel || {};
  const km = (S.proj.dist / 1000).toFixed(1).replace('.', ','), cp = S.stage.cps.slice().reverse().find(c => c.dist <= S.proj.dist + 100) || S.stage.cps[0];
  const ele = Math.round(track.elevationAt(S.stage, S.proj.dist));
  const pos = p ? p.lat.toFixed(5) + ', ' + p.lon.toFixed(5) : 'sem GPS';
  const maps = p ? 'https://maps.google.com/?q=' + p.lat.toFixed(5) + ',' + p.lon.toFixed(5) : '';
  const sp = !!(S.diario || S.free);   // crítica 06/09: SOS na realidade de SP quando o mapa é SP
  const hd = $('dlgSos').querySelector('.sos-hd span'); if (hd) hd.textContent = sp ? 'São Paulo · Brasil' : 'Auvergne · França';
  const FONE = '<svg class="fone" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.6a1 1 0 0 1-.25 1z"/></svg>';
  const fone = (n, rot, pri) => '<a' + (pri ? ' class="pri"' : '') + ' href="tel:' + n + '"><b>' + n + '</b><span>' + rot + '</span>' + FONE + '</a>';
  const nums = '<div class="sos-nums">' + (sp
    ? fone('192', 'SAMU · ambulância', 1) + fone('193', 'Bombeiros · resgate') + fone('190', 'Polícia Militar') + fone('188', 'CVV · apoio')
    : fone('112', 'Emergência europeia', 1) + fone('15', 'SAMU · médico') + fone('18', 'Bombeiros') + fone('17', 'Polícia')) + '</div>';
  $('sosBody').innerHTML = nums +
    '<div class="sos-pos"><b>' + pos + '</b><span>' + (sp ? (S.place ? 'perto de ' + esc(S.place) + ' · ' : '') + 'km ' + km + ' rodados' : 'km ' + km + ' da etapa ' + esc(S.stage.name.replace(/^E\S+ /, '')) + ' · ' + (cp ? 'perto de ' + esc(cp.name) : '')) + ' · altitude ' + ele + ' m</span><div class="acts"><button id="sosCopy">Copiar posição</button><button id="sosShare">Compartilhar</button></div></div>' +
    (sp ? '<div class="sos-card"><b>Diga ao operador</b>“Sou ciclista, sofri um acidente. Estou em ' + esc(S.place || 'São Paulo') + ', posição ' + pos + '.”</div>' : '<div class="sos-card"><b>Diga ao operador</b>“Je suis cycliste, j\'ai besoin d\'aide. Ma position : ' + pos + (cp ? ', sur la route du ' + esc(cp.name) : '') + ', altitude ' + ele + ' mètres.”</div>') +
    (d.hospital ? '<div class="sos-card"><b>Hospital mais perto</b>' + esc(d.hospital) + '</div>' : '') +
    (hotel.nome ? '<div class="sos-card"><b>Hotel de hoje</b>' + esc(hotel.nome) + '<br>' + esc(hotel.end || '') + (hotel.tel ? '<br>' + (hotel.tel.replace(/[^\d]/g, '').length >= 8 ? '<a href="tel:' + hotel.tel.split('·')[0].replace(/[^+\d]/g, '') + '">' + esc(hotel.tel) + '</a>' : esc(hotel.tel)) : '') + '</div>' : '') +
    (!sp ? sosEmergencia() : '');
  $('sosCopy').onclick = async () => { try { await navigator.clipboard.writeText(pos + ' ' + maps); voice.banner('Posição copiada', 3); } catch (e) { } };
  $('sosShare').onclick = async () => { try { if (navigator.share) await navigator.share({ title: 'Minha posição', text: 'Estou aqui: ' + pos + ' (km ' + km + ') ' + maps }); } catch (e) { } };
  if (!$('dlgSos').open) $('dlgSos').showModal();
}
function markPlace() {
  const p = S.pos || S.fix; if (!p) { voice.banner('Sem posição ainda', 2, 'o GPS ainda está fixando; tente daqui a alguns segundos'); return; }
  session.mark(S.session, 'lugar', { lat: p.lat, lon: p.lon, dist: S.proj.dist, ele: Math.round(track.elevationAt(S.stage, S.proj.dist)) });
  voice.banner('Lugar marcado', 3, 'km ' + (S.proj.dist / 1000).toFixed(1).replace('.', ',') + ' · vai para o relatório e o GPX'); R.invalidate();
}
function refresh() { if (panelTimer) return; panelTimer = setTimeout(() => { panelTimer = null; try { ui.panel(S); if (S.free) free.panel($); if (S.tab === 'parado') ui.paradoPanel(S); document.querySelectorAll('#paradoBody [data-fuel], #fExtra [data-fuel]').forEach(b => b.onclick = () => confirmFuel(b.dataset.fuel)); const bk = $('btnKnow'); if (bk) bk.hidden = !(S.off && (S.proj.off || 0) < 5000 && !muted() && S.session.state === 'running'); if (!S.mapMode) drawFita($('fitaCv'), S.stage, S.proj.dist || 0, S.theme, { paradas: S.paradas }); } catch (e) { console.error(e); } const h = $('panel').offsetHeight + 8; if (h !== S.scaleBottom) { measurePanel(); R.invalidate(); } }, 120); }
function size3d() { if (!rider3d) return; const c = $('rider3d'); rider3d.resize(c.clientWidth, c.clientHeight, Math.min(window.devicePixelRatio || 1, 2)); }
let riderFrame = -1, lastGlide = 0;
function headingRot() { if (S.rotLock) return R.view.rot; return (R.view.mode !== '2d' || S.prefs.orientation === 'heading') ? -S.pos.head : 0; }
// espelha a vista do renderer na câmera do chão do MapLibre. O renderer continua sendo quem decide
// centro, zoom e rumo (modelo de movimento, gestos, animações, recentrar); aqui a base só copia o
// resultado. Chamado uma vez por quadro no loop principal, sem depender de GPS rodando ou de animação
// em curso — são só esses dois que descolariam o chão da vista se o espelhamento ficasse pendurado
// neles. Guarda a última vista já espelhada e só mexe no MapLibre quando algo mudou de verdade.
let ultimaVistaChao = null;
function espelharChao() {
  if (!basemap.ativo()) return;
  const v = R.view, lat = R.centerLatLon ? R.centerLatLon() : (S.pos || S.fix);
  if (!lat) return;
  const u = ultimaVistaChao;
  if (u && Math.abs(u.lat - lat.lat) < 1e-6 && Math.abs(u.lon - lat.lon) < 1e-6 &&
      Math.abs(u.z - v.z) < 0.002 && Math.abs(u.rot - v.rot) < 2e-4 &&
      // 0,005 e não 0,5: a âncora inteira vive entre 0,2 e 0,6, então meio ponto é maior que a
      // faixa toda e uma troca só de âncora (resumo↔completo, 2D↔3ª) nunca chegaria ao chão
      Math.abs((u.anchorY || 0) - (v.anchorY || 0)) < 0.005) return;
  ultimaVistaChao = { lat: lat.lat, lon: lat.lon, z: v.z, rot: v.rot, anchorY: v.anchorY };
  basemap.camera({ lat: lat.lat, lon: lat.lon, zoom: v.z, rumoRad: v.rot, ancoraY: v.anchorY });
}
function snapView() { R.centerOn(S.pos.lat, S.pos.lon); R.setView(null, null, null, headingRot()); espelharChao(); R.invalidate(); }
// Posição mostrada (S.pos) desliza até a posição prevista: na estrada, avança pela geometria do traçado à velocidade do
// último fix (extrapolação até 1,5 s; com GPS perdido, até 45 s como o Waze num túnel); fora dela, em linha reta.
// Rumo pela geometria da via 15 m à frente (estável), ou pelo GPS fora da rota. Constantes de tempo: posição 0,25 s,
// rumo 0,35 s, zoom 1,2 s. ~30 qps em 2D, 20 com relevo + satélite; parado, nada é redesenhado.
function glide(ts) {
  const T = S.viewTarget; if (!T || !S.pos || !gps.running() || R.animating()) return;
  const now = Date.now(), age = (now - T.t) / 1000;
  const minGap = (R.view.mode !== '2d' && R.view.sat) ? 50 : 33; if (ts - lastGlide < minGap) return;
  const dt = Math.min(0.1, lastGlide ? (ts - lastGlide) / 1000 : 0.033); lastGlide = ts;
  let lat, lon, head, dist = T.dist;
  const lost = age > 4;
  if (lost && !(T.on && T.v > 2 && age < 45)) { if (lost && S.gpsMsg === 'GPS ligado' && gps.running() && T.v > 0.5) { S.gpsMsg = 'GPS perdido · estimando'; refresh(); voice.banner('GPS perdido', 2, 'estimando pela rota', '<span class="pill">~</span>', 0, 'gps'); } if (age > 45) return; }
  const ahead = T.v < 0.5 ? 0 : T.v * Math.min(lost ? 45 : 1.5, age);
  if (T.on) { dist = Math.min(S.stage.total, T.dist + ahead); const p = track.pointAt(S.stage, dist); lat = p[0]; lon = p[1]; head = track.bearingAt(S.stage, Math.min(S.stage.total, dist + 15)) * Math.PI / 180; }
  else { lat = T.lat + ahead * Math.cos(T.head) / 111320; lon = T.lon + ahead * Math.sin(T.head) / (111320 * Math.cos(T.lat * Math.PI / 180)); head = T.head; const ch = T.v < 1.2 ? compass.heading() : null; if (ch != null) head = ch * Math.PI / 180; }
  const kp = 1 - Math.exp(-dt / 0.25), kh = 1 - Math.exp(-dt / 0.35), P = S.pos;
  let dh = head - P.head; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  const dlat = lat - P.lat, dlon = lon - P.lon;
  let moved = false;
  if (Math.abs(dlat) > 1e-8 || Math.abs(dlon) > 1e-8) { P.lat += dlat * kp; P.lon += dlon * kp; moved = true; }
  if (Math.abs(dh) > 2e-4) { P.head += dh * kh; P.head = Math.atan2(Math.sin(P.head), Math.cos(P.head)); moved = true; }
  P.dist = dist;
  if (S.follow) {
    const v = R.view; if (moved) { v.cx = mercX(P.lon); v.cy = mercY(P.lat); v.rot = headingRot(); }
    if (S.zoomTarget != null && Math.abs(S.zoomTarget - v.z) > 0.005) { v.z += (S.zoomTarget - v.z) * (1 - Math.exp(-dt / 1.2)); moved = true; }
  }
  if (moved) R.invalidate();
}
const PERF = { n: 0, ms: 0, last: 0, el: null };
function perfHud(ts, ms) {
  if (!/[?&]hud=1/.test(location.search)) return;   // medidor de desempenho só com ?hud=1
  PERF.n++; PERF.ms += ms;
  if (ts - PERF.last < 500) return; PERF.last = ts;
  if (!PERF.el) { PERF.el = document.createElement('div'); PERF.el.id = 'perf'; PERF.el.style.cssText = 'position:fixed;left:8px;top:64px;z-index:50;font:600 12px/1.3 monospace;background:rgba(23,25,28,.8);color:#FFE500;padding:4px 6px;border-radius:4px;pointer-events:none;white-space:pre'; document.body.appendChild(PERF.el); }
  const st = R.stats(), mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) + ' MB' : '';
  if (S.cam3d && t3d) { const g = t3d.getStats(); PERF.el.textContent = Math.round(PERF.n * 2) + ' qps · 3D ' + g.ms + ' ms (+' + g.upd + ' prep) · ' + g.icons + ' ícones · ' + g.tri + ' tri · ' + g.calls + ' calls · dpr ' + g.dpr + ' · buracos ' + g.holes + ' · sat faltando ' + g.miss + ' ' + mem; PERF.n = 0; PERF.ms = 0; return; }
  const nb = native.status(); const ntxt = nb ? ' · baro ' + (nb.alt == null ? '–' : Math.round(nb.alt) + ' m/' + (nb.grade == null ? '–' : nb.grade.toFixed(1) + ' %')) + ' lux ' + (nb.lux == null ? '–' : Math.round(nb.lux)) + ' th ' + nb.thermal : '';
  PERF.el.textContent = Math.round(PERF.n * 2) + ' qps · draw ' + (PERF.ms / PERF.n).toFixed(1) + ' ms · base ' + st.baseCount + ' (' + st.base + 'px) · dpr ' + st.dpr + ' · ' + R.view.mode + (R.view.sat ? '+sat' : '') + ' z' + R.view.z.toFixed(1) + ' ' + mem + ntxt;
  PERF.n = 0; PERF.ms = 0;
}
function loop(ts) {
  if (S.cinema) { requestAnimationFrame(loop); return; }   // no Cinema a página está invisível: não desenhar mapa nem 3D (bateria, térmico, codificador)
  try {
  glide(ts);
  // espelha o chão vetorial na vista do canvas sempre, independente de GPS rodando ou de animação em
  // curso (R.animateTo do recentrar, por exemplo) — glide() e snapView() já mudam R.view antes disto,
  // e bindGestures (arrasto/pinça) muda R.view direto, então aqui é o único ponto que precisa cobrir
  // todos os casos.
  espelharChao();
  if (S.cam3d && t3d) {
    if (!t3d.isReady()) { voice.banner('3D indisponível neste aparelho', 2, 'toque em 3ª para tentar de novo'); setCam('2d'); }
    else { const hot = S.native && native.thermal() >= 2; if (hot !== !!loop._hot) { loop._hot = hot; if (t3d) t3d.setSat(!hot && !!S.prefs.sat); } if (ts - (loop._t3d || 0) >= (hot ? 33 : 15.5)) { loop._t3d = ts; const t0 = performance.now(); t3d.update(S, ts); perfHud(ts, performance.now() - t0); } requestAnimationFrame(loop); return; }   // 3D: no máximo 60 qps (a tela do S23 é 120 Hz)
  }
  if (ts - (loop._t2d || 0) < 15.5) { requestAnimationFrame(loop); return; } loop._t2d = ts;   // 2D também no máximo 60 qps (tela de 120 Hz)
  const t0 = performance.now(); R.draw(S); perfHud(ts, performance.now() - t0);
  // pedalada: 4 quadros por volta, cadência que acompanha a velocidade; parado, quadro fixo
  const v = S.fix ? (S.fix.v || 0) : 0, moving = v > 0.8 && gps.running();
  const f = moving ? Math.floor(ts / (60000 / Math.min(95, 60 + v * 3) / 4)) % 4 : 0;
  if (rider3d && rider3d.isReady()) { if (R.riderMoved()) R.drawRider(0); rider3d.render(R.riderInfo(), moving ? v : 0, ts, S.sensors && S.sensors.cad); }   // U5: a cadencia real do sensor manda na pedalada; sem sensor, a derivada da velocidade
  else if (f !== riderFrame || R.riderMoved()) { riderFrame = f; R.drawRider(f); }
  } catch (e) { if (window.__errs) window.__errs.push('loop: ' + (e && e.message)); if (!loop._err) { loop._err = 1; console.error(e); } }   // um erro num quadro não pode matar o loop
  requestAnimationFrame(loop);
}

function toggleSim() { if (gps.simulating()) { stopNavigation(); const k = store.get('sim:on', null); if (k) { store.clearStage(k); store.del('sim:on'); selectStage(k); } return; } startSim(22, S.proj.dist); }
function startSim(kmh, from) {
  stopNavigation(); if (S.session.state === 'idle') { session.start(S.session, Date.now()); if (S.native) music.onStart(); } else if (S.session.state === 'paused') session.resume(S.session, Date.now());
  store.set('sim:on', S.stage.key);
  S.follow = true; $('btnFollow').classList.add('on'); R.setView(null, null, 19); S.gpsMsg = ''; devTag('sim');
  gps.simulate(S.stage, kmh, onFix, from, d => track.gradeAt(S.stage, d, 150));
}
// ---- Largada (mundo Transmissão, 07/09/2026): o dia numa tela, um botão
function largadaInit() {
  const L = $('largada'); if (!L) return;
  const q = new URLSearchParams(location.search);
  const skip = q.get('sim') || q.get('mode') || q.get('preview') || q.get('to') || q.get('vias') || q.get('nolargada')
    || emMoldura()   // dentro do guia, o guia ja e a tela inicial: uma barra de navegacao por tela
    || (S.session && S.session.state !== 'idle');
  $('lgGo').onclick = () => { L.hidden = true; document.body.classList.remove('largada'); S.quiet = false; measureMask(); R.invalidate(); if (!S.free && !S.diario && !store.get('brief:' + S.stage.key, false)) showBriefingOnce(); };
  $('lgAjustes').onclick = () => ajustes.abrir();
  $('lgEtapas').onclick = () => { if (S.free || S.diario) { showPreview('trip'); return; } etapas.abrir(); };
  $('lgGuia').onclick = () => { const g = $('btnGuide'); if (g && !g.hidden) g.click(); else showPreview(S.stage.key); };
  const sw = $('lgSwitch'), destino = (S.free || S.diario) ? 'nav' : 'sp';
  // achado 2 (tarefa 3): a travessia vai no próprio endereço (?mundo=), não mais no sessionStorage — assim funciona
  // mesmo onde o armazenamento está bloqueado ou lança. O bloco que força por ?mundo= em decidirMundo já converge
  // para este destino sozinho; a página de chegada só precisa achar o parâmetro.
  if (destino === 'nav') { sw.textContent = 'Viagem'; sw.href = enderecoMundo('nav'); } else { sw.textContent = 'Diário · SP'; sw.href = enderecoMundo('sp'); }
  // achado 4 (decisão do Pedro): a porta do rodapé vale só desta vez — leva ao outro mundo agora, sem gravar
  // preferência; o automático continua armado e decide de novo na próxima abertura. A escolha permanente mora
  // em Ajustes › Aparelho › Mundo. achado 5: enquanto ?mundo= seguir na URL (por exemplo numa recarga da página),
  // o mundo atravessado se mantém; assim que sair da URL, o automático volta a valer sozinho.
  if (window !== window.parent) sw.onclick = e => { e.preventDefault(); try { parent.postMessage({ etape: 'switch', to: S.free || S.diario ? 'nav' : 'sp' }, '*'); } catch (x) { } };   // dentro do guia, quem navega é o guia
  largadaRender();
  if (skip) { L.hidden = true; return; }
  L.hidden = false; document.body.classList.add('largada'); S.quiet = true; requestAnimationFrame(() => requestAnimationFrame(() => { L.classList.add('ready'); measureMask(); R.invalidate(); }));
  if (entrada.precisaPrimeira()) setTimeout(() => entrada.abrirPrimeira(), 400);   // a Primeira vez pousa sobre a Largada já montada
  setTimeout(() => { measureMask(); R.invalidate(); }, 800);   // os blocos entram escalonados; a máscara final é depois da última transição
}
function largadaRender() {
  const L = $('largada'); if (!L || !S.stage) return;
  const st = S.stage, key = st.key, d = (S.routes.days || {})[key] || {}, dia = String((S.allParadas && S.allParadas.dias ? S.allParadas.dias[key] : '') || d.dia || '').trim();
  const keys = Object.keys(S.routes.stages).filter(k => k !== '4b'), idx = keys.indexOf(key);
  if (S.free || S.diario) {
    const last = store.get('lastdest:sp', null);
    $('lgK').innerHTML = 'Diário · São Paulo<small>' + new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) + '</small>';
    $('lgName').innerHTML = 'Para<br><i>onde</i><br>hoje?';
    $('lgS').innerHTML = last ? 'Último trajeto · <b>' + esc(last.name) + '</b>' : 'Escolha o destino ou navegue livre; a hora cheia lembra água e comida.';
    $('lgRow').innerHTML = '';
    $('lgGoSub').textContent = last ? esc(last.name) : 'DESTINO OU LIVRE';
    $('lgEtapas').textContent = 'Lugares'; $('lgGuia').textContent = 'Filmes';
  } else {
    const full = st.name.replace(/^E\S+ /, ''), parts = full.split('→').map(x => x.trim()), mid = parts.length > 2 ? parts.slice(1, -1).join(' · ') : (st.climbs && st.climbs.length ? st.climbs.slice().sort((x, y) => y.gain - x.gain)[0].name : '');
    $('lgK').innerHTML = 'Viagem · dia ' + (idx + 1) + ' de ' + keys.length + '<small>' + esc(dia) + (d.sol ? ' · sol ' + esc(d.sol) : '') + '</small>';
    $('lgName').innerHTML = esc(parts[0]) + '<br><i>' + esc(mid || parts[parts.length - 1]) + '</i>' + (mid ? '<br>' + esc(parts[parts.length - 1]) : '');
    $('lgS').innerHTML = (d.tipo ? 'Etapa ' + esc(d.tipo) + ' · ' : '') + (d.sub ? esc(d.sub) : '') + (d.saida ? ' · saída ' + esc(d.saida) : '') + (d.chegada ? ', chegada prevista ' + esc(d.chegada) : '');
    $('lgRow').innerHTML = '<div><b>' + String(st.km).replace('.', ',') + '<small>KM</small></b><span>distância</span></div><div><b>' + Math.round(st.up).toLocaleString('pt-BR') + '<small>M</small></b><span>subida</span></div><div><b>' + (st.climbs ? st.climbs.length : 0) + '</b><span>' + (st.climbs && st.climbs.length === 1 ? 'col' : 'cols') + '</span></div>';
    $('lgGoSub').textContent = 'ETAPA ' + key + (store.get('brief:' + key, false) ? '' : ' · PRÉVIA ANTES DE PARTIR');
  }
  const t = $('lgTerr'); if (t && !t.style.backgroundImage) t.style.backgroundImage = 'none';
}
function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function showBriefingOnce() { if (!store.get('brief:' + S.stage.key, false)) { store.set('brief:' + S.stage.key, true); showPreview(S.stage.key); } }
function showBriefing() { if (S.free) { voice.banner('Sem prévia no modo livre', 3, 'o percurso nasce com o pedal'); return; } showPreview(S.stage.key); }
// prévia do dia: mapa inteiro, perfil, cronograma, paradas, compras, hospedagem; ou a viagem inteira
let PV = null;
function showPreview(key) {
  const dlg = $('dlgPreview'), tabs = $('pvTabs');
  const keys = Object.keys(S.routes.stages);
  tabs.innerHTML = keys.map(k => `<button data-k="${k}" class="m-${(S.routes.types || {})[k] || 'blanc'}${k === key ? ' on' : ''}">${code(k)}</button>`).join('') + '<button data-k="trip" class="trip' + (key === 'trip' ? ' on' : '') + '">Viagem</button>';
  tabs.querySelectorAll('button').forEach(b => b.onclick = () => showPreview(b.dataset.k));
  if (key === 'trip') {
    $('pvBody').innerHTML = ui.tripHtml(S.routes, report.list());
    $('pvBody').querySelectorAll('li[data-k]').forEach(li => li.onclick = () => showPreview(li.dataset.k));
    $('pvGo').hidden = true;
  } else {
    const st = key === S.stage.key ? S.stage : track.loadStage(S.routes, key);
    const paradas = S.allParadas.itens.filter(p => p.stage === key);
    const b = guide.briefing(st, S.allParadas.itens, S.allParadas.dias, S.allParadas.regras);
    $('pvBody').innerHTML = ui.previewHtml(st, (S.routes.days || {})[key], b, paradas);
    { const d = (S.routes.days || {})[key] || {}, hh = s => { const m = /(\d+)h/.exec(s || ''); return m ? +m[1] : null; };
      const wxEl = $('pvWx'); const render = w => { if (wxEl) wxEl.innerHTML = weather.html(weather.summary(w, st, hh(d.saida), hh(d.chegada)), key); };
      render(weather.cached(key)); weather.fetchStage(st, key).then(w => { if (w) render(w); }); }
    $('pvGo').hidden = false; $('pvGo').onclick = () => { dlg.close(); if (key !== S.stage.key) selectStage(key); };
    if (!dlg.open) dlg.showModal();            // o canvas só tem tamanho com o diálogo aberto
    // mapa inteiro, norte para cima, ajustado ao traçado
    const cv = $('pvMap'); const R2 = createRenderer(cv); R2.setTheme(S.theme); R2.resize();
    const bb = st.pts.reduce((a, p) => [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])], [90, 180, -90, -180]);
    const { W, H } = R2.size(); const dx = mercX(bb[3]) - mercX(bb[1]), dy = mercY(bb[0]) - mercY(bb[2]);
    const z = Math.log2(Math.min((W - 40) / Math.max(dx, 1e-9), (H - 40) / Math.max(dy, 1e-9)) / 256);
    R2.setView((mercX(bb[1]) + mercX(bb[3])) / 2, (mercY(bb[0]) + mercY(bb[2])) / 2, Math.min(15, z), 0); R2.view.anchorY = 0.5;
    const S2 = { map: S.map, routes: S.routes, stage: st, paradas, proj: { idx: 0, dist: 0, off: 0 }, fix: null, scaleBottom: 8, mode: 'full', showStart: false };
    PV = { R2, S2 }; requestAnimationFrame(() => { R2.invalidate(); R2.draw(S2); });
    // maquete 3D da etapa (relevo real); sem DEM/WebGL fica o mapa plano
    const dioBox = $('pvBody').querySelector('.dio'), ctl = dioBox.querySelector('.dio-ctl');
    const showView = v => { ctl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); $('pvDio').hidden = v === 'map'; $('pvMap').hidden = v !== 'map'; if (v === 'map') { R2.resize(); R2.invalidate(); R2.draw(S2); if (diorama) diorama.stop(); } else if (diorama) { diorama.setSat(v === 'sat'); } };
    ctl.querySelectorAll('button').forEach(b => b.onclick = () => showView(b.dataset.v));
    const hint = dioBox.querySelector('.dio-hint');
    if (dem.available()) import('./diorama.js').then(m => { diorama = m; return m.build($('pvDio'), st, paradas, key).then(okd => { if (!okd) { showView('map'); ctl.hidden = true; } else { hint.textContent = 'arraste para girar · toque duplo liga o giro'; if (key === S.stage.key && S.proj && S.proj.dist > 0) diorama.setProgress(S.proj.dist); } }); });
    else { showView('map'); ctl.hidden = true; }
    import('./render.js').then(m => m.drawProfile($('pvProf'), st, 0, S.theme, { labels: true, paradas }));
  }
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
}
// tela 04 · Chegada: ritual antes do relatório; voz com o lugar e a diferença para o plano
function showArrival(r) {
  const all = report.list(), st = report.standings(all), ec = S.ecart;
  const prev = r.diario && r.dest ? Object.values(all).filter(x => x && x.diario && x.dest === r.dest && x.stageKey !== r.stageKey).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0] : null;
  const stage = S.stage;
  $('arrBody').innerHTML = ui.arrivalHtml(r, S, st, ec, prev, report.maillotSvg);
  $('arrReport').onclick = () => { $('dlgArrive').close(); showReport(r); };
  const vp = r.vsPlan, dest = r.dest || String(r.name).replace(/^E\S+ /, '').split('→').pop().split('·')[0].trim();
  voice.say('Chegada em ' + dest + (vp == null ? '.' : vp < 0 ? ', ' + Math.abs(vp) + ' minutos adiantado.' : vp > 0 ? ', ' + vp + ' minutos atrasado.' : ', na hora.'), 2);
  voice.vibrate(2);
  if (!$('dlgArrive').open) $('dlgArrive').showModal();   // a chegada pode disparar sozinha com outro dialogo aberto
  $('dlgArrive').scrollTop = 0;
  requestAnimationFrame(() => { try { drawFita($('arrProf'), stage, stage.total, S.theme, { paradas: S.paradas, arrived: true }); } catch (e) { } });
}
function showReport(r) {
  if (!r) { voice.banner('Ainda não há relatório', 3, 'ele nasce quando você encerra a saída'); return; }
  $('repBody').innerHTML = report.render(r, report.list());
  const sh = report.share(r, S.log);
  $('repShare').onclick = async () => { try { if (navigator.share) await navigator.share({ title: r.name, text: sh.text }); else { await navigator.clipboard.writeText(sh.text); voice.banner('Resumo copiado', 3); } } catch (e) { } };
  $('repGpx').onclick = () => { if (S.native) { const okg = native.saveGpx('etape-' + r.stageKey + '.gpx', sh.gpx); voice.banner(okg ? 'GPX guardado' : 'GPX não guardado', okg ? 3 : 2, okg ? 'Download/Etape' : 'tente de novo, ou envie pelo WhatsApp'); return; } const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([sh.gpx], { type: 'application/gpx+xml' })); a.download = 'etape-' + r.stageKey + '.gpx'; a.click(); };
  if (!$('dlgReport').open) $('dlgReport').showModal();
}
// U6 Fase 3: o IndexedDB abre assincrono, e o init() le o registro da etapa logo no comeco. Abrir e migrar ANTES
// do init evita o app arrancar lendo um localStorage que a migracao acabou de esvaziar. Se o banco nao abrir em
// 3 s, pronto() desiste e tudo segue pelo localStorage, como antes.
window.addEventListener('DOMContentLoaded', async () => {
  try { await logdb.pronto(); const n = await logdb.migrar(store); if (n) console.log('registro migrado para o IndexedDB:', n, 'amostras'); }
  catch (e) { if (window.__errs) window.__errs.push('logdb: ' + (e && e.message)); }
  init();
});
