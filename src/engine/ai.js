import { CATALOG, AMMO, NUKE_SPEED, CHARGER_COST } from './catalog.js';
const PH = AMMO.photon.cost;
import { chartValue } from './tohit.js';
import { seededRng } from './rng.js';
import { dist, eq, hexesWithin } from './hex.js';
import { newShip, makeItem, shipValue, addBlocker, countOf, itemCost } from './ship.js';
import { other, allowance, shieldsVs, weapons, weaponStatus, hpLeft, hpMax, canRam, canHyper, canMoveTo, fastestNuke, hasCharger, missileHpLeft } from './combat.js';

/* ---------------- Ship generation ---------------- */
const NAMES_A = ['Grudge', 'Wrath', 'Spite', 'Fury', 'Malice', 'Shadow', 'Hunger', 'Ember', 'Scourge', 'Howl', 'Venom', 'Talon'];
const NAMES_B = ['Orion', 'the Void', 'Vega', 'Rigel', 'Antares', 'the Nebula', 'Sirius', 'Deneb', 'Altair', 'Betelgeuse'];
const PREFIX = ['ISV', 'KSS', 'Raider', 'Marauder', 'Corsair', 'Reaver'];

export function aiBuildShip(budget, seed = (Math.random() * 2 ** 31) | 0) {
  const R = seededRng(seed), pick = (a) => a[Math.floor(R.next() * a.length)], chance = (p) => R.next() < p;
  const type = chance(0.5) ? 'conventional' : 'solar';
  const s = newShip(type);
  s.name = `${pick(PREFIX)} ${pick(NAMES_A)} of ${pick(NAMES_B)}`;
  s.counter = { glyph: 'X', color: '#ff5a5a' };
  const left = () => budget - shipValue(s);
  const tryItem = (id, opts) => { const it = makeItem(id, opts); if (addBlocker(s, id) || itemCost(it) > left()) return false; s.items.push(it); return true; };
  const tryAmmo = (k, n, cost) => { const can = Math.min(n, Math.floor(left() / cost)); if (can <= 0) return false; s.ammo[k] += can; return true; };
  const tryNuke = (thr) => { if (1000 + 250 * thr > left()) return false; s.ammo.nuke.push({ thrusters: thr }); return true; };

  let archetype;
  if (type === 'conventional') {
    archetype = pick(['sniper', 'brawler', 'beamboat', 'missileboat']);
    tryItem('thruster');
    if (budget >= 20000) tryItem('thruster');
    if (archetype === 'brawler' && chance(0.6)) tryItem('mini');
  } else {
    archetype = pick(['lancer', 'flareboat', 'burster']);
    tryItem('sthruster');
    if (budget >= 13000 || chance(0.5)) tryItem('sthruster');
    if (budget >= 25000) tryItem('sthruster');
  }
  const packages = {
    sniper: [() => tryItem('tube') && tryAmmo('photon', 10, PH), () => countOf(s, 'tube') && tryAmmo('photon', 10, PH), () => tryItem('shield'), () => tryItem('beam5', { dice: 1 }), () => tryItem('hyper')],
    brawler: [() => tryItem('cannon') && tryAmmo('shell', 16, 25), () => tryItem('disperser'), () => tryItem('tripod') && tryAmmo('rocket', 12, 25), () => tryItem('rammer'), () => tryItem('shield'), () => tryItem('derammer')],
    beamboat: [() => tryItem(pick(['beam4', 'beam5', 'beam6']), { dice: 1 + Math.floor(R.next() * 2) }), () => tryItem('shield'), () => tryItem('wltb'), () => tryItem('tube') && tryAmmo('photon', 6, PH)],
    missileboat: [() => tryItem('launcher') && tryNuke(2), () => countOf(s, 'launcher') && tryNuke(chance(0.5) ? 2 : 1), () => countOf(s, 'launcher') && tryAmmo('plasma', 2, 750), () => tryItem('shield'), () => tryItem('tube') && tryAmmo('photon', 10, PH), () => tryItem('hyper')],
    lancer: [() => tryItem(pick(['flare3', 'flare4']), { dice: 1 + Math.floor(R.next() * 2) }), () => tryItem('sunscreen'), () => tryItem('wltb')],
    flareboat: [() => tryItem(pick(['flare1', 'flare2', 'flare3']), { dice: 2 + Math.floor(R.next() * 2) }), () => tryItem('sunscreen'), () => tryItem('sunburst', { dice: 4 })],
    burster: [() => tryItem('sunburst', { dice: 4 + Math.floor(R.next() * 4) }), () => tryItem('sunscreen'), () => tryItem('flare2', { dice: 2 }), () => tryItem('rammer')],
  }[archetype];
  // Guarantee at least one weapon first, then shuffle-buy until nothing fits.
  for (let i = 0; i < 6 && !s.items.some((it) => CATALOG[it.id].attack); i++) packages[0]();
  for (let tries = 0; tries < 200; tries++) {
    if (left() < 500) break;
    if (R.next() < 0.25) { s.hullExtra += Math.min(10, Math.floor(left() / 50)); continue; }
    pick(packages)();
  }
  s.hullExtra += Math.floor(left() / 50); // spend remainder as hull
  s.archetype = archetype;
  return s;
}

