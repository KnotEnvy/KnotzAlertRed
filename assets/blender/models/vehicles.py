"""Ground vehicles and aircraft. Blender space: X right, Y forward, Z up."""
from kz.kit import glow, ngon, rect
from kz.registry import model

from .crimson import blade, spike, teeth


def tracks(p, half, length, w=0.62, h=0.72, wheels=4, y=0.0):
    """A pair of tread units with road wheels showing through."""
    L = length
    prof = [(-L / 2, h * 0.45), (-L / 2 + 0.3, 0.0), (L / 2 - 0.36, 0.0), (L / 2, h * 0.52), (L / 2 - 0.22, h), (-L / 2 + 0.16, h)]
    p.prism(prof, w, axis='x', at=(half, y, 0), mat='black', bevel=0.035, mirror=True)
    r = h * 0.3
    span = L - 0.95
    for i in range(wheels):
        wy = y - span / 2 + span * i / (wheels - 1)
        p.cyl(r, w + 0.07, at=(half, wy, r + 0.03), axis='x', seg=10, mat='gunmetal', mirror=True)
        p.cyl(r * 0.42, w + 0.11, at=(half, wy, r + 0.03), axis='x', seg=6, mat='metal', mirror=True)
    # drive sprocket and idler sit higher at the ends
    p.cyl(r * 0.8, w + 0.07, at=(half, y + L / 2 - 0.3, h * 0.56), axis='x', seg=8, mat='gunmetal', mirror=True)
    p.cyl(r * 0.8, w + 0.07, at=(half, y - L / 2 + 0.3, h * 0.52), axis='x', seg=8, mat='gunmetal', mirror=True)


def headlights(p, x, y, z, w=0.22, h=0.12):
    p.box((w, 0.06, h), at=(x, y, z), mat='glow', mirror=True)


def vents(p, at, size, n=4, axis='y', mat='black'):
    """A grille of n slats inside the rectangle `size` centred on `at` (lying on a top surface)."""
    sx, sy = size
    for i in range(n):
        t = (i + 0.5) / n - 0.5
        if axis == 'y':
            p.box((sx, sy / n * 0.55, 0.05), at=(at[0], at[1] + t * sy, at[2]), mat=mat)
        else:
            p.box((sx / n * 0.55, sy, 0.05), at=(at[0] + t * sx, at[1], at[2]), mat=mat)


def antenna(p, at, h=1.0, r=0.02, tip=True):
    p.cyl(r, h, at=(at[0], at[1], at[2] + h / 2), seg=4, mat='black', noao=True)
    p.cyl(r * 2.6, 0.1, at=(at[0], at[1], at[2] + 0.05), seg=6, mat='gunmetal')
    if tip:
        p.box((0.07, 0.07, 0.07), at=(at[0], at[1], at[2] + h), mat='glow')


