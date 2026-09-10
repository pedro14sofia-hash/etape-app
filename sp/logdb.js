// Étape Navegar · logdb.js (U6, Fase 3 da auditoria de backend)
// O registro do dia sai do localStorage. O problema medido (A3): uma amostra de telemetry serializa em 103 bytes;
// a 5 s, uma etapa de 6 h da 4.320 amostras = 435 KB, e as oito etapas somam 3,4 MB — contra um teto usual de 5 MB
// por origem, disputando espaco com prefs, sess:, fuel:, prog: e reports. Pior: setLog reserializava o log INTEIRO
// a cada 30 s; no fim da etapa eram 435 KB de JSON.stringify a cada meio minuto.
//
// Aqui cada amostra e um registro proprio, com chave [etapa, t]. Gravar e um put de 103 bytes, custo constante:
// acaba a reserializacao. Durante a etapa o array continua vivendo em memoria, como hoje, e o report.build continua
// recebendo um array — o app nao muda de forma.
//
// Sem IndexedDB (aba privada, armazenamento bloqueado) nada disso existe e o store.js segue como caminho de
// reserva. Por isso toda funcao daqui e tolerante: falhar aqui nao pode derrubar o pedal.

const NOME = 'etape', LOJA = 'log', VERSAO = 1;
let bd = null, tentou = false, ok = false;

function abrir() {
  if (tentou) return bd;
  tentou = true;
  try {
    if (!('indexedDB' in window)) return null;
    const req = indexedDB.open(NOME, VERSAO);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(LOJA)) d.createObjectStore(LOJA, { keyPath: ['stage', 't'] });
    };
    req.onsuccess = () => { bd = req.result; ok = true; };
    req.onerror = () => { ok = false; };
    return req;
  } catch (e) { return null; }
}

// A abertura do IndexedDB e assincrona; quem chama no arranque espera por ela uma vez.
export function pronto() {
  return new Promise(res => {
    if (bd) return res(true);
    let req; try { req = abrir(); } catch (e) { return res(false); }
    if (!req || !req.addEventListener) return res(!!bd);
    const fim = () => res(!!bd);
    req.addEventListener('success', () => { bd = req.result; ok = true; fim(); }, { once: true });
    req.addEventListener('error', fim, { once: true });
    setTimeout(fim, 3000);   // banco que nao abre em 3 s e banco que nao abriu: cai para o localStorage
  });
}

export function available() { return !!bd && ok; }

function loja(modo) {
  if (!bd) return null;
  try { return bd.transaction(LOJA, modo).objectStore(LOJA); } catch (e) { return null; }
}

// Todas as amostras de uma etapa, em ordem de tempo. Lido uma vez, no arranque.
export function load(stageKey) {
  return new Promise(res => {
    const st = loja('readonly');
    if (!st) return res(null);
    try {
      const faixa = IDBKeyRange.bound([stageKey, -Infinity], [stageKey, Infinity]);
      const req = st.getAll(faixa);
      req.onsuccess = () => res((req.result || []).map(r => r.s));
      req.onerror = () => res(null);
    } catch (e) { res(null); }
  });
}

// Grava uma amostra e nao espera. A chave [etapa, t] torna a operacao idempotente: regravar a mesma amostra
// sobrescreve em vez de duplicar, o que importa quando o app reabre no meio de uma etapa.
export function append(stageKey, sample) {
  const st = loja('readwrite');
  if (!st || !sample || typeof sample.t !== 'number') return false;
  try { st.put({ stage: stageKey, t: sample.t, s: sample }); return true; } catch (e) { return false; }
}

export function clear(stageKey) {
  const st = loja('readwrite');
  if (!st) return false;
  try { st.delete(IDBKeyRange.bound([stageKey, -Infinity], [stageKey, Infinity])); return true; } catch (e) { return false; }
}

// Migracao, uma vez e silenciosa: o que estiver em etape:log:* no localStorage vem para ca e sai de la.
// Idempotente — na segunda vez nao ha o que migrar.
export async function migrar(store) {
  if (!available()) return 0;
  let migradas = 0;
  try {
    const P = 'etape:log:', chaves = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(P) === 0) chaves.push(k.slice(P.length));
    }
    for (const sk of chaves) {
      const arr = store.log(sk);
      if (!Array.isArray(arr) || !arr.length) { store.del('log:' + sk); continue; }
      for (const s of arr) append(sk, s);
      store.del('log:' + sk);
      migradas += arr.length;
    }
  } catch (e) { }
  return migradas;
}
