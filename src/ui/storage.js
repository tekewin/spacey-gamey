import { sanitizeShip, clone } from '../engine/ship.js';
const KEY = 'spaceygamey.ships', BKEY = 'spaceygamey.battle', SKEY = 'spaceygamey.settings';
const get = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
export const storageOk = () => { try { localStorage.setItem('sg.t', '1'); localStorage.removeItem('sg.t'); return true; } catch { return false; } };
export function listShips() { return get(KEY, []).map((s) => { try { return sanitizeShip(s); } catch { return null; } }).filter(Boolean); }
export function saveShip(ship) {
  const all = get(KEY, []), s = clone(ship);
  s.savedAt = new Date().toISOString();
  const i = all.findIndex((x) => x.id === s.id);
  if (i >= 0) all[i] = s; else all.push(s);
  return set(KEY, all) ? s : null;
}
export function deleteShip(id) { set(KEY, get(KEY, []).filter((s) => s.id !== id)); }
export function exportShip(ship) {
  const blob = new Blob([JSON.stringify(ship, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (ship.name || 'ship').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') + '.ship.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export async function importShipFile(file) { return sanitizeShip(JSON.parse(await file.text())); }
export const saveBattle = (data) => set(BKEY, data);
export const loadBattle = () => get(BKEY, null);
export const clearBattle = () => { try { localStorage.removeItem(BKEY); } catch {} };
export const settings = Object.assign({ sound: true, fast: false, hard: false }, get(SKEY, {}));
export const saveSettings = () => set(SKEY, settings);
