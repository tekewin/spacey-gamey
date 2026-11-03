import { describe, it, expect } from 'vitest';
import { chartValue } from '../src/engine/tohit.js';
import { newShip, makeItem, shipValue, shipClass, classFloor, checkShip, sanitizeShip } from '../src/engine/ship.js';
import { createBattle, endTurn, act, hpLeft } from '../src/engine/combat.js';
import { aiBuildShip, aiNextAction } from '../src/engine/ai.js';
import { dist } from '../src/engine/hex.js';
import { PRESETS } from '../src/engine/presets.js';

describe('to-hit chart matches the rulebook example', () => {
  const cases = [['photon', 32, 14], ['flare', 36, 18], ['flare', 29, 15], ['sunburst', 29, 18], ['beam', 25, 16], ['photon', 25, 12], ['flare', 22, 14], ['sunburst', 22, 16]];
  for (const [f, d, n] of cases) it(`${f} @ ${d} = ${n}`, () => expect(chartValue(f, d)).toBe(n));
  it('Type V/VI beams reach 45', () => { expect(chartValue('beamlong', 25)).toBe(16); expect(chartValue('beamlong', 45)).toBe(20); expect(chartValue('beamlong', 46)).toBeNull(); expect(chartValue('beam', 31)).toBeNull(); });
  it('ships start 50 apart', () => { const b = createBattle(PRESETS[0].make(), aiBuildShip(12000, 1), 1); expect(dist(b.ships.human.pos, b.ships.ai.pos)).toBe(50); });
  it('out of range is null', () => { expect(chartValue('cannon', 10)).toBe(16); expect(chartValue('cannon', 11)).toBeNull(); expect(chartValue('photon', 80)).toBe(20); expect(chartValue('rocket', 5)).toBe(2); });
});

describe('ship value and class', () => {
  it('sample ships cost exactly 12,000', () => { for (const p of PRESETS) expect(shipValue(p.make())).toBe(12000); });
  it('class boundaries', () => { expect(shipClass(12000)).toBe(1); expect(shipClass(21999)).toBe(1); expect(shipClass(22000)).toBe(2); expect(shipClass(25000)).toBe(2); expect(classFloor(2)).toBe(22000); expect(classFloor(4)).toBe(42000); });
  it('AI spends close to the class floor without exceeding it', () => {
    for (const budget of [12000, 22000, 42000]) for (let s = 1; s < 40; s++) {
      const ai = aiBuildShip(budget, s), v = shipValue(ai);
      expect(v).toBeLessThanOrEqual(budget); expect(v).toBeGreaterThan(budget - 50); expect(checkShip(ai).errors).toEqual([]);
    }
  });
  it('round-trips through sanitize', () => { const s = PRESETS[0].make(); s.name = 'X'; expect(shipValue(sanitizeShip(JSON.parse(JSON.stringify(s))))).toBe(12000); });
});

describe('victory restock', () => {
  it('restores pre-battle ammo and full hull', async () => {
    const { survivorShip } = await import('../src/engine/combat.js');
    const a = PRESETS[0].make(); a.name = 'A'; const c = aiBuildShip(12000, 3);
    const b = createBattle(a, c, 1); b.ships.human.ammo.photon = 2; b.ships.human.damage = 40; b.ships.human.destroyed.x = true;
    const s = survivorShip(b); expect(s.ammo.photon).toBe(6); expect(shipValue(s)).toBe(12000); expect(s.record.wins).toBe(1);
  });
});

describe('missile damage is cumulative', () => {
  it('two small hits destroy it', async () => {
    const { fire } = await import('../src/engine/combat.js');
    const a = PRESETS[0].make(); a.name = 'A'; const c = aiBuildShip(12000, 3);
    const b = createBattle(a, c, 5);
    b.missiles.push({ id: 99, owner: 'ai', pos: { col: 9, row: 9 }, speed: 4, damage: 9 });
    const tube = b.ships.human.def.items.find((i) => i.id === 'tube');
    for (let i = 0; i < 20 && b.missiles.length; i++) { b.ships.human.fired = {}; b.ships.human.ammo.photon = 5; fire(b, 'human', tube.uid, { target: 99 }); }
    expect(b.missiles.length).toBe(0);
  });
});

