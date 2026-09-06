// Étape Navegar · compass.js
// Bússola do aparelho (deviceorientationabsolute) para o rumo quando parado ou andando devagar, como no Google Maps.
// Filtro passa-baixa circular (~0,5 s). Compensa a orientação da tela. heading() devolve graus ou null se não há leitura fresca.
let head = null, at = 0, bound = false;
function screenAngle() { try { return (screen.orientation && screen.orientation.angle) || window.orientation || 0; } catch (e) { return 0; } }
function onEvent(e) {
  let h = null;
  if (e.webkitCompassHeading != null) h = e.webkitCompassHeading;                       // iOS
  else if (e.alpha != null && (e.absolute || e.type === 'deviceorientationabsolute')) h = (360 - e.alpha) % 360;
  if (h == null || isNaN(h)) return;
  h = (h + screenAngle() + 360) % 360;
  const now = performance.now();
  if (head == null || now - at > 2000) head = h;
  else { const dt = Math.min(0.5, (now - at) / 1000), k = 1 - Math.exp(-dt / 0.5); let d = ((h - head + 540) % 360) - 180; head = (head + d * k + 360) % 360; }
  at = now;
}
export function start() {
  if (bound || typeof window === 'undefined') return; bound = true;
  const go = () => { if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', onEvent); else window.addEventListener('deviceorientation', onEvent); };
  // iOS pede permissão num gesto do usuário; Android não
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    const ask = () => { DeviceOrientationEvent.requestPermission().then(r => { if (r === 'granted') go(); }).catch(() => { }); document.removeEventListener('pointerdown', ask); };
    document.addEventListener('pointerdown', ask);
  } else go();
}
export function heading() { return head != null && performance.now() - at < 2500 ? head : null; }
