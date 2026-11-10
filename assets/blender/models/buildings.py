"""
Structures. Origin is the footprint centre; z = 0 sits 0.3 above the terrain (the game draws
buildings slightly raised so the foundation hides uneven ground). The game camera looks from
-Y, so "front" detail (doors, signage) faces -Y. One nav cell is 2 units.
"""
import math

from kz.kit import glow, ngon, rect
from kz.registry import model

from .crimson import blade, crown, horn, spike

WARM = glow(1.0, 0.62, 0.25)


def building(name, **kw):
    kw.setdefault('factions', kw.get('team') is None)
    return model(name, kind='building', icon=name, icon_yaw=32, **kw)


def foundation(b, w, d, chamfer=0.5, pad=True):
    """Concrete slab from below ground up to z = 0.3, with a darker working surface."""
    b.prism(rect(w, d, chamfer), 1.0, axis='z', at=(0, 0, -0.7), mat='concrete', bevel=0.07)
    if pad:
        b.prism(rect(w - 0.8, d - 0.8, chamfer * 0.75), 0.05, axis='z', at=(0, 0, 0.3), mat='concrete_dark')


def windows(b, x0, x1, y, z, n, h=0.3, mat='window', face='-y', gap=0.3, depth=0.08):
    """A row of n lit windows along a wall. face: '-y', '+y', '-x', '+x' (x0/x1 then run along y)."""
    span = x1 - x0
    w = (span - gap * (n - 1)) / n
    for i in range(n):
        c = x0 + w / 2 + i * (w + gap)
        if face in ('-y', '+y'):
            b.box((w, depth, h), at=(c, y, z), mat=mat)
        else:
            b.box((depth, w, h), at=(y, c, z), mat=mat)


def door(b, x, y, z, w, h, frame='team', inner='black', face=-1, lit=True):
    """Recessed doorway on a wall facing -Y (face=-1) or +Y."""
    b.box((w, 0.3, h), at=(x, y, z + h / 2), mat=inner)
    b.box((w + 0.36, 0.36, 0.2), at=(x, y + face * 0.02, z + h + 0.1), mat=frame, bevel=0.03)
    b.box((0.2, 0.36, h), at=(x - w / 2 - 0.1, y + face * 0.02, z + h / 2), mat=frame)
    b.box((0.2, 0.36, h), at=(x + w / 2 + 0.1, y + face * 0.02, z + h / 2), mat=frame)
    if lit:
        b.box((w * 0.7, 0.06, 0.1), at=(x, y + face * 0.17, z + h - 0.12), mat='glow')


def lamp(b, x, y, z=0.3, h=0.8, mat='glow'):
    b.cyl(0.07, h, at=(x, y, z + h / 2), seg=6, mat='gunmetal')
    b.box((0.2, 0.2, 0.16), at=(x, y, z + h + 0.06), mat=mat)


def mast(b, x, y, z, h, r=0.05, tip='glow'):
    b.cyl(r, h, at=(x, y, z + h / 2), seg=5, mat='gunmetal', noao=True)
    b.cyl(r * 2.4, 0.16, at=(x, y, z + 0.08), seg=6, mat='gunmetal')
    if tip:
        b.box((0.14, 0.14, 0.14), at=(x, y, z + h), mat=tip)


def roof_vent(b, x, y, z, w=0.9, d=0.9, h=0.4):
    b.box((w, d, h), at=(x, y, z + h / 2), mat='metal', bevel=0.05)
    for i in range(3):
        b.box((w * 0.8, 0.12, 0.05), at=(x, y - d * 0.28 + i * d * 0.28, z + h + 0.01), mat='black')


def stack(b, x, y, z, h, r=0.42, band='team', cap=True):
    """Tapered chimney with a paint band and a dark throat."""
    b.cyl(r, h, at=(x, y, z + h / 2), seg=10, r2=r * 0.72, mat='metal')
    b.cyl(r * 0.86, 0.3, at=(x, y, z + h * 0.72), seg=10, r2=r * 0.82, mat=band)
    if cap:
        b.ring(r * 0.8, r * 0.5, 0.18, at=(x, y, z + h + 0.05), seg=10, mat='gunmetal')
        b.cyl(r * 0.5, 0.05, at=(x, y, z + h + 0.02), seg=10, mat='black')


def buttress(b, x, y, base=(1.6, 1.6), top=(1.1, 1.1), h=3.0, mat='panel_dark', cap='team', light=True, z=0.3):
    b.tbox(base, top, h, at=(x, y, z), mat=mat, bevel=0.07)
    b.box((top[0] + 0.14, top[1] + 0.14, 0.22), at=(x, y, z + h + 0.08), mat=cap, bevel=0.04)
    if light:
        b.box((top[0] * 0.5, top[1] * 0.5, 0.2), at=(x, y, z + h + 0.28), mat='glow')