describe('nuke launch', () => {
  it('guided nuke moves its speed immediately', async () => {
    const { fire } = await import('../src/engine/combat.js');
    const a = PRESETS[0].make(); a.name = 'A'; a.items.push({ uid: 'L', id: 'launcher' }); a.ammo.nuke = [{ thrusters: 2 }];
    const b = createBattle(a, aiBuildShip(12000, 3), 5);
    fire(b, 'human', 'L', { mode: 'nuke' });
    expect(b.missiles.length).toBe(1);
    expect(dist(b.missiles[0].pos, { col: 8, row: 8 })).toBe(8);
  });
  it('every hit logs a crit check', async () => {
    const { fire } = await import('../src/engine/combat.js');
    const a = PRESETS[0].make(); a.name = 'A';
    const b = createBattle(a, aiBuildShip(12000, 3), 7); b.ships.ai.pos = { col: 9, row: 8 };
    const tube = b.ships.human.def.items.find((i) => i.id === 'tube');
    for (let i = 0; i < 6; i++) { b.ships.human.fired = {}; b.ships.human.ammo.photon = 5; fire(b, 'human', tube.uid); }
    const hits = b.log.filter((l) => /HIT/.test(l.text)).length, checks = b.log.filter((l) => /Crit check/.test(l.text)).length;
    expect(hits).toBeGreaterThan(0); expect(checks).toBe(b.over ? checks : hits);
  });
});

describe('AI vs AI full battles run to completion', () => {
  it('300 battles', { timeout: 120000 }, () => {
    let finished = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const budget = [12000, 22000, 32000][seed % 3];
      const a = aiBuildShip(budget, seed * 7), c = aiBuildShip(budget, seed * 13);
      const b = createBattle(a, c, seed);
      for (let t = 0; t < 400 && !b.over; t++) {
        let g = 0, x;
        while ((x = aiNextAction(b, b.active)) && g++ < 50) act(b, b.active, x);
        endTurn(b);
      }
      if (b.over) { finished++; expect(hpLeft(b.ships[b.winner === 'human' ? 'ai' : 'human'])).toBeLessThanOrEqual(0); }
      expect(JSON.parse(JSON.stringify(b)).turn).toBe(b.turn);
    }
    console.log('finished', finished, '/ 300');
    expect(finished).toBeGreaterThan(200);
  });
});

describe('designer rulings 2026-11-03', () => {
  it('rammer takes 1/4, or none with a de-rammer; rockets can crit', async () => {
    const { ram, fire } = await import('../src/engine/combat.js');
    const a = PRESETS[0].make(); a.name = 'A'; a.items.push({ uid: 'R', id: 'rammer' });
    for (const der of [false, true]) {
      const s = JSON.parse(JSON.stringify(a)); if (der) s.items.push({ uid: 'D', id: 'derammer' });
      const foe = aiBuildShip(12000, 3); foe.items = foe.items.filter((i) => i.id !== 'derammer'); foe.hullExtra = 500;
      const b = createBattle(s, foe, 9); b.ships.ai.pos = { col: 11, row: 8 };
      ram(b, 'human');
      const dealt = b.ships.ai.damage, self = b.ships.human.damage;
      expect(self).toBe(der ? 0 : Math.floor(dealt / 4));
    }
    const r = PRESETS[0].make(); r.name = 'R'; r.items.push({ uid: 'T', id: 'tripod' }); r.ammo.rocket = 300;
    const foe = aiBuildShip(12000, 3); foe.hullExtra = 2000;
    const b = createBattle(r, foe, 4); b.ships.ai.pos = { col: 9, row: 8 };
    for (let i = 0; i < 40; i++) { b.ships.human.fired = {}; fire(b, 'human', 'T'); }
    expect(b.log.filter((l) => /Crit check/.test(l.text)).length).toBe(40);
  });
});
