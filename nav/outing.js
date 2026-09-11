// Étape Navegar · outing.js
// "Antes de sair": o que acompanhar nesta saída. Cada métrica é uma linha com liga-desliga, meta (por hora ou por saída),
// dose e passo. Água e carboidrato continuam no motor de abastecimento (fuel.js); sódio, cafeína e as métricas que o Pedro
// criar entram como "extras": contam, lembram (se forem por hora) e aparecem na folha Abastecer. A escolha fica guardada
// por modo: o Diário lembra a última; a viagem parte do plano do guia para o tipo da etapa.
import * as store from './store.js';

const BASE = [
  { id: 'water', name: 'Água', unit: 'ml', perHour: true, target: 500, dose: 150, step: 50, on: true, hint: 'gole de {dose} {unit} a cada {every} min' },
  { id: 'carbs', name: 'Carboidrato', unit: 'g', perHour: true, target: 60, dose: 30, step: 5, on: true, hint: 'mordida de {dose} {unit} a cada {every} min' },
  { id: 'sodium', name: 'Sódio', unit: 'mg', perHour: true, target: 500, dose: 200, step: 50, on: false, hint: 'conta junto com a água e a comida' },
  { id: 'caffeine', name: 'Cafeína', unit: 'mg', perHour: false, target: 100, dose: 50, step: 25, on: false, hint: 'por saída, não por hora' }
];
export function defaults(mode, plan) {
  const list = BASE.map(m => ({ ...m }));
  if (mode === 'viagem' && plan) {   // metas do guia para o tipo da etapa (montanha 600 ml/h, 70 g/h…)
    const w = list[0], c = list[1], s = list[2];
    w.target = plan.waterPerHour; w.dose = plan.sipMl; c.target = plan.carbsPerHour; c.dose = plan.biteG; s.target = plan.sodiumPerHour;
  }
  return list;
}
export function load(mode, plan) {
  const saved = store.get('metrics:' + mode, null);
  if (!saved) return defaults(mode, plan);
  const def = defaults(mode, plan);
  // métricas novas do padrão entram; as guardadas mantêm liga/desliga e metas
  const out = def.map(d => { const s = saved.find(x => x.id === d.id); return s ? { ...d, ...s } : d; });
  for (const s of saved) if (!def.find(d => d.id === s.id)) out.push(s);
  return out;
}
export function save(mode, list) { store.set('metrics:' + mode, list); }
export function everyMin(m) { return m.perHour && m.target > 0 ? Math.max(5, Math.round(60 * m.dose / m.target)) : null; }
// aplica ao plano de abastecimento (muta): metas, doses, intervalos, o que está desligado e os extras
export function apply(plan, list) {
  const by = id => list.find(m => m.id === id) || {};
  const w = by('water'), c = by('carbs'), s = by('sodium');
  plan.off = { water: !w.on, carbs: !c.on, sodium: !s.on };
  if (w.on) { plan.waterPerHour = w.target; plan.sipMl = w.dose; plan.drinkEveryMin = everyMin(w); }
  if (c.on) { plan.carbsPerHour = c.target; plan.biteG = c.dose; plan.eatEveryMin = everyMin(c); }
  if (s.on) plan.sodiumPerHour = s.target;
  plan.extras = list.filter(m => m.on && !['water', 'carbs', 'sodium'].includes(m.id)).map(m => ({ ...m, everyMin: everyMin(m) }));
  plan.tracking = list.some(m => m.on);
  return plan;
}
export function summary(list) { const n = list.filter(m => m.on).length; return n ? 'com ' + n + (n === 1 ? ' métrica' : ' métricas') : 'sem acompanhamento'; }

// ---- folha: linhas com liga-desliga, meta com − e +, e "outra métrica"
const fmtN = x => String(x).replace('.', ',');
export function html(list) {
  return list.map((m, i) => {
    const every = everyMin(m), hint = (m.hint || (m.perHour ? 'por hora' : 'por saída')).replace('{dose}', fmtN(m.dose)).replace('{unit}', m.unit).replace('{every}', every || '–');
    return `<div class="met${m.on ? '' : ' off'}" data-i="${i}"><button class="tg${m.on ? ' on' : ''}" data-tg="${i}" aria-label="${m.on ? 'Desligar' : 'Ligar'} ${esc(m.name)}"><i></i></button><div class="mt"><b>${esc(m.name)}</b><span>${esc(hint)}</span></div><div class="step"><button data-st="${i}" data-d="-1" aria-label="Menos">−</button><b>${fmtN(m.target)} ${esc(m.unit)}${m.perHour ? '/h' : ''}</b><button data-st="${i}" data-d="1" aria-label="Mais">+</button></div></div>`;
  }).join('') + `<div class="met add" id="metAdd"><div class="mt"><b>+ Outra métrica</b><span>nome, unidade, meta e se é por hora; fica guardada para as próximas saídas</span></div></div>
  <form class="met-form" id="metForm" hidden><input id="mfName" placeholder="Nome (ex.: Gel)" maxlength="18" required><input id="mfUnit" placeholder="Unidade" maxlength="6" required><input id="mfTarget" type="number" min="1" step="1" placeholder="Meta" required><input id="mfDose" type="number" min="1" step="1" placeholder="Dose" required><label><input id="mfHour" type="checkbox" checked> por hora</label><button type="submit">Guardar</button></form>`;
}
export function bind(el, list, onChange) {
  el.querySelectorAll('[data-tg]').forEach(b => b.onclick = () => { const m = list[+b.dataset.tg]; m.on = !m.on; onChange(); });
  el.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { const m = list[+b.dataset.st]; if (!m.on) { m.on = true; } m.target = Math.max(m.step, m.target + m.step * +b.dataset.d); onChange(); });
  const add = el.querySelector('#metAdd'), form = el.querySelector('#metForm');
  if (add && form) {
    add.onclick = () => { form.hidden = !form.hidden; if (!form.hidden) form.querySelector('#mfName').focus(); };
    form.onsubmit = e => { e.preventDefault(); const name = form.querySelector('#mfName').value.trim(), unit = form.querySelector('#mfUnit').value.trim(), target = +form.querySelector('#mfTarget').value, dose = +form.querySelector('#mfDose').value, perHour = form.querySelector('#mfHour').checked; if (!name || !unit || !(target > 0) || !(dose > 0)) return; list.push({ id: 'x' + Date.now().toString(36), name, unit, perHour, target, dose, step: Math.max(1, Math.round(dose / 2)), on: true }); onChange(); };
  }
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
