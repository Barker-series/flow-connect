# FLOW CONNECT — design canon

A portrait, single-thumb path-drawing logic puzzle in the Flow lineage, dressed
as neon tubes on a dark board. This file is canon: every rule, reward, economy
number, and monetization decision is defined here first and implemented from
here. If code and this document disagree, the document is the bug report.

---

## 1. Pitch

Pairs of coloured endpoints sit on a square grid. Drag from one endpoint to its
twin to lay a glowing tube. Connect every pair **and** fill every cell — tubes
may not cross or branch. Every board has exactly one answer.

No timer. No lives. No fail state. One board, one answer, one satisfying click
when the last cell lights.

**Session shape:** 30 seconds to 3 minutes per board; sessions are strings of
boards. Fully playable one-handed in portrait.

---

## 2. Rules (`src/game/flow/game.ts`)

### 2.1 The board

- Square, **5×5 to 9×9**. Cells are addressed `(x, y)`, origin top-left,
  `index = y * size + x`.
- **4 to 10 flows**, one colour each. Each flow has exactly two endpoints.

### 2.2 Drawing

- A drag starting on an endpoint starts that flow **afresh** from that end.
- A drag starting on a drawn tube picks that flow up **from that cell**; the
  tube beyond it is dropped.
- The head moves one orthogonal cell at a time. A fast swipe that skips cells
  is walked cell-by-cell (longer axis first), so every tube is contiguous.
- **Another colour's endpoint is a wall.** Nothing may enter it.
- **Any other cell may be crossed.** The flow that owned it is cut back to just
  before the crossing. The cut is **provisional** while the finger is down:
  backing off restores the crossed flow whole. Lifting the finger commits it.
- Dragging back over your own tube shortens it to that cell.
- Once the head reaches the flow's other endpoint the flow is **connected** and
  may only be shortened, never grown past its terminal.

### 2.3 Moves

A **move** is a committed drag of a flow different from the previous committed
drag's flow. Redrawing the same flow repeatedly costs one move. Undo and
restart never refund a move. `par = number of flows`.

### 2.4 Solved, and "almost"

The board is **solved** when every flow is connected **and** every cell is
covered. Every flow connected with cells still empty is **almost**: the empty
cells pulse so the answer is on the board, not in a tooltip.

### 2.5 Helpers

- **Undo** — restore the board before the last committed change (200 deep).
- **Restart** — clear every tube; undoable; keeps the move count.
- **Hint** — lay the lowest-numbered flow that is not already drawn exactly as
  the intended solution, cutting anything in its way. A hinted solve is never
  perfect. Cost in §5.

---

## 3. Levels (`src/game/flow/`)

### 3.1 Generation

Offline and deterministic (`npm run levels` → `levels.json`, committed):

1. Lay a serpentine Hamiltonian path over the board and scramble it with
   `size² × 24` backbite moves (seeded `NoiseRandom`). A backbite keeps the path
   Hamiltonian, so the board is always fully fillable by construction.
2. Cut the path greedily into runs that never brush against themselves, then
   merge neighbouring runs (clean merges first) until the flow target is met.
   Every run is at least three cells.
3. Prove the result with the exhaustive solver (`solver.ts`). **Keep it only if
   it has exactly one solution.**

Pack levels: twice as many candidates as needed are generated, scored by solver
effort and flow count, and an even spread taken in ascending difficulty — so a
pack has a curve, not a shuffle.

### 3.2 Packs

| Pack | Board | Flows | Levels |
| --- | --- | --- | --- |
| **Spark** | 5×5 | 4–5 | 25 |
| **Current** | 6×6 | 5–6 | 25 |
| **Circuit** | 7×7 | 6–7 | 25 |
| **Grid** | 8×8 | 7–9 | 25 |
| **Mainframe** | 9×9 | 8–10 | 25 |

A pack opens when **12** levels of the previous pack are solved. Within a pack
the first three levels are open, and each level opens when any of the three
before it is solved — one stubborn board never walls off the pack.

### 3.3 The Daily Flow

One 7×7, 6–7-flow board per trusted day, generated on device from a hash of the
day key, so every player gets the same board. Requires trusted RUN time; shows
"waiting" until it arrives. Solving on consecutive days builds the **daily
streak**.

`npm run simulate` re-proves every shipped level (well-formed, unique, stored
answer matches the solver, playable to a perfect through the real rules) and
120 days of Daily Flows.

---

## 4. Scoring

| Event | Sparks |
| --- | --- |
| First solve of a pack level | `4 + 2 × (size − 5)` → 4 / 6 / 8 / 10 / 12 |
| **Perfect** (moves ≤ flows, no hint), first time per level | `+3` |
| First solve of a Daily Flow | `30`, `+10` if perfect |
| Replays | 0, except a first-ever perfect (`+3`) |

Replays pay nothing so level 1 cannot be farmed, but going back to clean up a
messy solve is always worth something. Each level records **best moves** and
whether it has ever been **perfect** (a star on the level tile).

---

## 5. Economy

**Sparks** are the only earned currency. A new profile starts with **60**.

| Sink | Cost |
| --- | --- |
| Hint | **30** sparks |
| Sorbet tube set | 150 sparks |
| Circuit tube set | 300 sparks |

**Guardrails** (`npm run balance`): no single pack level may pay a whole hint,
so a hint is always a decision; and perfect play through every pack funds fewer
hints than 40 % of the levels. Sparks are never sold for Run Bits, and hints are
never sold for Run Bits — the earned and paid economies stay separate.

### 5.3 Tube sets (cosmetic)

Ten tube colours per set, one per possible flow. Purely visual. `npm run test`
enforces that every pair of tubes in a set is at least ΔE 22 apart and every
tube is far brighter than an empty cell — a pretty set cannot ship a puzzle
where two colours read the same.

