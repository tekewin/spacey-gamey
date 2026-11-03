# Spacey Gamey — HTML Edition: Game Specification (v0.2)

Source: *Spacey Gamey* rulebook © 1984 Gemini Games (Spacey_Gamey_Rules.pdf). This spec turns those rules into a single-player browser game: one human ship against one computer ship. Items marked **[DECISION]** are places where the original rules are unclear, don't fit 1-vs-1 play, or had to change for a digital version. Each one has a proposed default, and the defaults can be revised.

---

## 1. Scope

**In scope (v1)**
- Ship builder (new ship) or load a saved ship at startup.
- One scenario at a time: human vs. one AI ship, on a ~50×50 hex map, with ships starting in opposite corners.
- Turn-based play. The human always moves first.
- Full movement, combat, critical-hit, ammo, shield, ramming, hyperspace and nuclear-missile rules.
- Post-combat phase when the human wins: roll for credits, repair, rearm and upgrade, then save.
- If the AI wins, the game is over. The saved ship is not changed: it keeps its state from before the battle (see §10).
- Save and load ships on the player's own device.

**Out of scope (v1)**
- All computer equipment and programs (BOBC, Crit-Hit, History, Multi-Ship, Accurator, Master). Rules that depend on them are removed.
- Multiplayer, more than 2 ships, the "class game" vote, and the multi-winner credit table rows.

---

## 2. Technology

| Concern | Choice | Notes |
|---|---|---|
| Rendering | **PixiJS v8** (2D, WebGL) | A top-down hex board is a 2D problem. Pixi handles 2,500 hexes, pan/zoom and sprite effects easily. three.js would add camera and 3D cost without improving play. |
| Language/build | TypeScript + Vite | Builds to a static `dist/` folder that can be opened locally or hosted anywhere. |
| UI panels | Plain DOM/HTML + CSS over the canvas (or Preact if it grows) | Builder forms, logs and dialogs are much easier in DOM than in canvas. |
| Hex math | Own module (axial/cube coordinates) | Uses the formulas from redblobgames.com. No dependency needed. |
| Randomness | Seedable PRNG (e.g. mulberry32) | Makes replays and debugging possible. Every roll is logged. |
| Persistence | `localStorage` + JSON file export/import | See §11. |
| Tests | Vitest for the rules engine | The rules engine must be pure (no Pixi imports) and unit-tested against the chart values. |

**Architecture:** `engine/` (pure rules: dice, catalog, ship, map, combat, AI) ← `game/` (state machine, turn controller) ← `ui/` (Pixi board + DOM panels). The engine takes actions and returns new state plus an event list, and the UI animates those events. This separation also makes later multiplayer straightforward.

---

## 3. Ship Building

### 3.1 Base ship
- Hull: **50 hull points (HP)**, free.
- Budget: **12,000 credits** for a new ship.
- The player picks **Conventional** or **Solar**. A conventional ship may buy only conventional equipment, and a solar ship only solar equipment. Both may buy ramming equipment and extra hull points.
- The player names the ship and picks a counter: a letter or symbol plus a colour. An optional extra is a small pixel-drawing pad (a nod to "draw a picture on a counter").

### 3.2 Buyer's Guide (catalog — encode as data, `catalog.ts`)

