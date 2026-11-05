import { Application, Container, Graphics, Text } from 'pixi.js';
import { COLS, ROWS, SIZE, hexToPixel, pixelToHex, inBounds } from '../engine/hex.js';
import { sfx } from './sound.js';
import { settings } from './storage.js';

// Beams green, solar weapons yellow, WLTB red (designer request)
const FORM_COLOR = { photon: 0x6fc3ff, beam: 0x39ff6a, beamlong: 0x7dff4a, disperser: 0xff9f40, plasma: 0xd06bff, cannon: 0xdddddd, wltb: 0xff2a2a, flare: 0xffd21f, sunburst: 0xfff04a, rocket: 0xffffff, nuke: 0xffffff };
const hexColor = (s) => parseInt(s.replace('#', ''), 16);
const corners = (x, y, s = SIZE) => { const p = []; for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; p.push(x + s * Math.cos(a), y + s * Math.sin(a)); } return p; };

export class Board {
  async init(el, handlers) {
    this.el = el; this.h = handlers;
    this.app = new Application();
    await this.app.init({ resizeTo: el, background: 0x020406, antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2) });
    el.appendChild(this.app.canvas);
    const w = (this.world = new Container());
    this.app.stage.addChild(w);
    this.stars = new Graphics(); this.grid = new Graphics(); this.overlay = new Graphics(); this.rangeG = new Graphics();
    this.hover = new Graphics(); this.tokens = new Container(); this.fx = new Container();
    w.addChild(this.stars, this.grid, this.overlay, this.rangeG, this.hover, this.tokens, this.fx);
    this.drawStatic();
    this.ships = {}; this.missiles = {}; this.dead = new Set();
    this.setupInput();
  }
  destroy() { try { this.app.destroy(true, { children: true }); } catch {} }

  drawStatic() {
    const last = hexToPixel(COLS - 1, ROWS - 1);
    this.W = last.x + SIZE * 2; this.H = last.y + SIZE * 2;
    for (let i = 0; i < 900; i++) this.stars.circle(Math.random() * this.W, Math.random() * this.H, Math.random() * 1.2 + 0.2).fill({ color: 0xffffff, alpha: Math.random() * 0.5 + 0.1 });
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) { const p = hexToPixel(c, r); this.grid.poly(corners(p.x, p.y)); }
    this.grid.stroke({ width: 1, color: 0x2bd46b, alpha: 0.22 });
    for (let c = 0; c < COLS; c += 10) for (let r = 0; r < ROWS; r += 10) {
      const p = hexToPixel(c, r), t = new Text({ text: `${c},${r}`, style: { fill: 0x2bd46b, fontSize: 9, fontFamily: 'monospace' } });
      t.alpha = 0.45; t.anchor.set(0.5); t.position.set(p.x, p.y); this.grid.addChild(t);
    }
  }

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

  showHover(h) { this.hover.clear(); if (!h) return; const p = hexToPixel(h.col, h.row); this.hover.poly(corners(p.x, p.y)).stroke({ width: 2, color: 0xffffff, alpha: 0.6 }); }
  setReachable(list) { this.overlay.clear(); if (!list?.length) return; for (const h of list) { const p = hexToPixel(h.col, h.row); this.overlay.poly(corners(p.x, p.y, SIZE - 1)); } this.overlay.fill({ color: 0x2bd46b, alpha: 0.13 }); }
  setRange(center, r, color = 0xffc94a, target) {
    this.rangeG.clear();
    if (target) { const t = hexToPixel(target.col, target.row); this.rangeG.poly(corners(t.x, t.y, SIZE + 3)).stroke({ width: 2, color: 0xff5a5a, alpha: 0.9 }); }
    if (!center || !r || !isFinite(r)) return;
    const p = hexToPixel(center.col, center.row);
    this.rangeG.circle(p.x, p.y, (r + 0.5) * SIZE * Math.sqrt(3)).stroke({ width: 1.5, color, alpha: 0.7 });
  }

  makeToken(glyph, color) {
    const c = new Container(), g = new Graphics(), col = hexColor(color);
    g.circle(0, 0, SIZE * 0.78).fill({ color: 0x000000, alpha: 0.9 }).stroke({ width: 2.5, color: col });
    const t = new Text({ text: glyph, style: { fill: col, fontSize: 16, fontWeight: '700', fontFamily: 'Orbitron, monospace' } });
    t.anchor.set(0.5); c.addChild(g, t); return c;
  }
  syncShips(b) {
    for (const side of ['human', 'ai']) {
      const S = b.ships[side];
      if (!this.ships[side]) { this.ships[side] = this.makeToken(S.def.counter.glyph, S.def.counter.color); this.tokens.addChild(this.ships[side]); }
      const p = hexToPixel(S.pos.col, S.pos.row), off = side === 'ai' && S.pos.col === b.ships.human.pos.col && S.pos.row === b.ships.human.pos.row ? 7 : 0;
      this.ships[side].position.set(p.x + off, p.y + off); this.ships[side].alpha = 1;
      this.ships[side].visible = !this.dead.has(side);
    }
    const ids = new Set(b.missiles.map((m) => m.id));
    for (const [id, g] of Object.entries(this.missiles)) if (!ids.has(+id)) { g.destroy(); delete this.missiles[id]; }
    for (const m of b.missiles) {
      if (!this.missiles[m.id]) {
        const g = new Graphics(), col = m.owner === 'human' ? 0x7cffb2 : 0xff5a5a;
        g.poly([0, -8, 6, 0, 0, 8, -6, 0]).fill({ color: col }).stroke({ width: 1, color: 0xffffff });
        const t = new Text({ text: String(m.id), style: { fill: 0xffffff, fontSize: 9, fontFamily: 'monospace' } }); t.position.set(7, -12);
        g.addChild(t); this.tokens.addChild(g); this.missiles[m.id] = g;
      }
      const p = hexToPixel(m.pos.col, m.pos.row); this.missiles[m.id].position.set(p.x, p.y);
    }
  }

  tween(ms, fn) {
    if (settings.fast) ms = Math.min(ms, ms * 0.3);
    return new Promise((res) => { let t = 0; const tick = (tk) => { t += tk.deltaMS; const k = Math.min(1, t / ms); fn(k); if (k >= 1) { this.app.ticker.remove(tick); res(); } }; this.app.ticker.add(tick); });
  }
  async animMove(side, path) {
    const tok = this.ships[side]; if (!tok) return;
    sfx.thrust(((path.length - 1) * 70 * (settings.fast ? 0.3 : 1)) / 1000);
    for (let i = 1; i < path.length; i++) {
      const a = hexToPixel(path[i - 1].col, path[i - 1].row), b = hexToPixel(path[i].col, path[i].row);
      await this.tween(70, (k) => tok.position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k));
    }
  }
  async animShot(form, from, to, hit) {
    const a = hexToPixel(from.col, from.row), b = hexToPixel(to.col, to.row), col = FORM_COLOR[form] ?? 0xffffff, g = new Graphics();
    this.fx.addChild(g); sfx.shot(form);
    const beamy = ['beam', 'beamlong', 'flare', 'sunburst', 'wltb', 'disperser'].includes(form);
    const ex = hit ? b.x : b.x + (Math.random() - 0.5) * 50, ey = hit ? b.y : b.y + (Math.random() - 0.5) * 50;
    if (beamy) {
      await this.tween(260, (k) => { g.clear(); const w = form === 'sunburst' ? 6 : form === 'wltb' ? 3 : 2.5; g.moveTo(a.x, a.y).lineTo(ex, ey).stroke({ width: w * (1 - k * 0.6), color: col, alpha: 1 - k * 0.7 }); if (form === 'wltb') { let px = a.x, py = a.y; for (let i = 1; i <= 8; i++) { const nx = a.x + (ex - a.x) * i / 8 + (i < 8 ? (Math.random() - 0.5) * 22 : 0), ny = a.y + (ey - a.y) * i / 8 + (i < 8 ? (Math.random() - 0.5) * 22 : 0); g.moveTo(px, py).lineTo(nx, ny).stroke({ width: 2, color: 0xff6a6a, alpha: 1 - k * 0.5 }); px = nx; py = ny; } } });
    } else {
      await this.tween(Math.min(500, 120 + Math.hypot(ex - a.x, ey - a.y) * 0.4), (k) => { g.clear(); g.circle(a.x + (ex - a.x) * k, a.y + (ey - a.y) * k, form === 'plasma' ? 6 : 3).fill({ color: col }); });
    }
    g.destroy();
    if (hit) await this.animBoom(to, false);
  }
  async animBoom(at, big, kill) {
    const p = hexToPixel(at.col, at.row), g = new Graphics(); this.fx.addChild(g); sfx.boom(big);
    // A ship-destroying blast is twice the size of a normal big explosion
    const R = kill ? SIZE * 6 : big ? SIZE * 3 : SIZE * 1.1;
    await this.tween(kill ? 1000 : big ? 700 : 300, (k) => { g.clear(); g.circle(p.x, p.y, R * k).fill({ color: big ? 0xffffff : 0xffb347, alpha: (1 - k) * 0.8 }).stroke({ width: kill ? 3 : 2, color: 0xff6a2a, alpha: 1 - k }); });
    g.destroy();
    // Remove the destroyed ship's icon once the explosion has finished
    if (kill) { this.dead.add(kill); if (this.ships[kill]) this.ships[kill].visible = false; }
  }
  async animHyper(side, from, to) {
    const tok = this.ships[side]; sfx.hyper();
    await this.tween(600, (k) => { tok.alpha = 1 - k; tok.scale.set(1 + k); tok.rotation = k * 3; });
    const p = hexToPixel(to.col, to.row); tok.position.set(p.x, p.y);
    await this.tween(600, (k) => { tok.alpha = k; tok.scale.set(2 - k); tok.rotation = (1 - k) * -3; });
    tok.scale.set(1); tok.rotation = 0;
  }
  async animMissile(id, path) {
    const g = this.missiles[id]; if (!g) return;
    for (let i = 1; i < path.length; i++) { const a = hexToPixel(path[i - 1].col, path[i - 1].row), b = hexToPixel(path[i].col, path[i].row); await this.tween(50, (k) => g.position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k)); }
  }
  /** Floating damage number that rises and fades over the hit ship; the token flashes. */
  animDamage(at, amount, side) {
    const p = hexToPixel(at.col, at.row), t = new Text({ text: `−${amount}`, style: { fill: amount >= 20 ? 0xffe36b : 0xff5a5a, fontSize: amount >= 20 ? 26 : 20, fontWeight: '900', fontFamily: 'Orbitron, monospace', stroke: { color: 0x000000, width: 4 } } });
    t.anchor.set(0.5); t.position.set(p.x, p.y - SIZE); this.fx.addChild(t);
    const tok = this.ships[side];
    this.tween(1100, (k) => { t.y = p.y - SIZE - k * 40; t.alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4; t.scale.set(1 + 0.3 * Math.max(0, 0.25 - k) * 4); if (tok) tok.alpha = k < 0.4 ? (Math.floor(k * 20) % 2 ? 0.25 : 1) : 1; }).then(() => { t.destroy(); if (tok) tok.alpha = 1; });
    return this.tween(350, () => {});
  }
  async play(ev, b) {
    for (const e of ev) {
      if (e.fx === 'dice') { await this.h.onDice?.(e); continue; }
      if (e.fx === 'dmg') { await this.animDamage(e.at, e.amount, e.side); continue; }
      if (e.fx === 'move') await this.animMove(e.side, e.path);
      else if (e.fx === 'shot') await this.animShot(e.form, e.from, e.to, e.hit);
      else if (e.fx === 'boom') await this.animBoom(e.at, e.big, e.kill);
      else if (e.fx === 'crit') await this.animBoom(e.at, false);
      else if (e.fx === 'hyper') await this.animHyper(e.side, e.from, e.to);
      else if (e.fx === 'missileNew') { this.syncShips(b); const g = this.missiles[e.id]; if (g && e.from) { const p0 = hexToPixel(e.from.col, e.from.row); g.position.set(p0.x, p0.y); } sfx.thrust(0.5); }
      else if (e.fx === 'missileMove') await this.animMissile(e.id, e.path);
    }
    this.syncShips(b);
  }
}