# ----------------------------------------------------------------------------- Command Center
@building('hq')
def hq(m):
    """Stepped fortress: sloped lower works, a blue armour belt, a glazed command deck and a radar mast."""
    b = m.part('body')
    foundation(b, 9.7, 9.7, chamfer=1.2)
    # tier 1
    f = b.prism(rect(8.0, 8.0, 1.3), 2.5, axis='z', at=(0, 0, 0.3), mat='panel', taper=0.86, bevel=0.1)
    b.prism(rect(7.2, 7.2, 1.2), 0.36, axis='z', at=(0, 0, 2.8), mat='team', bevel=0.06)
    b.prism(rect(6.7, 6.7, 1.1), 0.12, axis='z', at=(0, 0, 3.16), mat='panel_dark')
    # tier 2
    b.prism(rect(5.2, 5.2, 0.9), 2.0, axis='z', at=(0, 0, 3.28), mat='panel', taper=0.86, bevel=0.09)
    windows(b, -1.7, 1.7, -2.5, 4.2, 4, h=0.42)
    windows(b, -1.7, 1.7, 2.5, 4.2, 4, h=0.42, face='+y')
    windows(b, -1.7, 1.7, -2.5, 4.2, 4, h=0.42, face='-x')
    windows(b, -1.7, 1.7, 2.5, 4.2, 4, h=0.42, face='+x')
    b.prism(rect(4.7, 4.7, 0.8), 0.3, axis='z', at=(0, 0, 5.28), mat='team_dark', bevel=0.05)
    # command deck
    b.prism(rect(3.3, 3.0, 0.5), 1.05, axis='z', at=(0, 0.2, 5.58), mat='panel', taper=0.9, bevel=0.07)
    b.box((2.6, 0.1, 0.5), at=(0, -1.27, 6.16), mat='glass')
    b.box((0.1, 2.0, 0.5), at=(1.6, 0.2, 6.16), mat='glass', mirror=True)
    b.box((3.5, 3.2, 0.2), at=(0, 0.2, 6.72), mat='team', bevel=0.05)
    roof_vent(b, 0.9, 0.9, 6.82, 0.8, 0.8, 0.3)
    mast(b, -1.2, 1.2, 6.82, 2.4)
    mast(b, -0.8, 1.35, 6.82, 1.5, tip=None)
    # corner bastions
    for sx in (-1, 1):
        for sy in (-1, 1):
            buttress(b, sx * 3.95, sy * 3.95, base=(1.7, 1.7), top=(1.15, 1.15), h=3.3)
    # entrance on the camera side: ramp, blast door, flanking pylons
    b.prism([(-4.85, 0.3), (-3.4, 0.3), (-3.4, 0.95)], 3.0, axis='x', at=(0, 0, 0), mat='concrete_dark')
    b.box((3.6, 1.0, 2.5), at=(0, -3.72, 1.55), mat='panel_dark', bevel=0.08)
    door(b, 0, -4.2, 0.6, 2.3, 1.75)
    b.box((2.9, 0.12, 0.34), at=(0, -4.25, 2.62), mat='hazard')
    for x in (-1.0, -0.5, 0.0, 0.5, 1.0):
        b.box((0.2, 0.14, 0.36), at=(x, -4.27, 2.62), mat='black', rot=(0, 25, 0))
    b.prism([(0, 0.55), (0.5, 0), (0, -0.55), (-0.5, 0)], 0.1, axis='y', at=(0, -3.52, 3.5), mat='glow')   # crest
    lamp(b, -1.9, -4.5, 0.3, 1.0)
    lamp(b, 1.9, -4.5, 0.3, 1.0)
    # side annexes
    b.box((1.2, 3.4, 1.5), at=(4.0, 0, 1.05), mat='panel', bevel=0.08, mirror=True)
    b.box((1.3, 3.5, 0.2), at=(4.0, 0, 1.9), mat='team', bevel=0.04, mirror=True)
    windows(b, -1.3, 1.3, 4.62, 1.2, 3, h=0.3, face='+x')
    windows(b, -1.3, 1.3, -4.62, 1.2, 3, h=0.3, face='-x')
    b.pipe([(2.9, 3.2, 0.5), (2.9, 3.2, 2.2), (2.2, 2.6, 3.4)], 0.14, mat='gunmetal', mirror=True)
    if m.faction == 1:
        for sx in (-1, 1):
            for sy in (-1, 1):
                horn(b, sx * 3.95, sy * 3.95, 3.9, h=1.7, lean=10)
        crown(b, 0, 0.2, 6.82, 3.3, 3.0, n=3, h=0.6)
        blade(b, (1.0, -3.7, 2.8), length=1.2, height=1.1, mirror=True, rot=(0, 0, 180))

    # radar pedestal
    b.cyl(0.5, 0.5, at=(0.2, 0.3, 7.05), seg=8, mat='gunmetal')
    b.cyl(0.18, 0.9, at=(0.2, 0.3, 7.6), seg=6, mat='metal')

    r = m.part('radar', role='spin', pivot=(0.2, 0.3, 8.05), speed=0.9)
    with r.at((0.2, 0.3, 8.05)):
        r.cyl(0.3, 0.24, at=(0, 0, 0), seg=8, mat='gunmetal')
        r.prism([(-1.9, 0.0), (-1.5, 0.75), (1.5, 0.75), (1.9, 0.0), (1.5, -0.55), (-1.5, -0.55)], 0.12, axis='y',
                at=(0, -0.42, 0.55), mat='panel', rot=(18, 0, 0), bevel=0.03)
        r.box((3.2, 0.06, 0.12), at=(0, -0.52, 0.55), mat='team', rot=(18, 0, 0))
        r.box((0.1, 0.9, 0.1), at=(0, -0.9, 0.5), mat='gunmetal', rot=(10, 0, 0))
        r.box((0.2, 0.2, 0.2), at=(0, -1.36, 0.6), mat='glow')
        r.box((0.16, 0.7, 0.5), at=(0, 0.1, 0.3), mat='metal')


# ----------------------------------------------------------------------------- Fusion Reactor
@building('power')
def power(m):
    """Containment vessel with a glowing core band, twin cooling stacks and a control hut."""
    b = m.part('body')
    foundation(b, 5.7, 5.7, chamfer=0.7)
    cx, cy = 0.35, -0.2
    b.lathe([(2.0, 0.3), (2.05, 0.6), (2.05, 1.25), (1.8, 1.5)], at=(cx, cy, 0), seg=12, mat='panel')
    b.cyl(1.62, 0.95, at=(cx, cy, 1.95), seg=12, mat='crystal')                              # plasma window
    for i in range(6):
        a = (i + 0.5) / 6 * math.tau
        b.box((0.34, 0.3, 1.1), at=(cx + math.cos(a) * 1.68, cy + math.sin(a) * 1.68, 1.95), mat='panel_dark',
              rot=(0, 0, math.degrees(a)), bevel=0.04)
    b.lathe([(1.82, 2.4), (2.0, 2.55), (2.0, 2.9), (1.55, 3.45), (0.75, 3.8), (0.0, 3.86)], at=(cx, cy, 0), seg=12, mat='team')
    b.cyl(2.04, 0.14, at=(cx, cy, 2.72), seg=12, mat='panel')
    b.cyl(0.5, 0.36, at=(cx, cy, 3.95), seg=8, mat='gunmetal')
    b.cyl(0.3, 0.2, at=(cx, cy, 4.2), seg=8, mat='crystal')
    # cooling stacks behind the vessel
    for x in (-1.75, 1.6):
        b.lathe([(0.8, 0.3), (0.62, 1.7), (0.56, 3.0), (0.66, 4.1), (0.5, 4.1), (0.44, 3.0)], at=(x, 2.0, 0), seg=10, mat='panel_dark')
        b.cyl(0.47, 0.05, at=(x, 2.0, 3.3), seg=10, mat='black')
        b.ring(0.7, 0.55, 0.22, at=(x, 2.0, 3.55), seg=10, mat='team')
    b.pipe([(-1.75, 1.3, 0.75), (-1.2, 0.9, 0.75), (-0.9, 0.5, 0.9)], 0.17, mat='gunmetal')
    b.pipe([(1.6, 1.3, 0.75), (1.6, 0.8, 0.75)], 0.17, mat='gunmetal')
    # control hut, camera side
    b.box((1.5, 1.2, 1.3), at=(-1.95, -1.95, 0.95), mat='panel', bevel=0.07)
    b.box((1.6, 1.3, 0.16), at=(-1.95, -1.95, 1.68), mat='team', bevel=0.03)
    b.box((0.9, 0.08, 0.3), at=(-1.95, -2.56, 1.15), mat='window')
    b.box((0.4, 0.08, 0.7), at=(-1.4, -2.57, 0.65), mat='black')
    b.box((0.7, 0.5, 0.5), at=(2.2, -2.2, 0.55), mat='hazard', bevel=0.04)                    # breaker box
    b.box((0.3, 0.06, 0.2), at=(2.2, -2.46, 0.6), mat='glow')
    lamp(b, 2.5, -1.2, 0.3, 0.9)
    mast(b, -2.4, -1.5, 1.76, 1.6)
    if m.faction == 1:
        for i in range(6):
            a = (i + 0.5) / 6 * math.tau
            spike(b, (cx + math.cos(a) * 1.75, cy + math.sin(a) * 1.75, 2.95), r=0.16, h=0.9, rot=(-math.sin(a) * 30, math.cos(a) * 30, 0), mat='team_dark')
        for x in (-1.75, 1.6):
            for k in range(3):
                a = k * 2.1
                spike(b, (x + math.cos(a) * 0.6, 2.0 + math.sin(a) * 0.6, 4.05), r=0.1, h=0.5, mat='team')

    # a slow ring of containment nodes circling the core
    r = m.part('ring', role='spin', pivot=(cx, cy, 2.0), speed=0.7)
    r.ring(2.22, 2.08, 0.12, at=(cx, cy, 2.0), seg=12, mat='gunmetal')
    for i in range(4):
        a = i / 4 * math.tau
        r.box((0.34, 0.34, 0.5), at=(cx + math.cos(a) * 2.2, cy + math.sin(a) * 2.2, 2.0), mat='panel', rot=(0, 0, math.degrees(a)), bevel=0.05)
        r.box((0.12, 0.38, 0.3), at=(cx + math.cos(a) * 2.34, cy + math.sin(a) * 2.34, 2.0), mat='glow', rot=(0, 0, math.degrees(a)))


