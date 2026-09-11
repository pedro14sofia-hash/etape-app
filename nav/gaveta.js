// Étape Navegar · gaveta.js (U7, Tarefa 8 do plano da casca; spec 2026-09-07-interface-apps-de-fora)
// Os quatro apps de fora a um gesto: puxar da borda de cima, onde a bandeja da Samsung abriria e na tarefa fixa nada
// acontece. A gaveta é o atalho em movimento; o painel Aparelho continua sendo a consulta (rede, bateria, energia),
// e é para lá que o rodapé leva. Fora da casca ela não tem o que oferecer: native.apps() devolve vazio e ela some.
import * as native from './native.js';
import * as voice from './voice.js';

let S = null, el = null, borda = null, aberta = false, ctx = null;
const $ = id => document.getElementById(id);
const ROTULO = { music: 'Música', organic: 'Mapa reserva', maps: 'Google Maps', meteo: 'Radar' };

export function init(state, contexto) {
  S = state; ctx = contexto || {};
  el = $('gaveta'); borda = $('gvBorda'); if (!el || !borda) return;
  render();
  // arrasto a partir dos primeiros 24 px: acompanha o dedo e decide em 12 px. Não é um toque: um toque na borda de
  // cima acontece sem querer o tempo todo com a mão no guidão, e abrir a gaveta ali seria tapar o mapa numa curva.
  let y0 = null;
  borda.addEventListener('pointerdown', e => { if (bloqueada()) return; y0 = e.clientY; try { borda.setPointerCapture(e.pointerId); } catch (err) { } });
  borda.addEventListener('pointermove', e => { if (y0 == null) return; if (e.clientY - y0 > 12) { abrir(); y0 = null; } });
  borda.addEventListener('pointerup', () => { y0 = null; });
  borda.addEventListener('pointercancel', () => { y0 = null; });
  el.addEventListener('click', e => { if (e.target === el) fechar(); });   // tocar fora da folha fecha
  const mais = $('gvAparelho');
  if (mais) mais.onclick = () => { fechar(); if (ctx.abrirAparelho) ctx.abrirAparelho(); };
}

// não abre com app de fora na frente (a nossa tela não existe ali) nem no Cinema (a tela é a imagem)
function bloqueada() { return !!(S && S.cinema) || !!native.awayApp(); }

export function estaAberta() { return aberta; }
export function abrir() { if (bloqueada() || aberta || !el) return; render(); aberta = true; el.classList.add('on'); el.setAttribute('aria-hidden', 'false'); }
export function fechar() { if (!aberta || !el) return; aberta = false; el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); }

// o cartão diz o que vai acontecer ANTES de sair do Étape: o que volta sozinho, o que serve sem rede, o que falta
function estado(a) {
  if (!a.installed) return 'ainda não está instalado';
  if (a.id === 'meteo') return navigator.onLine ? 'pede dados · volta em ' + (a.returnMin || 2) + ' min' : 'sem rede agora';
  if (a.returnMin > 0) return 'volta sozinho em ' + a.returnMin + ' min';
  return 'pronto sem rede · volta pela aba';
}

function render() {
  const alvo = $('gvApps'); if (!alvo) return;
  alvo.innerHTML = '';
  const apps = native.apps();
  if (el) el.hidden = !apps.length;   // sem casca não há app de fora: a gaveta não existe, e a borda não engana o dedo
  if (borda) borda.hidden = !apps.length;
  for (const a of apps) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = '<b></b><span></span>';
    b.querySelector('b').textContent = ROTULO[a.id] || a.name || a.id;
    b.querySelector('span').textContent = estado(a);
    if (!a.installed) b.disabled = true;
    else b.onclick = () => { fechar(); const r = ctx.abrirApp ? ctx.abrirApp(a.id) : 'sem contexto'; if (r !== 'ok') voice.banner('Não abriu: ' + r, 2); };
    alvo.appendChild(b);
  }
}
