// Étape Navegar · fuel.js
// Abastecimento: avisos de beber e comer pelo tempo em movimento e pelo plano da etapa.
import * as store from './store.js';

export function plan(stage) {
  const mtn = stage.type === 'pois', long = stage.type === 'jaune';
  return { carbsPerHour: mtn ? 70 : long ? 65 : 60, waterPerHour: mtn ? 600 : 500, sodiumPerHour: mtn ? 600 : 500, drinkEveryMin: mtn ? 12 : 15, eatEveryMin: mtn ? 25 : 30, bottleMl: 750, bottles: 2, sipMl: 150, biteG: 30 };
}
export function create(stageKey) {
  return store.fuel(stageKey) || { stageKey, water: 0, carbs: 0, sodium: 0, lastDrink: 0, lastEat: 0, snoozed: { drink: 0, eat: 0 }, events: [], bottleLeft: 1500 };
}
// tick por tempo em movimento (s); devolve eventos
export function tick(f, p, movingSec, now, ctx) {
  const ev = [];
  if (movingSec < 60) return ev;
  const sinceDrink = (movingSec - f.lastDrink) / 60, sinceEat = (movingSec - f.lastEat) / 60;
  if (sinceDrink >= p.drinkEveryMin + f.snoozed.drink && (!f._dAt || now - f._dAt > 120000)) { f._dAt = now; f._dRep = (f._dRep || 0) + 1; if (f._dRep > 2) { f.snoozed.drink += p.drinkEveryMin; f._dRep = 0; } else ev.push({ kind: 'drink', level: 2, text: 'Beber', sub: Math.round(sinceDrink) + ' min sem beber · ' + Math.round(p.sipMl) + ' ml', speak: 'Hora de beber.' }); }
  if (sinceEat >= p.eatEveryMin + f.snoozed.eat && (!f._eAt || now - f._eAt > 180000)) { f._eAt = now; f._eRep = (f._eRep || 0) + 1; if (f._eRep > 2) { f.snoozed.eat += p.eatEveryMin; f._eRep = 0; } else ev.push({ kind: 'eat', level: 2, text: 'Comer ' + p.biteG + ' g', sub: Math.round(sinceEat) + ' min sem comer', speak: 'Hora de comer.' }); }
  // atrasado: ingestão 20 % abaixo do plano na hora corrida
  const hours = movingSec / 3600, planW = p.waterPerHour * hours, planC = p.carbsPerHour * hours;
  if (!f.events.length) return ev;                 // sem confirmação nenhuma, não cobra atraso nem garrafa
  if (hours > 1 && f.water < planW * 0.8 && (!f._bAt || now - f._bAt > 900000)) { f._bAt = now; ev.push({ kind: 'behind', level: 1, text: 'Água atrasada', sub: Math.round(f.water / 1000 * 10) / 10 + ' L de ' + Math.round(planW / 100) / 10 + ' L do plano', speak: 'Você está bebendo menos que o plano.' }); }
  if (ctx && ctx.waterAhead && f.bottleLeft < 0.3 * p.bottleMl * p.bottles && (!f._rAt || now - f._rAt > 600000)) { f._rAt = now; ev.push({ kind: 'refill', level: 2, text: 'Encher garrafa', sub: 'fonte a ' + Math.round(ctx.waterAhead) + ' m', speak: 'Fonte em ' + Math.round(ctx.waterAhead) + ' metros. Encha a garrafa.' }); }
  return ev;
}
export function confirm(f, p, kind, movingSec, amount) {
  f._dRep = 0; f._eRep = 0;
  if (kind === 'drink') { const ml = amount || p.sipMl; f.water += ml; f.sodium += ml * 0.4; f.bottleLeft = Math.max(0, f.bottleLeft - ml); f.lastDrink = movingSec; f.snoozed.drink = 0; }
  if (kind === 'eat') { const g = amount || p.biteG; f.carbs += g; f.sodium += 60; f.lastEat = movingSec; f.snoozed.eat = 0; }
  if (kind === 'refill') { f.bottleLeft = p.bottleMl * p.bottles; }
  f.events.push({ kind, at: Date.now(), amount });
  store.setFuel(f.stageKey, f);
}
export function snooze(f, kind, minutes = 10) { if ((f._sn = f._sn || {})[kind] >= 2) return false; f._sn[kind] = (f._sn[kind] || 0) + 1; f.snoozed[kind] += minutes; store.setFuel(f.stageKey, f); return true; }
export function status(f, p, movingSec, remKm, speedKmh) {
  const hours = movingSec / 3600, totalH = hours + (speedKmh > 3 ? remKm / speedKmh : 0);
  return { water: f.water, waterPlan: p.waterPerHour * hours, waterTotal: p.waterPerHour * Math.max(totalH, 1), carbs: f.carbs, carbsPlan: p.carbsPerHour * hours, carbsTotal: p.carbsPerHour * Math.max(totalH, 1), sodium: f.sodium, sodiumPlan: p.sodiumPerHour * hours, sodiumTotal: p.sodiumPerHour * Math.max(totalH, 1),
    nextDrinkMin: Math.max(0, Math.round(p.drinkEveryMin + f.snoozed.drink - (movingSec - f.lastDrink) / 60)), nextEatMin: Math.max(0, Math.round(p.eatEveryMin + f.snoozed.eat - (movingSec - f.lastEat) / 60)), bottles: f.bottleLeft / p.bottleMl, pct: hours > 0.5 ? Math.round((f.water / (p.waterPerHour * hours) - 1) * 100) : 0 };
}
