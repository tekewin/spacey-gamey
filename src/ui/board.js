import { Application, Container, Graphics, Text, Sprite, Texture, TilingSprite } from 'pixi.js';
import { COLS, ROWS, SIZE, hexToPixel, pixelToHex, inBounds } from '../engine/hex.js';
import { sfx } from './sound.js';
import { settings } from './storage.js';

// Beams green, solar weapons yellow, WLTB red (designer request)
const FORM_COLOR = { photon: 0x6fc3ff, beam: 0x39ff6a, beamlong: 0x7dff4a, disperser: 0xff9f40, plasma: 0xd06bff, cannon: 0xfff0b0, wltb: 0xff2a2a, flare: 0xffd21f, sunburst: 0xfff04a, rocket: 0xffffff, nuke: 0xffffff };
const BEAMS = ['beam', 'beamlong', 'flare', 'sunburst', 'wltb', 'disperser'];
const hexColor = (s) => parseInt(s.replace('#', ''), 16);
const corners = (x, y, s = SIZE) => { const p = []; for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; p.push(x + s * Math.cos(a), y + s * Math.sin(a)); } return p; };
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const lerpAng = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };
const mix = (c1, c2, k) => { const r = ((c1 >> 16) & 255) * (1 - k) + ((c2 >> 16) & 255) * k, g = ((c1 >> 8) & 255) * (1 - k) + ((c2 >> 8) & 255) * k, b = (c1 & 255) * (1 - k) + (c2 & 255) * k; return (r << 16) | (g << 8) | b; };

