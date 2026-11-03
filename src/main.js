import './style.css';
import { newShip, shipValue, shipClass, classFloor, hullPoints, baseMovement, clone } from './engine/ship.js';
import { createBattle, survivorShip, hpLeft, hpMax } from './engine/combat.js';
import { aiBuildShip } from './engine/ai.js';
import { TO_HIT, RANGE_LABELS, FORM_NAMES, MAX_RANGE } from './engine/tohit.js';
import { CATALOG, AMMO } from './engine/catalog.js';
import { randomSeed } from './engine/rng.js';
import { openBuilder } from './ui/builder.js';
import { runBattle } from './ui/battle.js';
import { listShips, saveShip, deleteShip, exportShip, importShipFile, saveBattle, loadBattle, clearBattle, settings, saveSettings, storageOk } from './ui/storage.js';
import { esc, fmt, sleep } from './ui/util.js';
import { sfx } from './ui/sound.js';

const root = document.getElementById('app');
let current = null; // { destroy }
const clear = () => { current?.destroy?.(); current = null; root.onclick = root.oninput = root.onchange = null; };

/* ---------- Title ---------- */
function title() {
  clear();
  const resume = loadBattle();
  root.innerHTML = `<div class="screen title">
    <div class="logo"><div class="l1">SPACEY</div><svg viewBox="0 0 120 60" class="ship-art"><path d="M10 30 L60 18 L110 30 L60 42 Z M45 30 L60 8 L75 30 M60 42 L60 54" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="60" cy="30" r="4" fill="currentColor"/></svg><div class="l2">GAMEY</div></div>
    <p class="tag">A game of ship-to-ship combat in outer space · © 1984 Gemini Games</p>
    <div class="menu">
      ${resume && !resume.over ? `<button class="primary" data-go="resume">Resume Battle — ${esc(resume.ships.human.def.name)} (turn ${resume.turn})</button>` : ''}
      <button class="${resume && !resume.over ? '' : 'primary'}" data-go="build">Build New Ship</button>
      <button data-go="hangar">Load Ship (Hangar)</button>
      <button data-go="rules">Rules Reference</button>
      <label class="small"><input type="checkbox" data-sound ${settings.sound ? 'checked' : ''}> Sound</label>
    </div>
    ${storageOk() ? '' : '<p class="warn">Browser storage is blocked here — use Export to keep your ships as files.</p>'}
  </div>`;
  root.onclick = (e) => {
    const g = e.target.closest('[data-go]')?.dataset.go; if (!g) return; sfx.click();
    if (g === 'build') build();
    if (g === 'hangar') hangar();
    if (g === 'rules') rules();
    if (g === 'resume') battle(resume);
  };
  root.onchange = (e) => { if ('sound' in e.target.dataset) { settings.sound = e.target.checked; saveSettings(); } };
}

/* ---------- Builder ---------- */
function build() {
  clear();
  openBuilder(root, {
    mode: 'new', ship: newShip('conventional'), onBack: title,
    onDone: (ship, action) => { const saved = saveShip(ship) || ship; if (action === 'launch') briefing(saved); else hangar(saved.id); },
  });
}
function upgrade(ship, { afterBattle = false } = {}) {
  clear();
  openBuilder(root, {
    mode: 'upgrade', ship, title: afterBattle ? 'Repair, Rearm & Upgrade' : `Upgrade — ${ship.name}`, onBack: afterBattle ? () => { saveShip(ship); title(); } : hangar,
    onDone: (s, action) => { const saved = saveShip(s) || s; if (action === 'launch') briefing(saved); else title(); },
  });
}

