import { CATALOG, AMMO, START_CREDITS, CHARGER_COST, itemLabel, chargerName } from '../engine/catalog.js';
import { newShip, makeItem, itemCost, shipValue, shipClass, hullPoints, baseMovement, addBlocker, checkShip, sideOk, clone } from '../engine/ship.js';
import { PRESETS } from '../engine/presets.js';
import { MAX_RANGE } from '../engine/tohit.js';
import { esc, fmt } from './util.js';
import { sfx } from './sound.js';

const GROUPS = [
  ['Engines', ['thruster', 'mini', 'impulse', 'sthruster', 'hyper']],
  ['Defense', ['shield', 'sunscreen']],
  ['Beam & solar weapons', ['beam1', 'beam2', 'beam3', 'beam4', 'beam5', 'beam6', 'sunburst', 'flare1', 'flare2', 'flare3', 'flare4']],
  ['Weapons & launchers', ['tube', 'cannon', 'disperser', 'rlauncher', 'tripod', 'launcher', 'wltb']],
  ['Ramming', ['rammer', 'derammer']],
];
const RANGE_OF = { beam: 30, beamlong: 45, flare: 45, sunburst: 30, photon: '∞', cannon: 10, disperser: 20, rocket: 5, wltb: 30, launcher: 'nuke/10' };

/**
 * mode 'new': budget 12,000, leftover becomes bank.  mode 'upgrade': only additions, budget = ship.bank.
 * Calls onDone(ship, action) where action is 'launch' | 'save'.
 */
