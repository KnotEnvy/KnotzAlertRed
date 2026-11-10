"""
Crimson Dominion dress: the Dominion fields the same chassis as the Coalition but armours
them for intimidation -- swept blades, ram teeth and horned towers. Models registered with
`factions=True` are built twice and call these helpers when `m.faction == 1`.
"""


def blade(p, at, length=0.9, height=0.5, thick=0.07, mat='team', sweep=0.35, mirror=False, rot=(0, 0, 0)):
    """Swept dorsal fin standing on z = at.z, pointing aft (-Y) by default."""
    prof = [(length * 0.5, 0.0), (-length * 0.5, 0.0), (-length * (0.5 + sweep), height), (-length * 0.1, height * 0.42)]
    return p.prism(prof, thick, axis='x', at=at, mat=mat, mirror=mirror, rot=rot)


def spike(p, at, r=0.12, h=0.5, rot=(0, 0, 0), mat='gunmetal', mirror=False):
    """Four-sided spike with its base centred on `at`."""
    with p.at(at, rot=rot):
        return p.cyl(r, h, at=(0, 0, h / 2), seg=4, r2=0.0, mat=mat, mirror=mirror, smooth=False)


def teeth(p, y, z, width, n=4, size=0.36, mat='gunmetal', pitch=-70):
    """A row of ram teeth across the front (pointing +Y)."""
    for i in range(n):
        x = (i + 0.5) / n * width - width / 2
        spike(p, (x, y, z), r=size * 0.38, h=size, rot=(pitch, 0, 0), mat=mat)


def horn(p, x, y, z, h=1.2, lean=14, mat='team', mirror=False):
    """Tapering horn on a tower top, leaning outward."""
    return p.tbox((0.5, 0.5), (0.08, 0.08), h, at=(x, y, z), mat=mat, rot=(0, lean if x > 0 else -lean, 0), mirror=mirror, bevel=0.02)


def crown(p, x, y, z, w, d, n=3, h=0.5, mat='team_dark'):
    """Crenellated spikes around a rectangular rooftop."""
    for i in range(n):
        t = (i + 0.5) / n - 0.5
        for sy in (-1, 1):
            spike(p, (x + t * w, y + sy * d / 2, z), r=0.16, h=h, mat=mat)
        for sx in (-1, 1):
            spike(p, (x + sx * w / 2, y + t * d, z), r=0.16, h=h, mat=mat)