@model('tank', icon='tank', factions=True)
def tank(m):
    """Mauler: the line tank. Sloped glacis, side skirts in alternating paint, hex turret."""
    b = m.part('body')
    tracks(b, 1.05, 3.9, w=0.64, h=0.74)
    # lower hull between the tracks
    b.prism([(-1.8, 0.34), (1.62, 0.34), (1.98, 0.72), (1.42, 1.1), (-1.56, 1.1), (-1.9, 0.86)], 1.56, mat='panel_dark', bevel=0.04)
    # upper hull: wide deck over the tracks with a sloped glacis
    b.prism([(-1.82, 0.78), (1.3, 0.78), (1.86, 0.86), (1.2, 1.2), (-1.5, 1.2), (-1.82, 1.0)], 2.56, mat='panel', bevel=0.05)
    # painted glacis plate and centre stripe
    b.prism([(1.24, 1.215), (1.84, 0.9), (1.8, 0.86), (1.2, 1.175)], 1.5, mat='team', at=(0, 0, 0.02))
    b.box((0.9, 2.2, 0.05), at=(0, -0.35, 1.215), mat='team')
    # side skirts: three plates a side, alternating paint
    for i, (y, mat) in enumerate(((1.02, 'team'), (-0.08, 'panel'), (-1.18, 'team'))):
        b.box((0.1, 1.02, 0.52), at=(1.37, y, 0.72), mat=mat, bevel=0.03, rot=(0, -5, 0), mirror=True)
    # engine deck
    b.box((1.7, 0.95, 0.16), at=(0, -1.22, 1.27), mat='metal', bevel=0.03)
    vents(b, (0.45, -1.22, 1.36), (0.55, 0.7), n=4)
    vents(b, (-0.45, -1.22, 1.36), (0.55, 0.7), n=4)
    b.cyl(0.09, 0.5, at=(0.98, -1.78, 1.12), axis='y', seg=6, mat='gunmetal', mirror=True)  # exhausts
    headlights(b, 0.82, 1.83, 0.93)
    b.box((0.5, 0.05, 0.1), at=(0, 1.9, 0.78), mat='gunmetal')
    b.box((0.16, 0.05, 0.1), at=(0.9, -1.84, 0.92), mat=glow(1.0, 0.25, 0.1), mirror=True)  # tail lights
    # turret ring
    b.cyl(0.78, 0.1, at=(0, -0.1, 1.24), seg=12, mat='gunmetal')

    t = m.part('turret', role='turret', pivot=(0, -0.1, 1.28))
    z0 = 1.29
    f = t.prism([(-0.72, -0.98), (0.72, -0.98), (0.98, -0.2), (0.62, 0.95), (-0.62, 0.95), (-0.98, -0.2)], 0.58, axis='z',
                at=(0, -0.1, z0), mat='team', taper=0.78, shift=(0, -0.02), bevel=0.05)
    t.paint(f, 'panel', where=lambda n, c: n.z > 0.9)
    t.box((1.16, 0.62, 0.4), at=(0, -1.18, z0 + 0.3), mat='panel', bevel=0.05)          # bustle
    t.box((0.5, 0.08, 0.26), at=(0, -1.5, z0 + 0.3), mat='gunmetal')
    t.box((0.62, 0.34, 0.44), at=(0, 0.92, z0 + 0.27), mat='gunmetal', bevel=0.05)        # mantlet
    t.cyl(0.25, 0.14, at=(-0.34, -0.3, z0 + 0.64), seg=8, mat='panel_dark')               # cupola
    t.cyl(0.17, 0.05, at=(-0.34, -0.3, z0 + 0.73), seg=8, mat='gunmetal')
    t.box((0.26, 0.3, 0.16), at=(0.42, 0.1, z0 + 0.62), mat='gunmetal', bevel=0.03)        # gunner sight
    t.box((0.18, 0.04, 0.09), at=(0.42, 0.26, z0 + 0.63), mat='glow')
    antenna(t, (0.52, -1.2, z0 + 0.5), h=1.15)
    # smoke launchers
    for s in (-1, 1):
        for k in range(2):
            t.cyl(0.07, 0.24, at=(s * (0.92 + k * 0.02), 0.25 - k * 0.2, z0 + 0.3), axis='y', seg=6, mat='gunmetal', rot=(0, 0, -s * 25))

    if m.faction == 1:
        teeth(b, 1.95, 0.62, 2.3, n=5, size=0.42)
        spike(b, (1.36, 1.6, 0.98), r=0.1, h=0.5, rot=(-60, 0, 0), mat='team', mirror=True)
        blade(t, (0.58, -1.0, z0 + 0.5), length=1.0, height=0.62, mirror=True, rot=(0, 0, -8))
        blade(t, (0.0, -1.25, z0 + 0.5), length=0.7, height=0.4, mat='gunmetal')

    g = m.part('barrel', role='barrel', pivot=(0, -0.1, 1.28), travel=0.42)
    g.cyl(0.19, 0.7, at=(0, 1.42, z0 + 0.27), axis='y', seg=8, mat='panel_dark')
    g.cyl(0.115, 1.75, at=(0, 2.4, z0 + 0.27), axis='y', seg=8, mat='gunmetal')
    g.cyl(0.19, 0.34, at=(0, 3.25, z0 + 0.27), axis='y', seg=8, mat='black')
    g.cyl(0.12, 0.04, at=(0, 3.43, z0 + 0.27), axis='y', seg=8, mat='glow')
    m.meta.update(muzzle=[0, 3.45, z0 + 0.27])


def wheel(p, x, y, r, w=0.42, mirror=True):
    """Chunky off-road wheel with a hub cap."""
    p.cyl(r, w, at=(x, y, r), axis='x', seg=12, mat='black', bevel=0.06, mirror=mirror)
    p.cyl(r * 0.55, w + 0.04, at=(x, y, r), axis='x', seg=8, mat='gunmetal', mirror=mirror)
    p.cyl(r * 0.22, w + 0.1, at=(x, y, r), axis='x', seg=6, mat='panel', mirror=mirror)


