import { CATALOG, AMMO, NUKE_SPEED, BASE_HULL, formSide, itemLabel, chargerName } from './catalog.js';
import { chartValue } from './tohit.js';
import { rngFor, die, roll } from './rng.js';
import { COLS, ROWS, dist, eq, line, inBounds } from './hex.js';
import { clone } from './ship.js';

export const START_INSET = 8; // ships start on the diagonal, exactly 50 hexes apart
export const other = (k) => (k === 'human' ? 'ai' : 'human');
const blankStats = () => ({ shots: 0, hits: 0, dealt: 0, taken: 0, crits: 0 });

function mkState(def, pos) {
  const a = def.ammo;
  const comps = ['photon', 'shell', 'rocket', 'plasma', 'nuke'].filter((k) => (k === 'nuke' ? a.nuke.length : a[k]) > 0);
  return { def: clone(def), pos, damage: 0, destroyed: {}, ammo: clone(a), comps, moveLeft: 0, hyperUsed: false, rammed: false, fired: {}, spent: {} };
}

export function createBattle(humanShip, aiShip, seed) {
  const b = {
    version: 1, rng: seed | 0, turn: 1, active: 'human', over: false, winner: null,
    ships: { human: mkState(humanShip, { col: START_INSET, row: START_INSET }), ai: mkState(aiShip, { col: COLS - 1 - START_INSET, row: ROWS - 1 - START_INSET }) },
    missiles: [], nextMissile: 1, log: [], stats: { human: blankStats(), ai: blankStats() }, aiPlan: null,
  };
  log(b, 'human', `Battle begins. ${humanShip.name} vs ${aiShip.name}. Range ${dist(b.ships.human.pos, b.ships.ai.pos)} hexes.`, 'info');
  startTurn(b, 'human');
  return b;
}

export function log(b, side, text, kind = 'info') {
  b.log.push({ turn: b.turn, side, text, kind });
  if (b.log.length > 400) b.log.splice(0, b.log.length - 400);
}

export const hpMax = (S) => BASE_HULL + S.def.hullExtra;
export const hpLeft = (S) => hpMax(S) - S.damage;
export const working = (S, uid) => !S.destroyed[uid];
const hasWorking = (S, id) => S.def.items.some((i) => i.id === id && working(S, i.uid));

export function allowance(S) {
  let sum = 0, imp = false;
  for (const it of S.def.items) {
    const c = CATALOG[it.id];
    if (c.move && working(S, it.uid)) { if (c.impulse) imp = true; else sum += c.move; }
  }
  return Math.max(sum, imp ? 1 : 0);
}
export function shieldsVs(S, form) {
  const side = formSide(form);
  if (side === 'none') return 0;
  const want = side === 'conv' ? 'shield' : 'sunscreen';
  return S.def.items.filter((i) => i.id === want && working(S, i.uid)).length;
}
export const weapons = (S) => S.def.items.filter((i) => CATALOG[i.id].attack);
export const hasCharger = (S, it) => !!it.charger && working(S, it.uid + ':charger');

export function weaponStatus(S, it, ignoreFired = false) {
  const c = CATALOG[it.id];
  if (!working(S, it.uid)) return { ok: false, why: 'destroyed' };
  if (!ignoreFired && S.fired[it.uid]) return { ok: false, why: 'fired this turn' };
  if (c.charged) {
    const ch = hasCharger(S, it);
    if (!ch && S.spent[it.uid]) return { ok: false, why: 'spent (no ' + (c.side === 'solar' ? 'generator' : 'recharger') + ')' };
    return { ok: true, once: !ch };
  }
  if (c.attack === 'launcher') return S.ammo.nuke.length || S.ammo.plasma ? { ok: true } : { ok: false, why: 'no ammo' };
  if (c.ammo && S.ammo[c.ammo] <= 0) return { ok: false, why: 'no ammo' };
  return { ok: true };
}
export const fastestNuke = (S) => S.ammo.nuke.reduce((best, n, i) => (best < 0 || n.thrusters > S.ammo.nuke[best].thrusters ? i : best), -1);

