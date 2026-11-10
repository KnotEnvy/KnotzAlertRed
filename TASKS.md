# KnotZ: Alert Red — build log

A 3D browser RTS: sidebar base-building and tank warfare, plus hero commanders, veterancy,
capturable outposts and requisition-bought support powers. Vite + TypeScript + Babylon.js.
Models are built in Blender from scripts in `assets/`, sound and music are synthesised at
runtime, and the 2D art in `public/art/` is original.

Round 1 (sections 1–9) built the playable game. Round 2 (section 10) is the presentation pass.

Legend: `[x]` done · `[~]` partial · `[ ]` not started

## 1. Foundation
- [x] Vite + strict TypeScript project, Babylon.js 9, npm scripts (`dev`, `build`, `typecheck`, `smoke`, `simtest`)
- [x] Module layout: `core/` `data/` `sim/` `render/` `input/` `ui/` `audio/`
- [x] Simulation is renderer-free (talks to presentation through `sim/hooks.ts`) so it runs headless
- [x] Seeded RNG + value-noise helpers

## 2. World & simulation
- [x] Procedural point-symmetric maps: rock ridges, lakes, forests, guaranteed base-to-base connectivity
- [x] Three battlefield themes (Verdant Basin, Scorched Dunes, Frostline)
- [x] Nav grid with cached flow fields (one Dijkstra per destination, shared by a whole group)
- [x] Waypoint smoothing by line-of-walk checks, formation slots, soft unit separation, stuck recovery
- [x] Fog of war (visible / explored) driving targeting, rendering, minimap and audio
- [x] Spatial hash for range queries

## 3. Economy & base building
- [x] Aurium crystal fields, harvesters (seek → mine → return → unload), refineries
- [x] Power grid: shortage halves production and shuts down Arc Pylons
- [x] Sidebar construction queues (structure / defence) with ready-then-place flow and placement rules
- [x] Unit queues for infantry / vehicles / aircraft, pay-as-you-build, right-click cancel + refund
- [x] Multiple factories speed up a queue; primary building + rally points
- [x] Sell, repair, tech prerequisites
- [x] Research: AP Munitions, Composite Plating, Turbo Harvesting, Nanite Repair
- [x] Capturable outposts: Aurium Extractors (income) and the Signal Obelisk (requisition + vision)

## 4. Combat
- [x] 9 units: Trooper, Grenadier, Lancer, Harvester, Lynx Buggy, Mauler Tank, Longbow Artillery, Titan, Kestrel Gunship
- [x] 3 defences: Sentry Gun, Rampart Cannon, Arc Pylon (chain lightning)
- [x] Damage-type × armour-class table (bullet / shell / rocket / energy / explosive)
- [x] Hitscan, homing shells and rockets, ballistic lobs with splash, chaining arcs
- [x] Orders: move, attack, attack-move, hold, stop, harvest, waypoint queueing; turrets fire on the move
- [x] Veterancy (Veteran / Elite) with stat bonuses and self-repair
- [x] Victory / defeat when a side loses every structure

## 5. Heroes & support powers
- [x] Three heroes with distinct kits (Rook, Nyx, Kade), 3 abilities each, ultimate at level 3
- [x] Hero XP from own and nearby kills, 5 levels, revival at the Command Center
- [x] Requisition tokens (time + combat + obelisk) spent on Supply Cache, Recon Sweep, Armor Drop, Orbital Lance
- [x] Status effects: haste, shield, slow, stun/EMP, kill-zone damage amplification

## 6. Enemy AI
- [x] Build order with power management and padded placement search
- [x] Harvester upkeep, mixed army production scaled by difficulty and match time
- [x] Base defence response, escalating attack waves, outpost capture squads
- [x] Hero control: ability targeting on clusters, retreat when wounded
- [x] Support power usage (cache, drop, lance), structure repair, upgrade research
- [x] Three difficulty levels (Recruit / Commander / Warlord)

## 7. Rendering
- [x] Procedural low-poly models (vertex colours, one draw call per model via thin instances)
- [x] Terrain mesh with biome blending, water, instanced trees / rocks / bushes, glowing crystals
- [x] Soft shadows that follow the camera, ACES tone mapping, bloom, FXAA, vignette
- [x] CPU particle system (explosions, smoke, sparks, dust, trails), tracers, lightning, orbital beam, shockwaves, scorch decals
- [x] Smoothed fog-of-war sheet, placement ghost, selection rings, range and rally indicators
- [x] 2D overlay: health bars, rank chevrons, hero badges, capture dials, floating text, drag box
- [x] 3D-rendered portraits for every build button and selection card

## 8. Interface & audio
- [x] Main menu (hero, difficulty, battlefield), loading screen, pause/settings, field manual, results screen with stats
- [x] Top bar (credits, power, requisition, clock), build sidebar with tabs and tooltips
- [x] Hero panel with ability cooldowns, support-power bar, selection card + command card, control groups
- [x] Minimap with fog, pings, camera frustum, click-to-look and right-click orders
- [x] RTS camera: edge/arrow pan, wheel zoom, rotate, jump-to-alert
- [x] Synthesised sound effects, generative music, optional announcer voice; settings persisted

