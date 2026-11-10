"""Scenery: Aurium crystals, trees, rocks and scrub. Foliage and stone use themed palette slots."""
import math
import random

from kz.registry import model


def prop(name, **kw):
    kw.setdefault('ao_dist', 2.2)
    return model(name, kind='prop', **kw)


def shard(p, x, y, r, h, tilt=(0, 0), seg=6, mat='crystal_lit', tip=0.34, phase=0.0, z=0.0):
    """A hexagonal crystal column with a pointed tip."""
    p.lathe([(r, 0.0), (r * 0.94, h * (1 - tip)), (0.0, h)], at=(x, y, z - 0.15), rot=(tilt[0], tilt[1], phase), seg=seg, mat=mat, smooth=False)


@prop('crystal', ao_dist=1.4, ao_strength=0.65)
def crystal(m):
    """An Aurium outcrop: one tall spire ringed by leaning shards, over a bed of glowing rubble."""
    b = m.part('body')
    rnd = random.Random(11)
    shard(b, 0.0, 0.05, 0.42, 2.5, (4, -3), phase=20)
    spec = [(0.62, 0.2, 0.3, 1.7, (-8, 26)), (-0.6, 0.3, 0.32, 1.55, (-6, -28)), (0.15, -0.62, 0.3, 1.35, (30, 4)),
            (-0.3, 0.75, 0.26, 1.2, (-32, -8)), (0.75, -0.45, 0.22, 0.95, (22, 34)), (-0.75, -0.4, 0.22, 0.85, (20, -36))]
    for i, (x, y, r, h, tilt) in enumerate(spec):
        shard(b, x, y, r, h, tilt, phase=rnd.random() * 60)
    # emissive hearts inside the big shards make the cluster glow from within
    shard(b, 0.0, 0.05, 0.2, 2.2, (4, -3), mat='crystal', phase=20, z=0.2)
    for i in range(7):
        a = rnd.random() * math.tau
        d = 0.5 + rnd.random() * 0.75
        b.ico(0.13 + rnd.random() * 0.1, at=(math.cos(a) * d, math.sin(a) * d, 0.08), mat='crystal', scale=(1, 1, 0.8), seed=i, jitter=0.25)
    b.ico(0.95, at=(0, 0, -0.1), mat=(0.1, 0.3, 0.34), scale=(1.25, 1.25, 0.32), seed=5, jitter=0.12)


def _pine(p, h, r, tiers, seed, lean=0.0):
    rnd = random.Random(seed)
    p.cyl(r * 0.16, h * 0.34, at=(0, 0, h * 0.15), seg=6, r2=r * 0.11, mat='trunk')
    z = h * 0.2
    for i in range(tiers):
        k = 1 - i / tiers
        tr = r * (0.45 + 0.55 * k)
        th = h * 0.8 / tiers * 1.5
        mat = 'cap' if i == tiers - 1 else ('leaf' if i % 2 == 0 else 'leaf2')
        p.cyl(tr, th, at=(lean * i * 0.1, 0, z + th / 2), seg=7, r2=tr * 0.16, mat=mat, rot=(0, 0, rnd.random() * 50), smooth=False)
        z += th * 0.56


@prop('tree0')
def tree0(m):
    _pine(m.part('body'), 5.6, 1.35, 4, 1)


@prop('tree1')
def tree1(m):
    """Broadleaf: a forked trunk under three faceted crowns."""
    p = m.part('body')
    p.cyl(0.26, 1.9, at=(0, 0, 0.9), seg=6, r2=0.17, mat='trunk')
    p.cyl(0.12, 1.0, at=(0.3, 0.1, 2.0), seg=5, mat='trunk', rot=(0, 32, 0))
    p.ico(1.5, at=(0, 0, 3.0), mat='leaf', scale=(1.0, 1.0, 0.85), seed=2, jitter=0.16)
    p.ico(1.05, at=(0.95, 0.3, 3.5), mat='leaf2', scale=(1, 1, 0.85), seed=3, jitter=0.16)
    p.ico(0.95, at=(-0.8, -0.45, 3.45), mat='cap', scale=(1, 1, 0.8), seed=4, jitter=0.16)
    p.ico(0.7, at=(0.1, 0.5, 4.1), mat='leaf2', scale=(1, 1, 0.8), seed=6, jitter=0.16)


@prop('tree2')
def tree2(m):
    _pine(m.part('body'), 7.0, 1.1, 5, 9, lean=0.5)


def _boulder(p, r, at, seed, scale=(1, 1, 0.75), mat='rock', cap=True):
    f = p.ico(r, at=at, mat=mat, scale=scale, seed=seed, jitter=0.2, rot=(0, 0, seed * 37))
    if cap:
        p.paint(f, 'cap', where=lambda n, c: n.z > 0.8)
    return f


@prop('rock0')
def rock0(m):
    p = m.part('body')
    _boulder(p, 1.25, (0, 0, 0.5), 1, (1.2, 1.0, 0.8))
    _boulder(p, 0.7, (1.0, 0.5, 0.25), 2, (1, 1.2, 0.7), mat='rock2')
    _boulder(p, 0.42, (-0.9, -0.7, 0.15), 3, (1, 1, 0.7), mat='rock2', cap=False)


@prop('rock1')
def rock1(m):
    """A standing stone with a cleft."""
    p = m.part('body')
    _boulder(p, 1.0, (0, 0, 1.0), 4, (0.9, 0.85, 1.6))
    _boulder(p, 0.8, (-0.7, 0.3, 0.45), 5, (1.1, 1, 0.8), mat='rock2')
    _boulder(p, 0.5, (0.65, -0.55, 0.25), 6, (1, 1, 0.75), cap=False)


@prop('rock2')
def rock2(m):
    p = m.part('body')
    _boulder(p, 1.35, (0, 0, 0.35), 7, (1.4, 1.1, 0.55), mat='rock2')
    _boulder(p, 0.55, (0.9, 0.8, 0.3), 8, (1, 1, 0.8))


@prop('bush', ao_dist=1.0)
def bush(m):
    p = m.part('body')
    p.ico(0.62, at=(0, 0, 0.32), mat='leaf2', scale=(1.1, 1.0, 0.75), seed=1, jitter=0.2)
    p.ico(0.44, at=(0.52, 0.2, 0.26), mat='leaf', scale=(1, 1, 0.8), seed=2, jitter=0.2)
    p.ico(0.36, at=(-0.42, -0.3, 0.22), mat='cap', scale=(1, 1, 0.8), seed=3, jitter=0.2)
    p.ico(0.3, at=(-0.1, 0.5, 0.2), mat='leaf', scale=(1, 1, 0.8), seed=4, jitter=0.2)
