import { Board } from './board.js';
import { CATALOG, NUKE_SPEED, itemLabel } from '../engine/catalog.js';
import { chartValue, MAX_RANGE } from '../engine/tohit.js';
import { dist, hexesWithin, eq } from '../engine/hex.js';
import { act, endTurn, weapons, weaponStatus, hpLeft, hpMax, canMoveTo, canRam, canHyper, other, fastestNuke, hasCharger, allowance, missileHpLeft } from '../engine/combat.js';
import { aiNextAction } from '../engine/ai.js';
import { shipValue, shipClass } from '../engine/ship.js';
import { saveBattle, settings, saveSettings } from './storage.js';
import { esc, sleep } from './util.js';
import { startHum, stopHum } from './sound.js';

const band = (S) => { const f = hpLeft(S) / hpMax(S); return f >= 0.999 ? ['Undamaged', 'ok'] : f > 0.6 ? ['Light damage', 'ok'] : f > 0.3 ? ['Heavy damage', 'warn'] : ['Critical', 'bad']; };
const FORM_OF = (c) => c.attack;

export async function runBattle(root, b, { onEnd, onQuit }) {
  root.innerHTML = `<div class="screen battle">
    <div class="board-wrap"><div id="board"></div>
      <div class="board-ctl"><button data-z="in">+</button><button data-z="out">−</button><button data-z="me">◎ Me</button><button data-z="foe">◎ Enemy</button><button data-z="all">▣ All</button></div>
      <div class="hoverinfo" id="hoverinfo"></div>
      <div class="dicetray" id="dicetray"></div>
      <div class="banner" id="banner"></div></div>
    <aside class="side" id="side"></aside></div>`;
  const tray = root.querySelector('#dicetray');
  const side = root.querySelector('#side'), banner = root.querySelector('#banner'), hoverinfo = root.querySelector('#hoverinfo');
  const board = new Board();
  let busy = false, target = 'ship', hoverWeapon = null, ended = false;
  await board.init(root.querySelector('#board'), {
    onHover: (h) => { hoverinfo.textContent = h ? `(${h.col},${h.row}) · ${dist(b.ships.human.pos, h)} hexes from you` : ''; },
    onDice: (e) => showDice(e),
    onClick: (h) => { if (!busy && b.active === 'human' && canMoveTo(b, 'human', h)) doHuman({ type: 'move', to: h }); },
  });
  board.syncShips(b);
  board.centerOn(b.ships.human.pos, 1);
  window.spaceyGamey = { battle: b, board, render: () => render(), canMoveTo: (h) => canMoveTo(b, 'human', h) }; // debugging hook

  const H = () => b.ships.human, A = () => b.ships.ai;
  const showBanner = async (txt, ms = 900) => { banner.textContent = txt; banner.classList.add('on'); await sleep(settings.fast ? ms / 3 : ms); banner.classList.remove('on'); };

  const pct = (need) => (need == null ? 0 : need <= 1 ? 100 : need > 20 ? 0 : Math.round(((21 - need) / 20) * 100));
  const avgDice = (n, s) => (n * (s + 1)) / 2;
  const dieShape = (s) => (s === 20 ? 'd20' : s === 6 ? 'd6' : s === 4 ? 'd4' : s <= 12 ? 'dmid' : 'dpick');
  async function showDice(e) {
    const T = settings.fast ? 0.35 : 1, shown = e.dice.slice(0, 20), more = e.dice.length - shown.length;
    tray.className = `dicetray on ${e.side === 'ai' ? 'foe' : 'me'}`;
    tray.innerHTML = `<div class="dt-label">${e.side === 'ai' ? 'ENEMY · ' : ''}${esc(e.label)}</div>
      <div class="dt-dice">${shown.map((d) => `<div class="die ${dieShape(d.s)}"><span>?</span><small>d${d.s}</small></div>`).join('')}${more > 0 ? `<div class="more">+${more} more</div>` : ''}</div>
      <div class="dt-verdict"></div>`;
    const spans = [...tray.querySelectorAll('.die span')];
    for (let i = 0; i < 7; i++) { spans.forEach((sp, j) => (sp.textContent = 1 + Math.floor(Math.random() * shown[j].s))); await sleep(45 * T); }
    spans.forEach((sp, j) => { sp.textContent = shown[j].v; sp.parentElement.classList.add('set'); if (shown[j].v === shown[j].s) sp.parentElement.classList.add('max'); });
    const v = tray.querySelector('.dt-verdict'); v.textContent = e.verdict || ''; v.className = 'dt-verdict ' + (e.good === true ? 'good' : e.good === false ? 'bad' : '');
    await sleep((e.dice.length > 6 ? 1100 : 850) * T);
    tray.classList.remove('on');
    await sleep(120 * T);
  }

  function weaponCard(it) {
    const S = H(), T = A(), c = CATALOG[it.id], st = weaponStatus(S, it);
    const tpos = target === 'ship' ? T.pos : (b.missiles.find((m) => m.id === target) || {}).pos || T.pos;
    const d = dist(S.pos, tpos), canAct = !busy && b.active === 'human' && !b.over;
    let info = '', buttons = '';
    const status = st.ok ? (st.once ? '<span class="tag warn">once/battle</span>' : '') : `<span class="tag bad">${esc(st.why)}</span>`;
    if (c.attack === 'launcher') {
      const ni = fastestNuke(S), sp = ni >= 0 ? NUKE_SPEED[S.ammo.nuke[ni].thrusters] : 0, pv = chartValue('plasma', d);
      info = `Nukes ${S.ammo.nuke.length} (fastest ${sp}/turn) · Plasmas ${S.ammo.plasma}`;
      const nukeOk = canAct && st.ok && ni >= 0 && target === 'ship', plOk = canAct && st.ok && S.ammo.plasma > 0 && pv != null;
      buttons = `<button data-fire="${it.uid}" data-mode="nuke" ${nukeOk ? '' : 'disabled'}>${ni >= 0 && d <= sp ? 'Nuke: direct hit' : 'Launch nuke'}</button>
        <button data-fire="${it.uid}" data-mode="plasma" ${plOk ? '' : 'disabled'}>Plasma${pv != null ? ` ${pct(pv)}% · 30 dmg` : ' (range 10)'}</button>`;
      if (ni >= 0 && target === 'ship') info += d <= sp ? ' · nuke: 100% · avg 70 dmg' : ` · nuke flies ${sp}/turn`;
    } else {
      const form = FORM_OF(c), v = chartValue(form, d);
      const ammo = c.ammo ? ` · ${S.ammo[c.ammo]} left` : '';
      if (form === 'rocket') info = v == null ? `out of range (max 5)${ammo}` : `auto-hit ${Math.min(c.shots, S.ammo.rocket)} × ${v} dmg${ammo}`;
      else info = v == null ? `out of range (max ${MAX_RANGE[form]})${ammo}` : `need ${v}+ on d20${ammo}`;
      const avg = c.costPerDie ? avgDice(it.dice, c.die) : c.dmg ? avgDice(c.dmg[0], c.dmg[1]) : v != null ? Math.min(c.shots, S.ammo.rocket) * v : 0;
      const odds = v == null ? '' : form === 'rocket' ? ` <span class="odds">100% · ${avg} dmg</span>` : ` <span class="odds">${pct(v)}% · avg ${Math.round(avg)}</span>`;
      buttons = `<button data-fire="${it.uid}" ${canAct && st.ok && v != null ? '' : 'disabled'}>Fire${odds}</button>`;
    }
    const dmg = c.costPerDie ? `${it.dice}d${c.die}` : c.attack === 'photon' ? '3d6' : c.attack === 'cannon' ? '2d6' : c.attack === 'disperser' ? '4d6' : c.attack === 'wltb' ? '6d6' : c.attack === 'rocket' ? `${c.shots}/turn` : '';
    return `<div class="wcard ${st.ok ? '' : 'dim'}" data-hover="${it.uid}"><div class="wtop"><b>${esc(itemLabel(it))}</b> <span class="muted">${dmg}</span> ${status}</div>
      <div class="winfo">${info}</div><div class="wbtn">${buttons}</div></div>`;
  }

  function render() {
    const S = H(), T = A(), d = dist(S.pos, T.pos), yours = b.active === 'human' && !b.over;
    if (target !== 'ship' && !b.missiles.some((m) => m.id === target)) target = 'ship';
    const [bt, bc] = band(T), hpPct = Math.max(0, hpLeft(S) / hpMax(S)) * 100;
    const enemyMissiles = b.missiles.filter((m) => m.owner === 'ai'), myMissiles = b.missiles.filter((m) => m.owner === 'human');
    const lost = Object.keys(S.destroyed).length;
    side.innerHTML = `
      <div class="turn ${yours ? 'you' : 'them'}">Turn ${b.turn} · ${yours ? 'YOUR MOVE' : b.over ? 'BATTLE OVER' : 'ENEMY MOVING…'}</div>
      <div class="panel shipcard">
        <div class="sc-head"><span class="glyph" style="color:${S.def.counter.color};border-color:${S.def.counter.color}">${esc(S.def.counter.glyph)}</span><b>${esc(S.def.name)}</b></div>
        <div class="hp"><div style="width:${hpPct}%"></div><span>${Math.max(0, hpLeft(S))} / ${hpMax(S)} HP</span></div>
        <div class="row"><span>Movement left</span><b>${S.moveLeft} / ${allowance(S)}</b></div>
        ${lost ? `<div class="row bad"><span>Crit-destroyed</span><b>${lost} item${lost > 1 ? 's' : ''}</b></div>` : ''}
        <div class="btnrow">
          <button data-act="hyper" ${yours && !busy && canHyper(b, 'human') ? '' : 'disabled'} title="H">Hyperspace</button>
          <button data-act="ram" ${yours && !busy && canRam(b, 'human') ? '' : 'disabled'}>Ram${S.def.items.some((i) => i.id === 'rammer') ? ` (${d}d6)` : ''}</button>
          <button class="primary" data-act="end" ${yours && !busy ? '' : 'disabled'} title="Space">End Turn ▸</button>
        </div>
      </div>
      <div class="panel enemycard">
        <div class="sc-head"><span class="glyph" style="color:${T.def.counter.color};border-color:${T.def.counter.color}">${esc(T.def.counter.glyph)}</span><b>${esc(T.def.name)}</b></div>
        <div class="row"><span>${T.def.type === 'solar' ? 'Solar' : 'Conventional'} · Class ${shipClass(shipValue(T.def))}${b.hard ? ' · <b class="bad">HARD</b>' : ''}</span><b class="${bc}">${bt}</b></div>
        <div class="row"><span>Range</span><b>${d} hexes</b></div>
        <div class="muted small">Loadout unknown — revealed as it fires. Odds and damage shown are before enemy shields.</div>
      </div>
      ${enemyMissiles.length ? `<div class="panel"><b>Target</b><label class="tgt"><input type="radio" name="tgt" value="ship" ${target === 'ship' ? 'checked' : ''}> Enemy ship</label>
        ${enemyMissiles.map((m) => `<label class="tgt bad"><input type="radio" name="tgt" value="${m.id}" ${target === m.id ? 'checked' : ''}> Incoming nuke #${m.id} — ${dist(S.pos, m.pos)} hexes, speed ${m.speed}, ${missileHpLeft(m)}/10 to kill</label>`).join('')}</div>` : ''}
      ${myMissiles.length ? `<div class="muted small">Your missiles in flight: ${myMissiles.map((m) => `#${m.id} (${dist(m.pos, T.pos)} from target)`).join(', ')}</div>` : ''}
      <div class="weapons">${weapons(S).map(weaponCard).join('') || '<div class="muted">No weapons.</div>'}</div>
      <div class="panel logp"><div class="loghead"><b>Combat log</b><label class="small"><input type="checkbox" data-snd ${settings.sound ? 'checked' : ''}> sound</label><label class="small"><input type="checkbox" data-fast ${settings.fast ? 'checked' : ''}> fast</label><button class="tiny" data-quit>Quit</button></div>
        <div class="log" id="log">${b.log.slice(-120).map((l) => `<div class="l k-${l.kind} ${l.side}">${esc(l.text)}</div>`).join('')}</div></div>`;
    const lg = side.querySelector('#log'); lg.scrollTop = lg.scrollHeight;
    board.setReachable(yours && !busy && S.moveLeft > 0 ? hexesWithin(S.pos, S.moveLeft).filter((h) => canMoveTo(b, 'human', h)) : []);
    updateRange();
  }
  function updateRange() {
    const S = H(), tpos = target === 'ship' ? A().pos : b.missiles.find((m) => m.id === target)?.pos;
    if (hoverWeapon) {
      const it = S.def.items.find((i) => i.uid === hoverWeapon), c = it && CATALOG[it.id];
      if (c) { const r = c.attack === 'launcher' ? 10 : MAX_RANGE[c.attack]; board.setRange(S.pos, r, 0xffc94a, tpos); return; }
    }
    board.setRange(null, 0, 0, tpos);
  }

  async function checkEnd() {
    if (b.over && !ended) {
      ended = true; render(); stopHum();
      await showBanner(b.winner === 'human' ? 'VICTORY' : 'SHIP DESTROYED', 1600);
      onEnd(b);
      return true;
    }
    return false;
  }
  async function exec(sideKey, a) {
    const ev = act(b, sideKey, a);
    render();
    await board.play(ev, b);
    saveBattle(b);
    render();
    return ev;
  }
  async function doHuman(a) {
    if (busy || b.active !== 'human' || b.over) return;
    busy = true; render();
    await exec('human', a);
    busy = false; render();
    await checkEnd();
  }
  async function endHumanTurn() {
    if (busy || b.active !== 'human' || b.over) return;
    busy = true;
    let ev = endTurn(b); render(); await board.play(ev, b); saveBattle(b);
    if (await checkEnd()) return;
    await aiTurn();
  }
  async function aiTurn() {
    busy = true; render();
    await showBanner('ENEMY TURN', 700);
    for (let g = 0; g < 40 && !b.over; g++) {
      const a = aiNextAction(b, 'ai'); if (!a) break;
      await sleep(settings.fast ? 80 : 350);
      await exec('ai', a);
    }
    if (await checkEnd()) return;
    const ev2 = endTurn(b); render(); await board.play(ev2, b); saveBattle(b);
    if (await checkEnd()) return;
    busy = false; render();
    showBanner('YOUR TURN', 600);
  }

  side.onclick = (e) => {
    const t = e.target.closest('button'); if (!t || t.disabled) return;
    const d = t.dataset;
    if (d.fire) doHuman({ type: 'fire', uid: d.fire, mode: d.mode, target });
    else if (d.act === 'end') endHumanTurn();
    else if (d.act === 'hyper') doHuman({ type: 'hyper' });
    else if (d.act === 'ram') doHuman({ type: 'ram' });
    else if ('quit' in d) { if (confirmQuit()) { stopHum(); board.destroy(); onQuit(); } }
  };
  let quitArmed = 0;
  function confirmQuit() { const now = Date.now(); if (now - quitArmed < 2500) return true; quitArmed = now; const q = side.querySelector('[data-quit]'); if (q) q.textContent = 'Click again'; return false; }
  side.onchange = (e) => {
    if (e.target.name === 'tgt') { target = e.target.value === 'ship' ? 'ship' : +e.target.value; render(); }
    if ('fast' in e.target.dataset) { settings.fast = e.target.checked; saveSettings(); }
    if ('snd' in e.target.dataset) { settings.sound = e.target.checked; saveSettings(); settings.sound ? startHum() : stopHum(); }
  };
  side.onmouseover = (e) => { const c = e.target.closest('[data-hover]'); const v = c ? c.dataset.hover : null; if (v !== hoverWeapon) { hoverWeapon = v; updateRange(); } };
  root.querySelector('.board-ctl').onclick = (e) => {
    const z = e.target.dataset.z; if (!z) return;
    if (z === 'in') board.zoomBy(1.25); else if (z === 'out') board.zoomBy(0.8);
    else if (z === 'me') board.centerOn(H().pos); else if (z === 'foe') board.centerOn(A().pos); else board.fitAll();
  };
  const key = (e) => {
    if (!document.body.contains(side)) { window.removeEventListener('keydown', key); return; }
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); endHumanTurn(); }
    else if (e.key === 'h' || e.key === 'H') { if (canHyper(b, 'human')) doHuman({ type: 'hyper' }); }
    else if (/^[1-9]$/.test(e.key)) { const btn = side.querySelectorAll('.wcard [data-fire]:not([disabled])')[+e.key - 1]; btn?.click(); }
  };
  window.addEventListener('keydown', key);

  render();
  startHum();
  await showBanner(b.turn === 1 && b.active === 'human' ? 'BATTLE STATIONS' : 'BATTLE RESUMED', 900);
  if (b.active === 'ai' && !b.over) aiTurn(); // resumed mid enemy turn
  return { destroy: () => { stopHum(); board.destroy(); } };
}