/* ---------- Hangar ---------- */
function hangar(highlight) {
  clear();
  const ships = listShips().sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
  root.innerHTML = `<div class="screen hangar">
    <header class="bar"><button data-back>◂ Back</button><h2>Hangar</h2><label class="file"><input type="file" accept=".json,application/json" data-import hidden>Import ship file…</label></header>
    <div class="drop" id="drop">Drop a <code>.ship.json</code> file here to import</div>
    <div class="cards">${ships.map((s) => { const v = shipValue(s); return `<div class="panel scard ${s.id === highlight ? 'hl' : ''}">
        <div class="sc-head"><span class="glyph" style="color:${s.counter.color};border-color:${s.counter.color}">${esc(s.counter.glyph)}</span><b>${esc(s.name)}</b></div>
        <div class="row"><span>${s.type === 'solar' ? 'Solar' : 'Conventional'} · Class ${shipClass(v)}</span><b>${fmt(v)} cr</b></div>
        <div class="row"><span>HP ${hullPoints(s)} · Move ${baseMovement(s)}</span><span>Wins ${s.record.wins} · Bank ${fmt(s.bank)}</span></div>
        <div class="btnrow"><button class="primary" data-battle="${s.id}">Battle ▸</button><button data-up="${s.id}" ${s.bank > 0 ? '' : 'disabled'} title="Spend banked credits">Upgrade</button><button data-exp="${s.id}">Export</button><button class="x" data-del="${s.id}">Delete</button></div>
      </div>`; }).join('') || '<p class="muted">No saved ships yet. Build one, or import a ship file.</p>'}</div></div>`;
  const find = (id) => ships.find((s) => s.id === id);
  let delArm = null;
  root.onclick = (e) => {
    const t = e.target.closest('button'); if (!t || t.disabled) return; const d = t.dataset; sfx.click();
    if ('back' in d) title();
    else if (d.battle) briefing(find(d.battle));
    else if (d.up) upgrade(find(d.up));
    else if (d.exp) exportShip(find(d.exp));
    else if (d.del) { if (delArm === d.del) { deleteShip(d.del); hangar(); } else { delArm = d.del; t.textContent = 'Confirm?'; } }
  };
  const doImport = async (file) => {
    try { const s = await importShipFile(file); const exists = listShips().some((x) => x.id === s.id); if (exists) s.id = crypto.randomUUID?.() || s.id + '-copy'; saveShip(s); hangar(s.id); }
    catch (err) { alert('Could not import: ' + err.message); }
  };
  root.onchange = (e) => { if ('import' in e.target.dataset && e.target.files[0]) doImport(e.target.files[0]); };
  const drop = root.querySelector('#drop');
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('on'); };
  drop.ondragleave = () => drop.classList.remove('on');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('on'); if (e.dataTransfer.files[0]) doImport(e.dataTransfer.files[0]); };
}

/* ---------- Briefing ---------- */
function briefing(ship) {
  clear();
  const v = shipValue(ship), cls = shipClass(v), hard = settings.hard;
  const budget = hard ? classFloor(cls) + 9999 : classFloor(cls); // Hard: top of the class range
  const foe = aiBuildShip(budget);
  root.innerHTML = `<div class="screen briefing"><div class="panel brief">
    <h2>Contact Report</h2>
    <p>Long-range sensors detect a hostile vessel at the far corner of the sector.</p>
    <div class="vs"><div><span class="glyph big" style="color:${ship.counter.color};border-color:${ship.counter.color}">${esc(ship.counter.glyph)}</span><b>${esc(ship.name)}</b><span class="muted">Class ${cls} · ${fmt(v)} cr · ${hullPoints(ship)} HP</span></div>
      <div class="vsx">VS</div>
      <div><span class="glyph big" style="color:${foe.counter.color};border-color:${foe.counter.color}">X</span><b>${esc(foe.name)}</b><span class="muted">${foe.type === 'solar' ? 'Solar' : 'Conventional'} · Class ${cls} · loadout unknown</span></div></div>
    <div class="diff"><button data-diff="normal" class="${hard ? '' : 'on'}">Normal</button><button data-diff="hard" class="${hard ? 'on hard' : ''}">Hard</button></div>
    <p class="small muted">${hard ? `<b class="bad">HARD:</b> the enemy is built with up to ${fmt(budget)} credits — the top of class ${cls}. Victory pays (1d4 + 2) × 1,000.` : `The enemy is built with ${fmt(budget)} credits — the bottom of class ${cls}. Victory pays 1d4 × 1,000.`} Ships start 50 hexes apart; you start top-left and move first.</p>
    <div class="btnrow"><button data-back>◂ Back</button><button class="primary" data-go>Engage ▸</button></div></div></div>`;
  root.onclick = (e) => {
    if (e.target.closest('[data-back]')) title();
    const df = e.target.closest('[data-diff]');
    if (df) { const h = df.dataset.diff === 'hard'; if (h !== settings.hard) { settings.hard = h; saveSettings(); briefing(ship); } return; }
    if (e.target.closest('[data-go]')) { const b = createBattle(ship, foe, randomSeed()); b.hard = hard; saveBattle(b); battle(b); }
  };
}

