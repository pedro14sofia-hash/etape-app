// Étape Navegar · basemap.js
// O chão do mapa 2D: base vetorial pronta (OpenStreetMap via Protomaps, arquivo PMTiles local)
// desenhada pelo MapLibre GL. O canvas #map continua por cima com a camada do Étape (fita,
// bandeirinhas, bornes, ciclista) e projeta por aqui, para os dois ficarem no mesmo quadro.
// A câmera continua sendo comandada pelo modelo de movimento do app (app.js), nunca pelo MapLibre.
let map = null, pronto = false, aoDesenharFns = [];

export function ativo() { return !!map; }
export function zoom() { return map ? map.getZoom() : 13; }

// os dois vendors são UMD (definem global, não exportam módulo): `import()` neles falha.
// Carregados por <script> sob demanda, para o 1 MB não pesar em quem abre com o chão antigo.
function carregar(src) {
  return new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => erro(new Error('não carregou ' + src));
    document.head.appendChild(s);
  });
}

export async function montar(el, { regiao, tema = 'asfalto', dpr = 2 }) {
  if (!window.maplibregl) await carregar('./vendor/maplibre-gl.js?v=a4f89d61');
  if (!window.pmtiles) await carregar('./vendor/pmtiles.js?v=a4f89d61');
  const gl = window.maplibregl;
  if (!document.getElementById('css-maplibre')) {
    const l = document.createElement('link');
    l.id = 'css-maplibre'; l.rel = 'stylesheet'; l.href = './vendor/maplibre-gl.css';
    document.head.appendChild(l);
  }
  // U7: dentro da casca a WebView descarta ela mesma os primeiros N bytes do corpo quando o pedido leva o cabecalho
  // Range — medido no S23: pedir "bytes=20000000-20000999" ao arquivo inteiro devolveu tamanho menos 20.000.000.
  // O PMTiles le pedaco por pedaco, entao por Range ele nunca funcionaria ali. A janela passa a viajar na URL
  // (`_r=inicio-fim`), que a casca e o serve.py entendem, e o cabecalho Range fica fora da conversa. Um caminho so
  // para o PC e para o aparelho: o chao do aparelho deixa de ser diferente do chao que se testa.
  const alvo = new URL('./chao/' + regiao + '.pmtiles', location.href).href;
  const fonte = {
    getKey: () => alvo,
    async getBytes(deslocamento, tamanho) {
      const u = alvo + (alvo.indexOf('?') < 0 ? '?' : '&') + '_r=' + deslocamento + '-' + (deslocamento + tamanho - 1);
      const r = await fetch(u);
      if (!r.ok) throw new Error('janela ' + r.status + ' em ' + u.slice(-48));
      const data = await r.arrayBuffer();
      if (data.byteLength > tamanho) throw new Error('janela ignorada: pedi ' + tamanho + ' e vieram ' + data.byteLength);
      return { data };
    }
  };
  const proto = new window.pmtiles.Protocol();
  proto.add(new window.pmtiles.PMTiles(fonte));
  gl.addProtocol('pmtiles', proto.tile);
  const estilo = await (await fetch('./chao/estilo-' + tema + '.json')).json();
  estilo.sources.protomaps.url = 'pmtiles://' + alvo;
  // new URL() codificaria {fontstack}/{range} (chaves viram %7B%7D): a base é resolvida sem o molde,
  // e o molde entra depois, literal, como no proto/chao/index.html.
  estilo.glyphs = new URL('./chao/glyphs/', location.href).href + '{fontstack}/{range}.pbf';
  map = new gl.Map({
    container: el, style: estilo, center: [0, 0], zoom: 13, pitch: 0, maxPitch: 0,
    // o dedo não manda: quem manda é o modelo de movimento. Os gestos entram pelo ui.js (Task 8).
    interactive: false, attributionControl: true, fadeDuration: 150, pixelRatio: dpr
  });
  // U7: "chao: Failed to fetch" sozinho nao diz o que falhou. O erro do MapLibre carrega url e status quando e de rede
  // (AJAXError); sem eles, um chao quebrado no aparelho e indistinguivel de um chao quebrado por outro motivo.
  map.on('error', e => {
    if (!window.__errs) return;
    const x = e.error || e, onde = x.url ? ' <- ' + String(x.url).slice(-64) : '', st = x.status ? ' [' + x.status + ']' : '';
    window.__errs.push('chao: ' + (x.message || x) + st + onde);
  });
  map.on('render', () => { for (const f of aoDesenharFns) f(); });
  await new Promise(r => map.once('load', r));
  pronto = true;
}

export function setTema(tema) {
  if (!map) return;
  const antes = map.getStyle().sources.protomaps.url, g = map.getStyle().glyphs;
  fetch('./chao/estilo-' + tema + '.json').then(r => r.json()).then(e => {
    e.sources.protomaps.url = antes; e.glyphs = g; map.setStyle(e);
  });
}

// rumoRad é o `view.rot` do render.js: rumo-para-cima = −heading. O MapLibre quer graus de bearing.
export function camera({ lat, lon, zoom, rumoRad, ancoraY }) {
  if (!map) return;
  const h = map.getContainer().clientHeight;
  // a âncora do app é uma fração da altura; no MapLibre isso é padding, e o centro fica no meio do que sobra.
  // ancoraY >= 0,5 empurra por cima (top); ancoraY < 0,5 empurra por baixo (bottom) — os dois lados da metade.
  const desloc = (ancoraY - 0.5) * 2 * h;
  map.jumpTo({
    center: [lon, lat], zoom, bearing: -rumoRad * 180 / Math.PI, pitch: 0,
    padding: { top: Math.max(0, desloc), bottom: Math.max(0, -desloc), left: 0, right: 0 }
  });
}

export function paraTela(lat, lon) { const p = map.project([lon, lat]); return [p.x, p.y]; }
export function daTela(x, y) { const p = map.unproject([x, y]); return { lat: p.lat, lon: p.lng }; }
export function metrosPorPixel() {
  const c = map.getCenter();
  return 156543.03392 * Math.cos(c.lat * Math.PI / 180) / Math.pow(2, map.getZoom());
}
export function caixaVisivel() {
  const b = map.getBounds();
  return [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
}
export function aoDesenhar(fn) { aoDesenharFns.push(fn); }
export function redimensionar() { if (map) map.resize(); }