function rollDamage(R, n, sides, shields) {
  const r = roll(R, n, sides);
  const total = r.reduce((a, f) => a + Math.max(1, f - shields), 0);
  const shown = r.length > 12 ? `${r.slice(0, 12).join(',')},…` : r.join(',');
  return { total, rolls: r, sides, shields, text: `${n}d${sides} [${shown}]${shields ? ` −${shields}/die` : ''} = ${total}` };
}
/** Dice-tray event for the UI. */
function diceFx(ev, side, label, dice, verdict, good = null) { ev.push({ fx: 'dice', side, label, dice, verdict, good }); }
const dmgDice = (ev, side, label, r) => diceFx(ev, side, label, r.rolls.map((v) => ({ s: r.sides, v })), `${r.shields ? `−${r.shields} per die (shields) · ` : ''}${r.total} damage`, null);

function applyDamage(b, side, dmg, ev) {
  const S = b.ships[side];
  S.damage += dmg;
  ev.push({ fx: 'dmg', side, at: { ...S.pos }, amount: dmg });
  b.stats[side].taken += dmg;
  b.stats[other(side)].dealt += dmg;
  if (hpLeft(S) <= 0 && !b.over) {
    b.over = true; b.winner = other(side);
    log(b, side, `${S.def.name} is DESTROYED!`, 'crit');
    ev.push({ fx: 'boom', at: { ...S.pos }, big: true });
  }
}

export function critItems(S) {
  const list = [];
  for (const it of S.def.items) {
    const c = CATALOG[it.id];
    if (c.crit && working(S, it.uid)) list.push({ uid: it.uid, name: itemLabel(it) });
    if (c.charged && it.charger && working(S, it.uid + ':charger')) list.push({ uid: it.uid + ':charger', name: `${chargerName(c)} (${itemLabel(it)})` });
  }
  for (const k of S.comps) if (working(S, 'comp:' + k)) list.push({ uid: 'comp:' + k, name: `${AMMO[k].name} compartment`, comp: k });
  return list;
}

function critCheck(b, attacker, targetSide, ev) {
  if (b.over) return;
  const R = rngFor(b), T = b.ships[targetSide];
  const a = die(R, 6), c = die(R, 6), s = a + c, isCrit = s === 2 || s === 12;
  diceFx(ev, attacker, 'Critical hit check (2 or 12)', [{ s: 6, v: a }, { s: 6, v: c }], isCrit ? 'CRITICAL AREA!' : 'No critical', isCrit);
  if (s !== 2 && s !== 12) { log(b, attacker, `Crit check: 2d6 = ${s} (needs 2 or 12) — no critical.`, 'info'); return; }
  const p = die(R, 6);
  diceFx(ev, attacker, 'Permanent? (5–6)', [{ s: 6, v: p }], p >= 5 ? 'PERMANENT CRIT!' : 'Surface damage only', p >= 5);
  if (p <= 4) { log(b, attacker, `Crit check: 2d6 = ${s} — critical area struck! Permanence d6 = ${p} (needs 5–6): surface damage only.`, 'crit'); return; }
  const list = critItems(T);
  if (!list.length) return;
  const k = die(R, list.length), item = list[k - 1];
  diceFx(ev, attacker, `Which item? (1–${list.length})`, [{ s: list.length, v: k }], `${item.name} destroyed`, true);
  T.destroyed[item.uid] = true;
  b.stats[attacker].crits++;
  log(b, attacker, `PERMANENT CRIT! (2d6=${s}, d6=${p}, d${list.length}=${k}) ${T.def.name}'s ${item.name} is destroyed.`, 'crit');
  ev.push({ fx: 'crit', at: { ...T.pos } });
  if (item.comp) explode(b, targetSide, item.comp, ev);
}

function compartmentDamage(R, S, k, shields) {
  const n = k === 'nuke' ? S.ammo.nuke.length : S.ammo[k];
  if (!n) return { n, total: 0, text: '' };
  if (k === 'photon') return { n, ...rollDamage(R, 3 * n, 6, shields) };
  if (k === 'shell') return { n, ...rollDamage(R, 2 * n, 6, shields) };
  if (k === 'nuke') return { n, ...rollDamage(R, 20 * n, 6, shields) };
  const per = k === 'rocket' ? 6 : 30, total = n * Math.max(1, per - shields);
  return { n, total, text: `${n} × ${per}${shields ? ` −${shields}` : ''} = ${total}` };
}

