// Animated deep-space backdrop for the menu screens (title, hangar, builder, briefing, results).
// One fixed <canvas> behind #app. Modes: 'title' (full show with dogfights), 'dim' (calm, darker), 'off'.

let cv, ctx, raf = 0, mode = 'off', W = 0, H = 0, dpr = 1, last = 0, time = 0;
let layers = [], neb = null, planet = null, ships = [], bolts = [], sparks = [], meteors = [], nextFly = 1.5, nextMeteor = 3;

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export function backdrop(m) {
  if (!cv) {
    cv = document.createElement('canvas'); cv.className = 'backdrop';
    document.body.prepend(cv); ctx = cv.getContext('2d');
    window.addEventListener('resize', resize); resize();
  }
  mode = m;
  cv.style.display = m === 'off' ? 'none' : 'block';
  cv.classList.toggle('dim', m === 'dim');
  if (m === 'off') { cancelAnimationFrame(raf); raf = 0; return; }
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2); W = window.innerWidth; H = window.innerHeight;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const area = (W * H) / 1e6;
  layers = [
    { n: 260 * area + 80, speed: 3, size: [0.3, 0.9], a: [0.25, 0.6] },
    { n: 120 * area + 40, speed: 9, size: [0.6, 1.3], a: [0.4, 0.85] },
    { n: 35 * area + 12, speed: 24, size: [1.1, 2.0], a: [0.7, 1] },
  ].map((L) => ({ ...L, stars: Array.from({ length: L.n | 0 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: rnd(...L.size), a: rnd(...L.a), tw: rnd(0, 6.28), ts: rnd(0.5, 2.5), c: pick(['#ffffff', '#ffffff', '#cfe6ff', '#fff2d6', '#d8fff0']) })) }));
  neb = makeNebula(); planet = makePlanet();
}