export function openBuilder(root, { mode, ship, onDone, onBack, title }) {
  let draft = clone(ship);
  const baseline = mode === 'upgrade' ? clone(ship) : null;
  const budget = mode === 'upgrade' ? ship.bank : START_CREDITS;
  const baseUids = new Set(baseline ? baseline.items.map((i) => i.uid) : []);
  const baseCharged = new Set(baseline ? baseline.items.filter((i) => i.charger).map((i) => i.uid) : []);
  const opts = {}; // per-catalog-id dice/charger choices
  const left = () => budget - (shipValue(draft) - (baseline ? shipValue(baseline) : 0));

  function render() {
    const L = left(), val = shipValue(draft), chk = checkShip(draft);
    const solar = draft.type === 'solar';
    const groups = GROUPS.map(([g, ids]) => {
      const rows = ids.filter((id) => sideOk(CATALOG[id], draft.type)).map((id) => {
        const c = CATALOG[id], o = (opts[id] ||= { dice: 1, charger: true });
        const it = makeItem(id, o), cost = itemCost(it), block = addBlocker(draft, id);
        const dis = block || cost > L;
        const extra = c.costPerDie ? `<label class="mini">dice <input type="number" min="1" max="20" value="${o.dice}" data-dice="${id}"></label>
            <label class="mini"><input type="checkbox" ${o.charger ? 'checked' : ''} data-charger="${id}"> ${c.side === 'solar' ? 'generator' : 'recharger'}</label>` : '';
        return `<div class="cat-row"><div class="cat-main"><b>${esc(c.name)}</b><span class="desc">${esc(c.desc)}${c.attack ? ` · range ${RANGE_OF[c.attack]}` : ''}</span></div>
          <div class="cat-ctl">${extra}<span class="cost">${fmt(cost)}</span><button data-add="${id}" ${dis ? 'disabled' : ''} title="${esc(block || (cost > L ? 'Not enough credits' : 'Add'))}">Add</button></div></div>`;
      }).join('');
      return rows ? `<h4>${g}</h4>${rows}` : '';
    }).join('');
    const ammoRows = solar ? '' : `<h4>Ammunition</h4>` + ['photon', 'shell', 'rocket', 'plasma'].map((k) => {
      const a = AMMO[k];
      return `<div class="cat-row"><div class="cat-main"><b>${a.name}</b><span class="desc">${a.dmg} dmg · ${fmt(a.cost)} each · have ${draft.ammo[k]}</span></div>
        <div class="cat-ctl">${[1, 5, 10].map((n) => `<button data-ammo="${k}" data-n="${n}" ${a.cost * n > L ? 'disabled' : ''}>+${n}</button>`).join('')}</div></div>`;
    }).join('') + `<div class="cat-row"><div class="cat-main"><b>Nuclear Missile</b><span class="desc">20d6 · 1,000 + 250 per missile thruster · speed 1 / 4 / 8</span></div>
        <div class="cat-ctl"><select data-nukethr>${[0, 1, 2].map((t) => `<option value="${t}" ${opts.nukeThr == t ? 'selected' : ''}>${t} thrusters</option>`).join('')}</select>
        <button data-nuke ${1000 + 250 * (opts.nukeThr || 0) > L ? 'disabled' : ''}>Add</button></div></div>`;
    const hullRow = `<h4>Hull</h4><div class="cat-row"><div class="cat-main"><b>Additional Hull Points</b><span class="desc">50 credits each</span></div>
      <div class="cat-ctl">${[1, 10, 20].map((n) => `<button data-hull="${n}" ${50 * n > L ? 'disabled' : ''}>+${n}</button>`).join('')}</div></div>`;

    const items = draft.items.map((it) => {
      const c = CATALOG[it.id], locked = baseUids.has(it.uid) || it.id === 'spc';
      const chTxt = c.charged ? (it.charger ? ` <span class="tag">+ ${chargerName(c)}</span>` : (baseCharged.has(it.uid) ? '' : ` <button class="tiny" data-addch="${it.uid}" ${CHARGER_COST > L ? 'disabled' : ''}>+ ${c.side === 'solar' ? 'generator' : 'recharger'} 1,000</button>`)) : '';
      const rmCh = c.charged && it.charger && !baseCharged.has(it.uid) && !locked ? '' : '';
      return `<li><span>${esc(itemLabel(it))}${chTxt}${rmCh}</span><span class="cost">${fmt(itemCost(it))}</span>${locked ? '<span class="lock" title="Already installed">■</span>' : `<button class="tiny x" data-rm="${it.uid}">✕</button>`}</li>`;
    }).join('') || '<li class="muted">Nothing installed yet.</li>';
    const ammoLi = ['photon', 'shell', 'rocket', 'plasma'].filter((k) => draft.ammo[k]).map((k) => {
      const can = draft.ammo[k] > (baseline ? baseline.ammo[k] : 0);
      return `<li><span>${draft.ammo[k]} × ${AMMO[k].name}</span><span class="cost">${fmt(draft.ammo[k] * AMMO[k].cost)}</span>${can ? `<button class="tiny x" data-ammorm="${k}">−</button>` : '<span class="lock">■</span>'}</li>`;
    }).join('') + draft.ammo.nuke.map((n, i) => {
      const can = i >= (baseline ? baseline.ammo.nuke.length : 0);
      return `<li><span>Nuclear Missile (${n.thrusters} thr, speed ${[1, 4, 8][n.thrusters]})</span><span class="cost">${fmt(1000 + 250 * n.thrusters)}</span>${can ? `<button class="tiny x" data-nukerm="${i}">✕</button>` : '<span class="lock">■</span>'}</li>`;
    }).join('');
    const hullCan = draft.hullExtra > (baseline ? baseline.hullExtra : 0);

    root.innerHTML = `<div class="screen builder">
      <header class="bar"><button data-back>◂ Back</button><h2>${esc(title || (mode === 'upgrade' ? 'Repair, Rearm & Upgrade' : 'Build Your Ship'))}</h2>
        <div class="credits ${L < 0 ? 'bad' : ''}">Credits left <b>${fmt(L)}</b></div></header>
      <div class="builder-grid">
        <section class="panel identity">
          <label>Name <input data-name maxlength="40" value="${esc(draft.name)}" placeholder="e.g. Sunfire"></label>
          <label>Counter <input data-glyph maxlength="2" value="${esc(draft.counter.glyph)}" class="glyph"></label>
          <label>Color <input type="color" data-color value="${draft.counter.color}"></label>
          ${mode === 'new' ? `<div class="type-toggle"><button data-type="conventional" class="${!solar ? 'on' : ''}">Conventional</button><button data-type="solar" class="${solar ? 'on' : ''}">Solar</button></div>
          <div class="presets">${PRESETS.map((p, i) => `<button data-preset="${i}">${esc(p.name)}</button>`).join('')}</div>` : `<div class="muted">${draft.type === 'solar' ? 'Solar' : 'Conventional'} ship · additions only — nothing can be sold.</div>`}
        </section>
        <section class="panel catalog"><h3>Buyer's Guide — ${solar ? 'Solar' : 'Conventional'}</h3>${groups}${ammoRows}${hullRow}</section>
        <section class="panel manifest"><h3>Manifest</h3>
          <div class="stats">
            <div><span>Hull points</span><b>${hullPoints(draft)}</b></div>
            <div><span>Movement</span><b>${baseMovement(draft)} hex/turn</b></div>
            <div><span>Ship value</span><b>${fmt(val)}</b></div>
            <div><span>Class</span><b>${shipClass(val)}</b></div>
          </div>
          <ul class="items">${items}${ammoLi}<li><span>Base hull 50 + ${draft.hullExtra} extra</span><span class="cost">${fmt(draft.hullExtra * 50)}</span>${hullCan ? `<button class="tiny x" data-hullrm>−10</button>` : '<span class="lock">■</span>'}</li></ul>
          ${chk.errors.map((e) => `<div class="err">✖ ${esc(e)}</div>`).join('')}${chk.warnings.map((w) => `<div class="warn">⚠ ${esc(w)}</div>`).join('')}
          <div class="actions">
            ${mode === 'new' ? `<button class="primary" data-done="launch" ${chk.errors.length || L < 0 ? 'disabled' : ''}>Save & Launch ▸</button><button data-done="save" ${chk.errors.length || L < 0 ? 'disabled' : ''}>Save to Hangar</button>`
              : `<button class="primary" data-done="launch" ${chk.errors.length ? 'disabled' : ''}>Save & Next Battle ▸</button><button data-done="save" ${chk.errors.length ? 'disabled' : ''}>Save & Return to Title</button>`}
          </div>
          <p class="muted small">Unspent credits are kept in the ship's bank for after future victories.</p>
        </section>
      </div></div>`;
  }

  root.onclick = (e) => {
    const t = e.target.closest('button'); if (!t || t.disabled) return;
    const d = t.dataset; sfx.click();
    if ('back' in d) return onBack();
    if (d.type && d.type !== draft.type) { const n = newShip(d.type); n.id = draft.id; n.name = draft.name; draft = n; }
    else if (d.preset) { const p = PRESETS[+d.preset].make(); p.id = draft.id; p.name = draft.name || PRESETS[+d.preset].name.split(' (')[0]; draft = p; }
    else if (d.add) { const it = makeItem(d.add, opts[d.add]); if (!addBlocker(draft, d.add) && itemCost(it) <= left()) draft.items.push(it); }
    else if (d.rm) draft.items = draft.items.filter((i) => i.uid !== d.rm || baseUids.has(i.uid) || i.id === 'spc');
    else if (d.addch) { const it = draft.items.find((i) => i.uid === d.addch); if (it && CHARGER_COST <= left()) it.charger = true; }
    else if (d.ammo) { const n = Math.min(+d.n, Math.floor(left() / AMMO[d.ammo].cost)); if (n > 0) draft.ammo[d.ammo] += n; }
    else if (d.ammorm) { if (draft.ammo[d.ammorm] > (baseline ? baseline.ammo[d.ammorm] : 0)) draft.ammo[d.ammorm]--; }
    else if ('nuke' in d) { const thr = +(opts.nukeThr || 0); if (1000 + 250 * thr <= left()) draft.ammo.nuke.push({ thrusters: thr }); }
    else if (d.nukerm) draft.ammo.nuke.splice(+d.nukerm, 1);
    else if (d.hull) { const n = Math.min(+d.hull, Math.floor(left() / 50)); draft.hullExtra += n; }
    else if ('hullrm' in d) draft.hullExtra = Math.max(baseline ? baseline.hullExtra : 0, draft.hullExtra - 10);
    else if (d.done) { draft.bank = left(); return onDone(draft, d.done); }
    render();
  };
  root.oninput = (e) => {
    const t = e.target, d = t.dataset;
    if ('name' in d) { draft.name = t.value; refreshButtons(); return; }
    if ('glyph' in d) { draft.counter.glyph = t.value.toUpperCase() || 'X'; return; }
    if ('color' in d) { draft.counter.color = t.value; return; }
  };
  root.onchange = (e) => {
    const t = e.target, d = t.dataset;
    if (d.dice) opts[d.dice].dice = Math.max(1, Math.min(20, +t.value || 1));
    else if (d.charger) opts[d.charger].charger = t.checked;
    else if ('nukethr' in d) opts.nukeThr = +t.value;
    else return;
    render();
  };
  function refreshButtons() {
    const chk = checkShip(draft), bad = chk.errors.length > 0 || left() < 0;
    root.querySelectorAll('[data-done]').forEach((b) => (b.disabled = bad));
    const box = root.querySelector('.manifest'); box.querySelectorAll('.err').forEach((x) => x.remove());
    const anchor = box.querySelector('.warn, .actions');
    for (const er of chk.errors) { const div = document.createElement('div'); div.className = 'err'; div.textContent = '✖ ' + er; box.insertBefore(div, anchor); }
  }
  render();
}