# ----------------------------------------------------------------------------- Aurium Refinery
@building('refinery')
def refinery(m):
    """Processing hall with an unloading bay, two storage silos showing their fill, and a flare stack."""
    b = m.part('body')
    foundation(b, 9.7, 7.7, chamfer=0.7)
    hx = -1.9
    # hall: gabled section running left-right
    f = b.prism([(-2.7, 0.3), (2.7, 0.3), (2.7, 2.5), (1.5, 3.5), (-1.5, 3.5), (-2.7, 2.5)], 5.2, axis='x', at=(hx, 0.3, 0), mat='panel', bevel=0.08)
    b.paint(f, 'team', where=lambda n, c: n.z > 0.3 and abs(n.y) > 0.3)
    b.box((5.3, 3.1, 0.14), at=(hx, 0.3, 3.56), mat='panel_dark', bevel=0.03)
    roof_vent(b, hx - 1.5, 0.3, 3.62, 1.0, 1.4, 0.36)
    roof_vent(b, hx + 1.3, 0.3, 3.62, 1.0, 1.4, 0.36)
    # unloading bay on the camera side, with a canopy and a conveyor of ore
    door(b, hx, -2.42, 0.3, 2.7, 1.9, frame='hazard')
    b.box((3.6, 1.6, 0.16), at=(hx, -3.0, 2.56), mat='team', bevel=0.04, rot=(-8, 0, 0))
    b.cyl(0.08, 2.1, at=(hx - 1.65, -3.6, 1.35), seg=6, mat='gunmetal')
    b.cyl(0.08, 2.1, at=(hx + 1.65, -3.6, 1.35), seg=6, mat='gunmetal')
    b.box((1.5, 1.7, 0.2), at=(hx, -3.0, 0.45), mat='gunmetal', bevel=0.03)
    for i in range(4):
        b.ico(0.2, at=(hx - 0.45 + (i % 2) * 0.9 * 0.6 + i * 0.1, -3.6 + i * 0.42, 0.68), mat='crystal', scale=(1, 1, 1.3), seed=i, jitter=0.2)
    windows(b, hx - 2.3, hx - 1.75, -2.42, 1.5, 1, h=0.4)
    windows(b, hx + 1.75, hx + 2.3, -2.42, 1.5, 1, h=0.4)
    windows(b, -1.6, 2.2, hx - 2.62, 1.7, 4, h=0.35, face='-x')
    # silos
    for y in (-1.75, 1.85):
        sx = 2.95
        b.lathe([(1.45, 0.3), (1.45, 3.3), (1.2, 4.0), (0.5, 4.4), (0.0, 4.42)], at=(sx, y, 0), seg=12, mat='panel')
        b.ring(1.5, 1.4, 0.4, at=(sx, y, 2.9), seg=12, mat='team')
        b.ring(1.5, 1.4, 0.2, at=(sx, y, 0.75), seg=12, mat='panel_dark')
        b.box((0.3, 0.1, 1.7), at=(sx, y - 1.45, 1.85), mat='crystal')                      # level gauge
        b.box((0.46, 0.14, 1.9), at=(sx, y - 1.42, 1.85), mat='gunmetal')
        b.cyl(0.34, 0.3, at=(sx, y, 4.5), seg=8, mat='gunmetal')
        b.cyl(0.2, 0.12, at=(sx, y, 4.7), seg=8, mat='crystal')
    b.pipe([(2.95, -1.75, 4.55), (2.95, 0.05, 4.9), (2.95, 1.85, 4.55)], 0.13, mat='gunmetal')
    b.pipe([(0.72, 0.6, 2.9), (1.4, 0.6, 2.9), (1.9, 1.2, 2.9)], 0.2, mat='gunmetal')
    b.pipe([(0.72, -0.6, 1.2), (1.6, -0.8, 1.2)], 0.2, mat='gunmetal')
    # flare stack behind the hall
    stack(b, -3.9, 2.9, 0.3, 5.6, r=0.5, band='hazard')
    b.cyl(0.26, 0.3, at=(-3.9, 2.9, 6.1), seg=8, mat=WARM)
    b.box((1.3, 0.9, 1.0), at=(-0.2, 3.0, 0.8), mat='panel_dark', bevel=0.06)
    lamp(b, 0.9, -3.4, 0.3, 0.9)
    lamp(b, -4.4, -3.4, 0.3, 0.9)
    if m.faction == 1:
        for x in (-3.9, -2.6, -1.3, 0.0):
            spike(b, (x, 0.3, 3.62), r=0.16, h=0.6, mat='team_dark')
        for y in (-1.75, 1.85):
            for k in range(4):
                a = k * math.pi / 2 + 0.6
                spike(b, (2.95 + math.cos(a) * 1.15, y + math.sin(a) * 1.15, 4.0), r=0.12, h=0.6, rot=(-math.sin(a) * 25, math.cos(a) * 25, 0), mat='team')


