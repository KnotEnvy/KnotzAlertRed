# KnotZ: Alert Red

A 3D real-time strategy game that runs in the browser. Build a base from a sidebar, harvest
Aurium, mass tanks, lead a hero commander with levelling abilities, capture outposts, call
orbital support — and tear down the Crimson Dominion's base before it tears down yours.

Built with **Vite + TypeScript + Babylon.js**. The 3D models are built in Blender from Python
scripts kept in `assets/` (see [assets/README.md](assets/README.md)), every sound effect and
the soundtrack is synthesised at runtime, and the 2D art in `public/art/` is original.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run build` | Type-check and produce a production bundle in `dist/` |
| `npm run typecheck` | `tsc --noEmit` with strict settings |
| `npm run assets` | Rebuild the model pack and HUD portraits in headless Blender (`BLENDER=/path/to/blender` if it is not found) |
| `npm run showcase` | Art review: lines up every unit and structure and writes close-up screenshots to `scripts/out/` (`THEME=frost` etc.); `node scripts/battleshot.mjs` stages a battle |
| `npm run simtest` | Headless simulation soak: the AI plays a scripted opponent, no rendering |
| `npm run movetest` | Marches a mixed group across ten generated maps and reports arrivals (pathfinding regression check) |
| `npm run smoke` | Quick headless-browser pass through the menu, HUD, queues, commands, abilities, powers, combat and the results screens. `SHOTS=1` writes screenshots to `scripts/out/`, `PREVIEW=1` tests the production bundle |
| `npm run verify` | The full verification suites in `scripts/verify/` (about 15 minutes): `input.mjs` (every unit command and camera control, with real mouse/keyboard events), `hud.mjs` (every HUD button, construction and production queues, settings, results screens) and `combat.mjs` (combat matrix, defences, veterancy, all hero abilities, support powers, outposts, AI and 16-minute soaks on each difficulty) |

The browser tests fail on any console error, page error, failed request, WebGL error or
exception inside the frame loop. They need a Playwright Chromium
(`npx playwright install chromium`) and render with software WebGL, so they are slow but
need no GPU.

## How to play

- **Economy** — build a *Fusion Reactor*, then an *Aurium Refinery* (it comes with a
  Harvester). Click a structure in the sidebar to start it; when it reads **READY**, click it
  again and place it near your base. Keep power demand below supply.
- **Army** — the *Barracks*, *War Factory* and *Sky Dock* train units; the *Tech Lab* unlocks
  Titans, Artillery, Arc Pylons and four upgrades. Units gain veterancy from kills.
- **Hero** — pick Commander Rook (command tank), Seraph Nyx (stormcaller) or Warden Kade
  (marksman). `Q` `W` `E` cast abilities, the ultimate unlocks at level 3, and a fallen hero
  revives at the Command Center.
- **Map control** — park infantry next to the neutral *Aurium Extractors* (income) and the
  *Signal Obelisk* (faster Requisition, central vision) to capture them.
- **Requisition** — tokens (★) accrue over time and through combat. Spend them on a Supply
  Cache, Recon Sweep, Armor Drop or Orbital Lance.
- **Win** by destroying every enemy structure.

### Controls

| Input | Action |
| --- | --- |
| Left-click / drag | Select / box-select (double-click selects a type, Shift adds) |
| Right-click | Move, attack, harvest, set rally point (Shift queues waypoints) |
| `A` then click, or Ctrl + right-click | Attack-move |
| `S` / `H` | Stop / hold position |
| `Q` `W` `E` | Hero abilities |
| `F1` / `F2` | Select hero / select whole army |
| Ctrl + `1`–`9`, `1`–`9` | Assign / recall control groups |
| Arrows or screen edge, wheel, middle-drag or `[` `]` | Pan, zoom, rotate camera |
| `Space` / `B` | Jump to last alert / to your Command Center |
| `/` | Field manual |
| `Esc` / `P` | Cancel, deselect, pause menu |

## Project layout

```
src/
  core/     constants, RNG + noise, math, persisted settings
  data/     unit, building, hero, power and upgrade definitions + the damage table
  sim/      the game simulation (no rendering, DOM or audio imports)
    world.ts        match state, combat resolution, production, fog, victory
    unit.ts         orders, steering, targeting, harvesting, veterancy
    building.ts     defences, repair, capture logic
    nav.ts          walkability grid + cached flow fields
    abilities.ts    hero abilities, support powers, lingering effects
    ai.ts           the skirmish opponent
    map.ts          procedural map generation
    hooks.ts        the interface the sim uses to request sounds / effects / notices
  render/   Babylon.js scene: model-pack loader, faceted terrain, thin-instance batches,
            particles and debris, wrecks, fog sheet, 2D overlay
  input/    mouse + keyboard: selection, context commands, placement and targeting modes
  ui/       DOM HUD, minimap, menus
  audio/    synthesised effects, generative music, announcer
  game.ts   wires one match together; main.ts handles menu ↔ match flow
assets/     Blender modelling kit and model sources (Python) — the art pipeline
public/     models/models.kzm (built model pack), art/ (key art, portraits, backdrops)
scripts/    headless test harnesses and art-review screenshot tools
```

The simulation only talks to presentation through `sim/hooks.ts`, so it can run without a
browser (see `scripts/simtest.mjs`). The renderer is stateless with respect to entities: each
frame it rebuilds thin-instance buffers straight from simulation state, so each part of a
unit type (hull, turret, barrel…) costs one draw call regardless of how many are on screen.

For automation, a running match is exposed as `window.__game` and
`?autostart=1&hero=nyx&difficulty=hard&theme=frost&seed=42` skips the menu.

Progress and the backlog live in [TASKS.md](TASKS.md).