@model('titan', icon='titan', factions=True)
def titan(m):
    """Titan: twin-gun heavy. Layered armour, armoured skirts, wide low turret with cheek pods."""
    b = m.part('body')
    tracks(b, 1.42, 5.1, w=0.86, h=0.94, wheels=5)
    b.prism([(-2.4, 0.4), (2.2, 0.4), (2.6, 0.9), (1.9, 1.38), (-2.1, 1.38), (-2.5, 1.05)], 2.0, mat='panel_dark', bevel=0.05)
    b.prism([(-2.42, 1.0), (1.75, 1.0), (2.5, 1.08), (1.7, 1.5), (-2.05, 1.5), (-2.42, 1.25)], 3.56, mat='panel', bevel=0.06)
    # raised armour belt along the deck
    b.prism([(1.66, 1.52), (2.46, 1.12), (2.42, 1.08), (1.62, 1.48)], 2.3, mat='team', at=(0, 0, 0.02))
    b.box((1.25, 1.5, 0.08), at=(1.1, -0.2, 1.52), mat='team', mirror=True)
    for y, mat in ((1.55, 'team'), (0.42, 'panel'), (-0.7, 'team'), (-1.82, 'panel')):
        b.box((0.12, 1.06, 0.66), at=(1.86, y, 0.92), mat=mat, bevel=0.04, rot=(0, -6, 0), mirror=True)
    b.box((2.5, 1.2, 0.26), at=(0, -1.7, 1.6), mat='metal', bevel=0.04)
    vents(b, (0.7, -1.7, 1.74), (0.8, 0.9), n=5)
    vents(b, (-0.7, -1.7, 1.74), (0.8, 0.9), n=5)
    b.cyl(0.14, 0.75, at=(1.0, -2.2, 1.85), seg=8, mat='gunmetal', mirror=True)   # exhaust stacks
    b.cyl(0.16, 0.08, at=(1.0, -2.2, 2.24), seg=8, mat='black', mirror=True)
    headlights(b, 1.15, 2.46, 1.14, w=0.3, h=0.14)
    b.box((1.2, 0.08, 0.34), at=(0, 2.52, 0.86), mat='gunmetal', bevel=0.02)
    b.box((0.2, 0.05, 0.12), at=(1.3, -2.44, 1.2), mat=glow(1.0, 0.25, 0.1), mirror=True)
    b.cyl(1.1, 0.12, at=(0, -0.2, 1.56), seg=12, mat='gunmetal')

    piv = (0, -0.2, 1.62)
    z0 = 1.62
    t = m.part('turret', role='turret', pivot=piv)
    f = t.prism([(-1.0, -1.25), (1.0, -1.25), (1.36, -0.3), (0.95, 1.25), (-0.95, 1.25), (-1.36, -0.3)], 0.74, axis='z',
                at=(0, -0.2, z0), mat='team', taper=0.8, shift=(0, -0.03), bevel=0.06)
    t.paint(f, 'panel', where=lambda n, c: n.z > 0.9)
    t.box((1.7, 0.8, 0.52), at=(0, -1.72, z0 + 0.38), mat='panel', bevel=0.06)
    t.box((0.9, 0.1, 0.3), at=(0, -2.14, z0 + 0.38), mat='gunmetal')
    t.box((0.5, 1.3, 0.5), at=(1.22, 0.2, z0 + 0.32), mat='panel', bevel=0.06, mirror=True)   # cheek armour
    t.box((0.3, 0.9, 0.3), at=(1.24, 0.25, z0 + 0.62), mat='team', bevel=0.04, mirror=True)
    t.box((1.6, 0.4, 0.56), at=(0, 1.2, z0 + 0.36), mat='gunmetal', bevel=0.06)
    t.cyl(0.32, 0.18, at=(-0.45, -0.55, z0 + 0.82), seg=8, mat='panel_dark')
    t.cyl(0.22, 0.06, at=(-0.45, -0.55, z0 + 0.93), seg=8, mat='gunmetal')
    t.box((0.4, 0.4, 0.22), at=(0.5, -0.1, z0 + 0.84), mat='gunmetal', bevel=0.03)
    t.box((0.28, 0.05, 0.12), at=(0.5, 0.11, z0 + 0.85), mat='glow')
    antenna(t, (0.75, -1.8, z0 + 0.64), h=1.4)
    antenna(t, (-0.75, -1.8, z0 + 0.64), h=1.0, tip=False)
    if m.faction == 1:
        teeth(b, 2.58, 0.75, 3.0, n=6, size=0.5)
        blade(t, (0.95, -1.5, z0 + 0.6), length=1.4, height=0.9, mirror=True, rot=(0, 0, -10))
        spike(t, (1.3, 0.75, z0 + 0.6), r=0.14, h=0.6, rot=(-35, 0, 0), mat='team', mirror=True)
        spike(b, (1.9, 2.1, 1.2), r=0.13, h=0.6, rot=(-55, 0, 0), mat='team', mirror=True)

    g = m.part('barrel', role='barrel', pivot=piv, travel=0.5)
    for s in (-1, 1):
        g.cyl(0.24, 0.9, at=(s * 0.46, 1.82, z0 + 0.36), axis='y', seg=8, mat='panel_dark')
        g.cyl(0.15, 2.3, at=(s * 0.46, 3.2, z0 + 0.36), axis='y', seg=8, mat='gunmetal')
        g.box((0.44, 0.5, 0.36), at=(s * 0.46, 4.4, z0 + 0.36), mat='black', bevel=0.04)
        g.cyl(0.13, 0.04, at=(s * 0.46, 4.67, z0 + 0.36), axis='y', seg=8, mat='glow')


