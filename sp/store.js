// Étape Navegar · store.js
// Estado persistente em localStorage, sempre com try/catch.
const P = 'etape:';
export function get(key, fallback) { try { const v = localStorage.getItem(P + key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } }
export function set(key, value) { try { localStorage.setItem(P + key, JSON.stringify(value)); return true; } catch (e) { return false; } }
export function del(key) { try { localStorage.removeItem(P + key); } catch (e) { } }
export function progress(stageKey) { return get('prog:' + stageKey, { done: [], sights: [], shops: [] }); }
export function setProgress(stageKey, p) { set('prog:' + stageKey, p); }
export function prefs() { return { voice: true, theme: 'auto', orientation: 'heading', autoPause: false, mode: 'full', tab: 'tele', weight: 75, ...get('prefs', {}) }; }
export function setPrefs(p) { set('prefs', p); }
export function session(stageKey) { return get('sess:' + stageKey, null); }
export function setSession(stageKey, s) { set('sess:' + stageKey, s); }
export function log(stageKey) { return get('log:' + stageKey, []); }
export function setLog(stageKey, l) { set('log:' + stageKey, l); }
export function fuel(stageKey) { return get('fuel:' + stageKey, null); }
export function setFuel(stageKey, f) { set('fuel:' + stageKey, f); }
export function reports() { return get('reports', {}); }
export function setReport(stageKey, r) { const all = reports(); all[stageKey] = r; set('reports', all); }
export function clearStage(stageKey) { for (const k of ['prog:', 'sess:', 'log:', 'fuel:']) del(k + stageKey); }
