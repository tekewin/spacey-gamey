import { settings } from './storage.js';
let ctx, hum = null;
const ac = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());
function noiseBuffer(sec) {
  const n = Math.floor(ac().sampleRate * sec), buf = ac().createBuffer(1, n, ac().sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Low ambient engine-room hum: two detuned low oscillators + filtered noise, slowly breathing. */
export function startHum() {
  if (!settings.sound || hum) return;
  try {
    const c = ac(); c.resume?.();
    const out = c.createGain(); out.gain.setValueAtTime(0, c.currentTime); out.gain.linearRampToValueAtTime(0.05, c.currentTime + 2.5);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180; lp.Q.value = 0.7;
    lp.connect(out).connect(c.destination);
    const nodes = [];
    for (const [f, type, g] of [[55, 'sawtooth', 0.35], [55.6, 'sine', 0.6], [110.3, 'sine', 0.12]]) {
      const o = c.createOscillator(), og = c.createGain(); o.type = type; o.frequency.value = f; og.gain.value = g;
      o.connect(og).connect(lp); o.start(); nodes.push(o);
    }
    const ns = c.createBufferSource(), ng = c.createGain(), nf = c.createBiquadFilter();
    ns.buffer = noiseBuffer(4); ns.loop = true; nf.type = 'lowpass'; nf.frequency.value = 120; ng.gain.value = 0.25;
    ns.connect(nf).connect(ng).connect(lp); ns.start(); nodes.push(ns);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.08; lg.gain.value = 40;
    lfo.connect(lg).connect(lp.frequency); lfo.start(); nodes.push(lfo);
    hum = { out, nodes };
  } catch {}
}
export function stopHum() {
  if (!hum) return;
  const { out, nodes } = hum, t = ctx.currentTime; hum = null;
  try { out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(0, t + 0.8); nodes.forEach((n) => n.stop(t + 0.9)); } catch {}
}

/** Low rumbling thrust for `sec` seconds: filtered noise with a soft attack and tail. */
export function thrust(sec = 0.4) {
  if (!settings.sound) return;
  try {
    const c = ac(), t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuffer(sec + 0.5); f.type = 'lowpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(90, t); f.frequency.linearRampToValueAtTime(220, t + 0.15); f.frequency.linearRampToValueAtTime(140, t + sec + 0.4);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.12); g.gain.setValueAtTime(0.35, t + sec); g.gain.exponentialRampToValueAtTime(0.001, t + sec + 0.45);
    const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.value = 42; og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.08, t + 0.1); og.gain.exponentialRampToValueAtTime(0.001, t + sec + 0.45);
    s.connect(f).connect(g).connect(c.destination); o.connect(og).connect(c.destination);
    s.start(t); s.stop(t + sec + 0.5); o.start(t); o.stop(t + sec + 0.5);
  } catch {}
}

/** Hyperspace: a charging rise, a sharp "fold", then a shimmering descending sweep. */
export function hyperSound() {
  if (!settings.sound) return;
  try {
    const c = ac(), t = c.currentTime, out = c.createGain(); out.gain.value = 0.9; out.connect(c.destination);
    // charge-up: two detuned saws sweeping up through a resonant filter
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 8; f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.55);
    const g1 = c.createGain(); g1.gain.setValueAtTime(0.001, t); g1.gain.exponentialRampToValueAtTime(0.12, t + 0.5); g1.gain.exponentialRampToValueAtTime(0.001, t + 0.62);
    f.connect(g1).connect(out);
    for (const det of [0, 7]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(80 + det, t); o.frequency.exponentialRampToValueAtTime(900 + det * 10, t + 0.55); o.connect(f); o.start(t); o.stop(t + 0.65); }
    // fold: a bright click/pop
    const p = c.createOscillator(), pg = c.createGain(); p.type = 'square'; p.frequency.setValueAtTime(1800, t + 0.58); p.frequency.exponentialRampToValueAtTime(60, t + 0.7);
    pg.gain.setValueAtTime(0.0001, t); pg.gain.setValueAtTime(0.1, t + 0.58); pg.gain.exponentialRampToValueAtTime(0.001, t + 0.72); p.connect(pg).connect(out); p.start(t); p.stop(t + 0.75);
    // re-entry shimmer: ring-modulated sine falling, with tremolo
    const s = c.createOscillator(), sg = c.createGain(), trem = c.createOscillator(), tg = c.createGain();
    s.type = 'sine'; s.frequency.setValueAtTime(1400, t + 0.62); s.frequency.exponentialRampToValueAtTime(180, t + 1.5);
    trem.frequency.value = 22; tg.gain.value = 0.05; trem.connect(tg).connect(sg.gain);
    sg.gain.setValueAtTime(0.0001, t); sg.gain.setValueAtTime(0.06, t + 0.62); sg.gain.exponentialRampToValueAtTime(0.001, t + 1.55);
    s.connect(sg).connect(out); s.start(t + 0.6); s.stop(t + 1.6); trem.start(t + 0.6); trem.stop(t + 1.6);
  } catch {}
}
export function blip(freq = 440, dur = 0.12, type = 'square', vol = 0.05, slide = 0) {
  if (!settings.sound) return;
  try {
    ac();
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur);
  } catch {}
}
export function noise(dur = 0.4, vol = 0.12) {
  if (!settings.sound) return;
  try {
    ac();
    const n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const s = ctx.createBufferSource(), g = ctx.createGain(); g.gain.value = vol;
    s.buffer = buf; s.connect(g).connect(ctx.destination); s.start();
  } catch {}
}
export const sfx = {
  shot: (form) => ({ photon: () => blip(880, 0.15, 'sine', 0.05, 0.4), beam: () => blip(1400, 0.2, 'sawtooth', 0.03, 0.5), beamlong: () => blip(1100, 0.28, 'sawtooth', 0.04, 0.4), flare: () => blip(600, 0.3, 'triangle', 0.06, 1.8), sunburst: () => blip(300, 0.3, 'triangle', 0.06, 2.5), wltb: () => blip(120, 0.35, 'sawtooth', 0.07, 4) }[form] || (() => blip(220, 0.1, 'square', 0.04, 0.5)))(),
  boom: (big) => noise(big ? 0.9 : 0.35, big ? 0.2 : 0.1),
  thrust,
  hyper: hyperSound,
  click: () => blip(660, 0.04, 'square', 0.02),
};
