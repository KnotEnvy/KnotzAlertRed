# Art pipeline

Every 3D model in the game is built in Blender from Python, headless, and exported to one
binary pack. There are no hand-edited `.blend` files to keep in sync: the scripts in
`assets/blender/` *are* the sources, and rebuilding everything takes about a minute.

```bash
npm run assets                       # rebuild public/models/models.kzm + public/art/icons/*.webp
assets/build.sh --pack public/models/models.kzm      # models only (a few seconds)
assets/build.sh --only tank,titan --sheet /tmp/sheet.png --fit     # preview render of some models
assets/build.sh --only hq@1 --sheet /tmp/hq.png --yaw 0            # the Crimson variant of one model
assets/build.sh --blend /tmp/all.blend                             # open the result in Blender
```

`assets/build.sh` looks for Blender in `$BLENDER`, then `~/.local/opt/blender-5.2.1-linux-x64/blender`,
then on `PATH`. It was written against Blender 5.2 LTS.

## Layout

| Path | What it is |
| --- | --- |
| `blender/kz/kit.py` | The modelling kit: `Part` primitives on bmesh (boxes, frusta, extruded profiles, lathes, pipes, rings, faceted blobs), bevels, mirroring, a nestable transform stack, and the ambient-occlusion bake |
| `blender/kz/export.py` | Writes the `.kzm` pack; also turns a model into Blender objects for previews |
| `blender/kz/render.py` | Contact sheets and the HUD portraits (Eevee) |
| `blender/kz/registry.py` | `@model(...)` decorator and the build loop |
| `blender/models/vehicles.py`, `infantry.py`, `buildings.py`, `props.py` | The models themselves |
| `blender/models/crimson.py` | Blades, ram teeth and horns that dress the Crimson Dominion variants |
| `blender/build.py` | Command-line entry point |

## Conventions

- **Space**: X right, Y forward, Z up, 1 unit = 1 world unit. Vehicles face +Y. Structures are
  centred on their footprint (one nav cell = 2 units) with z = 0 sitting 0.3 above the terrain,
  and their "front" faces **−Y**, because that is the side the game camera sees.
- **Colour is a palette slot, not a colour.** Faces are tagged `team`, `panel`, `metal`, `glow`…
  (`SLOTS` in `kit.py`). The game resolves slots against the faction palette when it loads the
  pack, so one mesh serves Aegis, Crimson and neutral owners; scenery uses the `leaf`/`rock`/`cap`
  slots, which the game overrides per battlefield theme. A literal `(r, g, b)` is also accepted,
  and `glow(r, g, b)` makes it emissive.
- **Emissive slots** (`glow`, `window`, `crystal`, `glass`) are exported with vertex alpha 0; the
  object material's plugin in `src/render/renderer.ts` draws those vertices unlit, which is what
  the bloom picks up.
- **Shading**: ambient occlusion is ray-cast per face corner against the whole model and the
  ground, then multiplied into the vertex colour. Edges sharper than 38° are split.
- **Parts and roles.** A model is a list of parts; the role tells the renderer how to move it:

  | Role | Behaviour |
  | --- | --- |
  | `body` | Drawn at the entity transform |
  | `walk` | Extra body poses; infantry alternate between them while moving |
  | `turret` | Yaws to the aim direction about its `pivot` |
  | `barrel` | As `turret`, plus it slides back by `travel` when the weapon fires |
  | `spin` | Rotates about the vertical through `pivot` (`speed`, optional `bob`, `follow` the hull) |
  | `rock` | See-saws about the X axis (`speed`, `amp`) |
  | `cargo` | Scaled by how full a harvester is |

  Each part is one thin-instance batch per faction in the game, so a unit type still costs a
  handful of draw calls however many are on screen.
- **Faction variants.** `@model('tank', factions=True)` builds the function twice; the second
  pass has `m.faction == 1` and is exported as `tank@1`, which the game prefers for team 1.
- **Muzzle positions** live in `src/data/muzzles.ts` (the simulation needs them and cannot read
  the pack). Update them when a barrel changes length.

## Adding a model

1. Write a function in one of the `models/*.py` files and decorate it with `@model('name', icon='name')`
   (or `@building('name')`, `@prop('name')`).
2. `assets/build.sh --only name --fit --sheet /tmp/name.png` and look at it.
3. `npm run assets`, then reference `name` from the unit or structure definition's `model` field.