function explode(b, side, k, ev) {
  const R = rngFor(b), S = b.ships[side];
  const r = compartmentDamage(R, S, k, 0);
  if (!r.n) { log(b, side, `The ${AMMO[k].name.toLowerCase()} compartment was empty.`, 'info'); return; }
  const O = b.ships[other(side)];
  const sameHex = eq(O.pos, S.pos);
  let splash = null;
  if (sameHex) {
    const form = k === 'photon' ? 'photon' : k === 'shell' ? 'cannon' : k === 'rocket' ? 'rocket' : k === 'plasma' ? 'plasma' : 'beam';
    splash = compartmentDamage(R, S, k, shieldsVs(O, form));
  }
  if (k === 'nuke') S.ammo.nuke = []; else S.ammo[k] = 0;
  log(b, side, `${r.n} ${AMMO[k].name.toLowerCase()} explode inside ${S.def.name}! ${r.text} (shields don't help).`, 'crit');
  if (r.rolls) dmgDice(ev, other(side), `${AMMO[k].name} compartment explodes`, r);
  ev.push({ fx: 'boom', at: { ...S.pos }, big: true });
  applyDamage(b, side, r.total, ev);
  if (splash && !b.over) { log(b, side, `The blast hits ${O.def.name} in the same hex: ${splash.text}.`, 'crit'); applyDamage(b, other(side), splash.total, ev); }
}

const missileSpeed = (n) => NUKE_SPEED[n.thrusters];
export const MISSILE_HP = 10;
export const missileHpLeft = (m) => MISSILE_HP - (m.damage || 0);

/** Fire weapon `uid`. opts: { target: 'ship' | missileId, mode: 'nuke'|'plasma' } */
export function fire(b, side, uid, opts = {}) {
  const ev = [], R = rngFor(b), S = b.ships[side], T = b.ships[other(side)];
  if (b.over || b.active !== side) return ev;
  const it = S.def.items.find((i) => i.uid === uid);
  if (!it) return ev;
  const c = CATALOG[it.id], st = weaponStatus(S, it);
  if (!st.ok) return ev;
  let form = c.attack;
  if (form === 'launcher') form = opts.mode || (S.ammo.nuke.length ? 'nuke' : 'plasma');
  if (form === 'nuke' && !S.ammo.nuke.length) return ev;
  if (form === 'plasma' && !S.ammo.plasma) return ev;
  const missile = opts.target && opts.target !== 'ship' ? b.missiles.find((m) => m.id === opts.target && m.owner !== side) : null;
  if (opts.target && opts.target !== 'ship' && !missile) return ev;
  if (missile && form === 'nuke') return ev;
  const tpos = missile ? missile.pos : T.pos, d = dist(S.pos, tpos);
  if (form !== 'nuke' && chartValue(form, d) == null) return ev;
  const tname = missile ? `nuclear missile #${missile.id}` : T.def.name;
  const wname = form === 'nuke' ? 'Nuclear missile' : form === 'plasma' ? 'Plasma' : itemLabel(it);

  S.fired[it.uid] = true;
  if (c.charged && !hasCharger(S, it)) S.spent[it.uid] = true;
  b.stats[side].shots++;

  if (form === 'nuke') {
    const idx = opts.nukeIdx ?? fastestNuke(S), n = S.ammo.nuke.splice(idx, 1)[0], sp = missileSpeed(n);
    if (d <= sp) {
      const r = rollDamage(R, 20, 6, shieldsVs(T, 'beam'));
      b.stats[side].hits++;
      log(b, side, `${S.def.name} launches a nuclear missile (speed ${sp}) at range ${d} — direct HIT! ${r.text}.`, 'hit');
      ev.push({ fx: 'shot', form, from: { ...S.pos }, to: { ...T.pos }, hit: true }, { fx: 'boom', at: { ...T.pos }, big: true });
      dmgDice(ev, side, 'Nuclear missile — 20d6', r);
      applyDamage(b, other(side), r.total, ev);
      critCheck(b, side, other(side), ev);
    } else {
      const m = { id: b.nextMissile++, owner: side, pos: { ...S.pos }, speed: sp, damage: 0 };
      b.missiles.push(m);
      const path = line(S.pos, T.pos).slice(0, sp + 1); // flies its full speed toward the target right away
      m.pos = { ...path[path.length - 1] };
      log(b, side, `${S.def.name} launches nuclear missile #${m.id} (speed ${sp}/turn). It streaks ${sp} hex${sp > 1 ? 'es' : ''} toward ${T.def.name} — ${dist(m.pos, T.pos)} hexes to go.`, 'info');
      ev.push({ fx: 'missileNew', id: m.id, from: { ...S.pos } }, { fx: 'missileMove', id: m.id, path });
    }
    return ev;
  }

  if (form === 'rocket') {
    const shots = Math.min(c.shots, S.ammo.rocket), per = chartValue('rocket', d), sh = missile ? 0 : shieldsVs(T, 'rocket');
    S.ammo.rocket -= shots;
    const each = Math.max(1, per - sh), total = each * shots;
    b.stats[side].hits++;
    log(b, side, `${S.def.name} fires ${shots} rocket${shots > 1 ? 's' : ''} at ${tname} (range ${d}): ${shots} × ${per}${sh ? ` −${sh}` : ''} = ${total}.`, 'hit');
    ev.push({ fx: 'shot', form, from: { ...S.pos }, to: { ...tpos }, hit: true });
    if (missile) return hitMissile(b, side, missile, total, ev);
    applyDamage(b, other(side), total, ev);
    critCheck(b, side, other(side), ev); // one crit check per rocket volley
    return ev;
  }

  if (c.ammo === 'photon') S.ammo.photon--;
  if (c.ammo === 'shell') S.ammo.shell--;
  if (form === 'plasma') S.ammo.plasma--;
  const sh = missile ? 0 : shieldsVs(T, form);
  const base = chartValue(form, d), need = base + sh, r = die(R, 20), hit = r >= need && need <= 20 || (need <= 0);
  const needTxt = `need ${need}${sh ? ` (${base}+${sh} shields)` : ''}`;
  diceFx(ev, side, `${wname} to hit — ${needTxt}`, [{ s: 20, v: r }], hit ? 'HIT!' : 'Miss', hit);
  ev.push({ fx: 'shot', form, from: { ...S.pos }, to: { ...tpos }, hit });
  if (!hit) { log(b, side, `${S.def.name} fires ${wname} at ${tname} (range ${d}): ${needTxt}, rolled ${r} — miss.`, 'miss'); return ev; }
  b.stats[side].hits++;
  let dmg;
  if (form === 'plasma') { const t = Math.max(1, 30 - sh); dmg = { total: t, text: `30${sh ? ` −${sh}` : ''} = ${t}` }; }
  else if (c.charged) dmg = rollDamage(R, it.dice, c.die, sh);
  else dmg = rollDamage(R, c.dmg[0], c.dmg[1], sh);
  log(b, side, `${S.def.name} fires ${wname} at ${tname} (range ${d}): ${needTxt}, rolled ${r} — HIT! ${dmg.text}.`, 'hit');
  if (dmg.rolls) dmgDice(ev, side, `${wname} damage`, dmg);
  if (missile) return hitMissile(b, side, missile, dmg.total, ev);
  applyDamage(b, other(side), dmg.total, ev);
  critCheck(b, side, other(side), ev);
  return ev;
}

