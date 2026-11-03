import { newShip, makeItem } from './ship.js';
export const PRESETS = [
  { name: 'Sample Ship A (Conventional)', make() {
    const s = newShip('conventional');
    s.items.push(makeItem('thruster'), makeItem('beam5', { dice: 2 }), makeItem('beam6', { dice: 1 }), makeItem('tube'), makeItem('shield'));
    s.ammo.photon = 6; s.hullExtra = 2; return s; } }, // 6 photons + 2 hull points keeps the sample at 12,000
  { name: 'Sample Ship B (Solar, no computer)', make() {
    const s = newShip('solar');
    s.items.push(makeItem('sthruster'), makeItem('flare3', { dice: 2 }), makeItem('sunburst', { dice: 6 }), makeItem('sunscreen'), makeItem('sunscreen'), makeItem('sunscreen'));
    s.hullExtra = 10; return s; } }, // solar thruster now 1,500
];