# ----------------------------------------------------------------------------- Barracks
@building('barracks')
def barracks(m):
    """Low armoured bunker: hipped roof, slit windows, sandbagged entrance and a unit banner."""
    b = m.part('body')
    foundation(b, 7.7, 5.7, chamfer=0.6)
    b.prism(rect(6.5, 4.3, 0.5), 1.9, axis='z', at=(0, 0.2, 0.3), mat='panel', taper=0.94, bevel=0.08)
    b.prism(rect(6.7, 4.5, 0.5), 0.26, axis='z', at=(0, 0.2, 2.2), mat='panel_dark', bevel=0.04)
    f = b.tbox((6.5, 4.3), (4.6, 2.2), 0.95, at=(0, 0.2, 2.46), mat='team', bevel=0.06)
    b.paint(f, 'panel', where=lambda n, c: n.z > 0.95)
    roof_vent(b, 1.3, 0.2, 3.41, 0.9, 0.9, 0.3)
    b.cyl(0.4, 0.2, at=(-1.2, 0.2, 3.5), seg=8, mat='gunmetal')                            # roof hatch
    mast(b, -2.0, 0.6, 3.41, 1.7)
    # corner buttresses
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.tbox((0.9, 0.9), (0.6, 0.6), 2.0, at=(sx * 3.15, 0.2 + sy * 2.05, 0.3), mat='panel_dark', bevel=0.05)
    # entrance with awning, slit windows
    door(b, -1.5, -1.98, 0.3, 1.3, 1.45)
    b.box((2.0, 0.9, 0.12), at=(-1.5, -2.4, 2.0), mat='team', bevel=0.03, rot=(-10, 0, 0))
    windows(b, 0.1, 2.5, -1.99, 1.35, 3, h=0.26)
    windows(b, -1.0, 1.4, -3.26, 1.35, 2, h=0.26, face='-x')
    windows(b, -1.0, 1.4, 3.26, 1.35, 2, h=0.26, face='+x')
    # sandbags and crates in the yard
    bag = (0.52, 0.45, 0.32)
    for i in range(5):
        b.box((0.6, 0.36, 0.26), at=(0.5 + i * 0.58, -2.55, 0.43), mat=bag, bevel=0.07)
    for i in range(4):
        b.box((0.6, 0.36, 0.26), at=(0.8 + i * 0.58, -2.55, 0.69), mat=(0.47, 0.41, 0.29), bevel=0.07)
    b.box((0.7, 0.7, 0.6), at=(3.1, -2.3, 0.6), mat=(0.3, 0.36, 0.26), bevel=0.04)
    b.box((0.5, 0.5, 0.4), at=(3.05, -2.25, 1.1), mat='team_dark', bevel=0.03)
    # banner pole
    b.cyl(0.06, 3.6, at=(-3.3, -2.3, 2.1), seg=6, mat='gunmetal', noao=True)
    b.prism([(0.0, 0.0), (0.0, 0.8), (1.25, 0.66), (0.95, 0.4), (1.25, 0.14)], 0.05, axis='y', at=(-3.3, -2.3, 3.0), mat='glow', noao=True)
    lamp(b, -2.6, -2.55, 0.3, 0.8)
    if m.faction == 1:
        for sx in (-1, 1):
            for sy in (-1, 1):
                spike(b, (sx * 3.15, 0.2 + sy * 2.05, 2.3), r=0.2, h=0.9, mat='team')
        crown(b, 0, 0.2, 3.41, 4.4, 2.0, n=3, h=0.5)


# ----------------------------------------------------------------------------- War Factory
@building('factory')
def factory(m):
    """Vehicle hall with a tall roll-up door, a chevroned apron, twin exhaust stacks and a control tower."""
    b = m.part('body')
    foundation(b, 9.7, 7.7, chamfer=0.7)
    hx = -0.9
    f = b.prism([(-3.6, 0.3), (3.6, 0.3), (3.6, 2.7), (2.5, 3.9), (-2.5, 3.9), (-3.6, 2.7)], 6.3, axis='y', at=(hx, 0.2, 0), mat='panel', bevel=0.09)
    b.paint(f, 'team', where=lambda n, c: n.z > 0.3 and abs(n.x) > 0.3)
    b.box((5.1, 6.4, 0.14), at=(hx, 0.2, 3.96), mat='panel_dark', bevel=0.03)
    b.box((0.7, 5.2, 0.2), at=(hx, 0.2, 4.08), mat=(0.07, 0.2, 0.3))                           # skylight
    b.box((0.16, 5.0, 0.06), at=(hx, 0.2, 4.2), mat='glow')
    for y in (-1.8, 0.2, 2.2):
        b.box((5.3, 0.3, 0.16), at=(hx, y, 4.0), mat='metal')
    # roll-up door, camera side
    b.box((5.0, 0.4, 2.9), at=(hx, -2.9, 1.75), mat='black')
    for i in range(6):
        b.box((4.8, 0.08, 0.08), at=(hx, -3.12, 0.75 + i * 0.42), mat='gunmetal')
    b.box((5.6, 0.5, 0.42), at=(hx, -2.98, 3.4), mat='hazard', bevel=0.04)
    for i in range(7):
        b.box((0.26, 0.52, 0.44), at=(hx - 2.2 + i * 0.73, -2.99, 3.4), mat='black', rot=(0, 28, 0))
    b.box((0.4, 0.6, 3.1), at=(hx - 2.75, -2.95, 1.85), mat='team', bevel=0.05)
    b.box((0.4, 0.6, 3.1), at=(hx + 2.75, -2.95, 1.85), mat='team', bevel=0.05)
    b.box((4.6, 0.06, 0.14), at=(hx, -3.12, 3.05), mat=WARM)
    # apron chevrons
    for i in range(4):
        b.box((0.9, 0.16, 0.03), at=(hx - 1.5 + i * 1.0, -3.55, 0.36), mat='hazard', rot=(0, 0, 35))
    windows(b, -2.0, 2.4, hx - 3.62, 1.9, 4, h=0.36, face='-x')
    # control tower on the right
    tx, ty = 3.85, 1.9
    b.box((1.6, 1.9, 4.6), at=(tx, ty, 2.6), mat='panel', bevel=0.08)
    b.box((1.7, 2.0, 0.3), at=(tx, ty, 2.4), mat='team', bevel=0.03)
    b.box((1.9, 2.2, 0.9), at=(tx, ty, 5.3), mat='panel_dark', bevel=0.08)
    b.box((1.5, 0.08, 0.5), at=(tx, ty - 1.12, 5.35), mat='glass')
    b.box((0.08, 1.7, 0.5), at=(tx - 0.97, ty, 5.35), mat='glass')
    b.box((0.08, 1.7, 0.5), at=(tx + 0.97, ty, 5.35), mat='glass')
    b.box((2.1, 2.4, 0.2), at=(tx, ty, 5.84), mat='team', bevel=0.05)
    mast(b, tx + 0.5, ty + 0.6, 5.94, 1.5)
    # exhaust stacks, camera side right
    stack(b, 3.9, -1.0, 0.3, 4.6, r=0.46)
    stack(b, 3.9, -2.4, 0.3, 4.0, r=0.46)
    b.box((1.5, 2.6, 0.9), at=(3.9, -1.7, 0.75), mat='metal', bevel=0.06)
    b.pipe([(3.1, -1.7, 1.0), (2.75, -1.7, 1.6)], 0.16, mat='gunmetal')
    lamp(b, -4.4, -3.4, 0.3, 1.0)
    lamp(b, 2.9, -3.4, 0.3, 1.0)
    if m.faction == 1:
        for y in (-2.6, -0.9, 0.8, 2.5):
            spike(b, (hx - 2.55, y, 3.9), r=0.18, h=0.8, rot=(0, -20, 0), mat='team_dark')
            spike(b, (hx + 2.55, y, 3.9), r=0.18, h=0.8, rot=(0, 20, 0), mat='team_dark')
        crown(b, tx, ty, 5.94, 2.0, 2.3, n=2, h=0.6, mat='team')
        horn(b, hx - 2.75, -2.95, 3.4, h=1.3, lean=8)
        horn(b, hx + 2.75, -2.95, 3.4, h=1.3, lean=8)