@model('artillery', icon='artillery', factions=True)
def artillery(m):
    """Longbow: tracked gun carriage with a long elevated barrel, recoil spades and a loader cab."""
    b = m.part('body')
    tracks(b, 1.02, 3.9, w=0.62, h=0.72)
    b.prism([(-1.8, 0.34), (1.6, 0.34), (1.95, 0.72), (1.5, 1.05), (-1.6, 1.05), (-1.9, 0.82)], 1.5, mat='panel_dark', bevel=0.04)
    b.prism([(-1.85, 0.78), (1.4, 0.78), (1.88, 0.86), (1.4, 1.14), (-1.85, 1.14)], 2.5, mat='panel', bevel=0.05)
    b.box((1.1, 0.9, 0.05), at=(0, 1.0, 1.15), mat='team')
    for y, mat in ((1.0, 'panel'), (-0.1, 'team'), (-1.2, 'panel')):
        b.box((0.1, 1.0, 0.46), at=(1.33, y, 0.74), mat=mat, bevel=0.03, mirror=True)
    # armoured cab at the left-front, gun cradle on the centreline
    f = b.tbox((0.95, 1.1), (0.8, 0.8), 0.62, at=(-0.62, 0.95, 1.14), mat='team', shift=(0, -0.12), bevel=0.04)
    b.box((0.6, 0.05, 0.2), at=(-0.62, 1.42, 1.5), mat='glass', rot=(-14, 0, 0))
    b.box((0.9, 1.5, 0.5), at=(0.25, -0.75, 1.38), mat='panel', bevel=0.05)        # ammo / breech housing
    b.box((0.5, 0.05, 0.3), at=(0.25, -1.52, 1.4), mat='gunmetal')
    b.box((0.26, 1.2, 0.9), at=(0.72, -0.5, 1.6), mat='metal', bevel=0.04)          # trunnion cheeks
    b.box((0.26, 1.2, 0.9), at=(-0.22, -0.5, 1.6), mat='metal', bevel=0.04)
    b.cyl(0.22, 1.26, at=(0.25, -0.5, 1.9), axis='x', seg=8, mat='gunmetal')
    # recoil spades folded down at the rear
    for s in (-1, 1):
        b.box((0.16, 1.2, 0.16), at=(s * 0.8, -2.2, 0.62), mat='metal', rot=(28, 0, 0))
        b.box((0.5, 0.1, 0.5), at=(s * 0.8, -2.72, 0.3), mat='gunmetal', rot=(-20, 0, 0), bevel=0.02)
    headlights(b, 0.85, 1.84, 0.9)
    antenna(b, (-0.95, 0.55, 1.76), h=1.0)
    vents(b, (0.25, -1.1, 1.65), (0.6, 0.5), n=3)
    if m.faction == 1:
        teeth(b, 1.92, 0.6, 2.2, n=4, size=0.4)
        blade(b, (-0.62, 0.6, 1.76), length=0.9, height=0.5)
        blade(b, (0.74, -0.9, 2.05), length=1.0, height=0.55, mat='team')
        blade(b, (-0.24, -0.9, 2.05), length=1.0, height=0.55, mat='team')

    g = m.part('barrel', role='barrel', pivot=(0.25, -0.5, 1.9), travel=0.7)
    elev = 26
    ax = (0.25, -0.5, 1.9)

    def along(d, r, length, mat, seg=8, **kw):
        import math
        c = (ax[0], ax[1] + math.cos(math.radians(elev)) * d, ax[2] + math.sin(math.radians(elev)) * d)
        g.cyl(r, length, at=c, axis='y', rot=(elev, 0, 0), seg=seg, mat=mat, **kw)

    along(0.2, 0.34, 1.5, 'team')            # recuperator sleeve
    along(-0.75, 0.3, 0.5, 'gunmetal')        # breech
    along(2.2, 0.17, 3.2, 'gunmetal')
    along(1.4, 0.23, 0.3, 'panel_dark')
    along(3.9, 0.27, 0.6, 'black')            # muzzle brake
    along(4.21, 0.16, 0.04, 'glow')