function hitMissile(b, side, m, dmg, ev) {
  m.damage = (m.damage || 0) + dmg; // cumulative: 10 total destroys it
  ev.push({ fx: 'dmg', side: 'missile', at: { ...m.pos }, amount: dmg });
  if (m.damage >= MISSILE_HP) {
    b.missiles = b.missiles.filter((x) => x !== m);
    log(b, side, `Nuclear missile #${m.id} is destroyed (${m.damage} total damage).`, 'hit');
    ev.push({ fx: 'boom', at: { ...m.pos } }, { fx: 'missileGone', id: m.id });
  } else log(b, side, `Nuclear missile #${m.id} takes ${dmg} damage (${m.damage}/${MISSILE_HP}) and keeps coming.`, 'info');
  return ev;
}

export function canMoveTo(b, side, h) {
  const S = b.ships[side], T = b.ships[other(side)];
  if (b.over || b.active !== side || !inBounds(h) || eq(h, T.pos)) return false;
  const d = dist(S.pos, h);
  return d > 0 && d <= S.moveLeft;
}
export function moveTo(b, side, h) {
  if (!canMoveTo(b, side, h)) return [];
  const S = b.ships[side], path = line(S.pos, h);
  S.moveLeft -= path.length - 1;
  S.pos = { ...h };
  return [{ fx: 'move', side, path }];
}