**Conventional**
| Item | Effect | Cost | Limits |
|---|---|---|---|
| Shield | −1 to enemy to-hit, −1 per damage die (vs conventional weapons) | 1,000 | max 3 |
| Impulse Engine | Move 1 hex; not cumulative with thrusters | 500 | max 1 |
| Mini-Thruster | Move 2 hexes | 1,250 | — |
| Thruster | Move 4 hexes | 2,000 | — |
| Hyperspace Device | Jump to random hex | 1,500 | max 1 |
| Laser Beam Type I–VI | dmg per die: d4 / d6 / d8 / d10 / d12 / d20 | 500 / 750 / 1,000 / 1,250 / 1,500 / 2,500 **per die** | buyer chooses die count |
| Beam Recharger | Lets one beam fire every turn | 1,000 | 1 per beam |
| Cannon | Fires cannon shells | 500 | — |
| Cannon Shell | 2d6 | 25 each | — |
| Disperser | 4d6 | 2,000 | — |
| Missile Launcher | Fires nuclear missiles & plasmas | 1,000 | — |
| Nuclear Missile | 20d6 | 1,000 each | — |
| Missile Thruster | +speed to one missile | 250 | max 2 per missile |
| Plasma | 30 flat | 750 each | — |
| Photon Tube | Fires photons | 1,000 | — |
| Photon | 3d6 | 50 each | — |
| Rocket Launcher | Fires 1 rocket/turn | 500 | — |
| Tripod | Fires 3 rockets/turn | 1,250 | — |
| Rocket | Damage by range (chart) | 25 each | — |
| WLTB | 6d6, ignores all shields | 4,000 | — |

**Solar**
| Item | Effect | Cost | Limits |
|---|---|---|---|
| Solar Power Converter (SPC) | **Required** for a solar ship; can never be crit-hit | 1,000 | exactly 1 |
| Solar Generator | Lets one solar weapon fire every turn | 1,000 | 1 per solar weapon |
| Solar Thruster | Move 3 hexes | 1,000 | — |
| Sunscreen Shield | −1 to-hit, −1 per die (vs solar weapons) | 500 | max 3 |
| Sunburst | d4 per die | 500 per die | — |
| Flare Type I–IV | d6 / d8 / d10 / d12 per die | 750 / 1,000 / 1,250 / 1,500 per die | — |
| WLTB | 6d6, ignores all shields | 4,000 | — |

**Both:** Rammer 1,500 · De-Rammer 1,500 · Additional Hull Point 50 each.

### 3.3 Builder UI
- Two-column layout: the catalog (filtered to the ship type) and a manifest with the running total, credits left, HP, movement per turn, and a per-weapon "max range / to-hit at 10 hexes" summary.
- Validation: the solar SPC is required, maximums are enforced, a warning appears for weapons with no launcher or ammo (e.g. photons without a tube), and a warning appears for a beam or solar weapon without a recharger/generator ("fires only once per scenario").
- Ammo is held in **compartments**. Each ammo type (photons, shells, rockets, nukes, plasmas) is one compartment with a count. A compartment costs nothing, but it is a critical-hit target.
- Shows the **Ship Value** (sum of everything owned, including extra HP and ammo) and the **Class** (§9).
- Preset buttons: "Sample Ship A (Conventional)" and a computer-free version of "Sample Ship B" (the BOBC and program are replaced by 2,000 credits more hull or shields).

---

## 4. Map

- **50 × 50 hexes**, flat-top, in an offset grid stored as axial coordinates internally. (The original printed map was 60×40.)
- The human starts at the corner hex (0,0) and the AI at (49,49). The distance is about 74 hexes, so the opening turns are a closing manoeuvre. This makes long-range photons and flares matter, as in the rulebook example.
- **Range** = hex distance (cube distance), "counting hexes in as straight a line as possible."
- No terrain or line-of-sight blocking (open space).
- Board controls: pan (drag), zoom (wheel/pinch), and a toggleable coordinates overlay. The board highlights reachable hexes while moving and shows range rings for a selected weapon.
- **[DECISION] Map edge:** a ship may not voluntarily leave the board in v1, because there is no "leave the map" victory in 1-vs-1. *Option:* allow a "Disengage" action from an edge hex. This would mean no win and no credits, but the ship is restored and saved, matching rule C-10 ("leaves the map → restored").

---

## 5. Turn Structure

The original rules use a 2d6 roll for initiative. Instead, **the human always goes first.** Each player turn:

1. **Start of turn:** recharge any recharger- or generator-backed weapons, and move each in-flight nuclear missile owned by this side (§7.6).
2. **Action phase:** the player has a movement allowance (§6) and may *interleave* movement and attacks freely: move some, fire, move more (rule C-1). Each weapon fires at most once per turn (§7.1).
3. **End turn.** Unused movement is lost.

Combat only happens during the active player's own turn. There is no return fire on the opponent's turn.

The scenario ends when a ship's accumulated damage ≥ its HP (rule C-9).

---

## 6. Movement

- **Allowance per turn** = sum of thruster values. Thrusters stack (Thruster 4, Mini 2, Solar 3).
- **Impulse engine:** 1 hex. It is independent and *not* added to thrusters, and a ship may have only one. If a ship has both, it uses whichever is higher that turn. **[DECISION]** Proposed: an impulse engine can't be bought alongside thrusters at all, since it would never add anything.
- The ship moves hex by hex in any direction, including backwards, with no facing and no penalty.
- **Hyperspace (once per turn):** usable before any movement or after some movement. Once it is used, no further movement is allowed this turn (rule B-6). Attacks are still allowed after a jump. Destination: a uniformly random hex not occupied by the enemy. **[DECISION]** The original quadrant + d10 + d20 procedure is replaced by a uniform random hex. It is functionally the same and fits a square map. The roll is shown in the log for flavour.
- **No hyperspace after ramming** in the same turn.
- UI: the player clicks a destination, and the path is previewed along the shortest route with remaining movement shown. Movement is committed one step at a time, so attacks can happen mid-path.

---

## 7. Combat

### 7.1 Weapon firing rates (per turn)
| Weapon | Shots per turn | Ammo | Notes |
|---|---|---|---|
| Laser beam (each) | 1 | — | Without a recharger: **once per scenario** |
| Solar flare / Sunburst (each) | 1 | — | Without a generator: **once per scenario** |
| Photon tube (each) | 1 photon | Photon compartment | |
| Cannon (each) | 1 shell | Shell compartment | |
| Disperser (each) | 1 | — | |
| WLTB (each) | 1 | — | |
| Rocket launcher / Tripod | 1 / 3 rockets | Rocket compartment | |
| Missile launcher (each) | 1 nuke **or** 1 plasma | Nuke/plasma compartments | |

**Designer ruling:** every weapon fires at most once per turn. Each beam needs its own recharger, and each solar weapon needs its own generator. Each tube or launcher fires once per turn. One missile launcher can fire nukes or plasmas, but only one shot per turn in total.

### 7.2 To-Hit Chart (encode exactly)
Range columns: `0 | 1 | 2 | 3 | 4-5 | 6-7 | 8-10 | 11-15 | 16-20 | 21-25 | 26-30 | 31-35 | 36-40 | 41-45 | 46-50 | 51+`

| Attack form | Max range | Needed on d20 by column (— = out of range) |
|---|---|---|
| Photon | 51+ | 2 3 4 5 6 7 8 9 11 12 13 14 16 17 19 20 |
| Laser Beam | 30 | 2 3 4 5 6 8 10 12 14 16 18 — — — — — |
| Disperser | 20 | 2 3 4 5 7 10 12 15 18 — — — — — — — |
| Plasma | 10 | 0 2 4 7 9 13 16 — — — — — — — — — |
| Cannon | 3 | 2 5 9 14 — — — — — — — — — — — — |
| WLTB | 30 | 2 3 4 6 8 10 12 14 16 18 20 — — — — — |
| Solar Flare | 45 | 2 3 4 5 7 9 10 12 13 14 15 16 18 20 — — |
| Sunburst | 30 | 2 3 4 5 6 8 10 12 14 16 18 — — — — — |
| Rocket* | 5 | **damage** 6 5 4 3 2 — … |

\*Rockets never roll to hit. The number is the damage per rocket.