@model('buggy', icon='buggy', factions=True)
def buggy(m):
    """Lynx: fast scout. Exposed roll cage, long-travel suspension, pintle machine gun."""
    b = m.part('body')
    for y in (1.05, -1.0):
        wheel(b, 0.92, y, 0.5, w=0.44)
        b.box((0.5, 0.12, 0.12), at=(0.62, y, 0.52), mat='gunmetal', mirror=True)   # axle
    b.prism([(-1.45, 0.42), (1.2, 0.42), (1.62, 0.62), (1.25, 0.86), (0.5, 0.94), (-1.45, 0.9)], 1.1, mat='panel', bevel=0.05)
    b.prism([(1.22, 0.88), (1.6, 0.64), (1.56, 0.6), (1.18, 0.84)], 0.8, mat='team', at=(0, 0, 0.02))
    b.box((0.6, 0.9, 0.05), at=(0, 0.85, 0.93), mat='team', rot=(4, 0, 0))             # hood stripe
    b.box((1.3, 0.5, 0.2), at=(0, 0.95, 0.62), mat='panel_dark', bevel=0.03)          # front fenders bar
    b.box((0.34, 1.0, 0.12), at=(0.76, 1.05, 1.02), mat='team', bevel=0.03, mirror=True)     # mud guards
    b.box((0.34, 1.0, 0.12), at=(0.76, -1.0, 1.02), mat='team', bevel=0.03, mirror=True)
    b.box((1.0, 0.7, 0.36), at=(0, -1.1, 1.0), mat='team', bevel=0.05)                 # rear engine cover
    vents(b, (0, -1.1, 1.2), (0.7, 0.5), n=3)
    b.box((0.36, 0.42, 0.42), at=(0.3, -0.1, 0.95), mat='gunmetal', bevel=0.04, mirror=True)  # seats
    b.box((0.9, 0.06, 0.3), at=(0, 0.46, 1.1), mat='glass', rot=(-28, 0, 0))            # windscreen
    # roll cage
    cage = [(0.56, 0.5, 0.92), (0.52, 0.2, 1.55), (0.52, -0.62, 1.55), (0.56, -0.78, 1.0)]
    b.pipe(cage, 0.045, mat='gunmetal', mirror=True)
    b.pipe([(-0.52, 0.2, 1.55), (0.52, 0.2, 1.55)], 0.045, mat='gunmetal')
    b.pipe([(-0.52, -0.62, 1.55), (0.52, -0.62, 1.55)], 0.045, mat='gunmetal')
    b.box((0.5, 0.1, 0.1), at=(0, 0.2, 1.63), mat='glow')                             # light bar
    headlights(b, 0.46, 1.6, 0.74, w=0.2, h=0.1)
    b.box((0.9, 0.1, 0.16), at=(0, 1.66, 0.5), mat='gunmetal')                        # bull bar
    antenna(b, (-0.5, -1.3, 1.18), h=1.1)
    if m.faction == 1:
        teeth(b, 1.7, 0.5, 1.0, n=3, size=0.4)
        blade(b, (0.0, -1.25, 1.18), length=0.8, height=0.55)
        spike(b, (0.78, 1.5, 1.06), r=0.09, h=0.4, rot=(-60, 0, 0), mat='team', mirror=True)

    piv = (0, -0.3, 1.6)
    t = m.part('turret', role='turret', pivot=piv, travel=0.12)
    t.cyl(0.14, 0.1, at=(0, -0.3, 1.63), seg=8, mat='gunmetal')
    t.box((0.24, 0.5, 0.22), at=(0, -0.22, 1.78), mat='panel_dark', bevel=0.03)
    t.box((0.12, 0.26, 0.26), at=(0.2, -0.3, 1.74), mat='team')                        # ammo box
    t.cyl(0.05, 0.9, at=(0, 0.45, 1.8), axis='y', seg=6, mat='black')
    t.cyl(0.075, 0.16, at=(0, 0.86, 1.8), axis='y', seg=6, mat='gunmetal')
    t.box((0.5, 0.05, 0.34), at=(0, -0.02, 1.84), mat='panel', bevel=0.02)              # gun shield
    m.meta.update(muzzle=[0, 0.95, 1.8])