# ----------------------------------------------------------------------------- Tech Lab
@building('techlab')
def techlab(m):
    """Hexagonal research block under a ribbed observatory dome, with a tracking dish."""
    b = m.part('body')
    foundation(b, 5.7, 5.7, chamfer=1.1)
    b.prism(ngon(6, 2.6, phase=0), 2.0, axis='z', at=(0, 0, 0.3), mat='panel', taper=0.9, bevel=0.08)
    b.prism(ngon(6, 2.5, phase=0), 0.34, axis='z', at=(0, 0, 2.3), mat='team', bevel=0.05)
    b.prism(ngon(6, 2.15, phase=0), 0.4, axis='z', at=(0, 0, 2.64), mat='panel_dark', bevel=0.05)
    for i in range(6):
        a = math.radians(i * 60 + 30)
        if i == 4:
            continue                                                                         # door face (-y)
        b.box((1.3, 0.1, 0.4), at=(math.cos(a) * 2.14, math.sin(a) * 2.14, 1.45), mat='window', rot=(0, 0, math.degrees(a) + 90))
    door(b, 0, -2.2, 0.3, 1.1, 1.4)
    # dome: dark glass under structural ribs, glowing collar
    b.dome(1.75, at=(0, 0, 3.0), mat=(0.07, 0.2, 0.3), seg=12, rings=4, squash=0.82)
    b.ring(1.85, 1.6, 0.16, at=(0, 0, 3.08), seg=12, mat='glow')
    for i in range(6):
        a = i * 60
        with b.at((0, 0, 3.0), rot=(0, 0, a)):
            b.pipe([(1.78, 0, 0.0), (1.55, 0, 0.72), (1.0, 0, 1.22), (0.3, 0, 1.46)], 0.07, mat='panel', seg=4)
    b.cyl(0.36, 0.3, at=(0, 0, 4.5), seg=8, mat='gunmetal')
    mast(b, 0, 0, 4.6, 2.2)
    b.ring(0.3, 0.2, 0.08, at=(0, 0, 5.6), seg=8, mat='team', noao=True)
    b.ring(0.22, 0.14, 0.08, at=(0, 0, 6.1), seg=8, mat='team', noao=True)
    # equipment
    b.box((0.9, 0.7, 0.9), at=(2.2, -1.9, 0.75), mat='metal', bevel=0.05)
    b.box((0.5, 0.06, 0.3), at=(2.2, -2.26, 0.85), mat='glow')
    b.cyl(0.4, 1.4, at=(-2.25, 1.6, 1.0), seg=8, mat='panel_dark')
    b.cyl(0.42, 0.2, at=(-2.25, 1.6, 1.3), seg=8, mat='hazard')
    b.cyl(0.14, 1.0, at=(2.0, 1.2, 3.2), seg=6, mat='gunmetal')
    if m.faction == 1:
        for i in range(6):
            a = math.radians(i * 60)
            spike(b, (math.cos(a) * 2.25, math.sin(a) * 2.25, 2.64), r=0.18, h=1.0, rot=(-math.sin(a) * 18, math.cos(a) * 18, 0), mat='team')

    d = m.part('dish', role='spin', pivot=(2.0, 1.2, 3.75), speed=0.6)
    with d.at((2.0, 1.2, 3.75)):
        d.cyl(0.2, 0.2, at=(0, 0, 0), seg=6, mat='gunmetal')
        d.lathe([(0.0, 0.0), (0.5, 0.1), (0.9, 0.36), (0.86, 0.4), (0.46, 0.16), (0.0, 0.08)], at=(0, -0.2, 0.5), rot=(-60, 0, 0), seg=10, mat='panel')
        d.cyl(0.03, 0.6, at=(0, -0.55, 0.72), axis='y', rot=(30, 0, 0), seg=4, mat='gunmetal')
        d.box((0.12, 0.12, 0.12), at=(0, -0.82, 0.88), mat='glow')


