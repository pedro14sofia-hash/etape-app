// Étape Navegar · sensors.js
// Sensores Bluetooth pelo Web Bluetooth (Chrome Android): frequência cardíaca (Forerunner 165 em modo broadcast),
// cadência/velocidade (CSC) e potência. connect() precisa de um toque do usuário. Dados em S.sensors via onData.
let device = null, cb = null, state = { hr: null, cad: null, pwr: null, at: 0 }, csc = null;
export function supported() { return !!(navigator.bluetooth && navigator.bluetooth.requestDevice); }
export function onData(fn) { cb = fn; }
export function connected() { return !!(device && device.gatt && device.gatt.connected); }
export function name() { return device ? device.name : ''; }
function emit() { state.at = Date.now(); if (cb) cb({ ...state }); }
export async function connect() {
  if (!supported()) throw new Error('Bluetooth não disponível neste navegador');
  device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }, { services: ['cycling_speed_and_cadence'] }, { services: ['cycling_power'] }], optionalServices: ['heart_rate', 'cycling_speed_and_cadence', 'cycling_power', 'battery_service'] });
  device.addEventListener('gattserverdisconnected', () => { state = { hr: null, cad: null, pwr: null, at: 0 }; emit(); setTimeout(() => { if (device) device.gatt.connect().then(subscribe).catch(() => { }); }, 3000); });
  await device.gatt.connect(); await subscribe();
  return device.name;
}
async function subscribe() {
  const srv = device.gatt;
  try { const s = await srv.getPrimaryService('heart_rate'); const c = await s.getCharacteristic('heart_rate_measurement'); await c.startNotifications(); c.addEventListener('characteristicvaluechanged', e => { const v = e.target.value; const f = v.getUint8(0); state.hr = (f & 1) ? v.getUint16(1, true) : v.getUint8(1); emit(); }); } catch (e) { }
  try { const s = await srv.getPrimaryService('cycling_speed_and_cadence'); const c = await s.getCharacteristic('csc_measurement'); await c.startNotifications(); c.addEventListener('characteristicvaluechanged', e => { const v = e.target.value; const f = v.getUint8(0); let o = 1; if (f & 1) o += 6; if (f & 2) { const rev = v.getUint16(o, true), tm = v.getUint16(o + 2, true); if (csc) { const dr = (rev - csc.rev + 65536) % 65536, dt = ((tm - csc.tm + 65536) % 65536) / 1024; if (dt > 0) state.cad = Math.round(dr / dt * 60); } csc = { rev, tm }; emit(); } }); } catch (e) { }
  try { const s = await srv.getPrimaryService('cycling_power'); const c = await s.getCharacteristic('cycling_power_measurement'); await c.startNotifications(); c.addEventListener('characteristicvaluechanged', e => { const v = e.target.value; state.pwr = v.getInt16(2, true); emit(); }); } catch (e) { }
}
export function disconnect() { if (device && device.gatt.connected) device.gatt.disconnect(); device = null; state = { hr: null, cad: null, pwr: null, at: 0 }; emit(); }
export function current() { return Date.now() - state.at < 15000 ? state : { hr: null, cad: null, pwr: null }; }
