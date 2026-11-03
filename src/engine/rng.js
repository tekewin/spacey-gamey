// Seedable PRNG (mulberry32). State lives on a plain object so battles serialize.
export function rngFor(obj, key = 'rng') {
  return {
    next() {
      let s = (obj[key] + 0x6d2b79f5) | 0;
      obj[key] = s;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}
export function seededRng(seed) { const o = { rng: seed | 0 }; return rngFor(o); }
export const die = (R, sides) => 1 + Math.floor(R.next() * sides);
export const roll = (R, n, sides) => Array.from({ length: n }, () => die(R, sides));
export const randomSeed = () => (Math.random() * 2 ** 31) | 0;