@model('harvester', icon='harvester', factions=True)
def harvester(m):
    """Six-wheel Aurium hauler: cab forward, open hopper, intake scoop with grinding teeth."""
    b = m.part('body')
    for y in (1.45, 0.0, -1.45):
        wheel(b, 1.22, y, 0.62, w=0.5)
    b.box((2.0, 4.4, 0.36), at=(0, -0.05, 0.86), mat='gunmetal', bevel=0.04)           # chassis
    # hopper: an open-topped bin with sloped sides
    hop = [(-1.28, 1.05), (-1.05, 2.28), (1.05, 2.28), (1.28, 1.05)]
    f = b.prism([(-1.2, 1.05), (-1.34, 2.3), (-1.16, 2.3), (-1.04, 1.2), (1.04, 1.2), (1.16, 2.3), (1.34, 2.3), (1.2, 1.05)],
                2.9, axis='y', at=(0, -0.72, 0), mat='panel', bevel=0.03)
    b.box((2.44, 0.14, 1.2), at=(0, 0.72, 1.7), mat='panel', bevel=0.03)                 # front wall
    b.box((2.44, 0.14, 1.2), at=(0, -2.16, 1.7), mat='panel', bevel=0.03)                # tail gate
    b.box((2.1, 2.7, 0.06), at=(0, -0.72, 1.24), mat='black')                             # bin floor
    b.box((0.08, 2.92, 0.36), at=(1.3, -0.72, 1.62), mat='team', mirror=True)             # paint band
    b.box((2.5, 0.1, 0.3), at=(0, -2.24, 1.5), mat='hazard')
    for y in (-1.6, -0.72, 0.16):
        b.box((0.1, 0.16, 1.1), at=(1.29, y, 1.72), mat='panel_dark', rot=(0, -6, 0), mirror=True)   # ribs
    # cab
    c = b.prism([(0.82, 1.05), (2.2, 1.05), (2.2, 1.7), (1.9, 2.25), (0.82, 2.25)], 2.0, mat='team', bevel=0.06)
    b.box((1.7, 0.06, 0.46), at=(0, 2.09, 1.98), mat='glass', rot=(-28.5, 0, 0))
    b.box((0.06, 0.6, 0.4), at=(1.01, 1.45, 1.95), mat='glass', mirror=True)
    b.box((1.6, 1.0, 0.08), at=(0, 1.36, 2.28), mat='panel', bevel=0.02)
    b.box((0.5, 0.2, 0.12), at=(0, 1.5, 2.36), mat='glow')                                # roof beacon bar
    headlights(b, 0.72, 2.22, 1.3, w=0.3, h=0.16)
    # intake scoop
    b.prism([(2.2, 0.5), (3.0, 0.22), (3.05, 0.34), (2.5, 0.9), (2.2, 1.0)], 2.5, mat='gunmetal', bevel=0.04)
    for i in range(5):
        x = (i - 2) * 0.52
        b.tbox((0.3, 0.3), (0.06, 0.1), 0.36, at=(x, 2.98, 0.26), mat='panel', rot=(-110, 0, 0))
    b.cyl(0.26, 2.3, at=(0, 2.62, 0.62), axis='x', seg=8, mat='hazard')                   # grinder drum
    b.cyl(0.12, 0.9, at=(-1.0, 0.86, 2.6), seg=6, mat='gunmetal')                          # exhaust
    b.cyl(0.14, 0.1, at=(-1.0, 0.86, 3.06), seg=6, mat='black')
    b.box((0.3, 0.05, 0.16), at=(0.85, -2.26, 1.05), mat=glow(1.0, 0.25, 0.1), mirror=True)
    if m.faction == 1:
        for y in (-1.9, -1.2, -0.5, 0.2):
            spike(b, (1.25, y, 2.28), r=0.12, h=0.42, rot=(0, 18, 0), mat='team', mirror=True)
        blade(b, (0.7, 1.2, 2.32), length=0.9, height=0.5, mirror=True)

    # cargo heap: grows out of the hopper as it fills (game scales it vertically)
    c = m.part('cargo', role='cargo', pivot=(0, -0.72, 2.2), depth=0.85, show_preview=True)
    import random
    rnd = random.Random(3)
    for i in range(9):
        x = (rnd.random() - 0.5) * 1.5
        y = -0.72 + (rnd.random() - 0.5) * 2.1
        h = 0.5 + rnd.random() * 0.55
        c.cyl(0.26 + rnd.random() * 0.14, h, at=(x, y, 1.95 + h / 2), r2=0.03, seg=5, mat='crystal',
              rot=((rnd.random() - 0.5) * 40, (rnd.random() - 0.5) * 40, rnd.random() * 90), smooth=False)
    c.box((2.0, 2.6, 0.5), at=(0, -0.72, 1.75), mat=(0.08, 0.38, 0.42))