## 9. Verification
- [x] `npm run typecheck` — zero TypeScript errors
- [x] `npm run simtest` — headless simulation soak (AI vs scripted player)
- [x] `npm run movetest` — group pathfinding across ten generated maps
- [x] `npm run smoke` — quick headless-browser pass (dev server and production bundle), zero console errors
- [x] `npm run verify` — input (52 checks), HUD + queues (97 checks), combat + AI + soak (46 checks), zero console / WebGL / frame errors
- [x] Independent verification pass (GPT-6.1 Terra): dev server + typecheck + build + smoke + all three suites + click-every-button spot check + screenshot review — all green, zero console / WebGL / frame errors

### Bugs found and fixed during verification
- Babylon's default pointer handling suppressed mouse events on the canvas (no clicks reached the game)
- Turning shadows off left the frozen terrain material with a stale shader (terrain vanished)
- Symbol-font glyphs rendered as boxes on systems without those fonts → replaced with inline SVG icons
- Pathfinding ran ~7x slower than necessary (heap Dijkstra → bucket queue, local constants in hot loops)
- Armor Drop refused clicks on a blocked cell instead of snapping to open ground beside it

## 10. Round 2 — presentation pass

### Models and world (Blender)
- [x] Headless Blender pipeline: Python modelling kit, binary model pack, contact-sheet and portrait renderer (`npm run assets`, see `assets/README.md`)
- [x] All 9 units, 3 heroes, 12 structures and the scenery rebuilt as Blender models (53 meshes with faction variants) with baked ambient occlusion
- [x] Palette-slot colouring: one mesh per model, recoloured per faction and per battlefield theme at load
- [x] Crimson Dominion variants with their own silhouette (blades, ram teeth, horned towers, violet arc pylons)
- [x] Separate recoiling barrels, spinning rotors / radars / containment rings, a nodding pump jack, infantry walk cycles
- [x] Weapons fire from the real muzzle of each model (`src/data/muzzles.ts`)
- [x] HUD portraits pre-rendered in Blender instead of at match start (faster loading)
- [x] Faceted low-poly terrain with a scenery skirt beyond the map edge; themed trees, rocks and scrub
- [x] Lighting rebudgeted under the material's diffuse clamp — cast shadows are visible for the first time

### Effects
- [x] Explosions: star flash, light thrown on the ground, shockwave, rolling smoke column, embers, tumbling lit debris
- [x] Muzzle flame tongues, impact flashes, glowing projectile heads
- [x] Burnt-out wrecks that smoulder and sink; aircraft fall out of the sky; structures collapse into rubble
- [x] Rotating bracket selection rings, pulsing rally markers, sparkling Aurium

### Interface
- [x] Bundled typefaces (Chakra Petch, Barlow — SIL OFL), cut-corner panel language, expanded inline SVG icon set, custom SVG cursors
- [x] Main menu: key art backdrop with motion, logo lockup, painted commander cards with a kit profile, battlefield picture cards, difficulty pips, settings and field manual from the menu
- [x] Loading screen with the battlefield's art, the commander, rotating tips and a segmented progress bar
- [x] HUD: ticking credits, power gauge with shortage states, requisition pips, tabbed production with progress sweeps and lock reasons, an always-visible queue panel, hero panel with painted portrait / XP / cooldown sweeps, structured tooltips, notices with repeat counts, attack-direction edge flash
- [x] In-world overlay: segmented health bars that quieten in crowds, veterancy chevrons, hero badges, status chips, capture dials, floating text, bracketed drag box
- [x] Pause and grouped settings, field manual, victory / defeat screens with art backdrops and counting stats, restyled fatal-error box

### Sound
- [x] Sample-level synthesis engine: 63 layered recipes pre-rendered as seeded variations and loudness-normalised (still no audio files)
- [x] Mix bus: effects / UI / ambience / music buses, per-battlefield reverb, compressor and a −1 dBFS safety ceiling, priority voice stealing, distance low-pass
- [x] Adaptive generative music: menu, calm, tension and combat states that change on bar lines, driven by measured combat intensity; victory and defeat cues; per-battlefield scales and instruments
- [x] Ambience beds per battlefield, announcer earcons for every category with optional speech
- [x] Interface, economy and event cues (build start, upgrade, power, capture lost, insufficient funds, objective, collapse…)
- [x] `?soundboard=1` sound test page and `npm run audio:render` (WAV + spectrogram + loudness report per sound, mix stress tests)

### Verification (merged tree, 2026-11-10)
- [x] `npm run typecheck`, `npm run build`
- [x] `npm run smoke` — 31/31 on the dev server and on the production bundle (`PREVIEW=1`), zero runtime problems
- [x] `npm run verify` — input 52/52, HUD 97/97, combat 46/46, zero runtime problems or frame exceptions
- [x] `npm run audio:render` — 78 items, none silent or clipping; mix stress tests (40 mixed, 40 close, 200-trigger flood) stay under the −1 dBFS ceiling
- [x] `npm run simtest`, `npm run movetest`
- [x] Smoke test's "combat loop resolves kills" check made deterministic (it failed about one run in six since round 1)

### Not verifiable by automation — needs a human playtest
- How any of the audio actually sounds (music taste, weapon identity, explosion weight, music/effects balance, announcer voice)
- Frame rate on a real GPU (the suites run software WebGL)
- The custom mouse cursors (screenshots do not capture the pointer)

## Ideas for later
- [ ] Naval / amphibious units and bridges
- [ ] Second faction with asymmetric tech
- [ ] Campaign missions and scripted objectives
- [ ] Save / load, replays, multiplayer
- [ ] Walls, garrisonable buildings, transport aircraft