function makeNebula() {
  const s = 0.5, c = document.createElement('canvas'); c.width = Math.max(1, W * s); c.height = Math.max(1, H * s);
  const g = c.getContext('2d'); g.globalCompositeOperation = 'lighter';
  const blobs = [
    ['rgba(120,40,200,', 0.25, 0.30, 0.55], ['rgba(20,120,170,', 0.62, 0.22, 0.45], ['rgba(200,40,120,', 0.40, 0.55, 0.35],
    ['rgba(30,180,120,', 0.12, 0.75, 0.40], ['rgba(90,60,220,', 0.80, 0.55, 0.40],
  ];
  for (const [col, fx, fy, fr] of blobs) {
    for (let i = 0; i < 26; i++) {
      const x = (fx + rnd(-0.18, 0.18)) * c.width, y = (fy + rnd(-0.14, 0.14)) * c.height, r = fr * Math.max(c.width, c.height) * rnd(0.12, 0.42);
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col + rnd(0.035, 0.075) + ')'); gr.addColorStop(1, col + '0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  }
  // dark dust lanes
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 40; i++) {
    const x = rnd(0, c.width), y = rnd(0, c.height), r = rnd(20, 90) * s * 2;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(2,3,10,0.35)'); gr.addColorStop(1, 'rgba(2,3,10,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  return c;
}

function makePlanet() {
  const R = Math.min(W, H) * 0.26, pad = R * 1.25, c = document.createElement('canvas');
  c.width = (R * 2 + pad * 2) * dpr; c.height = (R * 2 + pad) * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  const cx = R + pad, cy = (R * 2 + pad) / 2, tilt = -0.32;
  const ring = (front) => {
    g.save(); g.translate(cx, cy); g.rotate(tilt);
    g.beginPath(); if (front) g.rect(-R * 3, 0, R * 6, R * 3); else g.rect(-R * 3, -R * 3, R * 6, R * 3); g.clip();
    const bands = [[1.32, 0.10, 'rgba(255,214,150,0.35)'], [1.48, 0.05, 'rgba(255,190,120,0.55)'], [1.60, 0.14, 'rgba(230,170,255,0.28)'], [1.80, 0.04, 'rgba(255,230,190,0.5)'], [1.95, 0.08, 'rgba(180,150,255,0.22)']];
    for (const [rr, w, col] of bands) { g.strokeStyle = col; g.lineWidth = R * w; g.beginPath(); g.ellipse(0, 0, R * rr, R * rr * 0.26, 0, 0, 7); g.stroke(); }
    g.restore();
  };
  // atmosphere glow
  const halo = g.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.35); halo.addColorStop(0, 'rgba(90,200,255,0.35)'); halo.addColorStop(1, 'rgba(90,200,255,0)');
  g.fillStyle = halo; g.beginPath(); g.arc(cx, cy, R * 1.35, 0, 7); g.fill();
  ring(false);
  // body
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
  const body = g.createRadialGradient(cx - R * 0.45, cy - R * 0.5, R * 0.1, cx, cy, R * 1.1);
  body.addColorStop(0, '#5fd3d0'); body.addColorStop(0.45, '#2a6a9a'); body.addColorStop(1, '#1a1440');
  g.fillStyle = body; g.fillRect(cx - R, cy - R, R * 2, R * 2);
  g.translate(cx, cy); g.rotate(tilt);
  for (let i = 0; i < 18; i++) { const y = rnd(-R, R), h = rnd(R * 0.02, R * 0.12); g.fillStyle = pick(['rgba(255,255,255,', 'rgba(20,10,60,', 'rgba(120,255,220,']) + rnd(0.04, 0.13) + ')'; g.beginPath(); g.ellipse(rnd(-R * 0.1, R * 0.1), y, R * 1.3, h, 0, 0, 7); g.fill(); }
  g.rotate(-tilt); g.translate(-cx, -cy);
  const shade = g.createLinearGradient(cx - R * 0.6, cy - R * 0.6, cx + R * 0.9, cy + R * 0.9); shade.addColorStop(0.35, 'rgba(0,0,10,0)'); shade.addColorStop(1, 'rgba(0,0,10,0.92)');
  g.fillStyle = shade; g.fillRect(cx - R, cy - R, R * 2, R * 2);
  g.restore();
  // rim light
  g.strokeStyle = 'rgba(160,240,255,0.45)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R - 1, Math.PI * 0.95, Math.PI * 1.65); g.stroke();
  ring(true);
  return { c, w: c.width / dpr, h: c.height / dpr, cx, cy };
}

/* ---------- little ships for the title dogfights ---------- */
function drawShip(g, kind, color, flame) {
  g.save();
  if (flame > 0) {
    const fl = g.createLinearGradient(-10, 0, -10 - 22 * flame, 0); fl.addColorStop(0, 'rgba(255,255,255,0.95)'); fl.addColorStop(0.3, kind === 'foe' ? 'rgba(255,90,60,0.8)' : 'rgba(80,220,255,0.8)'); fl.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fl; g.beginPath(); g.moveTo(-8, -3.5); g.lineTo(-10 - 22 * flame, 0); g.lineTo(-8, 3.5); g.fill();
  }
  g.fillStyle = '#0b1114'; g.strokeStyle = color; g.lineWidth = 1.4;
  g.beginPath();
  if (kind === 'foe') { g.moveTo(14, 0); g.lineTo(2, -4); g.lineTo(6, -12); g.lineTo(-8, -6); g.lineTo(-10, 0); g.lineTo(-8, 6); g.lineTo(6, 12); g.lineTo(2, 4); }
  else { g.moveTo(16, 0); g.lineTo(-2, -5); g.lineTo(-8, -13); g.lineTo(-10, -5); g.lineTo(-8, 0); g.lineTo(-10, 5); g.lineTo(-8, 13); g.lineTo(-2, 5); }
  g.closePath(); g.fill(); g.stroke();
  g.fillStyle = color; g.beginPath(); g.arc(4, 0, 2, 0, 7); g.fill();
  g.restore();
}

function spawnFlyby() {
  const ltr = Math.random() < 0.5, y0 = rnd(H * 0.12, H * 0.62), scale = rnd(0.8, 1.5), v = rnd(150, 230) * scale;
  const ang = rnd(-0.15, 0.15), dir = ltr ? 1 : -1, x0 = ltr ? -60 : W + 60;
  const lead = { kind: 'hero', color: '#7cffb2', x: x0, y: y0, vx: dir * v * Math.cos(ang), vy: v * Math.sin(ang), wob: rnd(0, 6), s: scale, alive: true };
  ships.push(lead);
  if (Math.random() < 0.8) ships.push({ kind: 'foe', color: '#ff5a5a', x: x0 - dir * rnd(90, 160) * scale, y: y0 + rnd(-30, 30), vx: lead.vx * 1.03, vy: lead.vy, wob: rnd(0, 6), s: scale, chase: lead, cd: rnd(0.2, 0.6), alive: true });
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  const g = ctx; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#02030a'; g.fillRect(0, 0, W, H);
  // nebula, gently breathing/drifting
  g.globalAlpha = 0.9 + Math.sin(time * 0.3) * 0.1;
  g.drawImage(neb, Math.sin(time * 0.02) * 20 - 20, Math.cos(time * 0.017) * 14 - 14, W + 40, H + 40);
  g.globalAlpha = 1;
  drawStars(layers[0], dt); drawStars(layers[1], dt);
  // planet
  if (planet) { const px = W * 0.86 - planet.cx, py = H * 0.86 - planet.cy + Math.sin(time * 0.15) * 4; g.drawImage(planet.c, px, py, planet.w, planet.h); }
  // shooting stars
  nextMeteor -= dt; if (nextMeteor <= 0) { nextMeteor = rnd(2.5, 7); meteors.push({ x: rnd(W * 0.1, W), y: rnd(-20, H * 0.4), vx: -rnd(500, 800), vy: rnd(200, 380), life: 1 }); }
  for (const m of meteors) {
    m.x += m.vx * dt; m.y += m.vy * dt; m.life -= dt * 0.9;
    const gr = g.createLinearGradient(m.x, m.y, m.x - m.vx * 0.12, m.y - m.vy * 0.12); gr.addColorStop(0, `rgba(255,255,255,${m.life})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = gr; g.lineWidth = 1.6; g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(m.x - m.vx * 0.12, m.y - m.vy * 0.12); g.stroke();
  }
  meteors = meteors.filter((m) => m.life > 0);
  if (mode === 'title') dogfight(g, dt);
  drawStars(layers[2], dt);
  // vignette
  const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.7)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
}

function drawStars(L, dt) {
  const g = ctx;
  for (const s of L.stars) {
    s.x -= L.speed * dt; if (s.x < -2) { s.x = W + 2; s.y = Math.random() * H; }
    const a = s.a * (0.65 + 0.35 * Math.sin(time * s.ts + s.tw));
    g.globalAlpha = a; g.fillStyle = s.c; g.beginPath(); g.arc(s.x, s.y, s.r, 0, 7); g.fill();
    if (s.r > 1.6) { g.globalAlpha = a * 0.35; g.fillRect(s.x - s.r * 3, s.y - 0.4, s.r * 6, 0.8); g.fillRect(s.x - 0.4, s.y - s.r * 3, 0.8, s.r * 6); }
  }
  g.globalAlpha = 1;
}

function dogfight(g, dt) {
  nextFly -= dt; if (nextFly <= 0) { nextFly = rnd(5, 9); spawnFlyby(); }
  for (const s of ships) {
    if (s.chase && s.chase.alive) { const dy = s.chase.y - s.y; s.vy += dy * 0.8 * dt; s.vy *= 0.98; }
    s.x += s.vx * dt; s.y += s.vy * dt + Math.sin(time * 3 + s.wob) * 12 * dt;
    if (s.chase && (s.cd -= dt) <= 0 && s.chase.alive) {
      s.cd = rnd(0.35, 0.8); const a = Math.atan2(s.chase.y - s.y, s.chase.x - s.x) + rnd(-0.08, 0.08);
      bolts.push({ x: s.x, y: s.y, vx: Math.cos(a) * 700, vy: Math.sin(a) * 700, life: 1, target: s.chase });
    }
    const ang = Math.atan2(s.vy, s.vx);
    g.save(); g.translate(s.x, s.y); g.rotate(ang); g.scale(s.s, s.s);
    g.shadowColor = s.color; g.shadowBlur = 10; drawShip(g, s.kind, s.color, 0.7 + Math.random() * 0.3); g.restore();
  }
  ships = ships.filter((s) => s.x > -250 && s.x < W + 250);
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const b of bolts) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt * 1.4;
    g.strokeStyle = 'rgba(255,90,80,0.9)'; g.lineWidth = 2.2; g.shadowColor = '#ff4a3a'; g.shadowBlur = 8;
    g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - b.vx * 0.025, b.y - b.vy * 0.025); g.stroke();
    if (b.target.alive && Math.hypot(b.target.x - b.x, b.target.y - b.y) < 14 * b.target.s) {
      b.life = 0; for (let i = 0; i < 14; i++) { const a = rnd(0, 6.28), v = rnd(40, 220); sparks.push({ x: b.x, y: b.y, vx: Math.cos(a) * v + b.target.vx * 0.5, vy: Math.sin(a) * v, life: rnd(0.3, 0.8), c: pick(['#fff3b0', '#ffb347', '#ff6a2a']) }); }
    }
  }
  bolts = bolts.filter((b) => b.life > 0);
  g.shadowBlur = 0;
  for (const p of sparks) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt; g.globalAlpha = Math.max(0, p.life); g.fillStyle = p.c; g.fillRect(p.x - 1, p.y - 1, 2.2, 2.2); }
  sparks = sparks.filter((p) => p.life > 0);
  g.restore(); g.globalAlpha = 1;
}
