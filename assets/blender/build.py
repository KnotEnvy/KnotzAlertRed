"""
Builds the KnotZ: Alert Red model pack (and optional previews) in headless Blender.

  blender --background --python assets/blender/build.py -- [options]

  --pack PATH        write the binary model pack the game loads (default public/models/models.kzm)
  --sheet PATH       render a contact sheet of the selected models
  --icons DIR        render HUD portraits (one WebP per model that asks for one)
  --only a,b,c       restrict to these model names
  --team N           faction palette for sheets (0 Aegis, 1 Crimson, 2 neutral)
  --blend PATH       save the assembled models as a .blend for inspection
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from kz import registry  # noqa: E402
import models  # noqa: E402,F401  (registers every model)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--pack')
    ap.add_argument('--sheet')
    ap.add_argument('--icons')
    ap.add_argument('--only')
    ap.add_argument('--team', type=int, default=0)
    ap.add_argument('--blend')
    ap.add_argument('--cols', type=int)
    ap.add_argument('--yaw', type=float, default=-145)
    ap.add_argument('--size', default='1800x1100')
    ap.add_argument('--fit', action='store_true', help='scale every model to fill its sheet cell')
    args = ap.parse_args(argv)

    names = args.only.split(',') if args.only else None
    t0 = time.time()
    built = registry.build_all(names)
    print(f'[kz] built {len(built)} models in {time.time() - t0:.1f}s')

    if args.pack:
        from kz.export import write_pack
        os.makedirs(os.path.dirname(os.path.abspath(args.pack)), exist_ok=True)
        v, t, size = write_pack(built, args.pack)
        print(f'[kz] pack {args.pack}: {len(built)} models, {v} vertices, {t} triangles, {size / 1024:.0f} KiB')
    if args.sheet:
        from kz.render import render_sheet
        w, h = (int(x) for x in args.size.split('x'))
        shown = [m for m in built if not m.meta.get('no_sheet')]
        teams = [m.meta.get('team', args.team) for m in shown]
        render_sheet(shown, os.path.abspath(args.sheet), team=teams, fit=args.fit, cols=args.cols, size=(w, h), yaw=args.yaw)
        print(f'[kz] sheet {args.sheet}')
    if args.icons:
        from kz.render import render_icon
        os.makedirs(args.icons, exist_ok=True)
        for m in built:
            icon = m.meta.get('icon')
            if not icon:
                continue
            render_icon(m, os.path.join(os.path.abspath(args.icons), f'{icon}.webp'), team=m.meta.get('team', 0), yaw=m.meta.get('icon_yaw', -140))
        print(f'[kz] icons -> {args.icons}')
    if args.blend:
        import bpy
        from kz.render import reset_scene
        from kz.export import to_objects
        reset_scene()
        x = 0.0
        for m in built:
            to_objects(m, team=m.meta.get('team', 0), at=(x, 0, 0))
            x += 14
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.blend))
        print(f'[kz] blend {args.blend}')


main()