/* ---------------- Expected-value helpers ---------------- */
const meanDie = (sides, sh) => { let t = 0; for (let f = 1; f <= sides; f++) t += Math.max(1, f - sh); return t / sides; };
const pHit = (need) => (need == null ? 0 : need <= 1 ? 1 : need > 20 ? 0 : (21 - need) / 20);

/** Expected damage of one weapon from S against T at range d. mode chooses launcher ammo. */
export function weaponEV(S, it, T, d, { ignoreFired = false, mode } = {}) {
  const c = CATALOG[it.id];
  if (!weaponStatus(S, it, ignoreFired).ok) return { ev: 0, p: 0 };
  let form = c.attack;
  if (form === 'launcher') {
    if (mode === 'plasma' || (!mode && !S.ammo.nuke.length)) form = 'plasma';
    else {
      const i = fastestNuke(S);
      if (i < 0) return { ev: 0, p: 0 };
      const sp = NUKE_SPEED[S.ammo.nuke[i].thrusters];
      return d <= sp ? { ev: 20 * meanDie(6, shieldsVs(T, 'beam')), p: 1, form: 'nuke' } : { ev: 0, p: 0, form: 'nuke', guided: true };
    }
    if (!S.ammo.plasma) return { ev: 0, p: 0 };
  }
  if (form === 'rocket') {
    const v = chartValue('rocket', d);
    if (v == null) return { ev: 0, p: 0 };
    return { ev: Math.min(c.shots, S.ammo.rocket) * Math.max(1, v - shieldsVs(T, 'rocket')), p: 1, form };
  }
  const base = chartValue(form, d);
  if (base == null) return { ev: 0, p: 0 };
  const sh = shieldsVs(T, form), p = pHit(base + sh);
  let dmg;
  if (form === 'plasma') dmg = Math.max(1, 30 - sh);
  else if (c.charged) dmg = it.dice * meanDie(c.die, sh);
  else dmg = c.dmg[0] * meanDie(c.dmg[1], sh);
  return { ev: p * dmg, p, form };
}
export function shipEV(S, T, d, ignoreFired = false) {
  let t = 0;
  for (const it of weapons(S)) {
    const c = CATALOG[it.id];
    if (c.attack === 'launcher') t += Math.max(weaponEV(S, it, T, d, { ignoreFired, mode: 'nuke' }).ev, weaponEV(S, it, T, d, { ignoreFired, mode: 'plasma' }).ev);
    else t += weaponEV(S, it, T, d, { ignoreFired }).ev;
  }
  return t;
}

/* ---------------- Turn logic ---------------- */
const RMAX = 100;
function plan(b, side) {
  const S = b.ships[side], T = b.ships[other(side)], d0 = dist(S.pos, T.pos), m = S.moveLeft, tm = allowance(T);
  const mev = [], hev = [];
  for (let r = 0; r <= RMAX; r++) { mev[r] = shipEV(S, T, r); hev[r] = shipEV(T, S, r, true); }
  const threat = (r0) => { let mx = 0; for (let r = Math.max(0, r0 - tm); r <= Math.min(RMAX, r0 + tm); r++) mx = Math.max(mx, hev[r]); return mx; };
  // Track turns without firing; the AI gets bolder the longer it stays idle.
  S.idle = (b.stats[side].shots === S.lastShots ? (S.idle || 0) + 1 : 0); S.lastShots = b.stats[side].shots;
  const bold = Math.max(0.1, 1 - (S.idle || 0) * 0.15);
  const W = (hpLeft(S) < hpMax(S) * 0.4 ? 1.1 : 0.7) * bold; // more cautious when hurt
  let pref = 0, bestPref = -Infinity;
  for (let r = 0; r <= 60; r++) { const v = mev[r] - 0.7 * bold * hev[r]; if (v > bestPref + 0.01) { bestPref = v; pref = r; } }
  const cands = m > 0 ? hexesWithin(S.pos, m).filter((h) => !eq(h, T.pos)) : [S.pos];
  let A = { s: -Infinity }, Bh = { s: -Infinity };
  for (const h of cands) {
    const r = dist(h, T.pos), jitter = Math.random() * 0.05, shape = -0.06 * Math.abs(r - pref) + jitter;
    const sa = mev[Math.min(r, RMAX)] - W * threat(r) + shape;
    const sb = -W * threat(r) + shape;
    if (sa > A.s) A = { s: sa, h };
    if (sb > Bh.s) Bh = { s: sb, h };
  }
  const sB = mev[Math.min(d0, RMAX)] + Bh.s;
  const P = { fireFirst: sB > A.s, dest: sB > A.s ? Bh.h : A.h, moved: false, ram: false, hyper: false };
  if (canHyper(b, side) && hpLeft(S) < hpMax(S) * 0.3 && threat(dist(P.dest, T.pos)) > hpLeft(S) * 0.4) { P.hyper = true; P.fireFirst = true; P.dest = null; }
  if (canRam(b, side)) {
    const inflicted = 3.5 * d0 * (T.def.items.some((i) => i.id === 'derammer') ? 0.5 : 1);
    const self = inflicted * (S.def.items.some((i) => i.id === 'derammer') ? 0 : 0.25);
    if (d0 >= 3 && self < hpLeft(S) * 0.4 && inflicted + mev[0] > Math.max(A.s, sB) + threat(0) * 0.3) P.ram = true;
  }
  return P;
}