export function canRam(b, side) {
  const S = b.ships[side], T = b.ships[other(side)];
  if (b.over || b.active !== side || S.rammed || !hasWorking(S, 'rammer')) return false;
  const d = dist(S.pos, T.pos);
  return d >= 1 && d <= S.moveLeft;
}
export function ram(b, side) {
  if (!canRam(b, side)) return [];
  const ev = [], R = rngFor(b), S = b.ships[side], T = b.ships[other(side)];
  const d = dist(S.pos, T.pos), r = rollDamage(R, d, 6, 0);
  let dealt = r.total;
  const tDer = hasWorking(T, 'derammer'), sDer = hasWorking(S, 'derammer');
  if (tDer) dealt = Math.floor(dealt / 2);
  const self = sDer ? 0 : Math.floor(dealt * 0.25); // designer ruling: rammer takes ¼, or nothing with a de-rammer
  ev.push({ fx: 'move', side, path: line(S.pos, T.pos) }, { fx: 'boom', at: { ...T.pos } });
  dmgDice(ev, side, `Ram — ${d}d6`, r);
  S.pos = { ...T.pos }; S.moveLeft = 0; S.rammed = true;
  b.stats[side].shots++; b.stats[side].hits++;
  log(b, side, `${S.def.name} RAMS ${T.def.name} from ${d} hexes! ${r.text}${tDer ? ', halved by de-rammer' : ''} → ${dealt}. Rammer takes ${self}${sDer ? ' (de-rammer: none)' : ' (¼)'}.`, 'hit');
  applyDamage(b, other(side), dealt, ev);
  if (!b.over && self > 0) applyDamage(b, side, self, ev);
  return ev;
}

export function canHyper(b, side) {
  const S = b.ships[side];
  return !b.over && b.active === side && !S.hyperUsed && !S.rammed && hasWorking(S, 'hyper');
}
export function hyperspace(b, side) {
  if (!canHyper(b, side)) return [];
  const R = rngFor(b), S = b.ships[side], T = b.ships[other(side)], from = { ...S.pos };
  let h;
  do h = { col: Math.floor(R.next() * COLS), row: Math.floor(R.next() * ROWS) }; while (eq(h, T.pos));
  S.pos = h; S.moveLeft = 0; S.hyperUsed = true;
  log(b, side, `${S.def.name} activates hyperspace and reappears at (${h.col},${h.row}). Range now ${dist(h, T.pos)}.`, 'info');
  return [{ fx: 'hyper', side, from, to: { ...h } }];
}

export function startTurn(b, side) {
  const ev = [], S = b.ships[side];
  S.fired = {}; S.rammed = false; S.hyperUsed = false; S.moveLeft = allowance(S);
  b.aiPlan = null;
  for (const m of b.missiles.filter((x) => x.owner === side)) {
    if (b.over) break;
    const T = b.ships[other(side)], d = dist(m.pos, T.pos);
    const path = line(m.pos, T.pos).slice(0, m.speed + 1);
    m.pos = { ...path[path.length - 1] };
    ev.push({ fx: 'missileMove', id: m.id, path });
    if (d <= m.speed) {
      const R = rngFor(b), r = rollDamage(R, 20, 6, shieldsVs(T, 'beam'));
      b.missiles = b.missiles.filter((x) => x !== m);
      b.stats[side].hits++;
      log(b, side, `Nuclear missile #${m.id} reaches ${T.def.name} and detonates! ${r.text}.`, 'hit');
      ev.push({ fx: 'missileGone', id: m.id }, { fx: 'boom', at: { ...T.pos }, big: true });
      dmgDice(ev, side, `Nuclear missile #${m.id} detonates — 20d6`, r);
      applyDamage(b, other(side), r.total, ev);
      critCheck(b, side, other(side), ev);
    } else log(b, side, `Nuclear missile #${m.id} closes in — ${dist(m.pos, T.pos)} hexes from ${T.def.name}.`, 'info');
  }
  return ev;
}

export function endTurn(b) {
  if (b.over) return [];
  b.active = other(b.active);
  if (b.active === 'human') b.turn++;
  log(b, b.active, `— Turn ${b.turn}: ${b.ships[b.active].def.name} —`, 'turn');
  return startTurn(b, b.active);
}

/** Ship to save after a victory: fully repaired and restocked to its pre-battle loadout. */
export function survivorShip(b, side = 'human') {
  const S = b.ships[side], s = clone(S.def); // S.def is the untouched pre-battle ship
  s.record = { wins: (s.record?.wins || 0) + 1, battles: (s.record?.battles || 0) + 1 };
  return s;
}

/** Execute a UI/AI action object. */
export function act(b, side, a) {
  switch (a.type) {
    case 'move': return moveTo(b, side, a.to);
    case 'fire': return fire(b, side, a.uid, a);
    case 'ram': return ram(b, side);
    case 'hyper': return hyperspace(b, side);
    default: return [];
  }
}