# ----------------------------------------------------------------------------- Sky Dock
@building('airpad')
def airpad(m):
    """Octagonal landing deck with approach lights, a glazed control tower and fuel bowsers."""
    b = m.part('body')
    foundation(b, 7.7, 7.7, chamfer=1.9, pad=False)
    b.prism(ngon(8, 3.75, phase=0.5), 0.34, axis='z', at=(0, 0, 0.3), mat='gunmetal', bevel=0.06)
    b.cyl(3.05, 0.05, at=(0, 0, 0.66), seg=16, mat='black')
    b.ring(2.75, 2.5, 0.05, at=(0, 0, 0.69), seg=16, mat='panel', noao=True)
    # landing mark: a chevron cross in faction paint
    b.box((2.6, 0.5, 0.05), at=(0, 0, 0.7), mat='team', noao=True)
    b.box((0.5, 2.6, 0.05), at=(0, 0, 0.7), mat='team', noao=True)
    b.box((0.9, 0.9, 0.06), at=(0, 0, 0.71), mat='panel', rot=(0, 0, 45), noao=True)
    for i in range(8):
        a = (i + 0.5) / 8 * math.tau
        b.box((0.24, 0.24, 0.14), at=(math.cos(a) * 3.3, math.sin(a) * 3.3, 0.72), mat='glow')
    for i in range(8):
        a = i / 8 * math.tau
        b.box((0.5, 0.16, 0.04), at=(math.cos(a) * 3.3, math.sin(a) * 3.3, 0.68), mat='hazard', rot=(0, 0, math.degrees(a) + 90), noao=True)
    # control tower, back-left
    tx, ty = -3.0, 3.0
    b.box((1.4, 1.4, 3.0), at=(tx, ty, 1.8), mat='panel', bevel=0.08)
    b.box((1.5, 1.5, 0.3), at=(tx, ty, 1.5), mat='team', bevel=0.03)
    b.prism(rect(1.9, 1.9, 0.3), 0.8, axis='z', at=(tx, ty, 3.3), mat='panel_dark', bevel=0.06)
    b.box((1.5, 0.08, 0.44), at=(tx, ty - 0.96, 3.74), mat='glass')
    b.box((0.08, 1.5, 0.44), at=(tx + 0.96, ty, 3.74), mat='glass')
    b.box((0.08, 1.5, 0.44), at=(tx - 0.96, ty, 3.74), mat='glass')
    b.prism(rect(2.1, 2.1, 0.35), 0.18, axis='z', at=(tx, ty, 4.1), mat='team', bevel=0.04)
    b.cyl(0.12, 0.5, at=(tx, ty, 4.5), seg=6, mat='gunmetal')
    # fuel bowsers, back-right
    for i, y in enumerate((2.6, 3.3)):
        b.cyl(0.36, 1.5, at=(2.9, y, 0.72), axis='x', seg=8, mat='panel')
        b.cyl(0.38, 0.3, at=(2.9, y, 0.72), axis='x', seg=8, mat='hazard')
    b.pipe([(2.2, 2.95, 0.5), (1.6, 2.4, 0.5), (1.5, 1.9, 0.72)], 0.07, mat='black')
    # blast deflector
    b.box((0.16, 2.6, 0.9), at=(3.55, -1.2, 0.95), mat='panel_dark', rot=(0, -18, 0), bevel=0.03)
    lamp(b, -3.3, -3.3, 0.3, 0.8)
    lamp(b, 3.3, -3.3, 0.3, 0.8)
    if m.faction == 1:
        crown(b, tx, ty, 4.28, 2.0, 2.0, n=2, h=0.55, mat='team')
        for i in range(8):
            a = i / 8 * math.tau
            spike(b, (math.cos(a) * 3.62, math.sin(a) * 3.62, 0.62), r=0.14, h=0.5, rot=(-math.sin(a) * 30, math.cos(a) * 30, 0), mat='team_dark')

    r = m.part('radar', role='spin', pivot=(tx, ty, 4.75), speed=1.6)
    with r.at((tx, ty, 4.75)):
        r.box((1.7, 0.1, 0.5), at=(0, 0, 0.3), mat='panel', bevel=0.02, rot=(-12, 0, 0))
        r.box((1.8, 0.06, 0.1), at=(0, -0.06, 0.58), mat='team')
        r.cyl(0.1, 0.16, at=(0, 0, 0.0), seg=6, mat='gunmetal')


# ----------------------------------------------------------------------------- defences
def _turret_base(b, r=1.75, h=0.5, n=8):
    foundation(b, 3.7, 3.7, chamfer=0.9, pad=False)
    b.prism(ngon(n, r, phase=0.5), h, axis='z', at=(0, 0, 0.3), mat='panel_dark', taper=0.86, bevel=0.06)
    b.prism(ngon(n, r * 0.8, phase=0.5), 0.14, axis='z', at=(0, 0, 0.3 + h), mat='team', bevel=0.04)
    for i in range(4):
        a = math.radians(45 + i * 90)
        b.box((0.3, 0.3, 0.1), at=(math.cos(a) * 1.55, math.sin(a) * 1.55, 0.36), mat='hazard')


@building('sentry')
def sentry(m):
    """Sentry Gun: armoured pedestal with a fast twin-barrel autocannon and an ammo drum."""
    b = m.part('body')
    _turret_base(b, r=1.6, h=0.5)
    b.cyl(0.62, 1.25, at=(0, 0, 1.55), seg=8, r2=0.46, mat='metal')
    b.cyl(0.66, 0.2, at=(0, 0, 1.05), seg=8, mat='gunmetal')
    b.box((0.5, 0.4, 0.6), at=(1.15, 1.0, 0.7), mat='panel', bevel=0.05)                     # ammo locker
    b.box((0.3, 0.05, 0.14), at=(1.15, 0.78, 0.8), mat='glow')

    if m.faction == 1:
        for i in range(4):
            a = math.radians(45 + i * 90)
            spike(b, (math.cos(a) * 1.3, math.sin(a) * 1.3, 0.8), r=0.16, h=0.8, rot=(-math.sin(a) * 30, math.cos(a) * 30, 0), mat='team')

    piv = (0, 0, 2.2)
    t = m.part('turret', role='turret', pivot=piv, travel=0.06)
    with t.at(piv):
        t.cyl(0.6, 0.16, at=(0, 0, 0.0), seg=8, mat='gunmetal')
        f = t.prism([(-0.78, -0.3), (0.5, -0.3), (0.86, 0.1), (0.5, 0.62), (-0.78, 0.62)], 0.96, axis='x', at=(0, 0, 0.1), mat='team', bevel=0.05)
        t.paint(f, 'panel', where=lambda n, c: n.z > 0.9)
        t.box((0.26, 0.9, 0.56), at=(0.62, -0.05, 0.4), mat='panel', bevel=0.05, mirror=True)   # cheek plates
        t.cyl(0.3, 0.3, at=(0.82, -0.2, 0.36), axis='x', seg=8, mat='hazard', mirror=True)     # drums
        t.box((0.5, 0.06, 0.16), at=(0, 0.87, 0.52), mat='glow')                               # sensor bar
        t.box((0.2, 0.3, 0.2), at=(0, -0.5, 0.82), mat='gunmetal')
        t.cyl(0.02, 0.8, at=(0.3, -0.6, 1.1), seg=4, mat='black', noao=True)
        if m.faction == 1:
            blade(t, (0.45, -0.3, 0.72), length=0.8, height=0.5, mirror=True)

    g = m.part('barrel', role='barrel', pivot=piv, travel=0.3)
    with g.at(piv):
        for s in (-1, 1):
            g.cyl(0.13, 0.5, at=(s * 0.26, 1.0, 0.3), axis='y', seg=8, mat='panel_dark')
            g.cyl(0.075, 1.3, at=(s * 0.26, 1.8, 0.3), axis='y', seg=6, mat='gunmetal')
            g.cyl(0.11, 0.24, at=(s * 0.26, 2.42, 0.3), axis='y', seg=6, mat='black')