function bestShot(b, side) {
  const S = b.ships[side], T = b.ships[other(side)], d = dist(S.pos, T.pos);
  let best = null;
  const consider = (it, mode, r) => {
    if (!r.form && r.ev <= 0) return;
    const c = CATALOG[it.id], st = weaponStatus(S, it);
    if (!st.ok) return;
    let score = r.ev;
    if (r.guided) { if (b.missiles.some((m) => m.owner === side) || d > 40) return; score = 4; }
    else {
      if (r.ev <= 0) return;
      if (st.once && r.p < 0.5 && hpLeft(T) > r.ev * 2) return; // save once-per-battle shots
      if ((c.ammo === 'photon' || c.ammo === 'shell') && r.p < 0.2) return;
      if (mode === 'plasma' && r.p < 0.3) return;
    }
    if (!best || score > best.score) best = { score, action: { type: 'fire', uid: it.uid, mode, target: 'ship' } };
  };
  for (const it of weapons(S)) {
    if (CATALOG[it.id].attack === 'launcher') {
      if (S.ammo.nuke.length) consider(it, 'nuke', weaponEV(S, it, T, d, { mode: 'nuke' }));
      if (S.ammo.plasma) consider(it, 'plasma', weaponEV(S, it, T, d, { mode: 'plasma' }));
    } else consider(it, undefined, weaponEV(S, it, T, d));
  }
  return best?.action || null;
}

function shootDownMissile(b, side) {
  const S = b.ships[side];
  for (const m of b.missiles.filter((x) => x.owner !== side)) {
    const md = dist(S.pos, m.pos);
    if (md > m.speed + 6) continue;
    let best = null;
    for (const it of weapons(S)) {
      const c = CATALOG[it.id], st = weaponStatus(S, it);
      if (!st.ok) continue;
      let form = c.attack;
      if (form === 'launcher') { if (!S.ammo.plasma) continue; form = 'plasma'; }
      let p, dmg;
      if (form === 'rocket') { const v = chartValue('rocket', md); if (v == null) continue; p = 1; dmg = v * Math.min(c.shots, S.ammo.rocket); }
      else {
        const base = chartValue(form, md); if (base == null) continue;
        p = pHit(base);
        dmg = form === 'plasma' ? 30 : c.charged ? it.dice * (c.die + 1) / 2 : c.dmg[0] * (c.dmg[1] + 1) / 2;
      }
      const need = missileHpLeft(m), score = p * (dmg >= need ? 1 : (dmg / need) * 0.6);
      if (score > 0.25 && (!best || score > best.score)) best = { score, action: { type: 'fire', uid: it.uid, mode: form === 'plasma' ? 'plasma' : undefined, target: m.id } };
    }
    if (best) return best.action;
  }
  return null;
}

/** Returns the AI's next action for this turn, or null to end the turn. */
export function aiNextAction(b, side = 'ai') {
  if (b.over || b.active !== side) return null;
  const S = b.ships[side];
  const sd = shootDownMissile(b, side);
  if (sd) return sd;
  if (!b.aiPlan) b.aiPlan = plan(b, side);
  const P = b.aiPlan;
  if (P.ram && canRam(b, side)) { P.ram = false; P.moved = true; return { type: 'ram' }; }
  if (P.fireFirst || P.moved) { const w = bestShot(b, side); if (w) return w; }
  if (!P.moved) {
    P.moved = true;
    if (P.dest && !eq(P.dest, S.pos) && canMoveTo(b, side, P.dest)) return { type: 'move', to: P.dest };
  }
  const w = bestShot(b, side);
  if (w) return w;
  if (P.hyper && canHyper(b, side)) { P.hyper = false; return { type: 'hyper' }; }
  return null;
}