- **Resolution:** roll a d20. The shot hits if the roll ≥ target + the defender's applicable shields (the "−1 per shield" is applied as raising the target number). A natural roll can't exceed 20, so a total target above 20 can't hit.
- Unit tests must reproduce the rulebook example: photon at 32 → 14; flare at 36 → 18; flare at 29 → 15; sunburst at 29 → 18; beams at 25 → 16; photon at 25 → 12; flare at 22 → 14; sunburst at 22 → 16.

### 7.3 Damage
| Weapon | Damage |
|---|---|
| Beam/Flare/Sunburst | (dice bought) × (die type) — e.g. 2-die Type V Beam = 2d12 |
| Photon 3d6 · Cannon shell 2d6 · Disperser 4d6 · WLTB 6d6 · Nuke 20d6 | dice as listed |
| Plasma | 30 flat, no roll (still needs to-hit) |
| Rocket | per chart by range, per rocket |

**Shields (rule C-8):** each *applicable* shield subtracts 1 from every damage die, and each die still does a minimum of 1. Conventional shields only work against conventional weapons, and Sunscreen shields only against solar weapons. WLTB ignores all shields.
- **Rockets & shields (designer ruling):** each rocket's damage is reduced by 1 per applicable shield, minimum 1.
- **Plasma & shields (designer ruling):** shields raise plasma's to-hit target and also reduce its 30 damage. **[DECISION]** It is reduced by 1 per applicable shield, treating the 30 as one "die", so 3 shields → 27.

### 7.4 Critical hits (computer-free version of C-6/C-7)
After **every hit** except rockets. Rockets can never cause critical hits (designer ruling):
1. Roll 2d6. On **2 or 12**, the hit struck a critical area.
2. Roll 1d6. On **1–4**, it is only a normal surface hit (no extra effect). On **5–6**, it is a **permanent crit**.
3. On a permanent crit, the defender's critical items are numbered 1…N, and a die of size N is rolled to pick one. That item is **destroyed for the rest of the scenario.**
   - Critical items: every individual thruster/mini/solar thruster, impulse engine, hyperspace device, each beam, each recharger, each solar generator, each flare/sunburst, each shield, each cannon, disperser, WLTB, photon tube, rocket launcher, tripod and missile launcher, plus each **ammo compartment** (one item per ammo type).
   - Never critical: the SPC, hull points, and rammer/de-rammer. **[DECISION]** The rules' list doesn't name ramming gear, so it's excluded.
   - **Compartment explosion:** a hit compartment detonates all remaining contents *inside the ship*, and **shields don't apply**. Photons 3d6 each · Shells 2d6 each · Rockets 6 each · Nukes 20d6 each · Plasmas 30 each.
   - (The rule about splash damage to other ships in the same hex is irrelevant 1-vs-1 unless a ram put both ships in one hex. In that case, apply it to the other ship, with its applicable shields reducing the damage, as the rules say.)
4. The normal hit damage is still applied.

Losing a thruster reduces movement from the next turn onward. **[DECISION]** It does not reduce movement in the current turn. Losing a shield takes effect immediately.

Dice results show in an animated "dice tray" and in the combat log, e.g. *"Photon @ 32 hexes: need 14, rolled 18 — HIT. 3d6 = 11. Crit check 2d6 = 7: no crit."*

### 7.5 Rockets
- No to-hit roll. If the target is within 0–5 hexes, every rocket fired hits for the chart value (6 at 0 down to 2 at 4–5).
- **No crit check:** rockets are the only weapon that cannot cause critical hits.

### 7.6 Nuclear missiles
- Fired from a missile launcher (one per launcher per turn).
- Speed (designer ruling): **1 hex/turn** base, **4** with one missile thruster, **8** with two. Thrusters replace the base speed; they don't add to it.
- **Option 1, direct launch (designer ruling):** if the target is within the missile's speed (1, 4 or 8 hexes), the missile hits automatically and does 20d6, less applicable shields per die. Then a crit check is made.
- **Option 2, guided missile:** launched at longer range, it appears as a token on the map. At the start of each of the owner's turns, it moves up to its speed toward its target, and the owner may redirect it. It detonates on reaching the target's hex.
- **Shooting down a missile (designer ruling, 2026-11-03):** on their turn, the target may attack a missile token with any weapon except a nuke. The attack uses the normal to-hit roll at range, and the missile has no shields. Damage is **cumulative**: once the missile has taken **10 total damage** across any number of hits, it is destroyed. Otherwise it keeps coming.
- If the firing ship is destroyed, its missiles keep homing (irrelevant in 1-vs-1, since the game ends).