@building('cannon')
def cannon(m):
    """Rampart Cannon: a squat bunker carrying a heavy single-barrel anti-armour gun."""
    b = m.part('body')
    foundation(b, 3.7, 3.7, chamfer=0.7, pad=False)
    b.prism(rect(3.3, 3.3, 0.7), 1.3, axis='z', at=(0, 0, 0.3), mat='panel', taper=0.8, bevel=0.08)
    b.prism(rect(2.5, 2.5, 0.55), 0.22, axis='z', at=(0, 0, 1.6), mat='team', bevel=0.05)
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.tbox((0.7, 0.7), (0.4, 0.4), 1.1, at=(sx * 1.45, sy * 1.45, 0.3), mat='panel_dark', bevel=0.04)
    b.box((0.8, 0.1, 0.24), at=(0, -1.52, 1.05), mat='window')
    b.cyl(1.0, 0.2, at=(0, 0, 1.9), seg=10, mat='gunmetal')

    piv = (0, 0, 2.0)
    t = m.part('turret', role='turret', pivot=piv, travel=0.08)
    with t.at(piv):
        f = t.prism([(-0.95, -1.1), (0.95, -1.1), (1.2, -0.2), (0.8, 1.1), (-0.8, 1.1), (-1.2, -0.2)], 0.86, axis='z', at=(0, 0, 0), mat='team',
                    taper=0.8, bevel=0.07)
        t.paint(f, 'panel', where=lambda n, c: n.z > 0.9)
        t.box((1.4, 0.7, 0.6), at=(0, -1.3, 0.42), mat='panel', bevel=0.07)
        t.box((0.9, 0.5, 0.74), at=(0, 1.1, 0.42), mat='gunmetal', bevel=0.07)
        t.box((0.44, 0.44, 0.3), at=(0.5, -0.2, 0.98), mat='gunmetal', bevel=0.04)
        t.box((0.3, 0.05, 0.16), at=(0.5, 0.03, 1.0), mat='glow')
        t.cyl(0.3, 0.14, at=(-0.4, -0.3, 0.92), seg=8, mat='panel_dark')
        t.cyl(0.02, 1.2, at=(-0.7, -1.2, 1.3), seg=4, mat='black', noao=True)
        if m.faction == 1:
            blade(t, (0.75, -1.1, 0.86), length=1.2, height=0.75, mirror=True, rot=(0, 0, -8))
    if m.faction == 1:
        for sx in (-1, 1):
            for sy in (-1, 1):
                spike(b, (sx * 1.45, sy * 1.45, 1.4), r=0.16, h=0.7, mat='team')

    g = m.part('barrel', role='barrel', pivot=piv, travel=0.6)
    with g.at(piv):
        g.cyl(0.32, 0.9, at=(0, 1.7, 0.44), axis='y', seg=8, mat='panel_dark')
        g.cyl(0.2, 2.2, at=(0, 3.0, 0.44), axis='y', seg=8, mat='gunmetal')
        g.box((0.56, 0.6, 0.46), at=(0, 4.2, 0.44), mat='black', bevel=0.05)
        g.cyl(0.16, 0.04, at=(0, 4.52, 0.44), axis='y', seg=8, mat='glow')


@building('arc')
def arc(m):
    """Arc Pylon: a coil tower. Charge climbs three collector rings to a caged discharge orb."""
    # the Dominion's pylons discharge violet, as on the fortress in the key art
    energy = glow(0.85, 0.38, 1.3) if m.faction == 1 else 'glow'
    b = m.part('body')
    _turret_base(b, r=1.65, h=0.6)
    b.cyl(0.95, 0.8, at=(0, 0, 1.3), seg=8, r2=0.7, mat='panel')
    b.cyl(0.6, 4.2, at=(0, 0, 3.6), seg=8, r2=0.3, mat='metal')
    for i in range(3):
        z = 2.2 + i * 1.15
        r = 1.0 - i * 0.2
        b.ring(r, r - 0.2, 0.26, at=(0, 0, z), seg=12, mat='team')
        b.ring(r - 0.06, r - 0.26, 0.12, at=(0, 0, z + 0.2), seg=12, mat=energy)
        for k in range(3):
            a = math.radians(k * 120 + i * 40)
            b.box((r - 0.4, 0.1, 0.1), at=(math.cos(a) * (r - 0.1) / 2 * 1.2, math.sin(a) * (r - 0.1) / 2 * 1.2, z), mat='gunmetal', rot=(0, 0, math.degrees(a)))
    # discharge head: an orb held by four prongs
    b.ico(0.6, at=(0, 0, 6.35), mat=energy, subdiv=2, smooth=True)
    for k in range(4):
        a = math.radians(k * 90 + 45)
        b.pipe([(math.cos(a) * 0.3, math.sin(a) * 0.3, 5.5), (math.cos(a) * 0.95, math.sin(a) * 0.95, 6.0), (math.cos(a) * 0.9, math.sin(a) * 0.9, 6.7),
                (math.cos(a) * 0.45, math.sin(a) * 0.45, 7.15)], 0.08, mat='panel_dark', seg=4)
    b.box((0.6, 0.5, 0.7), at=(1.1, -1.05, 0.9), mat='panel', bevel=0.05)                     # capacitor bank
    b.box((0.36, 0.05, 0.2), at=(1.1, -1.31, 1.0), mat=energy)
    b.pipe([(0.85, -0.8, 1.0), (0.55, -0.5, 1.5)], 0.09, mat='black')

    if m.faction == 1:
        for i in range(4):
            a = math.radians(i * 90)
            spike(b, (math.cos(a) * 1.25, math.sin(a) * 1.25, 0.9), r=0.18, h=1.0, rot=(-math.sin(a) * 28, math.cos(a) * 28, 0), mat='team')

    r = m.part('halo', role='spin', pivot=(0, 0, 6.35), speed=2.4)
    r.ring(1.25, 1.14, 0.08, at=(0, 0, 6.35), seg=12, mat='gunmetal', noao=True)
    for k in range(3):
        a = math.radians(k * 120)
        r.box((0.18, 0.18, 0.34), at=(math.cos(a) * 1.2, math.sin(a) * 1.2, 6.35), mat=energy)


