// Flat-top hexes, "odd-q" offset coordinates {col,row}; cube math internally.
export const COLS = 50, ROWS = 50, SIZE = 18;
export function toCube(col, row) { const q = col; const r = row - (col - (col & 1)) / 2; return { q, r, s: -q - r }; }
export function fromCube(q, r) { return { col: q, row: r + (q - (q & 1)) / 2 }; }
export function dist(a, b) {
  const A = toCube(a.col, a.row), B = toCube(b.col, b.row);
  return Math.max(Math.abs(A.q - B.q), Math.abs(A.r - B.r), Math.abs(A.s - B.s));
}
export const eq = (a, b) => a.col === b.col && a.row === b.row;
export const inBounds = (h) => h.col >= 0 && h.col < COLS && h.row >= 0 && h.row < ROWS;
function cubeRound(q, r, s) {
  let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}
export function line(a, b) {
  const A = toCube(a.col, a.row), B = toCube(b.col, b.row), N = dist(a, b), out = [];
  for (let i = 0; i <= N; i++) {
    const t = N === 0 ? 0 : i / N;
    const c = cubeRound(A.q + (B.q - A.q) * t + 1e-6, A.r + (B.r - A.r) * t + 1e-6, A.s + (B.s - A.s) * t - 2e-6);
    out.push(fromCube(c.q, c.r));
  }
  return out;
}
export function hexesWithin(center, n) {
  const C = toCube(center.col, center.row), out = [];
  for (let dq = -n; dq <= n; dq++)
    for (let dr = Math.max(-n, -dq - n); dr <= Math.min(n, -dq + n); dr++) {
      const h = fromCube(C.q + dq, C.r + dr);
      if (inBounds(h)) out.push(h);
    }
  return out;
}
export function hexToPixel(col, row) { return { x: SIZE * 1.5 * col + SIZE, y: SIZE * Math.sqrt(3) * (row + 0.5 * (col & 1)) + SIZE }; }
export function pixelToHex(x, y) {
  x -= SIZE; y -= SIZE;
  const q = ((2 / 3) * x) / SIZE, r = ((-1 / 3) * x + (Math.sqrt(3) / 3) * y) / SIZE;
  const c = cubeRound(q, r, -q - r);
  return fromCube(c.q, c.r);
}