@model('gunship', icon='gunship', ground=False, ao_dist=1.2, factions=True)
def gunship(m):
    """Kestrel: twin-fan VTOL gunship. Faceted fuselage, canted fan pods, chin gun, V tail."""
    b = m.part('body')
    # fuselage: long faceted hex section, tapering to the tail boom
    b.prism(ngon(6, 0.84, phase=0, sx=1.0, sy=0.8), 2.6, axis='y', at=(0, 0.5, 0), mat='panel', taper=0.7, shift=(0, -0.06), bevel=0.04)
    b.prism(ngon(6, 0.84, phase=0, sx=1.0, sy=0.8), 2.4, axis='y', at=(0, -2.0, 0.0), mat='panel', taper=0.3, shift=(0, 0.16), rot=(0, 0, 180))
    b.box((0.9, 2.2, 0.1), at=(0, 0.2, 0.6), mat='team', bevel=0.02)                       # spine stripe
    # nose + canopy
    b.prism(ngon(6, 0.52, phase=0, sx=1.0, sy=0.74), 0.9, axis='y', at=(0, 2.24, -0.07), mat='team', taper=0.36, shift=(0, -0.1), bevel=0.03)
    b.prism([(-0.4, 0.0), (0.4, 0.0), (0.26, 0.42), (-0.26, 0.42)], 1.2, axis='y', at=(0, 1.3, 0.36), mat='glass', taper=0.62, shift=(0, -0.1))
    # stub wings + fan pods
    b.box((1.5, 0.9, 0.14), at=(1.3, 0.0, 0.18), mat='panel', bevel=0.03, rot=(0, -6, 0), mirror=True)
    b.box((0.5, 0.92, 0.16), at=(1.3, 0.0, 0.2), mat='team', rot=(0, -6, 0), mirror=True)
    b.ring(0.82, 0.64, 0.46, at=(2.25, 0.0, 0.28), seg=12, mat='panel', mirror=True)       # duct shroud
    b.ring(0.86, 0.62, 0.1, at=(2.25, 0.0, 0.5), seg=12, mat='team', mirror=True)
    b.cyl(0.64, 0.06, at=(2.25, 0.0, 0.1), seg=12, mat='black', mirror=True)                # duct floor
    b.cyl(0.46, 0.08, at=(2.25, 0.0, 0.03), seg=10, mat='glow', mirror=True)               # lift glow underneath
    b.box((0.7, 0.3, 0.3), at=(0.86, -0.5, 0.2), mat='panel_dark', bevel=0.05, mirror=True)  # intakes
    b.box((0.5, 0.05, 0.18), at=(0.86, -0.34, 0.22), mat='black', mirror=True)
    # weapon pylons
    b.box((0.26, 1.2, 0.26), at=(1.25, 0.25, -0.12), mat='gunmetal', bevel=0.04, mirror=True)
    for dx in (-0.09, 0.09):
        b.cyl(0.07, 0.2, at=(1.25 + dx, 0.9, -0.12), axis='y', seg=6, mat='black', mirror=True)
    # chin gun
    b.box((0.3, 0.5, 0.24), at=(0, 1.7, -0.56), mat='gunmetal', bevel=0.03)
    b.cyl(0.06, 0.8, at=(0, 2.25, -0.6), axis='y', seg=6, mat='black')
    # tail: V fins and a thruster
    b.box((0.08, 0.9, 0.8), at=(0.34, -2.75, 0.5), mat='team', rot=(0, 28, 0), bevel=0.02, mirror=True)
    b.box((1.3, 0.5, 0.08), at=(0, -2.85, 0.2), mat='panel_dark', bevel=0.02)
    b.cyl(0.22, 0.3, at=(0, -3.24, 0.16), axis='y', seg=8, mat='gunmetal')
    b.cyl(0.15, 0.04, at=(0, -3.4, 0.16), axis='y', seg=8, mat='glow')
    # skids
    b.pipe([(0.5, 1.0, -0.86), (0.5, -0.8, -0.86)], 0.05, mat='gunmetal', mirror=True)
    b.pipe([(0.42, 0.6, -0.4), (0.5, 0.6, -0.86)], 0.04, mat='gunmetal', mirror=True)
    b.pipe([(0.42, -0.5, -0.4), (0.5, -0.5, -0.86)], 0.04, mat='gunmetal', mirror=True)
    b.box((0.1, 0.1, 0.08), at=(0, -0.3, 0.6), mat=glow(1.0, 0.25, 0.1))                    # beacon
    if m.faction == 1:
        spike(b, (0, 2.6, -0.1), r=0.14, h=0.9, rot=(-90, 0, 0), mat='gunmetal')
        spike(b, (2.9, 0.3, 0.3), r=0.16, h=1.1, rot=(-78, 0, -20), mat='team', mirror=True)
        blade(b, (0, -1.4, 0.55), length=1.3, height=0.6)

    for s, name in ((1, 'fan_r'), (-1, 'fan_l')):
        f = m.part(name, role='spin', pivot=(s * 2.25, 0.0, 0.4), speed=s * 26.0, follow=True)
        for k in range(3):
            f.box((1.24, 0.22, 0.03), at=(s * 2.25, 0.0, 0.4), mat='panel_dark', rot=(0, 8, k * 60), noao=True)
        f.cyl(0.16, 0.14, at=(s * 2.25, 0.0, 0.42), seg=8, mat='team')


