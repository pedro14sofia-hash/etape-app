// Étape Navegar · etapas.js (U2, plano 2026-09-08)
// A folha Escolher etapa, no lugar do <select> da fita. Oito etapas mais a variante do dia 4, cada uma com
// dia, tipo, distância, subida e o ponto da categoria; a de hoje em amarelo. O módulo não alcança o app.js:
// a lista chega pronta pelo contexto, e a escolha volta pelo contexto.

const MESES = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 };
const ANO = 2026;   // a viagem inteira cabe em outubro de 2026; os rótulos de dia não carregam ano

// U2 · a janela da viagem, para app.js decidir o mundo (crítica de revisão, tarefa 3). É constante de propósito:
// nav e sp são duas construções separadas, e uma decisão que precisa dar o mesmo resultado nas duas pontas não
// pode ler dados que existem só de um lado (ROUTES.days é {} em /sp/ e null em /teste/ — antes disso, mundoAuto
// lia essa lista local e só não fechava ciclo porque a do Diário estava vazia). Espelha as datas de data/bolso_data.py.
export const JANELA_VIAGEM = { inicio: new Date(2026, 9, 22, 0, 0, 0, 0), fim: new Date(2026, 9, 29, 23, 59, 59, 999) };
export function dentroDaJanela(agora) {
  const h = agora || new Date();
  return h >= JANELA_VIAGEM.inicio && h <= JANELA_VIAGEM.fim;
}

// 'Dom 25/out' → Date(2026, 9, 25). Devolve null quando o rótulo não casa.
// O JavaScript normaliza datas inválidas (como 31/fev) em silêncio; validamos aqui.
export function dataDoDia(rotulo) {
  const m = /(\d{1,2})\s*\/\s*([a-zç]{3})/i.exec(String(rotulo || ''));
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase()];
  if (mes == null) return null;
  const dia = +m[1];
  const d = new Date(ANO, mes, dia);
  // Verifica que a data construída tem o mesmo dia e mês que foram pedidos.
  // Impede que '31/fev' vire '3/mar' sem avisar.
  if (d.getMonth() !== mes || d.getDate() !== dia) return null;
  return d;
}

// Qual etapa é hoje. `dias` = { '1': 'Qui 22/out', … }. Fora da janela da viagem devolve null.
// A variante 4b divide a data com a etapa 4 e nunca é "a etapa de hoje" sozinha.
export function chaveDeHoje(dias, agora) {
  const h = agora || new Date(), y = h.getFullYear(), mo = h.getMonth(), da = h.getDate();
  for (const k in dias || {}) {
    if (k === '4b') continue;
    const d = dataDoDia(dias[k]);
    if (d && d.getFullYear() === y && d.getMonth() === mo && d.getDate() === da) return k;
  }
  return null;
}

let ctx = null, dlg = null, lista = null;
const $ = id => document.getElementById(id);

function monta() {
  lista.innerHTML = '';
  for (const it of ctx.lista()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'et-item' + (it.hoje ? ' hoje' : '');
    b.dataset.k = it.k;
    b.innerHTML = '<i class="et-p m-' + it.maillot + '"></i>'
      + '<div class="et-t"><b></b><span></span></div>'
      + '<div class="et-n"><b></b><b></b></div>';
    b.querySelector('.et-t b').textContent = it.code + ' · ' + it.nome;
    b.querySelector('.et-t span').textContent = [it.dia, it.tipo, it.hoje ? 'hoje' : ''].filter(Boolean).join(' · ');
    const n = b.querySelectorAll('.et-n b');
    n[0].innerHTML = String(it.km).replace('.', ',') + '<small>KM</small>';
    n[1].innerHTML = Math.round(it.up).toLocaleString('pt-BR') + '<small>M</small>';
    const kmLabel = String(it.km).replace('.', ',') + ' quilômetros';
    const upLabel = Math.round(it.up) + ' metros de subida';
    b.setAttribute('aria-label', it.code + ', ' + it.nome + ', ' + it.dia + (it.hoje ? ', hoje' : '') + ', ' + kmLabel + ', ' + upLabel);
    b.onclick = () => { fechar(); ctx.selecionar(it.k); };
    lista.appendChild(b);
  }
}

// item 6 da revisão final: no meio da viagem a etapa de hoje nasce fora da vista (a lista é mais alta que a
// folha). Quando existe um item 'hoje', a folha traz ele para dentro da vista em vez de sempre abrir do topo.
export function abrir() {
  if (!dlg) return; monta(); if (!dlg.open) dlg.showModal();
  const hoje = lista.querySelector('.et-item.hoje');
  if (hoje) hoje.scrollIntoView({ block: 'center' }); else dlg.scrollTop = 0;
}
export function fechar() { if (dlg && dlg.open) dlg.close(); }

export function init(estado, contexto) {
  ctx = contexto || {};
  dlg = $('dlgEtapas'); lista = $('etLista');
  if (!dlg || !lista) return;
  $('etTrip').onclick = () => { fechar(); if (ctx.verViagem) ctx.verViagem(); };
}