### 7.7 Ramming (rule C-11)
- Requires a **Rammer**. The ram is declared as a movement action against a target within remaining movement.
- Damage to the target = **1d6 per hex** between the ships at the moment the ram is declared, along the most direct path. **[DECISION]** All ram hexes count against remaining movement.
- The rammer takes **½** of the damage it inflicts, or **¼** if it has a De-Rammer. A target with a De-Rammer takes ½ damage. Shields never reduce ram damage.
- The rammer ends its movement in the target's hex, and may not hyperspace that turn. It may still fire weapons, at range 0.
- Ships may share a hex after a ram. Next turn either ship may move away.

---

## 8. AI Opponent

### 8.1 Ship generation
- The AI's budget is the **minimum value of the human ship's class** (designer ruling): `budget = 12,000 + (class − 1) × 10,000`. Examples: a fresh 12,000-credit ship (class 1) faces a 12,000-credit AI. A 25,000-credit ship (class 2) faces a 22,000-credit AI. A 47,500-credit ship (class 4) faces a 42,000-credit AI. The AI spends as close to the full budget as it can without going over.
- **Conventional or solar** at random (50/50), then a randomly chosen archetype, filled greedily to the budget with validation:
  - *Sniper* — photon tubes + lots of photons, shields, 1–2 thrusters, extra HP.
  - *Brawler* — cannons/disperser/rockets/tripod, thrusters, rammer.
  - *Beam boat* — high-type beams/flares with rechargers/generators.
  - *Missile boat* — launchers, nukes with missile thrusters, plasmas.
  - *Solar lancer* — sunbursts + flares + generators + sunscreens.
- The AI ship gets a generated name ("ISV Grudge of Orion"). Its equipment is **hidden** from the player (designer ruling); only its name, type and class are shown. Its weapons are revealed in the log only as they fire.