| Set | Unlock |
| --- | --- |
| **Arcade** | starter |
| **Sorbet** | 150 sparks |
| **Circuit** | 300 sparks |
| **Aurora**, **Synthwave** | entitlement `flowconnect_tube_pack_nightlife` |
| **Prism** | entitlement `flowconnect_tubes_prism` |

---

## 6. Monetization

**Model:** hybrid. Cosmetics and an ad-free upgrade in Run Bits, plus optional
rewarded video and one capped interstitial.

**Non-payer promise.** Nothing purchasable changes a level, a hint price, or a
reward. Every level is solvable without a hint. Three sets are earnable. The
only ad a non-payer cannot decline is one interstitial after every fourth solve,
never in their first session.

**Purchase architecture:** RUN Shop + authoritative Entitlements; ownership is
read from Entitlements every session, never from the save.

### 6.1 Products (`rundot/shop.config.json`)

| Product | Item id | Price | Grants | Offered after |
| --- | --- | --- | --- | --- |
| `tube_pack` | `flowconnect_tube_pack_nightlife` | **199 RB** | Aurora + Synthwave | 3 solves |
| `ad_free` | `flowconnect_no_interstitials` | **249 RB** | No interstitial | 8 solves |
| `power_pass` | `flowconnect_power_pass` | **399 RB** | Both + Prism | 8 solves |

Prices are launch hypotheses mirroring LEADLIGHT's shipped 199/249/399 ladder;
the bundle is cheaper than its parts plus an exclusive.

### 6.2 Ad placements

| Placement | Format | Trigger | Gates |
| --- | --- | --- | --- |
| `free_hint` | rewarded | Tapping HINT with fewer than 30 sparks | ≥2 solves; cooldown 45 s; 4/session; 10/day |
| `double_sparks` | rewarded | Level-complete card | ≥2 solves; cooldown 30 s; 4/session; 12/day |
| `between_levels` | interstitial | Leaving the level-complete card | ≥8 solves; every 4th solve; never first session; never first 20 s; cooldown 120 s; 3/session; 6/day; skipped if ad-free owned |

Rewards apply only on an SDK-verified completion. The interstitial runs AFTER
the navigation the player asked for, never between them and their button.

### 6.3 Kill switches

`rundot/liveops.config.json` → `flowconnect_monetization`. Every control fails
closed: no reachable LiveOps config means every offer and placement hides.

---

## 7. Retention

- **Daily Flow** and its streak (§3.3) — the main daily reason to return.
- **Daily sparks** — 7-day ladder 10/12/15/18/22/26/45, trusted-time day.
- **Daily jobs** — solve 5 levels (15), solve 3 perfectly (20), solve the Daily
  Flow (15).
- **Return reminders** — opt-in, 24/48/72 h, naming the Daily Flow and the
  waiting level.

---

## 8. Art direction — "Neon Logic"

- **Value structure first.** Deep navy stage < dark bezel < darker sockets <<
  saturated glowing tubes. The tubes are the only light source. If a change
  makes the board brighter or the tubes duller, it is wrong.
- **Tubes.** Drawn in passes: a wide additive bloom, a darker rim, the colour
  core, and a white-hot filament down the middle. Round caps and joins, so a
  corner is a bend. Covered cells take a faint tint of their tube. Proportions
  live in `TUBE` in `art/neon.ts` and are shared by the live board and every
  static render.
- **Endpoints.** Lit glass orbs with a halo and a specular. Unconnected orbs
  breathe; connected ones hold steady — what is left to do is always legible.
- **Drawing.** A halo in the active colour sits around the finger (wider than a
  thumb). Each step plucks a pentatonic note that climbs with the tube's length;
  each colour connects on its own chime; a cut is a downward zap.
- **Connect.** A charge of light runs the length of the tube, sparks jump off
  both ends, the orbs pop.
- **Solve.** Every tube charges in a wave, the board flares in every colour, a
  resolving chord, then the level-complete sheet docks at the bottom — the lit
  board stays in view above it; it is the reward.
- **Light is the point.** The board casts its own colour onto the stage, derived
  from the live board: the room lights as the player connects flows.
- **Single generator.** Every static image — menu backdrop, level thumbnails,
  Studio previews, the 512×512 store tile — is drawn by `art/neon.ts`. No image,
  font, or audio file ships.
- **Reduced motion** keeps every light and state change and drops movement: no
  flying sparks, no charge travel, shorter holds.

**Audio.** Procedural (`audio/audioManager.ts`): the notes above plus a soft
electric I–vi–IV–V pad.

---

## 9. Persistence

Save key `flowconnect:save`, version 1, in RUN appStorage (the SDK mock's
locally). Browser storage is never used — it is unavailable in the RUN iframe
and the SDK build refuses it. Sections: `settings`, `progress` (`sparks`,
`levelRecords`, `levelsCompleted`, `hintsUsedTotal`, `dailyStreak`,
`dailyBestStreak`, `dailyLastSolved`, earned sets, selected set), `retention`,
`commerce`. A board in progress is **not** saved. Daily records are capped at
120 days. Unknown fields are dropped by the migrator.

---

## 10. Analytics

Funnels: `load`, `flowconnect_first_level` (loaded → started → solved),
`flowconnect_first_level_detail` (started → first flow drawn → first connected
→ half connected → solved), `engagement` (solves 1–25), `purchase`. Events:
`level_started`, `level_completed` (moves, flows, perfect, hints, first_solve,
sparks, duration), `hint_used`, `palette_selected`, `palette_unlocked`, plus the
monetization events. Analytics never changes player state.
