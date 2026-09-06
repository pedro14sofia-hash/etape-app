// Étape Navegar · weather.js
// Previsão do tempo pela Open-Meteo (gratuita, sem chave) para 3 pontos da etapa (largada, meio, chegada), horária,
// guardada em localStorage para ler offline. Vento relativo ao rumo médio da etapa.
import * as store from './store.js';
const DATES = { '1': '2026-10-22', '2': '2026-10-23', '3': '2026-10-24', '4': '2026-10-25', '4b': '2026-10-25', '5': '2026-10-26', '6': '2026-10-27', '7': '2026-10-28', '8': '2026-10-29' };
const CODES = { 0: 'céu limpo', 1: 'quase limpo', 2: 'parcialmente nublado', 3: 'nublado', 45: 'nevoeiro', 48: 'nevoeiro', 51: 'garoa', 53: 'garoa', 55: 'garoa forte', 61: 'chuva fraca', 63: 'chuva', 65: 'chuva forte', 71: 'neve', 73: 'neve', 75: 'neve', 80: 'pancadas', 81: 'pancadas', 82: 'pancadas fortes', 95: 'trovoada' };
export function dateOf(key) { return DATES[key] || null; }
export function daysAhead(date) { return Math.round((new Date(date + 'T12:00:00') - Date.now()) / 86400000); }
export function availableFrom(key) { const d = dateOf(key); if (!d) return null; const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() - 15); return t; }
export function cached(key) { return store.get('wx:' + key, null); }
// busca (só online); resolve com o objeto guardado ou null
export async function fetchStage(stage, key) {
  const date = dateOf(key); if (!date || !navigator.onLine) return cached(key);
  if (daysAhead(date) > 15) return cached(key);   // a Open-Meteo prevê 16 dias; antes disso não há o que buscar
  const old = cached(key); if (old && Date.now() - old.at < 3 * 3600 * 1000) return old;
  const pts = [stage.pts[0], stage.pts[Math.floor(stage.pts.length / 2)], stage.pts[stage.pts.length - 1]];
  const q = 'latitude=' + pts.map(p => p[0].toFixed(3)).join(',') + '&longitude=' + pts.map(p => p[1].toFixed(3)).join(',') +
    '&hourly=temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_direction_10m,weather_code&timezone=Europe%2FParis&start_date=' + date + '&end_date=' + date;
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?' + q); if (!r.ok) return old;
    let j = await r.json(); if (!Array.isArray(j)) j = [j];
    const out = { at: Date.now(), date, points: j.map((x, i) => ({ name: ['largada', 'meio', 'chegada'][i], hours: x.hourly.time.map((tm, h) => ({ h: +tm.slice(11, 13), t: x.hourly.temperature_2m[h], pp: x.hourly.precipitation_probability[h], mm: x.hourly.precipitation[h], ws: x.hourly.wind_speed_10m[h], wd: x.hourly.wind_direction_10m[h], code: x.hourly.weather_code[h] })) })) };
    store.set('wx:' + key, out); return out;
  } catch (e) { return old; }
}
// rumo médio da etapa (graus) para o vento relativo
export function meanBearing(stage) {
  const a = stage.pts[0], b = stage.pts[stage.pts.length - 1];
  return (Math.atan2(Math.sin((b[1] - a[1]) * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180), Math.cos(a[0] * Math.PI / 180) * Math.sin(b[0] * Math.PI / 180) - Math.sin(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.cos((b[1] - a[1]) * Math.PI / 180)) * 180 / Math.PI + 360) % 360;
}
export function windRelative(bearing, windDir, speed) {
  // vento "de" windDir; componente contra o rumo: cos(diferença)
  const d = ((windDir - bearing) + 540) % 360 - 180, head = Math.cos(d * Math.PI / 180) * speed;
  return { head, label: Math.abs(d) < 60 ? 'de frente' : Math.abs(d) > 120 ? 'a favor' : 'de lado' };
}
const DIRS = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
export function dirLabel(deg) { return DIRS[Math.round(deg / 45) % 8]; }
// resumo do dia entre as horas de saída e chegada: por ponto, a hora mais próxima do horário previsto
export function summary(wx, stage, saidaH, chegadaH) {
  if (!wx) return null;
  const hs = [saidaH || 8, Math.round(((saidaH || 8) + (chegadaH || 16)) / 2), chegadaH || 16];
  const mb = meanBearing(stage);
  const cols = wx.points.map((p, i) => { const h = p.hours.find(x => x.h === hs[i]) || p.hours[hs[i]] || p.hours[0]; const wr = windRelative(mb, h.wd, h.ws); return { name: p.name, h: hs[i], t: h.t, pp: h.pp, mm: h.mm, ws: h.ws, wd: h.wd, dir: dirLabel(h.wd), rel: wr.label, code: h.code, desc: CODES[h.code] || '' }; });
  let day = wx.points[1].hours.filter(x => x.h >= (saidaH || 8) && x.h <= (chegadaH || 17)); if (!day.length) day = wx.points[1].hours.slice(7, 19); if (!day.length) return null;
  const ppMax = Math.max(...day.map(x => x.pp || 0)), mm = day.reduce((a, x) => a + (x.mm || 0), 0), tmin = Math.min(...day.map(x => x.t)), tmax = Math.max(...day.map(x => x.t));
  const rainAt = day.find(x => (x.pp || 0) >= 50);
  return { cols, ppMax, mm: Math.round(mm * 10) / 10, tmin, tmax, rainAt: rainAt ? rainAt.h : null, wind: cols[1].ws, windDir: cols[1].dir, windRel: cols[1].rel, hours: day, at: wx.at };
}
export function html(sm, key) {
  if (!sm) { const from = key ? availableFrom(key) : null; const soon = from && from > new Date(); return '<div class="wx none">' + (soon ? 'Previsão disponível a partir de ' + from.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ' (16 dias antes). Abra com internet na véspera.' : 'Sem previsão guardada. Abra com internet na véspera.') + '</div>'; }
  const alert = sm.ppMax >= 50 ? '<div class="wxa">Chuva provável' + (sm.rainAt != null ? ' a partir das ' + sm.rainAt + 'h' : '') + ' · ' + sm.mm + ' mm</div>' : '';
  return '<div class="wx"><div class="wxh"><span>Tempo</span><b>' + Math.round(sm.tmin) + '° a ' + Math.round(sm.tmax) + '°</b><span>chuva ' + Math.round(sm.ppMax) + ' %</span><span>vento ' + Math.round(sm.wind) + ' km/h ' + sm.windDir + ' · ' + sm.windRel + '</span></div>' + alert +
    '<div class="wxr">' + sm.cols.map(c => '<div><small>' + c.name + ' ' + c.h + 'h</small><b>' + Math.round(c.t) + '°</b><span>' + c.desc + '</span><span>' + Math.round(c.pp || 0) + ' % · ' + Math.round(c.ws) + ' km/h ' + c.dir + '</span></div>').join('') + '</div>' +
    '<div class="wxs">' + sm.hours.map(h => '<i style="height:' + Math.max(2, Math.round((h.pp || 0) / 100 * 22)) + 'px" title="' + h.h + 'h ' + Math.round(h.pp || 0) + '%"></i>').join('') + '</div><div class="wxf">' + sm.hours[0].h + 'h → ' + sm.hours[sm.hours.length - 1].h + 'h · probabilidade de chuva por hora · atualizado ' + new Date(sm.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + '</div></div>';
}