/* ---------- Battle ---------- */
async function battle(b) {
  clear();
  current = await runBattle(root, b, { onEnd: (bb) => { clearBattle(); current?.destroy?.(); current = null; bb.winner === 'human' ? victory(bb) : defeat(bb); }, onQuit: () => { current = null; title(); } });
}
const summary = (b) => { const h = b.stats.human, a = b.stats.ai; return `<table class="sum"><tr><th></th><th>You</th><th>Enemy</th></tr>
  <tr><td>Shots</td><td>${h.shots}</td><td>${a.shots}</td></tr><tr><td>Hits</td><td>${h.hits}</td><td>${a.hits}</td></tr>
  <tr><td>Damage dealt</td><td>${h.dealt}</td><td>${a.dealt}</td></tr><tr><td>Permanent crits</td><td>${h.crits}</td><td>${a.crits}</td></tr></table>
  <p class="muted small">${b.turn} turn${b.turn === 1 ? "" : "s"}.</p>`; };

function victory(b) {
  clear();
  const ship = survivorShip(b);
  const foe = b.ships.ai.def;
  root.innerHTML = `<div class="screen result win"><div class="panel brief">
    <h2>VICTORY</h2>${b.hard ? '<p class="bad"><b>HARD MODE</b></p>' : ''}<p>${esc(foe.name)} has been destroyed. ${esc(ship.name)} survives with ${hpLeft(b.ships.human)} of ${hpMax(b.ships.human)} HP.</p>
    ${summary(b)}
    <div class="credits-roll"><div class="d4" id="d4">?</div><div id="earn">The sponsoring companies roll ${b.hard ? '<b>(1d4 + 2)</b> — Hard mode bonus —' : '1d4'} for your earnings…</div></div>
    <div class="btnrow"><button class="primary" data-roll>Roll for credits</button></div></div></div>`;
  root.onclick = async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if ('roll' in t.dataset) {
      t.disabled = true; const d4 = root.querySelector('#d4');
      for (let i = 0; i < 14; i++) { d4.textContent = 1 + Math.floor(Math.random() * 4); sfx.click(); await sleep(60 + i * 8); }
      const r = 1 + Math.floor(Math.random() * 4); d4.textContent = r;
      const mult = r + (b.hard ? 2 : 0);
      ship.bank += mult * 1000;
      root.querySelector('#earn').innerHTML = `${b.hard ? `Rolled ${r} + 2 (Hard) = ${mult}. ` : ''}You earn <b>${fmt(mult * 1000)}</b> credits. Bank: <b>${fmt(ship.bank)}</b>.<br><span class="small muted">Your ship is fully repaired and restocked to its pre-battle loadout, free. Spend your credits on upgrades.</span>`;
      saveShip(ship);
      t.parentElement.innerHTML = `<button class="primary" data-shop>Repair, Rearm & Upgrade ▸</button>`;
    } else if ('shop' in t.dataset) upgrade(ship, { afterBattle: true });
  };
}
function defeat(b) {
  clear();
  root.innerHTML = `<div class="screen result lose"><div class="panel brief">
    <h2>SHIP DESTROYED</h2><p>${esc(b.ships.human.def.name)} was lost to ${esc(b.ships.ai.def.name)}.</p>
    <p class="small muted">The enemy was a ${b.ships.ai.def.type} ship. Your saved copy in the hangar is unchanged and can fly again next game.</p>
    ${summary(b)}<div class="btnrow"><button class="primary" data-t>Game Over — Title</button></div></div></div>`;
  root.onclick = (e) => { if (e.target.closest('[data-t]')) title(); };
}