/* ---------- procedural textures ---------- */
function starTexture(size, n, rMin, rMax, aMin, aMax, bright) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  for (let i = 0; i < n; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = rnd(rMin, rMax), a = rnd(aMin, aMax);
    g.fillStyle = pick(['#ffffff', '#ffffff', '#cfe6ff', '#fff0d0', '#d8fff0']); g.globalAlpha = a; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    if (bright && r > rMax * 0.8) { g.globalAlpha = a * 0.3; g.fillRect(x - r * 4, y - 0.4, r * 8, 0.8); g.fillRect(x - 0.4, y - r * 4, 0.8, r * 8); }
  }
  return Texture.from(c);
}
function nebulaTexture(w, h) {
  const s = 0.5, c = document.createElement('canvas'); c.width = w * s; c.height = h * s; const g = c.getContext('2d');
  g.globalCompositeOperation = 'lighter';
  const cols = ['rgba(110,40,200,', 'rgba(20,110,170,', 'rgba(190,40,120,', 'rgba(30,160,110,', 'rgba(80,60,210,'];
  for (let k = 0; k < 7; k++) {
    const col = pick(cols), fx = rnd(0.05, 0.95), fy = rnd(0.05, 0.95), fr = rnd(0.25, 0.5);
    for (let i = 0; i < 22; i++) {
      const x = (fx + rnd(-0.15, 0.15)) * c.width, y = (fy + rnd(-0.15, 0.15)) * c.height, r = fr * c.width * rnd(0.15, 0.5);
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col + rnd(0.03, 0.06) + ')'); gr.addColorStop(1, col + '0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  }
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 50; i++) { const x = rnd(0, c.width), y = rnd(0, c.height), r = rnd(15, 70); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(2,3,10,0.4)'); gr.addColorStop(1, 'rgba(2,3,10,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  return Texture.from(c);
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return Texture.from(c);
}

/* ---------- ship hulls (drawn pointing +x, ~1 unit = SIZE) ---------- */
function drawHull(g, type, col, foe) {
  const s = SIZE * 0.82, P = (pts) => pts.map((v) => v * s);
  const dark = mix(0x0a1014, col, 0.38), hi = mix(col, 0xffffff, 0.55);
  if (type === 'solar') {
    // solar panel wings
    for (const sgn of [-1, 1]) {
      g.rect(-0.55 * s, sgn > 0 ? 0.28 * s : -0.98 * s, 0.75 * s, 0.7 * s).fill({ color: 0x24407a }).stroke({ width: 1.2, color: col });
      for (let i = 1; i < 4; i++) g.moveTo(-0.55 * s + i * 0.1875 * s, sgn > 0 ? 0.28 * s : -0.98 * s).lineTo(-0.55 * s + i * 0.1875 * s, sgn > 0 ? 0.98 * s : -0.28 * s);
      g.moveTo(-0.55 * s, sgn * 0.63 * s).lineTo(0.2 * s, sgn * 0.63 * s);
      g.stroke({ width: 0.7, color: col, alpha: 0.55 });
      g.moveTo(-0.15 * s, sgn * 0.12 * s).lineTo(-0.15 * s, sgn * 0.28 * s).stroke({ width: 2, color: col, alpha: 0.8 });
    }
    g.poly(P([0.95, 0, 0.35, -0.2, -0.75, -0.2, -0.85, 0, -0.75, 0.2, 0.35, 0.2])).fill({ color: dark }).stroke({ width: 1.6, color: col });
  } else if (foe) {
    g.poly(P([1.0, 0, 0.2, -0.28, 0.55, -0.9, -0.6, -0.5, -0.8, -0.2, -0.65, 0, -0.8, 0.2, -0.6, 0.5, 0.55, 0.9, 0.2, 0.28])).fill({ color: dark }).stroke({ width: 1.6, color: col });
    g.moveTo(0.55 * s, -0.9 * s).lineTo(0.95 * s, -0.75 * s).moveTo(0.55 * s, 0.9 * s).lineTo(0.95 * s, 0.75 * s).stroke({ width: 1.4, color: col });
  } else {
    g.poly(P([1.05, 0, 0.1, -0.24, -0.45, -0.95, -0.7, -0.9, -0.55, -0.25, -0.8, 0, -0.55, 0.25, -0.7, 0.9, -0.45, 0.95, 0.1, 0.24])).fill({ color: dark }).stroke({ width: 1.6, color: col });
    g.moveTo(-0.1 * s, -0.4 * s).lineTo(0.35 * s, -0.12 * s).moveTo(-0.1 * s, 0.4 * s).lineTo(0.35 * s, 0.12 * s).stroke({ width: 0.8, color: col, alpha: 0.6 });
  }
  g.moveTo(-0.5 * s, 0).lineTo(0.8 * s, 0).stroke({ width: 1, color: hi, alpha: 0.7 });
  g.ellipse(0.38 * s, 0, 0.19 * s, 0.09 * s).fill({ color: 0xffffff, alpha: 0.95 });
}

export class Board {
  async init(el, handlers) {
    this.el = el; this.h = handlers;
    this.app = new Application();
    await this.app.init({ resizeTo: el, background: 0x02030a, antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2) });
    el.appendChild(this.app.canvas);
    this.glowTex = glowTexture();
    // Parallax star layers live outside the world so they scroll slower than the board
    this.bg = new Container();
    this.far = new TilingSprite({ texture: starTexture(512, 260, 0.3, 0.9, 0.2, 0.6), width: 10, height: 10 });
    this.near = new TilingSprite({ texture: starTexture(512, 40, 0.8, 1.7, 0.5, 1, true), width: 10, height: 10 });
    this.bg.addChild(this.far, this.near);
    this.shaker = new Container();
    this.app.stage.addChild(this.bg, this.shaker);
    const w = (this.world = new Container());
    this.shaker.addChild(w);
    this.nebula = new Sprite(); this.grid = new Graphics(); this.edge = new Graphics(); this.overlay = new Graphics(); this.rangeG = new Graphics();
    this.reticle = new Graphics(); this.hover = new Graphics(); this.tokens = new Container(); this.fx = new Container();
    this.pNorm = new Graphics(); this.pAdd = new Graphics(); this.pAdd.blendMode = 'add';
    this.fxAdd = new Container(); this.fxAdd.blendMode = 'add';
    w.addChild(this.nebula, this.grid, this.edge, this.overlay, this.rangeG, this.reticle, this.hover, this.pNorm, this.tokens, this.fx, this.fxAdd, this.pAdd);
    this.drawStatic();
    this.ships = {}; this.missiles = {}; this.dead = new Set(); this.shielded = {};
    this.parts = []; this.rings = []; this.shake = 0; this.time = 0;
    this.app.ticker.add((tk) => this.tick(tk.deltaMS / 1000));
    this.setupInput();
  }
  destroy() { try { this.app.destroy(true, { children: true }); } catch {} }

  drawStatic() {
    const last = hexToPixel(COLS - 1, ROWS - 1);
    this.W = last.x + SIZE * 2; this.H = last.y + SIZE * 2;
    const m = 300;
    this.nebula.texture = nebulaTexture(this.W + m * 2, this.H + m * 2);
    this.nebula.position.set(-m, -m); this.nebula.width = this.W + m * 2; this.nebula.height = this.H + m * 2;
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) { const p = hexToPixel(c, r); this.grid.poly(corners(p.x, p.y)); }
    this.grid.stroke({ width: 1, color: 0x58c8ff, alpha: 0.16 });
    // brighter sector lines every 10 hexes
    for (let c = 0; c < COLS; c += 10) for (let r = 0; r < ROWS; r++) { const p = hexToPixel(c, r); this.grid.circle(p.x, p.y, 1.2); }
    for (let r = 0; r < ROWS; r += 10) for (let c = 0; c < COLS; c++) { const p = hexToPixel(c, r); this.grid.circle(p.x, p.y, 1.2); }
    this.grid.fill({ color: 0x8fe8ff, alpha: 0.35 });
    for (let c = 0; c < COLS; c += 10) for (let r = 0; r < ROWS; r += 10) {
      const p = hexToPixel(c, r), t = new Text({ text: `${c},${r}`, style: { fill: 0x8fe8ff, fontSize: 9, fontFamily: 'Share Tech Mono, monospace' } });
      t.alpha = 0.5; t.anchor.set(0.5); t.position.set(p.x, p.y); this.grid.addChild(t);
    }
    // glowing sector boundary with corner brackets
    const e = this.edge, W = this.W, H = this.H, k = 60;
    e.roundRect(-6, -6, W + 12, H + 12, 10).stroke({ width: 10, color: 0x2bd4ff, alpha: 0.06 }).roundRect(-6, -6, W + 12, H + 12, 10).stroke({ width: 1.5, color: 0x58c8ff, alpha: 0.4 });
    for (const [x, y, sx, sy] of [[-10, -10, 1, 1], [W + 10, -10, -1, 1], [-10, H + 10, 1, -1], [W + 10, H + 10, -1, -1]]) e.moveTo(x + sx * k, y).lineTo(x, y).lineTo(x, y + sy * k).stroke({ width: 3, color: 0x8fe8ff, alpha: 0.85 });
  }

  /* ---------- per-frame: parallax, pulses, particles, shake ---------- */
  tick(dt) {
    this.time += dt;
    const sw = this.app.screen.width, sh = this.app.screen.height, w = this.world;
    for (const L of [this.far, this.near]) { if (L.width !== sw) L.width = sw; if (L.height !== sh) L.height = sh; }
    this.far.tilePosition.set(w.x * 0.08 - this.time * 2, w.y * 0.08);
    this.near.tilePosition.set(w.x * 0.22 - this.time * 5, w.y * 0.22);
    this.overlay.alpha = 0.75 + 0.25 * Math.sin(this.time * 4);
    this.reticle.rotation += dt * 0.8; this.reticle.scale.set(1 + 0.06 * Math.sin(this.time * 6));
    for (const side in this.ships) {
      const t = this.ships[side];
      t.glow.alpha = 0.45 + 0.15 * Math.sin(this.time * 2.5 + (side === 'ai' ? 1.5 : 0));
      t.ring.rotation += dt * (side === 'ai' ? -0.6 : 0.6);
      t.body.rotation = lerpAng(t.body.rotation, t.face, Math.min(1, dt * 12));
      t.thrust = Math.max(0.18, t.thrust - dt * 1.5);
      t.flame.scale.set(t.thrust * (0.8 + Math.random() * 0.4), 0.8 + Math.random() * 0.25);
      t.shield.alpha = Math.max(0, t.shield.alpha - dt * 2); t.shield.scale.set(1 + (1 - t.shield.alpha) * 0.15);
    }
    for (const id in this.missiles) { const m = this.missiles[id]; m.blink.alpha = Math.sin(this.time * 12 + +id) > 0 ? 1 : 0.2; }
    // particles
    const pa = this.pAdd, pn = this.pNorm; pa.clear(); pn.clear();
    for (const p of this.parts) {
      p.life -= dt; if (p.life <= 0) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= p.drag; p.vy *= p.drag;
      const k = p.life / p.max;
      if (p.kind === 'smoke') { pn.circle(p.x, p.y, p.r * (1.8 - k)).fill({ color: 0x55606a, alpha: 0.28 * k }); }
      else if (p.kind === 'debris') { pn.rect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r).fill({ color: mix(0x7a8a99, 0x111111, 1 - k), alpha: k }); pa.circle(p.x, p.y, p.r * 0.6).fill({ color: 0xff8a3a, alpha: k * 0.6 }); }
      else if (p.kind === 'streak') { pa.moveTo(p.x, p.y).lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04).stroke({ width: p.r, color: p.color, alpha: k }); }
      else pa.circle(p.x, p.y, p.r * (0.4 + k * 0.6)).fill({ color: p.color, alpha: k });
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const r of this.rings) {
      r.t += dt; const k = Math.min(1, r.t / r.dur), e = 1 - Math.pow(1 - k, 3);
      pa.circle(r.x, r.y, r.r * e).stroke({ width: r.w * (1 - k) + 1, color: r.color, alpha: (1 - k) * r.a });
      if (r.fill) pa.circle(r.x, r.y, r.r * e * 0.9).fill({ color: r.color, alpha: (1 - k) * 0.12 });
    }
    this.rings = this.rings.filter((r) => r.t < r.dur);
    // screen shake
    if (this.shake > 0.1) { this.shaker.position.set(rnd(-1, 1) * this.shake, rnd(-1, 1) * this.shake); this.shake *= Math.pow(0.0015, dt); }
    else if (this.shake) { this.shake = 0; this.shaker.position.set(0, 0); }
  }
  emit(kind, x, y, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = o.dir != null ? o.dir + rnd(-(o.spread ?? 0.5), o.spread ?? 0.5) : rnd(0, 6.283), v = rnd(o.vmin ?? 30, o.vmax ?? 200), life = rnd(o.lmin ?? 0.3, o.lmax ?? 0.9);
      this.parts.push({ kind, x: x + rnd(-(o.jit || 0), o.jit || 0), y: y + rnd(-(o.jit || 0), o.jit || 0), vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, r: rnd(o.rmin ?? 1, o.rmax ?? 2.5), color: Array.isArray(o.color) ? pick(o.color) : o.color ?? 0xffc070, drag: o.drag ?? 0.94 });
    }
  }
  ring(x, y, r, o = {}) { this.rings.push({ x, y, r, t: 0, dur: o.dur ?? 0.5, w: o.w ?? 4, color: o.color ?? 0xffd9a0, a: o.a ?? 0.9, fill: o.fill }); }
  flash(x, y, r, color = 0xffffff, ms = 250) {
    const s = new Sprite(this.glowTex); s.anchor.set(0.5); s.tint = color; s.blendMode = 'add'; s.position.set(x, y); s.width = s.height = r * 2; this.fxAdd.addChild(s);
    this.tween(ms, (k) => { s.alpha = 1 - k; s.scale.set((r * 2 / 64) * (1 + k * 0.5)); }).then(() => s.destroy());
  }
  bump(n) { if (settings.reduceShake) return; this.shake = Math.max(this.shake, n); }

  setupInput() {
    const c = this.app.canvas, w = this.world;
    let down = null, moved = false;
    const toHex = (e) => { const r = c.getBoundingClientRect(); return pixelToHex((e.clientX - r.left - w.x) / w.scale.x, (e.clientY - r.top - w.y) / w.scale.y); };
    const pointers = new Map(); let pinch = null;
    c.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, e); c.setPointerCapture(e.pointerId);
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), s: w.scale.x }; down = null; return; }
      down = { x: e.clientX, y: e.clientY, wx: w.x, wy: w.y }; moved = false;
    });
    c.addEventListener('pointermove', (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, e);
      if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); this.zoomAt((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2, (pinch.s * d / pinch.d) / w.scale.x); return; }
      if (down) { const dx = e.clientX - down.x, dy = e.clientY - down.y; if (Math.abs(dx) + Math.abs(dy) > 5) moved = true; if (moved) { w.x = down.wx + dx; w.y = down.wy + dy; this.clamp(); } }
      const h = toHex(e); this.showHover(inBounds(h) ? h : null); this.h.onHover?.(inBounds(h) ? h : null);
    });
    const up = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; if (down && !moved) { const h = toHex(e); if (inBounds(h)) this.h.onClick?.(h); } down = null; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => { this.showHover(null); this.h.onHover?.(null); });
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  }
  zoomAt(cx, cy, f) {
    const w = this.world, r = this.app.canvas.getBoundingClientRect();
    const ns = Math.min(3, Math.max(0.25, w.scale.x * f)); f = ns / w.scale.x;
    const px = cx - r.left, py = cy - r.top;
    w.x = px - (px - w.x) * f; w.y = py - (py - w.y) * f; w.scale.set(ns); this.clamp();
  }
  zoomBy(f) { const r = this.app.canvas.getBoundingClientRect(); this.zoomAt(r.left + r.width / 2, r.top + r.height / 2, f); }
  centerOn(h, scale) {
    const w = this.world; if (scale) w.scale.set(scale);
    const p = hexToPixel(h.col, h.row);
    w.x = this.app.screen.width / 2 - p.x * w.scale.x; w.y = this.app.screen.height / 2 - p.y * w.scale.y;
    this.clamp();
  }
  clamp() {
    const w = this.world, sw = this.app.screen.width, sh = this.app.screen.height, m = 40;
    const mw = this.W * w.scale.x, mh = this.H * w.scale.y;
    w.x = mw + 2 * m < sw ? (sw - mw) / 2 : Math.min(m, Math.max(sw - mw - m, w.x));
    w.y = mh + 2 * m < sh ? (sh - mh) / 2 : Math.min(m, Math.max(sh - mh - m, w.y));
  }
  fitAll() { const s = Math.min(this.app.screen.width / this.W, this.app.screen.height / this.H) * 0.95; this.world.scale.set(s); this.world.x = (this.app.screen.width - this.W * s) / 2; this.world.y = (this.app.screen.height - this.H * s) / 2; }

  showHover(h) { this.hover.clear(); if (!h) return; const p = hexToPixel(h.col, h.row); this.hover.poly(corners(p.x, p.y)).fill({ color: 0xffffff, alpha: 0.06 }).stroke({ width: 2, color: 0xffffff, alpha: 0.7 }); }
  setReachable(list) {
    this.overlay.clear(); if (!list?.length) return;
    for (const h of list) { const p = hexToPixel(h.col, h.row); this.overlay.poly(corners(p.x, p.y, SIZE - 1.5)); }
    this.overlay.fill({ color: 0x2bd46b, alpha: 0.12 }).stroke({ width: 1, color: 0x5af090, alpha: 0.35 });
  }
  setRange(center, r, color = 0xffc94a, target) {
    this.rangeG.clear(); this.reticle.clear();
    if (target) {
      const t = hexToPixel(target.col, target.row), R = SIZE * 1.15, g = this.reticle;
      g.position.set(t.x, t.y);
      for (let i = 0; i < 4; i++) { const a = (Math.PI / 2) * i + 0.25; g.moveTo(Math.cos(a) * R, Math.sin(a) * R).arc(0, 0, R, a, a + Math.PI / 2 - 0.5); }
      g.stroke({ width: 2, color: 0xff5a5a, alpha: 0.95 });
      for (let i = 0; i < 4; i++) { const a = (Math.PI / 2) * i + Math.PI / 4; g.moveTo(Math.cos(a) * (R + 7), Math.sin(a) * (R + 7)).lineTo(Math.cos(a) * (R - 3), Math.sin(a) * (R - 3)); }
      g.stroke({ width: 2, color: 0xff8a8a, alpha: 0.9 });
    }
    if (!center || !r || !isFinite(r)) return;
    const p = hexToPixel(center.col, center.row), R = (r + 0.5) * SIZE * Math.sqrt(3);
    this.rangeG.circle(p.x, p.y, R).fill({ color, alpha: 0.04 }).stroke({ width: 6, color, alpha: 0.12 }).circle(p.x, p.y, R).stroke({ width: 1.5, color, alpha: 0.8 });
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; this.rangeG.moveTo(p.x + Math.cos(a) * (R - 5), p.y + Math.sin(a) * (R - 5)).lineTo(p.x + Math.cos(a) * R, p.y + Math.sin(a) * R); }
    this.rangeG.stroke({ width: 1, color, alpha: 0.6 });
  }

  /* ---------- ship tokens ---------- */
  makeToken(def, side) {
    const c = new Container(), col = hexColor(def.counter.color), foe = side === 'ai';
    const glow = new Sprite(this.glowTex); glow.anchor.set(0.5); glow.tint = col; glow.width = glow.height = SIZE * 3.6; glow.blendMode = 'add';
    const ring = new Graphics();
    for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i + 0.12, R = SIZE * 0.98; ring.moveTo(Math.cos(a) * R, Math.sin(a) * R).arc(0, 0, R, a, a + Math.PI / 3 - 0.24); }
    ring.stroke({ width: 1.5, color: col, alpha: 0.7 });
    const shield = new Graphics(); shield.poly(corners(0, 0, SIZE * 1.15)).fill({ color: 0x6fc3ff, alpha: 0.18 }).stroke({ width: 2, color: 0xaee4ff, alpha: 0.9 }); shield.alpha = 0; shield.blendMode = 'add';
    const body = new Container();
    const flame = new Graphics(); flame.poly([0, -SIZE * 0.16, -SIZE * 0.9, 0, 0, SIZE * 0.16]).fill({ color: foe ? 0xff6a3a : 0x6fdcff, alpha: 0.85 }).poly([0, -SIZE * 0.07, -SIZE * 0.5, 0, 0, SIZE * 0.07]).fill({ color: 0xffffff, alpha: 0.95 });
    flame.position.set(-SIZE * 0.62, 0); flame.blendMode = 'add';
    const hull = new Graphics(); drawHull(hull, def.type, col, foe);
    body.addChild(flame, hull);
    const badge = new Container(), t = new Text({ text: def.counter.glyph, style: { fill: col, fontSize: 10, fontWeight: '900', fontFamily: 'Orbitron, monospace' } });
    t.anchor.set(0.5); const bg = new Graphics().circle(0, 0, 8).fill({ color: 0x000000, alpha: 0.85 }).stroke({ width: 1.2, color: col });
    badge.addChild(bg, t); badge.position.set(SIZE * 0.72, SIZE * 0.72);
    c.addChild(glow, ring, body, shield, badge);
    Object.assign(c, { glow, ring, body, flame, shield, face: 0, thrust: 0.2 });
    return c;
  }
  syncShips(b) {
    for (const side of ['human', 'ai']) {
      const S = b.ships[side];
      this.shielded[side] = (S.def.items || []).some((i) => i.id === 'shield' || i.id === 'sunscreen');
      if (!this.ships[side]) {
        const tok = (this.ships[side] = this.makeToken(S.def, side)); this.tokens.addChild(tok);
        const o = b.ships[side === 'human' ? 'ai' : 'human'].pos, a = hexToPixel(S.pos.col, S.pos.row), q = hexToPixel(o.col, o.row);
        tok.face = tok.body.rotation = Math.atan2(q.y - a.y, q.x - a.x);
      }
      const p = hexToPixel(S.pos.col, S.pos.row), off = side === 'ai' && S.pos.col === b.ships.human.pos.col && S.pos.row === b.ships.human.pos.row ? 7 : 0;
      this.ships[side].position.set(p.x + off, p.y + off); this.ships[side].alpha = 1;
      this.ships[side].visible = !this.dead.has(side);
    }
    const ids = new Set(b.missiles.map((m) => m.id));
    for (const [id, g] of Object.entries(this.missiles)) if (!ids.has(+id)) { g.destroy({ children: true }); delete this.missiles[id]; }
    for (const m of b.missiles) {
      if (!this.missiles[m.id]) {
        const g = new Container(), col = m.owner === 'human' ? 0x7cffb2 : 0xff5a5a, body = new Graphics();
        body.poly([9, 0, 4, -3, -6, -3, -9, -6, -8, 0, -9, 6, -6, 3, 4, 3]).fill({ color: 0xdfe6ea }).stroke({ width: 1, color: col });
        body.rect(-2, -3, 3, 6).fill({ color: 0xffd21f });
        const blink = new Graphics().circle(9, 0, 2.2).fill({ color: col }); blink.blendMode = 'add';
        const halo = new Sprite(this.glowTex); halo.anchor.set(0.5); halo.tint = col; halo.width = halo.height = 30; halo.alpha = 0.5; halo.blendMode = 'add';
        const t = new Text({ text: String(m.id), style: { fill: 0xffffff, fontSize: 9, fontFamily: 'Share Tech Mono, monospace', stroke: { color: 0x000000, width: 3 } } }); t.position.set(7, -16);
        g.addChild(halo, body, blink, t); Object.assign(g, { body, blink });
        this.tokens.addChild(g); this.missiles[m.id] = g;
      }
      const p = hexToPixel(m.pos.col, m.pos.row); this.missiles[m.id].position.set(p.x, p.y);
    }
  }
  sideAt(x, y) { for (const s in this.ships) { const t = this.ships[s]; if (t.visible && Math.hypot(t.x - x, t.y - y) < SIZE * 0.8) return s; } return null; }
  aim(side, x, y) { const t = this.ships[side]; if (t) t.face = Math.atan2(y - t.y, x - t.x); }

  tween(ms, fn) {
    if (settings.fast) ms = Math.min(ms, ms * 0.3);
    return new Promise((res) => { let t = 0; const tick = (tk) => { t += tk.deltaMS; const k = Math.min(1, t / ms); fn(k); if (k >= 1) { this.app.ticker.remove(tick); res(); } }; this.app.ticker.add(tick); });
  }
  async animMove(side, path) {
    const tok = this.ships[side]; if (!tok) return;
    sfx.thrust(((path.length - 1) * 70 * (settings.fast ? 0.3 : 1)) / 1000);
    for (let i = 1; i < path.length; i++) {
      const a = hexToPixel(path[i - 1].col, path[i - 1].row), b = hexToPixel(path[i].col, path[i].row);
      tok.face = Math.atan2(b.y - a.y, b.x - a.x); tok.thrust = 1.4;
      await this.tween(70, (k) => {
        tok.position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);
        const r = tok.body.rotation; this.emit('glow', tok.x - Math.cos(r) * SIZE * 0.7, tok.y - Math.sin(r) * SIZE * 0.7, 1, { vmin: 5, vmax: 25, lmin: 0.25, lmax: 0.5, rmin: 1.5, rmax: 3, color: side === 'ai' ? [0xff8a4a, 0xffc070] : [0x6fdcff, 0xbff4ff] });
      });
    }
  }
  async animShot(form, from, to, hit) {
    const a0 = hexToPixel(from.col, from.row), b = hexToPixel(to.col, to.row), col = FORM_COLOR[form] ?? 0xffffff;
    const shooter = this.sideAt(a0.x, a0.y); if (shooter) this.aim(shooter, b.x, b.y);
    const ang = Math.atan2(b.y - a0.y, b.x - a0.x), a = { x: a0.x + Math.cos(ang) * SIZE * 0.7, y: a0.y + Math.sin(ang) * SIZE * 0.7 };
    sfx.shot(form);
    const ex = hit ? b.x : b.x + (Math.random() - 0.5) * 60, ey = hit ? b.y : b.y + (Math.random() - 0.5) * 60;
    const g = new Graphics(); this.fxAdd.addChild(g);
    this.flash(a.x, a.y, BEAMS.includes(form) ? 14 : 10, col, 180);
    if (BEAMS.includes(form)) {
      // beams: glowing core + soft outer bloom, with crackle for WLTB and a fan for dispersers
      const wide = form === 'sunburst' ? 3 : form === 'flare' ? 2 : form === 'wltb' ? 1.4 : 1;
      const ends = form === 'disperser' ? [-0.12, -0.05, 0, 0.05, 0.12].map((d) => { const L = Math.hypot(ex - a.x, ey - a.y), an = Math.atan2(ey - a.y, ex - a.x) + d; return { x: a.x + Math.cos(an) * L, y: a.y + Math.sin(an) * L }; }) : [{ x: ex, y: ey }];
      await this.tween(320, (k) => {
        g.clear(); const grow = Math.min(1, k * 4), fade = k < 0.5 ? 1 : 1 - (k - 0.5) * 2;
        for (const e of ends) {
          const tx = a.x + (e.x - a.x) * grow, ty = a.y + (e.y - a.y) * grow;
          g.moveTo(a.x, a.y).lineTo(tx, ty).stroke({ width: 12 * wide, color: col, alpha: 0.12 * fade });
          g.moveTo(a.x, a.y).lineTo(tx, ty).stroke({ width: 5 * wide, color: col, alpha: 0.35 * fade });
          g.moveTo(a.x, a.y).lineTo(tx, ty).stroke({ width: 1.6 * wide, color: 0xffffff, alpha: 0.95 * fade });
        }
        if (form === 'wltb') {
          let px = a.x, py = a.y; const tx = a.x + (ex - a.x) * grow, ty = a.y + (ey - a.y) * grow;
          for (let i = 1; i <= 10; i++) { const nx = a.x + (tx - a.x) * i / 10 + (i < 10 ? rnd(-14, 14) : 0), ny = a.y + (ty - a.y) * i / 10 + (i < 10 ? rnd(-14, 14) : 0); g.moveTo(px, py).lineTo(nx, ny).stroke({ width: 2, color: 0xff8080, alpha: fade }); px = nx; py = ny; }
        }
        if (form === 'sunburst' || form === 'flare') for (let i = 0; i < 8; i++) { const an = (i / 8) * 6.283 + k * 2; g.moveTo(a.x, a.y).lineTo(a.x + Math.cos(an) * 16 * wide * fade, a.y + Math.sin(an) * 16 * wide * fade).stroke({ width: 1.5, color: 0xfff6b0, alpha: fade }); }
        if (grow >= 1 && Math.random() < 0.6) for (const e of ends) this.emit('streak', e.x, e.y, 1, { color: [col, 0xffffff], vmin: 60, vmax: 220, lmin: 0.15, lmax: 0.35, rmin: 1, rmax: 1.8, dir: ang + Math.PI, spread: 1.2 });
      });
    } else {
      const dist = Math.hypot(ex - a.x, ey - a.y), ms = Math.min(520, 140 + dist * 0.45);
      const n = form === 'rocket' ? 3 : 1, offs = [...Array(n)].map((_, i) => ({ d: n > 1 ? (i - 1) * 7 : 0, lag: i * 0.12 }));
      const nx = -Math.sin(ang), ny = Math.cos(ang);
      await this.tween(ms * (1 + (n - 1) * 0.12), (K) => {
        g.clear();
        for (const o of offs) {
          const k = Math.max(0, Math.min(1, (K * (1 + (n - 1) * 0.12)) - o.lag)); if (k <= 0) continue;
          const curve = form === 'rocket' ? Math.sin(k * Math.PI) * o.d * 2 : 0;
          const x = a.x + (ex - a.x) * k + nx * (o.d + curve) * (1 - k), y = a.y + (ey - a.y) * k + ny * (o.d + curve) * (1 - k);
          if (form === 'photon') {
            g.circle(x, y, 9).fill({ color: col, alpha: 0.2 }).circle(x, y, 4.5).fill({ color: col, alpha: 0.7 }).circle(x, y, 2.2).fill({ color: 0xffffff });
            this.emit('glow', x, y, 1, { vmin: 5, vmax: 20, lmin: 0.2, lmax: 0.4, rmin: 2, rmax: 3.5, color: [col, 0xbfe8ff] });
          } else if (form === 'plasma') {
            const pr = 7 + Math.sin(K * 40) * 1.5;
            g.circle(x, y, pr * 2.2).fill({ color: col, alpha: 0.15 }).circle(x, y, pr).fill({ color: col, alpha: 0.75 }).circle(x, y, pr * 0.45).fill({ color: 0xffe0ff });
            this.emit('glow', x, y, 2, { vmin: 10, vmax: 50, lmin: 0.25, lmax: 0.5, rmin: 2, rmax: 4, color: [col, 0xff9cff], jit: 4 });
          } else if (form === 'cannon') {
            g.moveTo(x, y).lineTo(x - Math.cos(ang) * 22, y - Math.sin(ang) * 22).stroke({ width: 4, color: 0xffb347, alpha: 0.35 });
            g.moveTo(x, y).lineTo(x - Math.cos(ang) * 14, y - Math.sin(ang) * 14).stroke({ width: 2, color: 0xfff6d0 });
          } else {
            g.moveTo(x, y).lineTo(x - Math.cos(ang) * 6, y - Math.sin(ang) * 6).stroke({ width: 3, color: 0xffffff });
            g.circle(x - Math.cos(ang) * 7, y - Math.sin(ang) * 7, 3).fill({ color: 0xffa040, alpha: 0.9 });
            if (Math.random() < 0.7) this.emit('smoke', x - Math.cos(ang) * 8, y - Math.sin(ang) * 8, 1, { vmin: 2, vmax: 12, lmin: 0.5, lmax: 0.9, rmin: 2, rmax: 3.5, drag: 0.9 });
          }
        }
      });
      if (form === 'cannon') this.emit('smoke', a.x, a.y, 4, { vmin: 5, vmax: 30, lmin: 0.4, lmax: 0.8, rmin: 2, rmax: 4, dir: ang, spread: 0.6 });
    }
    g.destroy();
    if (hit) {
      const tgt = this.sideAt(b.x, b.y);
      if (tgt && this.shielded[tgt] && form !== 'wltb') { const s = this.ships[tgt].shield; s.alpha = 1; s.rotation = ang; this.ring(b.x, b.y, SIZE * 1.3, { color: 0x9fdcff, dur: 0.35, w: 3 }); }
      await this.animBoom(to, false, null, col);
    } else {
      this.emit('glow', ex, ey, 6, { color: [col, 0xffffff], vmin: 10, vmax: 60, lmin: 0.2, lmax: 0.5 });
    }
  }
  async animBoom(at, big, kill, tint) {
    const p = hexToPixel(at.col, at.row); sfx.boom(big);
    if (kill) return this.animKill(p, kill);
    if (big) {
      this.flash(p.x, p.y, SIZE * 4, 0xfff2c0, 450);
      this.ring(p.x, p.y, SIZE * 3.2, { color: 0xffd08a, dur: 0.7, w: 8, fill: true });
      this.ring(p.x, p.y, SIZE * 2, { color: 0xff7a3a, dur: 0.5, w: 5 });
      this.emit('spark', p.x, p.y, 50, { color: [0xffffff, 0xfff3b0, 0xffb347, 0xff6a2a], vmin: 60, vmax: 340, lmin: 0.4, lmax: 1.1, rmin: 1.5, rmax: 3.5 });
      this.emit('debris', p.x, p.y, 12, { vmin: 40, vmax: 160, lmin: 0.8, lmax: 1.6, rmin: 2, rmax: 4, drag: 0.97 });
      this.emit('smoke', p.x, p.y, 14, { vmin: 10, vmax: 60, lmin: 0.8, lmax: 1.6, rmin: 4, rmax: 9, jit: 8 });
      this.bump(9);
      await this.tween(650, () => {});
    } else {
      this.flash(p.x, p.y, SIZE * 1.7, tint ?? 0xffd08a, 260);
      this.ring(p.x, p.y, SIZE * 1.3, { color: 0xffc880, dur: 0.35, w: 3 });
      this.emit('spark', p.x, p.y, 22, { color: [0xffffff, 0xffe08a, 0xffa040, tint ?? 0xff7a3a], vmin: 40, vmax: 220, lmin: 0.25, lmax: 0.7, rmin: 1, rmax: 2.5 });
      this.emit('smoke', p.x, p.y, 4, { vmin: 5, vmax: 25, lmin: 0.5, lmax: 1, rmin: 3, rmax: 5 });
      this.bump(3.5);
      await this.tween(300, () => {});
    }
  }
  async animKill(p, side) {
    const tok = this.ships[side];
    // a chain of secondary blasts across the hull, then the big one
    for (let i = 0; i < 4; i++) {
      const x = p.x + rnd(-SIZE * 0.8, SIZE * 0.8), y = p.y + rnd(-SIZE * 0.8, SIZE * 0.8);
      this.flash(x, y, SIZE * 1.4, 0xffc070, 220); this.emit('spark', x, y, 14, { color: [0xffffff, 0xffb347, 0xff6a2a], vmin: 40, vmax: 160, lmin: 0.3, lmax: 0.6 }); this.bump(4);
      if (tok) tok.body.rotation += rnd(-0.4, 0.4);
      await this.tween(110, () => {});
    }
    if (tok) { tok.visible = false; } this.dead.add(side);
    this.flash(p.x, p.y, SIZE * 9, 0xffffff, 650);
    this.flash(p.x, p.y, SIZE * 5, 0xffb060, 900);
    this.ring(p.x, p.y, SIZE * 6, { color: 0xffe0b0, dur: 1.0, w: 12, fill: true });
    this.ring(p.x, p.y, SIZE * 4, { color: 0xff7a3a, dur: 0.8, w: 6 });
    this.ring(p.x, p.y, SIZE * 8, { color: 0x9fdcff, dur: 1.3, w: 2, a: 0.6 });
    this.emit('spark', p.x, p.y, 120, { color: [0xffffff, 0xfff3b0, 0xffb347, 0xff6a2a, 0xff3a2a], vmin: 80, vmax: 520, lmin: 0.5, lmax: 1.5, rmin: 1.5, rmax: 4 });
    this.emit('streak', p.x, p.y, 30, { color: [0xffffff, 0xffe08a], vmin: 250, vmax: 600, lmin: 0.3, lmax: 0.7, rmin: 1.2, rmax: 2 });
    this.emit('debris', p.x, p.y, 30, { vmin: 40, vmax: 260, lmin: 1.2, lmax: 2.4, rmin: 2, rmax: 5, drag: 0.985 });
    this.emit('smoke', p.x, p.y, 30, { vmin: 10, vmax: 90, lmin: 1.2, lmax: 2.2, rmin: 5, rmax: 12, jit: 12 });
    this.bump(18);
    await this.tween(1000, () => {});
  }
  async animHyper(side, from, to) {
    const tok = this.ships[side]; sfx.hyper();
    const streaks = new Graphics(); this.fxAdd.addChild(streaks);
    const lines = [...Array(18)].map(() => ({ a: rnd(0, 6.283), r: rnd(SIZE * 2, SIZE * 5), l: rnd(10, 30) }));
    const vortex = (cx, cy, k, inward) => { streaks.clear(); for (const L of lines) { const r = inward ? L.r * (1 - k) : L.r * k, x = cx + Math.cos(L.a + k * 2) * r, y = cy + Math.sin(L.a + k * 2) * r; streaks.moveTo(x, y).lineTo(x + Math.cos(L.a) * L.l * (inward ? 1 : -1), y + Math.sin(L.a) * L.l * (inward ? 1 : -1)).stroke({ width: 1.5, color: 0xb98cff, alpha: inward ? k : 1 - k }); } };
    const ax = tok.x, ay = tok.y;
    await this.tween(600, (k) => { tok.alpha = 1 - k; tok.scale.set(1 + k * 0.6, 1 - k * 0.7); tok.rotation = k * 3; vortex(ax, ay, k, true); });
    this.flash(ax, ay, SIZE * 3, 0xb98cff, 300);
    const p = hexToPixel(to.col, to.row); tok.position.set(p.x, p.y);
    this.flash(p.x, p.y, SIZE * 3, 0xb98cff, 400); this.ring(p.x, p.y, SIZE * 2.5, { color: 0xc9a8ff, dur: 0.6, w: 4 });
    await this.tween(600, (k) => { tok.alpha = k; tok.scale.set(1.6 - k * 0.6, 0.3 + k * 0.7); tok.rotation = (1 - k) * -3; vortex(p.x, p.y, k, false); });
    tok.scale.set(1); tok.rotation = 0; streaks.destroy();
  }
  async animMissile(id, path) {
    const g = this.missiles[id]; if (!g) return;
    for (let i = 1; i < path.length; i++) {
      const a = hexToPixel(path[i - 1].col, path[i - 1].row), b = hexToPixel(path[i].col, path[i].row);
      g.body.rotation = g.blink.rotation = Math.atan2(b.y - a.y, b.x - a.x);
      await this.tween(50, (k) => {
        g.position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);
        const r = g.body.rotation; this.emit('glow', g.x - Math.cos(r) * 10, g.y - Math.sin(r) * 10, 1, { vmin: 5, vmax: 20, lmin: 0.2, lmax: 0.4, rmin: 1.5, rmax: 2.5, color: [0xffa040, 0xfff0b0] });
        this.emit('smoke', g.x - Math.cos(r) * 12, g.y - Math.sin(r) * 12, 1, { vmin: 2, vmax: 8, lmin: 0.6, lmax: 1.1, rmin: 2, rmax: 3 });
      });
    }
  }
  /** Floating damage number that rises and fades over the hit ship; the token flashes. */
  animDamage(at, amount, side) {
    const p = hexToPixel(at.col, at.row), t = new Text({ text: `−${amount}`, style: { fill: amount >= 20 ? 0xffe36b : 0xff5a5a, fontSize: amount >= 20 ? 26 : 20, fontWeight: '900', fontFamily: 'Orbitron, monospace', stroke: { color: 0x000000, width: 4 }, dropShadow: { color: amount >= 20 ? 0xffb300 : 0xff0000, blur: 8, distance: 0, alpha: 0.8 } } });
    t.anchor.set(0.5); t.position.set(p.x, p.y - SIZE); this.fx.addChild(t);
    const tok = this.ships[side];
    this.tween(1100, (k) => { t.y = p.y - SIZE - k * 40; t.alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4; t.scale.set(1 + 0.3 * Math.max(0, 0.25 - k) * 4); if (tok) tok.body.alpha = k < 0.4 ? (Math.floor(k * 20) % 2 ? 0.3 : 1) : 1; }).then(() => { t.destroy(); if (tok) tok.body.alpha = 1; });
    return this.tween(350, () => {});
  }
  async play(ev, b) {
    for (const e of ev) {
      if (e.fx === 'dice') { await this.h.onDice?.(e); continue; }
      if (e.fx === 'dmg') { await this.animDamage(e.at, e.amount, e.side); continue; }
      if (e.fx === 'move') await this.animMove(e.side, e.path);
      else if (e.fx === 'shot') await this.animShot(e.form, e.from, e.to, e.hit);
      else if (e.fx === 'boom') await this.animBoom(e.at, e.big, e.kill);
      else if (e.fx === 'crit') { const p = hexToPixel(e.at.col, e.at.row); this.emit('spark', p.x, p.y, 30, { color: [0xffc94a, 0xffffff, 0xff9f40], vmin: 60, vmax: 260, lmin: 0.4, lmax: 0.9 }); this.ring(p.x, p.y, SIZE * 1.8, { color: 0xffc94a, dur: 0.5, w: 4 }); await this.animBoom(e.at, false, null, 0xffc94a); }
      else if (e.fx === 'hyper') await this.animHyper(e.side, e.from, e.to);
      else if (e.fx === 'missileNew') { this.syncShips(b); const g = this.missiles[e.id]; if (g && e.from) { const p0 = hexToPixel(e.from.col, e.from.row); g.position.set(p0.x, p0.y); this.flash(p0.x, p0.y, 16, 0xffd08a, 250); this.emit('smoke', p0.x, p0.y, 6, { vmin: 5, vmax: 40, lmin: 0.5, lmax: 1 }); } sfx.thrust(0.5); }
      else if (e.fx === 'missileMove') await this.animMissile(e.id, e.path);
    }
    this.syncShips(b);
  }
}