### 8.2 Turn behaviour (utility AI)
Each turn, the AI scores candidate plans of the form [move to hex X] + [fire set] (+ optional mid-move fire), using:
- Expected damage dealt = Σ P(hit at range) × E[damage − shields], with crit bonuses.
- Expected damage it would take next turn from the human's *known* weapons at the resulting range. The AI knows the player's loadout. **[DECISION]** Fair, because the player can see their own ship.
- Ammo conservation (don't waste a once-per-scenario beam at 20% odds).
- Preferred range for its archetype, plus a ram opportunity check and missile-dodging.
- Hyperspace when HP < 30% and it is in danger, or to break off from a brawler.
- Difficulty setting: Easy (random noise, no kiting), Normal, Hard (full look-ahead of one opponent turn).

AI actions are animated at readable speed, with a "fast-forward" button.

---

## 9. Ship Value & Class

- **Value** = sum of the purchase price of everything currently owned, including extra HP and remaining ammo.
- **Class:** 1 = 12,000–21,999; 2 = 22,000–31,999; … each class covers 10,000 credits, with no upper limit.
- Shown in the builder, in the HUD, and on the save card. The AI is generated in the player's class. Optional for later: let the player challenge a higher class "at their own risk".

---

## 10. Post-Combat (human wins)

1. **Victory screen** with a battle summary: turns, shots, hits, damage dealt/taken, crits.
2. **Earnings:** roll **1d4 × 1,000** credits (the 2–3 player row of the rules table). These are added to the ship's **credit bank**, along with any credits left unspent at build time.
3. **Free restoration (rule C-10):** all hull points are restored and all crit-destroyed equipment is repaired at no cost.
4. **Free restock (designer ruling, 2026-11-03):** all ammunition fired during the battle (photons, shells, rockets, nukes with their missile thrusters, plasmas) is restored to its pre-battle level at no cost. The ship returns exactly as it started the battle.
5. **Upgrade shop:** earnings are spent only on additions on top of that restored starting loadout, using the same builder UI, opened on the existing ship with the bank as budget. The player can **only add equipment**. Nothing can be sold or removed (designer ruling).
6. The value and class are recalculated → **Save** → "Next battle" (a new AI is generated in the new class) or return to the title screen.

**Human loses:** the "Ship destroyed" screen shows the battle summary, then *Game Over*. The ship is lost for that game, but its saved copy remains untouched and can be loaded for the next game (designer ruling). Battle damage is never written back to the save, and the mid-battle autosave is discarded.

---

## 11. Save / Load

- **Format:** versioned JSON.
  ```json
  { "format": "spacey-gamey-ship", "version": 1,
    "id": "uuid", "name": "Sunfire", "type": "solar",
    "counter": { "glyph": "S", "color": "#ffcc33", "pixels": null },
    "hullBase": 50, "hullExtra": 10,
    "items": [ { "id": "flare3", "dice": 2, "generator": true }, ... ],
    "ammo": { "photons": 10, "shells": 0, "rockets": 0, "nukes": [ {"thrusters": 2} ], "plasmas": 0 },
    "bank": 0, "record": { "wins": 0, "battles": 0 }, "savedAt": "ISO-8601" }
  ```
- **On-device storage:** `localStorage` key `spaceygamey.ships`, a hangar of many ships. On-device saves are kept per browser. All access is wrapped in try/catch, with a fallback to export-only if storage is blocked.
- **Export/Import:** download a `.ship.json` file, and import by file picker or drag-and-drop. Files are validated against the schema and the catalog: unknown items are rejected, and value is recalculated from the catalog rather than trusted from the file.
- Optional: the File System Access API "Save to folder…" on Chromium.
- **Mid-battle autosave** after every turn, so a reload resumes the battle.

---

## 12. Screens & Flow

```
Title ─┬─ Build New Ship ─────────────┐
       ├─ Load Ship (hangar / import) ┼─► Pre-battle briefing (AI name/class) ─► Battle
       └─ Rules reference                                     │
Battle ──► Victory ─► Credits roll ─► Repair/Rearm/Upgrade ─► Save ─► Next battle / Title
       └─► Defeat ─► Summary ─► Title
```

**Battle HUD:** the board fills the screen. Side panel: own ship (HP bar, movement left, weapon cards with ammo/recharge state and "need X to hit" at current range, buttons: Move / Fire / Ram / Hyperspace / Launch Nuke / End Turn). Enemy card (name, class, HP shown as damage bands, not exact numbers). The combat log and dice tray are along the bottom. Keyboard shortcuts: 1–9 select a weapon, Space ends the turn, H for hyperspace.

**Visual style:** matches the 1984 booklet: a black field with white linework, a hand-lettered angular title font for headings, a phosphor-green or amber monochrome hex grid, and coloured weapon effects (red beams, gold flares, blue photons, white-hot nukes). Effects use Pixi sprites/particles, with sound effects via WebAudio. All effects can be turned off.

---

## 13. Rules removed or changed (summary)

| Original rule | Handling |
|---|---|
| Computers & programs (BOBC, Crit-Hit, History, Multi-Ship, Accurator, Master) | Removed; crit = 2/12 then 5–6 |
| 2d6 roll for first move | Human always first |
| 60×40 map, ships on outer edge in quadrants | 50×50, opposite corners |
| Hyperspace quadrant/d10/d20 procedure | Uniform random hex |
| Class game choice, multi-ship, multi-winner, truce/leave/fight options | Not used in 1-vs-1 |
| Credits table | 1d4×1,000 per win |
| Leaving the map | Not allowed in v1 (optional Disengage) |

---

## 14. Milestones

1. **Engine core:** catalog, dice, ship model/value, hex math, to-hit table + unit tests matching the rulebook example.
2. **Builder + save/load** (works standalone).
3. **Board:** Pixi map, movement, human turn loop, basic weapons.
4. **Full combat:** crits, compartments, rockets, ramming, hyperspace, nukes.
5. **AI:** ship generation + utility turn logic.
6. **Post-combat loop,** class system, autosave.
7. **Polish:** effects, sound, rules reference page, accessibility (colour-blind-safe palette, keyboard play).

---

## 15. Designer rulings (resolved 2026-11-02)

1. Nuclear missile: 1 thruster = 4 hexes/turn, 2 = 8. A missile launched with the target within that distance hits that turn.
2. All weapons fire at most once per turn.
3. Shields reduce damage from each rocket and from plasma hits.
4. One recharger, generator or launcher is needed per weapon. One missile launcher fires both nukes and plasmas.
5. Rockets are the only weapon that cannot cause critical hits.
6. No selling. Players can only add to their ship.
7. A loss loses the ship for that game. The saved copy can be reloaded for the next game.
8b. The enemy ship is built with the lowest credit value of the player's class (e.g. a 25,000-credit player ship is class 2, so the enemy gets 22,000).
8. Enemy equipment is hidden from the player.

### Remaining minor assumptions (change any time)
- Plasma vs shields: −1 per applicable shield (the 30 is treated as one die).
- The enemy HP bar shows bands (e.g. Undamaged / Damaged / Heavy / Critical) rather than exact numbers, consistent with hidden equipment.

## 16. Additions (2026-11-03)

- **Hard mode (designer ruling):** chosen on the pre-battle briefing screen; the choice is remembered. The enemy is built with the **top** of the player's class range, `classFloor + 9,999` (e.g. 21,999 for class 1), instead of the bottom. A Hard victory pays **(1d4 + 2) × 1,000** credits.
- **To-hit odds:** each Fire button shows the hit chance and average damage at the current range, before enemy shields, since the enemy's shields are hidden.
- **Dice tray:** every roll (to-hit d20, damage dice, crit 2d6, permanence d6, crit item pick, ram, nuke, compartment explosion) animates in a tray in the centre of the board. It shows the result in green or red, with a red frame when the enemy is rolling.
- **Damage numbers:** a floating "−N" rises over any ship or missile that takes damage, and the ship's counter flashes.
- **Balance changes (designer rulings, 2026-11-03):**
  - Photons cost **150** each (was 50). Thrusters cost **1,500** (was 2,000) and Mini-Thrusters **1,000** (was 1,250). Solar Thrusters cost **1,500** (was 1,000). Sunscreens unchanged at 500.
  - To stay at 12,000, Sample Ship A carries 6 photons plus 2 extra hull points, and Sample Ship B has 10 extra hull points (was 20).
  - Type V and VI beams reach **45 hexes**. They use the beam row of the To Hit chart, extended to 31–35: **18**, 36–40: **19**, 41–45: **20** *(values chosen by Claude; adjust if desired)*. Types I–IV keep range 30.
  - Ships start on the diagonal at (8,8) and (41,41), exactly **50 hexes** apart.
  - Cannon range is **10 hexes**, using the plasma row of the To Hit chart (0, 2, 4, 7, 9, 13, 16).
  - Ramming: the rammer takes **¼** of the damage it inflicts, or **none** if it has a De-Rammer. A De-Rammer on the target still halves the damage the target takes.
  - Rockets can now cause critical hits: one crit check per rocket volley.
  - Rules Reference gains a Weapons & Damage table (damage, range, cost, notes for every weapon).
  - Weapon effect colours: beams green, solar flares and sunbursts yellow, WLTB red (jagged lightning).