# ----------------------------------------------------------------------------- neutral outposts
@building('extractor', team=2)
def extractor(m):
    """Aurium Extractor: a weathered pre-war pumping station. Derrick, nodding pump and a holding tank."""
    rust = (0.42, 0.27, 0.18)
    steel = (0.36, 0.37, 0.39)
    b = m.part('body')
    b.prism(rect(5.7, 5.7, 0.6), 1.0, axis='z', at=(0, 0, -0.7), mat=(0.36, 0.34, 0.31), bevel=0.07)
    b.prism(rect(4.9, 4.9, 0.5), 0.05, axis='z', at=(0, 0, 0.3), mat=(0.26, 0.25, 0.24))
    # holding tank, back-left
    b.lathe([(1.35, 0.3), (1.35, 2.3), (1.1, 2.75), (0.4, 2.95), (0.0, 2.96)], at=(-1.3, 1.3, 0), seg=10, mat=steel)
    b.ring(1.4, 1.3, 0.34, at=(-1.3, 1.3, 1.9), seg=10, mat='team')
    b.ring(1.4, 1.3, 0.2, at=(-1.3, 1.3, 0.8), seg=10, mat=rust)
    b.box((0.26, 0.1, 1.3), at=(-1.3, -0.06, 1.4), mat='crystal')
    # derrick over the bore, front-right
    dx, dy = 1.25, -0.9
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.pipe([(dx + sx * 0.95, dy + sy * 0.95, 0.3), (dx + sx * 0.3, dy + sy * 0.3, 5.2)], 0.08, mat=steel, seg=4)
    for z, k in ((1.5, 0.78), (2.9, 0.6), (4.2, 0.43)):
        b.pipe([(dx - k, dy - k, z), (dx + k, dy - k, z), (dx + k, dy + k, z), (dx - k, dy + k, z)], 0.05, mat=rust, seg=4, closed=True)
    b.box((0.8, 0.8, 0.2), at=(dx, dy, 5.25), mat=rust, bevel=0.03)
    b.cyl(0.22, 4.6, at=(dx, dy, 2.6), seg=6, mat='gunmetal')
    b.box((0.2, 0.2, 0.2), at=(dx, dy, 5.5), mat='glow')
    b.cyl(0.6, 0.4, at=(dx, dy, 0.5), seg=8, mat=steel)
    # pipe run to the tank and an owner beacon
    b.pipe([(dx - 0.5, dy, 0.6), (-0.4, dy, 0.6), (-0.6, 0.2, 0.9)], 0.16, mat=rust)
    b.box((1.0, 0.8, 0.9), at=(1.8, 1.9, 0.75), mat=steel, bevel=0.05)                         # pump house
    b.box((1.1, 0.9, 0.12), at=(1.8, 1.9, 1.26), mat=rust)
    b.cyl(0.05, 2.6, at=(-2.4, -2.4, 1.6), seg=5, mat='gunmetal', noao=True)
    b.prism([(0.0, 0.0), (0.0, 0.7), (1.05, 0.58), (0.8, 0.35), (1.05, 0.12)], 0.05, axis='y', at=(-2.4, -2.4, 2.1), mat='team', noao=True)
    # pump jack support
    b.box((0.3, 0.3, 1.5), at=(1.8, 0.75, 1.9), mat=steel)

    j = m.part('jack', role='rock', pivot=(1.8, 0.75, 2.7), speed=1.6, amp=0.26)
    with j.at((1.8, 0.75, 2.7)):
        j.box((0.24, 2.6, 0.26), at=(0, -0.2, 0), mat=rust, bevel=0.03)
        j.prism([(-1.7, 0.5), (-1.3, 0.3), (-1.3, -0.5), (-1.7, -0.3)], 0.4, axis='x', at=(0, 0, 0), mat=steel)   # horse head
        j.box((0.4, 0.5, 0.5), at=(0, 1.0, -0.1), mat='gunmetal', bevel=0.04)                                    # counterweight
        j.cyl(0.14, 0.4, at=(0, 0, 0), axis='x', seg=6, mat='gunmetal')


@building('obelisk', team=2)
def obelisk(m):
    """Signal Obelisk: an ancient relay. Stepped plinth, a needle cut with glowing bands, a hovering focus crystal."""
    stone = (0.36, 0.37, 0.44)
    stone2 = (0.25, 0.26, 0.32)
    b = m.part('body')
    b.prism(rect(3.9, 3.9, 0.6), 1.0, axis='z', at=(0, 0, -0.7), mat=stone2, bevel=0.06)
    b.prism(rect(3.2, 3.2, 0.5), 0.6, axis='z', at=(0, 0, 0.3), mat=stone, bevel=0.06)
    b.prism(rect(2.5, 2.5, 0.4), 0.5, axis='z', at=(0, 0, 0.9), mat=stone2, bevel=0.06)
    # the needle: two tapering stages with inset glowing bands
    b.prism(rect(1.8, 1.8, 0.25), 4.2, axis='z', at=(0, 0, 1.4), mat=stone, taper=0.74, bevel=0.05)
    b.prism(rect(1.26, 1.26, 0.18), 3.8, axis='z', at=(0, 0, 5.7), mat=stone, taper=0.56, bevel=0.04)
    for z, w in ((2.4, 1.72), (3.8, 1.5), (5.2, 1.38), (6.6, 1.2), (8.0, 0.98)):
        b.prism(rect(w, w, 0.14), 0.16, axis='z', at=(0, 0, z), mat='glow')
    b.prism(rect(0.7, 0.7, 0.05), 0.9, axis='z', at=(0, 0, 9.5), mat='gold', taper=0.05)
    # glyph slits on the camera side
    for i in range(3):
        b.box((0.12, 0.06, 0.5), at=(-0.3 + i * 0.3, -0.84 + 0.0, 3.0 + (i % 2) * 0.2), mat='glow')
    # four guardian stones
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.tbox((0.62, 0.62), (0.3, 0.3), 1.5, at=(sx * 1.45, sy * 1.45, 0.3), mat=stone, bevel=0.04, rot=(sy * -6, sx * 6, 0))
            b.box((0.3, 0.3, 0.16), at=(sx * 1.3, sy * 1.3, 1.86), mat='glow')

    c = m.part('focus', role='spin', pivot=(0, 0, 11.4), speed=1.1, bob=0.3)
    c.lathe([(0.0, -0.9), (0.46, 0.0), (0.0, 1.0)], at=(0, 0, 11.4), seg=4, mat='glow')
    for i in range(4):
        a = i / 4 * math.tau
        c.lathe([(0.0, -0.36), (0.16, 0.0), (0.0, 0.4)], at=(math.cos(a) * 1.5, math.sin(a) * 1.5, 11.4), seg=4, mat='glow')