@model('hero_rook', icon='hero_rook')
def hero_rook(m):
    """Commander Rook's command tank: a siege bulwark with a ram prow, gold trim and a command mast."""
    b = m.part('body')
    tracks(b, 1.44, 5.2, w=0.9, h=0.98, wheels=5)
    b.prism([(-2.45, 0.42), (2.2, 0.42), (2.65, 0.95), (1.95, 1.45), (-2.15, 1.45), (-2.55, 1.1)], 1.98, mat='panel_dark', bevel=0.05)
    b.prism([(-2.48, 1.02), (1.7, 1.02), (2.55, 1.1), (1.75, 1.58), (-2.1, 1.58), (-2.48, 1.3)], 3.64, mat='panel', bevel=0.06)
    b.prism([(1.71, 1.6), (2.51, 1.14), (2.47, 1.1), (1.67, 1.56)], 2.5, mat='team', at=(0, 0, 0.02))
    b.box((3.7, 4.2, 0.1), at=(0, -0.3, 1.04), mat='gold', bevel=0.03)                     # gold waistline
    # ram prow
    b.prism([(2.45, 0.3), (3.15, 0.5), (3.05, 1.25), (2.5, 1.35)], 3.5, mat='team_dark', bevel=0.05)
    b.prism([(3.06, 1.27), (3.17, 0.5), (3.21, 0.5), (3.1, 1.3)], 3.3, mat='gold')
    for x in (-1.2, -0.4, 0.4, 1.2):
        b.box((0.16, 0.12, 0.76), at=(x, 3.16, 0.86), mat='gunmetal', rot=(-8, 0, 0))
    for y, mat in ((1.6, 'team'), (0.45, 'panel'), (-0.7, 'team'), (-1.85, 'panel')):
        b.box((0.14, 1.08, 0.7), at=(1.9, y, 0.96), mat=mat, bevel=0.04, rot=(0, -6, 0), mirror=True)
        b.box((0.16, 1.1, 0.08), at=(1.94, y, 1.3), mat='gold', rot=(0, -6, 0), mirror=True)
    b.box((2.6, 1.3, 0.3), at=(0, -1.75, 1.7), mat='metal', bevel=0.04)
    vents(b, (0.75, -1.75, 1.86), (0.85, 1.0), n=5)
    vents(b, (-0.75, -1.75, 1.86), (0.85, 1.0), n=5)
    b.cyl(0.16, 0.9, at=(1.05, -2.3, 2.0), seg=8, mat='gunmetal', mirror=True)
    headlights(b, 1.2, 2.56, 1.2, w=0.32, h=0.14)
    b.cyl(1.16, 0.14, at=(0, -0.2, 1.64), seg=12, mat='gold')

    piv = (0, -0.2, 1.7)
    z0 = 1.7
    t = m.part('turret', role='turret', pivot=piv)
    f = t.prism([(-1.05, -1.3), (1.05, -1.3), (1.42, -0.3), (1.0, 1.3), (-1.0, 1.3), (-1.42, -0.3)], 0.82, axis='z',
                at=(0, -0.2, z0), mat='team', taper=0.8, shift=(0, -0.03), bevel=0.06)
    t.paint(f, 'panel', where=lambda n, c: n.z > 0.9)
    t.box((2.9, 2.7, 0.1), at=(0, -0.2, z0 + 0.06), mat='gold', bevel=0.03)                  # brim
    t.box((1.8, 0.85, 0.56), at=(0, -1.78, z0 + 0.42), mat='panel', bevel=0.06)
    t.box((1.9, 0.9, 0.08), at=(0, -1.78, z0 + 0.72), mat='gold')
    t.box((1.5, 0.5, 0.7), at=(0, 1.25, z0 + 0.42), mat='gunmetal', bevel=0.07)
    t.cyl(0.42, 0.3, at=(-0.5, -0.5, z0 + 0.94), seg=8, mat='gold')                          # commander's cupola
    t.cyl(0.3, 0.08, at=(-0.5, -0.5, z0 + 1.12), seg=8, mat='gunmetal')
    t.box((0.4, 0.06, 0.12), at=(-0.5, -0.1, z0 + 0.98), mat='glow')
    t.box((0.44, 0.44, 0.26), at=(0.55, -0.1, z0 + 0.94), mat='gunmetal', bevel=0.03)
    t.box((0.3, 0.05, 0.14), at=(0.55, 0.13, z0 + 0.95), mat='glow')
    # command mast with banner and dish
    t.cyl(0.05, 2.6, at=(0.8, -1.7, z0 + 2.0), seg=6, mat='gunmetal', noao=True)
    t.prism([(0.0, 0.0), (0.0, 0.9), (-1.15, 0.75), (-0.85, 0.45), (-1.15, 0.15)], 0.05, mat='glow', at=(0.8, -1.76, z0 + 2.3), noao=True)
    t.cyl(0.4, 0.1, at=(-0.8, -1.75, z0 + 1.1), seg=10, mat='panel', rot=(35, 0, 20), r2=0.2)
    t.cyl(0.04, 0.5, at=(-0.8, -1.75, z0 + 0.85), seg=5, mat='gunmetal')
    antenna(t, (-0.2, -2.0, z0 + 0.74), h=1.7)

    g = m.part('barrel', role='barrel', pivot=piv, travel=0.6)
    g.cyl(0.36, 1.0, at=(0, 1.95, z0 + 0.44), axis='y', seg=8, mat='panel_dark')
    g.cyl(0.4, 0.14, at=(0, 2.3, z0 + 0.44), axis='y', seg=8, mat='gold')
    g.cyl(0.22, 2.6, at=(0, 3.6, z0 + 0.44), axis='y', seg=8, mat='gunmetal')
    g.box((0.62, 0.7, 0.5), at=(0, 5.0, z0 + 0.44), mat='black', bevel=0.05)
    g.cyl(0.36, 0.1, at=(0, 4.6, z0 + 0.44), axis='y', seg=8, mat='gold')
    g.cyl(0.18, 0.04, at=(0, 5.37, z0 + 0.44), axis='y', seg=8, mat='glow')
