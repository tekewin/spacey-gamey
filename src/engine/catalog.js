// The "Buyer's Guide". Computer equipment intentionally omitted.
const beam = (n, die, cost, attack = 'beam') => ({ name: `Type ${n} Beam`, side: 'conv', costPerDie: cost, die, attack, charged: true, crit: true, kind: 'weapon', desc: `d${die} per die` });
const flare = (n, die, cost) => ({ name: `Type ${n} Flare`, side: 'solar', costPerDie: cost, die, attack: 'flare', charged: true, crit: true, kind: 'weapon', desc: `d${die} per die` });
export const CATALOG = {
  shield:    { name: 'Shield', side: 'conv', cost: 1000, max: 3, crit: true, kind: 'defense', desc: '−1 to-hit and −1 per damage die vs conventional weapons' },
  impulse:   { name: 'Impulse Engine', side: 'conv', cost: 500, max: 1, crit: true, kind: 'move', move: 1, impulse: true, desc: 'Move 1 hex (cannot combine with thrusters)' },
  mini:      { name: 'Mini-Thruster', side: 'conv', cost: 1000, crit: true, kind: 'move', move: 2, desc: 'Move 2 hexes' },
  thruster:  { name: 'Thruster', side: 'conv', cost: 1500, crit: true, kind: 'move', move: 4, desc: 'Move 4 hexes' },
  hyper:     { name: 'Hyperspace Device', side: 'conv', cost: 1500, max: 1, crit: true, kind: 'move', desc: 'Jump to a random hex' },
  beam1: beam('I', 4, 500), beam2: beam('II', 6, 750), beam3: beam('III', 8, 1000),
  beam4: beam('IV', 10, 1250), beam5: beam('V', 12, 1500, 'beamlong'), beam6: beam('VI', 20, 2500, 'beamlong'), // V & VI reach 45 hexes (designer ruling)
  cannon:    { name: 'Cannon', side: 'conv', cost: 500, attack: 'cannon', ammo: 'shell', dmg: [2, 6], crit: true, kind: 'weapon', desc: 'Fires cannon shells (2d6), range 10' },
  disperser: { name: 'Disperser', side: 'conv', cost: 2000, attack: 'disperser', dmg: [4, 6], crit: true, kind: 'weapon', desc: '4d6' },
  launcher:  { name: 'Missile Launcher', side: 'conv', cost: 1000, attack: 'launcher', crit: true, kind: 'weapon', desc: 'Fires nuclear missiles or plasmas (one per turn)' },
  tube:      { name: 'Photon Tube', side: 'conv', cost: 1000, attack: 'photon', ammo: 'photon', dmg: [3, 6], crit: true, kind: 'weapon', desc: 'Fires photons (3d6)' },
  rlauncher: { name: 'Rocket Launcher', side: 'conv', cost: 500, attack: 'rocket', ammo: 'rocket', shots: 1, crit: true, kind: 'weapon', desc: 'Fires 1 rocket per turn' },
  tripod:    { name: 'Tripod', side: 'conv', cost: 1250, attack: 'rocket', ammo: 'rocket', shots: 3, crit: true, kind: 'weapon', desc: 'Fires 3 rockets per turn' },
  wltb:      { name: 'WLTB', side: 'any', cost: 4000, attack: 'wltb', dmg: [6, 6], crit: true, kind: 'weapon', desc: 'Whip-Lash Thunder Bolt: 6d6, ignores all shields' },
  spc:       { name: 'Solar Power Converter', side: 'solar', cost: 1000, max: 1, crit: false, kind: 'core', desc: 'Required on every solar ship; never crit' },
  sthruster: { name: 'Solar Thruster', side: 'solar', cost: 1500, crit: true, kind: 'move', move: 3, desc: 'Move 3 hexes' },
  sunscreen: { name: 'Sunscreen Shield', side: 'solar', cost: 500, max: 3, crit: true, kind: 'defense', desc: '−1 to-hit and −1 per damage die vs solar weapons' },
  sunburst:  { name: 'Sunburst', side: 'solar', costPerDie: 500, die: 4, attack: 'sunburst', charged: true, crit: true, kind: 'weapon', desc: 'd4 per die' },
  flare1: flare('I', 6, 750), flare2: flare('II', 8, 1000), flare3: flare('III', 10, 1250), flare4: flare('IV', 12, 1500),
  rammer:    { name: 'Rammer', side: 'any', cost: 1500, max: 1, crit: false, kind: 'ram', desc: 'Allows ramming: 1d6 per hex travelled; the rammer takes ¼ of that' },
  derammer:  { name: 'De-Rammer', side: 'any', cost: 1500, max: 1, crit: false, kind: 'ram', desc: 'Halves ram damage taken; a rammer fitted with one takes no damage when it rams' },
};
export const AMMO = {
  photon: { name: 'Photons', cost: 150, needs: ['tube'], dmg: '3d6' },
  shell:  { name: 'Cannon Shells', cost: 25, needs: ['cannon'], dmg: '2d6' },
  rocket: { name: 'Rockets', cost: 25, needs: ['rlauncher', 'tripod'], dmg: 'by range' },
  plasma: { name: 'Plasmas', cost: 750, needs: ['launcher'], dmg: '30' },
  nuke:   { name: 'Nuclear Missiles', cost: 1000, needs: ['launcher'], dmg: '20d6' },
};
export const CHARGER_COST = 1000, MISSILE_THRUSTER_COST = 250, HULL_COST = 50, BASE_HULL = 50, START_CREDITS = 12000;
export const NUKE_SPEED = [1, 4, 8];
export function formSide(form) { return form === 'flare' || form === 'sunburst' ? 'solar' : form === 'wltb' ? 'none' : 'conv'; }
export function chargerName(c) { return c.side === 'solar' ? 'Solar Generator' : 'Beam Recharger'; }
export function itemLabel(it) {
  const c = CATALOG[it.id];
  return c.costPerDie ? `${it.dice}d${c.die} ${c.name}` : c.name;
}
