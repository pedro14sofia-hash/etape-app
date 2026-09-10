// Étape Navegar · store.js
// Estado persistente em localStorage, sempre com try/catch.
const P = 'etape:';
export function get(key, fallback) { try { const v = localStorage.getItem(P + key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } }
let cheio = null;   // o app escuta: sem isso, o registro do dia se perdia calado
export function onFull(fn) { cheio = fn; }
function avisa(kind, detail) { try { cheio && cheio(kind, detail); } catch (e) { } }
export function set(key, value) {
  let s; try { s = JSON.stringify(value); } catch (e) { return false; }
  try { localStorage.setItem(P + key, s); return true; } catch (e) {
    const solto = liberaRegistroAntigo(key);
    if (solto) { try { localStorage.setItem(P + key, s); avisa('freed', solto); return true; } catch (e2) { } }
    avisa('full', ''); return false;
  }
}
// harden 07/09: oito dias de registro passam do teto do localStorage. Em vez de perder o pedal de hoje,
// apaga o registro da etapa mais antiga que ja virou relatorio. Perde-se o GPX dela, nunca o de agora.
function liberaRegistroAntigo(keepKey) {
  try {
    const reps = get('reports', {}), pre = P + 'log:';
    let alvo = null, quando = Infinity;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i); if (!k || k.indexOf(pre) !== 0) continue;
      const sk = k.slice(pre.length); if ('log:' + sk === keepKey) continue;
      const rep = reps[sk]; if (!rep) continue;                       // sem relatorio: ainda e o pedal de alguem
      const t = rep.finishedAt || rep.date || 0; if (t < quando) { quando = t; alvo = sk; }
    }
    if (!alvo) {
      // U6 Fase 3, ultimo recurso: se nenhum log tem relatorio, ainda assim libera o MAIS ANTIGO que nao seja o
      // de agora. O desenho e explicito — que nunca seja o pedal de hoje que se perde. Sem isto, um Encerrar que
      // falhasse num dia deixava a cota cheia e sem nada liberavel, e o proximo a estourar era o pedal em curso.
      let maisAntigo = null, menor = Infinity;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i); if (!k || k.indexOf(pre) !== 0) continue;
        const sk = k.slice(pre.length); if ('log:' + sk === keepKey) continue;
        let t = Infinity;
        try { const arr = JSON.parse(localStorage.getItem(k) || '[]'); if (arr.length && arr[0] && arr[0].t) t = arr[0].t; } catch (e) { }
        if (t < menor) { menor = t; maisAntigo = sk; }
      }
      if (!maisAntigo) return null;
      del('log:' + maisAntigo); return maisAntigo;
    }
    del('log:' + alvo); return alvo;
  } catch (e) { return null; }
}
export function del(key) { try { localStorage.removeItem(P + key); } catch (e) { } }
export function progress(stageKey) { return get('prog:' + stageKey, { done: [], sights: [], shops: [] }); }
export function setProgress(stageKey, p) { set('prog:' + stageKey, p); }
export function prefs() { return { voice: true, theme: 'auto', orientation: 'heading', autoPause: false, mode: 'full', tab: 'tele', weight: 75, screen: 'sempre', mundo: 'auto', chao: 'estudio', chaoMotor: 'gl', brilhoAuto: true, vozMusica: 'pausa', cineMode: 'nitidez', cineLook: 1, cineCadencia: '30', previewLook: true, hrTrigger: 165, music: {}, playlists: {}, ...get('prefs', {}) }; }
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

// aba (sessionStorage — dura só a aba, não o localStorage de cima; "sessão" já é o nome do pedal do dia acima).
// Mesmo prefixo e mesmo envelope try/catch. Só o par que os pontos de uso pedem (a travessia de mundo, achado
// da revisão da U2) — não é a porta para tudo, só para o que já existia solto.
export function getAba(key, fallback) { try { const v = sessionStorage.getItem(P + key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } }
export function setAba(key, value) { let s; try { s = JSON.stringify(value); } catch (e) { return false; } try { sessionStorage.setItem(P + key, s); return true; } catch (e) { return false; } }
export function delAba(key) { try { sessionStorage.removeItem(P + key); } catch (e) { } }
