import { CATALOG, AMMO, CHARGER_COST, MISSILE_THRUSTER_COST, HULL_COST, BASE_HULL } from './catalog.js';
export const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : 'id' + Math.random().toString(36).slice(2) + Date.now().toString(36));
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const sideOk = (c, type) => c.side === 'any' || (c.side === 'conv' && type === 'conventional') || (c.side === 'solar' && type === 'solar');

export function newShip(type = 'conventional') {
  return {
    format: 'spacey-gamey-ship', version: 1, id: uid(), name: '', type,
    counter: { glyph: type === 'solar' ? 'S' : 'C', color: type === 'solar' ? '#ffc94a' : '#7cffb2' },
    hullExtra: 0, items: type === 'solar' ? [{ uid: uid(), id: 'spc' }] : [],
    ammo: { photon: 0, shell: 0, rocket: 0, plasma: 0, nuke: [] },
    bank: 0, record: { wins: 0, battles: 0 }, savedAt: null,
  };
}
export function makeItem(id, opts = {}) {
  const c = CATALOG[id], it = { uid: uid(), id };
  if (c.costPerDie) it.dice = Math.max(1, opts.dice | 0 || 1);
  if (c.charged) it.charger = opts.charger !== false;
  return it;
}
export function itemCost(it) {
  const c = CATALOG[it.id];
  return (c.costPerDie ? c.costPerDie * it.dice : c.cost) + (it.charger ? CHARGER_COST : 0);
}
export function ammoCost(a) {
  return a.photon * AMMO.photon.cost + a.shell * AMMO.shell.cost + a.rocket * AMMO.rocket.cost + a.plasma * AMMO.plasma.cost
    + a.nuke.reduce((s, n) => s + AMMO.nuke.cost + MISSILE_THRUSTER_COST * n.thrusters, 0);
}
export const shipValue = (s) => s.items.reduce((a, i) => a + itemCost(i), 0) + ammoCost(s.ammo) + s.hullExtra * HULL_COST;
export const shipClass = (v) => (v < 22000 ? 1 : Math.floor((v - 12000) / 10000) + 1);
export const classFloor = (c) => 12000 + (c - 1) * 10000;
export const classRange = (c) => [classFloor(c), classFloor(c) + 9999];
export const hullPoints = (s) => BASE_HULL + s.hullExtra;
export const countOf = (s, id) => s.items.filter((i) => i.id === id).length;
export function baseMovement(s) {
  let sum = 0, imp = false;
  for (const it of s.items) { const c = CATALOG[it.id]; if (c.move) { if (c.impulse) imp = true; else sum += c.move; } }
  return Math.max(sum, imp ? 1 : 0);
}

/** Can `id` be added to ship s? Returns null if OK, else a reason string. */
export function addBlocker(s, id) {
  const c = CATALOG[id];
  if (!c) return 'Unknown item';
  if (!sideOk(c, s.type)) return s.type === 'solar' ? 'Conventional equipment only' : 'Solar equipment only';
  if (c.max && countOf(s, id) >= c.max) return `Maximum of ${c.max}`;
  const hasThr = s.items.some((i) => CATALOG[i.id].move && !CATALOG[i.id].impulse);
  if (id === 'impulse' && hasThr) return 'Cannot combine with thrusters';
  if (c.move && !c.impulse && countOf(s, 'impulse')) return 'Ship has an impulse engine';
  return null;
}

export function checkShip(s) {
  const errors = [], warnings = [];
  if (!s.name?.trim()) errors.push('Give your ship a name.');
  if (s.type === 'solar' && countOf(s, 'spc') !== 1) errors.push('Solar ships need exactly one Solar Power Converter.');
  for (const it of s.items) { const c = CATALOG[it.id]; if (!c) errors.push('Unknown item ' + it.id); else if (!sideOk(c, s.type)) errors.push(`${c.name} is not allowed on a ${s.type} ship.`); }
  for (const [id, c] of Object.entries(CATALOG)) if (c.max && countOf(s, id) > c.max) errors.push(`At most ${c.max} × ${c.name}.`);
  if (countOf(s, 'impulse') && s.items.some((i) => CATALOG[i.id].move && !CATALOG[i.id].impulse)) errors.push('Impulse engine cannot be combined with thrusters.');
  if (!baseMovement(s)) warnings.push('No engines — this ship cannot move.');
  if (!s.items.some((i) => CATALOG[i.id].attack)) warnings.push('No weapons fitted.');
  for (const [k, a] of Object.entries(AMMO)) {
    const n = k === 'nuke' ? s.ammo.nuke.length : s.ammo[k];
    const has = a.needs.some((id) => countOf(s, id));
    if (n && !has) warnings.push(`${a.name} carried but nothing can fire them.`);
  }
  for (const it of s.items) {
    const c = CATALOG[it.id];
    if (c.ammo && !s.ammo[c.ammo]) warnings.push(`${c.name} has no ${AMMO[c.ammo].name.toLowerCase()}.`);
    if (it.id === 'launcher' && !s.ammo.nuke.length && !s.ammo.plasma) warnings.push('Missile Launcher has no nukes or plasmas.');
    if (c.charged && !it.charger) warnings.push(`${c.name} has no ${c.side === 'solar' ? 'generator' : 'recharger'} — fires only once per battle.`);
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

/** Validate and normalise an imported object. Throws on invalid files. */
export function sanitizeShip(o) {
  if (!o || o.format !== 'spacey-gamey-ship') throw new Error('Not a Spacey Gamey ship file.');
  if (!['conventional', 'solar'].includes(o.type)) throw new Error('Unknown ship type.');
  const s = newShip(o.type);
  s.id = typeof o.id === 'string' ? o.id : uid();
  s.name = String(o.name || 'Unnamed').slice(0, 40);
  s.counter = { glyph: String(o.counter?.glyph || 'X').slice(0, 2), color: /^#[0-9a-f]{6}$/i.test(o.counter?.color) ? o.counter.color : s.counter.color };
  s.hullExtra = Math.max(0, o.hullExtra | 0);
  s.items = (o.items || []).map((i) => {
    if (!CATALOG[i.id]) throw new Error('Unknown item: ' + i.id);
    const c = CATALOG[i.id], it = { uid: typeof i.uid === 'string' ? i.uid : uid(), id: i.id };
    if (c.costPerDie) it.dice = Math.max(1, Math.min(50, i.dice | 0 || 1));
    if (c.charged) it.charger = !!i.charger;
    return it;
  });
  const a = o.ammo || {};
  s.ammo = { photon: Math.max(0, a.photon | 0), shell: Math.max(0, a.shell | 0), rocket: Math.max(0, a.rocket | 0), plasma: Math.max(0, a.plasma | 0),
    nuke: (a.nuke || []).map((n) => ({ thrusters: Math.max(0, Math.min(2, n.thrusters | 0)) })) };
  s.bank = Math.max(0, o.bank | 0);
  s.record = { wins: Math.max(0, o.record?.wins | 0), battles: Math.max(0, o.record?.battles | 0) };
  s.savedAt = o.savedAt || null;
  const { errors } = checkShip(s);
  const bad = errors.filter((e) => !e.startsWith('Give'));
  if (bad.length) throw new Error(bad.join(' '));
  return s;
}