/* ---------- Rules ---------- */
function weaponRows() {
  const rng = (f) => (MAX_RANGE[f] === Infinity ? 'unlimited' : `${MAX_RANGE[f]} hexes`);
  const typ = (c) => (c.side === 'solar' ? '<span class="sol">Solar</span>' : c.side === 'any' ? 'Both' : 'Conventional');
  const rows = [];
  for (const [id, c] of Object.entries(CATALOG)) {
    if (!c.attack) continue;
    let dmg, range = rng(c.attack === 'launcher' ? 'plasma' : c.attack), cost = c.costPerDie ? `${fmt(c.costPerDie)} per die` : fmt(c.cost), note = '';
    const cls = c.attack === 'wltb' ? 'w-wltb' : c.attack === 'flare' || c.attack === 'sunburst' ? 'w-sol' : c.attack.startsWith('beam') ? 'w-beam' : '';
    if (c.costPerDie) { dmg = `1d${c.die} per die (avg ${(c.die + 1) / 2})`; note = 'needs recharger/generator'; }
    else if (c.attack === 'photon') { dmg = `3d6 per photon (avg 10.5)`; note = `photons ${fmt(AMMO.photon.cost)} each`; }
    else if (c.attack === 'cannon') { dmg = `2d6 per shell (avg 7)`; note = `shells ${fmt(AMMO.shell.cost)} each`; }
    else if (c.attack === 'rocket') { dmg = `${c.shots} rocket${c.shots > 1 ? 's' : ''}/turn × 6/5/4/3/2 by range`; note = `auto-hit; rockets ${fmt(AMMO.rocket.cost)} each`; }
    else if (c.attack === 'launcher') { dmg = 'Nuke 20d6 (avg 70) · Plasma 30'; range = 'nuke: homes in · plasma: 10 hexes'; note = `nuke ${fmt(AMMO.nuke.cost)} (+250/thruster) · plasma ${fmt(AMMO.plasma.cost)}`; }
    else if (c.attack === 'disperser') dmg = '4d6 (avg 14)';
    else if (c.attack === 'wltb') { dmg = '6d6 (avg 21)'; note = 'ignores all shields'; }
    rows.push(`<tr class="${cls}"><th>${esc(c.name)}</th><td>${typ(c)}</td><td>${dmg}</td><td>${range}</td><td>${cost}</td><td class="muted">${note}</td></tr>`);
  }
  rows.push(`<tr><th>Ram (needs Rammer)</th><td>Both</td><td>1d6 per hex charged</td><td>your movement</td><td>${fmt(CATALOG.rammer.cost)}</td><td class="muted">rammer takes ¼ (none with de-rammer)</td></tr>`);
  rows.push(`<tr><th>Compartment explosion</th><td>—</td><td>photons 3d6 · shells 2d6 · rockets 6 · nukes 20d6 · plasmas 30, each</td><td>inside ship</td><td>—</td><td class="muted">shields don't help</td></tr>`);
  return rows.join('');
}
function rules() {
  clear();
  const rows = Object.keys(TO_HIT).map((f) => `<tr><th>${FORM_NAMES[f]}</th><td class="mr">${MAX_RANGE[f] === Infinity ? '51+' : MAX_RANGE[f]}</td>${TO_HIT[f].map((v) => `<td>${v ?? '—'}</td>`).join('')}</tr>`).join('');
  root.innerHTML = `<div class="screen rules"><header class="bar"><button data-back>◂ Back</button><h2>Rules Reference</h2></header>
  <div class="panel"><h3>To Hit Chart</h3><div class="tablewrap"><table class="chart"><tr><th>Attack form</th><th>Max</th>${RANGE_LABELS.map((l) => `<th>${l}</th>`).join('')}</tr>${rows}</table></div>
  <p class="small">Roll a d20 equal to or above the number. Each applicable shield adds +1 to the number and −1 to every damage die (min 1 per die). *Rockets never roll: the number is damage per rocket. Nuclear missiles never roll.</p></div>
  <div class="panel"><h3>Weapons &amp; Damage</h3><div class="tablewrap"><table class="chart dmg">
    <tr><th>Weapon</th><th>Type</th><th>Damage</th><th>Max range</th><th>Cost</th><th>Notes</th></tr>${weaponRows()}</table></div>
    <p class="small">Charged weapons (beams, flares, sunbursts) buy any number of dice. Each one needs its own recharger/generator (1,000) to fire every turn, otherwise it fires once per battle.</p></div>
  <div class="panel cols"><div>
    <h3>Turn</h3><ul><li>You always move first.</li><li>Move and fire in any order: move, fire, move again.</li><li>Each weapon fires at most once per turn.</li><li>Beams and solar weapons need their own recharger/generator to fire every turn — otherwise once per battle.</li></ul>
    <h3>Movement</h3><ul><li>Thruster 4 · Mini-thruster 2 · Solar thruster 3 (they add up). Impulse engine 1 (not with thrusters).</li><li>Hyperspace: jump to a random hex. You may move and then jump, but you can't move after jumping.</li></ul>
  </div><div>
    <h3>Critical hits</h3><ul><li>After every hit (a rocket volley counts as one hit), roll 2d6: a 2 or 12 strikes a critical area.</li><li>Then a d6: 5–6 permanently destroys a random critical item.</li><li>An ammo compartment explodes inside the ship, and shields don't help.</li></ul>
    <h3>Special</h3><ul><li>Nuclear missile: speed 1, 4 or 8 (with 0, 1 or 2 thrusters). If the target is within that distance it hits at once (20d6). Otherwise it homes in each turn and can be shot down: 10 total damage destroys it (hits add up).</li>
    <li>Ram (needs a rammer): 1d6 per hex charged. The rammer takes ¼ of that, or nothing if it has a de-rammer. A de-rammer on the target halves what the target takes.</li>
    <li>Win: roll 1d4 × 1,000 credits ((1d4 + 2) × 1,000 in Hard mode, where the enemy is built at the top of your class). The ship is fully repaired and restocked to its pre-battle loadout, free. Upgrades are additions only.</li></ul>
  </div></div>
  <div class="panel savebox"><h3>Where your ships are saved</h3>
    <p>Your hangar is not kept in cookies. It's in the browser's <b>localStorage</b>, a small storage area each site gets on your computer. The game uses three keys:</p>
    <ul><li><code>spaceygamey.ships</code> — every ship in your hangar (JSON)</li><li><code>spaceygamey.battle</code> — the battle in progress, so you can resume it</li><li><code>spaceygamey.settings</code> — sound, fast mode, Normal/Hard</li></ul>
    <ul><li><b>It stays on this computer and in this browser.</b> Chrome and Edge keep separate hangars, and nothing syncs to other devices.</li>
    <li><b>Opening the game as a local file ties the storage to that file.</b> In Chrome, every page opened with <code>file://</code> usually shares one storage area. If you moved or renamed the game file and your hangar came up empty, try opening it from its old location.</li>
    <li><b>Clearing browsing data can wipe it</b> if you clear "cookies and other site data". Private or incognito windows throw it away when you close them.</li>
    <li><b>You can look at it yourself.</b> Press F12, then go to Application → Local Storage.</li></ul>
    <p><b>The safe backup is Export:</b> each hangar card has an Export button that downloads a <code>.ship.json</code> file you can keep anywhere. Bring it back with Import, or by dropping the file onto the hangar.</p>
  </div></div>`;
  root.onclick = (e) => { if (e.target.closest('[data-back]')) title(); };
}

title();
