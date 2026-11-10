"""Foot soldiers and the two foot heroes. Each has a standing pose plus two walk-cycle frames."""
import math

from kz.kit import glow, ngon
from kz.registry import model

SKIN = (0.78, 0.6, 0.48)


def _leg(p, side, swing, plate='panel', shin='team'):
    """One leg hung from the hip; `swing` degrees forward (+) or back (-)."""
    knee = max(0.0, -swing) * 0.9 + 6          # trailing leg bends more
    with p.at((side * 0.2, 0.0, 0.94), rot=(-swing, 0, 0)):
        p.box((0.27, 0.3, 0.5), at=(0, 0, -0.2), mat='black', bevel=0.03)
        p.box((0.29, 0.1, 0.34), at=(0, 0.14, -0.2), mat=plate)                     # thigh plate
        with p.at((0, 0, -0.46), rot=(knee, 0, 0)):
            p.box((0.25, 0.28, 0.46), at=(0, 0, -0.2), mat=shin, bevel=0.03)
            p.box((0.27, 0.12, 0.16), at=(0, 0.13, 0.02), mat=plate)                # knee guard
            p.box((0.27, 0.44, 0.15), at=(0, 0.07, -0.42), mat='gunmetal', bevel=0.03)  # boot


def _torso(p, lean=0.0, chest='team', plate='panel', pack='gunmetal', pack_size=(0.46, 0.24, 0.5)):
    with p.at((0, 0, 0.92), rot=(-lean, 0, 0)):
        p.box((0.56, 0.34, 0.2), at=(0, 0, 0.08), mat='black', bevel=0.03)                     # hips
        p.box((0.6, 0.12, 0.1), at=(0, 0, 0.2), mat='gunmetal')                                # belt
        p.tbox((0.6, 0.36), (0.74, 0.44), 0.56, at=(0, 0, 0.24), mat=chest, bevel=0.04)        # chest
        p.box((0.46, 0.08, 0.3), at=(0, 0.21, 0.56), mat=plate, bevel=0.02)                    # breastplate
        p.box((0.14, 0.05, 0.08), at=(0.12, 0.26, 0.62), mat='glow')
        if pack:
            p.box(pack_size, at=(0, -0.3, 0.52), mat=pack, bevel=0.04)
        p.box((0.3, 0.3, 0.12), at=(0, 0, 0.84), mat='black')                                   # neck


def _head(p, lean=0.0, helm='panel', crest='team', visor='glow', z=1.86, y=0.02):
    with p.at((0, y + math.sin(math.radians(lean)) * 0.9, z)):
        p.tbox((0.44, 0.48), (0.36, 0.4), 0.4, at=(0, 0, 0), mat=helm, bevel=0.06)
        p.box((0.36, 0.06, 0.13), at=(0, 0.23, 0.19), mat=visor)
        p.box((0.12, 0.44, 0.07), at=(0, -0.02, 0.4), mat=crest)                                # crest stripe
        p.box((0.5, 0.2, 0.14), at=(0, -0.06, 0.1), mat='gunmetal', bevel=0.02)                 # ear pieces


def _arm(p, side, shoulder_rot, elbow_rot, pad='panel', upper='black', fore='team', lean=0.0, pad_size=(0.3, 0.36, 0.2)):
    """Arm from the shoulder; rotations are (pitch, 0, yaw) in degrees."""
    with p.at((side * 0.46, math.sin(math.radians(lean)) * 0.55, 1.66)):
        p.box(pad_size, at=(side * 0.02, 0, 0.04), mat=pad, bevel=0.05)
        with p.at((0, 0, -0.02), rot=(-shoulder_rot[0], 0, shoulder_rot[2])):
            p.box((0.2, 0.22, 0.4), at=(0, 0, -0.2), mat=upper, bevel=0.02)
            with p.at((0, 0, -0.4), rot=(-elbow_rot[0], 0, elbow_rot[2])):
                p.box((0.19, 0.2, 0.36), at=(0, 0, -0.16), mat=fore, bevel=0.02)
                p.box((0.2, 0.22, 0.14), at=(0, 0, -0.38), mat='black')                       # glove


def soldier(p, pose, weapon, chest='team', helm='panel', crest='team', visor='glow', pack=True, pack_size=(0.46, 0.24, 0.5),
            pad_size=(0.3, 0.36, 0.2), pack_mat='gunmetal'):
    swing = (0, 30, -30)[pose]
    lean = 0 if pose == 0 else 7
    lift = 0.0 if pose == 0 else 0.03
    with p.at((0, 0, lift)):
        _leg(p, -1, swing)
        _leg(p, 1, -swing)
        _torso(p, lean, chest=chest, pack=pack_mat if pack else None, pack_size=pack_size)
        _head(p, lean, helm=helm, crest=crest, visor=visor)
        weapon(p, lean)


def frames(m, build):
    """Standing body plus the two stride frames the renderer alternates between while moving."""
    build(m.part('body'), 0)
    build(m.part('walk1', role='walk', frame=1), 1)
    build(m.part('walk2', role='walk', frame=2), 2)


# ----------------------------------------------------------------------------- trooper
def _rifle(p, lean):
    _arm(p, 1, (-52, 0, 12), (-58, 0, 0), lean=lean)
    _arm(p, -1, (-62, 0, -34), (-36, 0, 0), lean=lean)
    with p.at((0.12, 0.42, 1.36)):
        p.box((0.11, 0.9, 0.17), at=(0, 0.05, 0), mat='gunmetal', bevel=0.02)
        p.box((0.09, 0.3, 0.12), at=(0, -0.5, -0.03), mat='black')                    # stock
        p.cyl(0.035, 0.42, at=(0, 0.7, 0.02), axis='y', seg=6, mat='black')
        p.box((0.08, 0.14, 0.2), at=(0, 0.05, -0.16), mat='black')                     # magazine
        p.box((0.06, 0.26, 0.06), at=(0, 0.1, 0.12), mat='glow')                       # sight rail


@model('trooper', icon='trooper', ao_dist=0.7)
def trooper(m):
    frames(m, lambda p, pose: soldier(p, pose, _rifle))


# ----------------------------------------------------------------------------- lancer
def _launcher(p, lean):
    _arm(p, 1, (-100, 0, 8), (-70, 0, 0), lean=lean)
    _arm(p, -1, (-70, 0, -30), (-50, 0, 0), lean=lean)
    with p.at((0.36, 0.1, 1.9)):
        p.cyl(0.13, 1.5, at=(0, 0.1, 0), axis='y', seg=8, mat='panel')
        p.cyl(0.16, 0.3, at=(0, 0.72, 0), axis='y', seg=8, mat='team')
        p.cyl(0.17, 0.26, at=(0, -0.62, 0), axis='y', seg=8, mat='gunmetal', r2=0.13)
        p.cyl(0.1, 0.05, at=(0, 0.88, 0), axis='y', seg=8, mat='glow')                 # warhead
        p.box((0.08, 0.2, 0.2), at=(-0.16, 0.2, 0.02), mat='gunmetal')                 # sight
        p.box((0.06, 0.06, 0.1), at=(-0.16, 0.3, 0.06), mat='glow')


@model('lancer', icon='lancer', ao_dist=0.7)
def lancer(m):
    def build(p, pose):
        soldier(p, pose, _launcher, helm='gunmetal', crest='glow', pack_size=(0.5, 0.26, 0.56), pack_mat='panel_dark')
        # spare rockets on the pack
        for x in (-0.14, 0.14):
            p.cyl(0.07, 0.5, at=(x, -0.42, 1.7 + (0.03 if pose else 0)), seg=6, mat='panel')
            p.cyl(0.07, 0.1, at=(x, -0.42, 2.0 + (0.03 if pose else 0)), seg=6, mat='team', r2=0.02)
    frames(m, build)


# ----------------------------------------------------------------------------- grenadier
def _thumper(p, lean):
    _arm(p, 1, (-50, 0, 14), (-62, 0, 0), lean=lean, pad_size=(0.36, 0.42, 0.26))
    _arm(p, -1, (-60, 0, -34), (-40, 0, 0), lean=lean, pad_size=(0.36, 0.42, 0.26))
    with p.at((0.12, 0.44, 1.34)):
        p.cyl(0.12, 0.56, at=(0, 0.2, 0.02), axis='y', seg=8, mat='gunmetal')
        p.cyl(0.15, 0.1, at=(0, 0.46, 0.02), axis='y', seg=8, mat='black')
        p.cyl(0.17, 0.24, at=(0, -0.05, -0.08), axis='y', seg=8, mat='hazard')          # drum
        p.box((0.1, 0.4, 0.14), at=(0, -0.36, 0), mat='black')


@model('grenadier', icon='grenadier', ao_dist=0.7)
def grenadier(m):
    def build(p, pose):
        soldier(p, pose, _thumper, chest='team', helm='hazard', crest='gunmetal', pack_size=(0.56, 0.3, 0.6), pack_mat='team_dark')
        z = 0.03 if pose else 0
        for x in (-0.2, 0.0, 0.2):                                                        # bandolier of shells
            p.cyl(0.07, 0.14, at=(x, 0.25, 1.26 + z), seg=6, mat='hazard')
    frames(m, build)


# ----------------------------------------------------------------------------- Warden Kade
def _rail_rifle(p, lean):
    green = glow(0.3, 1.25, 0.55)
    _arm(p, 1, (-55, 0, 12), (-60, 0, 0), lean=lean, pad='gold', fore='panel_dark', pad_size=(0.34, 0.4, 0.22))
    _arm(p, -1, (-72, 0, -30), (-30, 0, 0), lean=lean, pad='team', fore='panel_dark', pad_size=(0.34, 0.4, 0.22))
    with p.at((0.14, 0.5, 1.38)):
        p.box((0.12, 1.1, 0.2), at=(0, 0.0, 0), mat='gunmetal', bevel=0.02)
        p.box((0.1, 0.4, 0.16), at=(0, -0.68, -0.04), mat='black', bevel=0.02)
        p.box((0.05, 1.5, 0.06), at=(0.0, 1.25, 0.06), mat='black')                     # twin rails
        p.box((0.05, 1.5, 0.06), at=(0.0, 1.25, -0.06), mat='black')
        p.box((0.03, 1.4, 0.04), at=(0.0, 1.25, 0.0), mat=green)
        p.box((0.1, 0.12, 0.2), at=(0, 2.0, 0), mat='gunmetal')
        p.cyl(0.07, 0.44, at=(0, 0.1, 0.2), axis='y', seg=6, mat='black')               # scope
        p.cyl(0.06, 0.03, at=(0, 0.33, 0.2), axis='y', seg=6, mat=green)
        p.box((0.05, 0.05, 0.4), at=(0, 0.9, -0.24), mat='gunmetal', rot=(20, 0, 0))    # bipod


@model('hero_kade', icon='hero_kade', ao_dist=0.9)
def hero_kade(m):
    green = glow(0.3, 1.25, 0.55)
    cloak = (0.07, 0.09, 0.1)

    def build(p, pose):
        with p.at(scale=1.45):
            soldier(p, pose, _rail_rifle, chest='panel_dark', helm='black', crest='gold', visor=green, pack=False)
            z = 0.03 if pose else 0
            sway = (0, 9, -9)[pose]
            # hood and long cloak
            p.tbox((0.52, 0.5), (0.4, 0.42), 0.3, at=(0, -0.08, 2.02 + z), mat=cloak, bevel=0.05)
            p.prism([(-0.42, 0.0), (0.42, 0.0), (0.56, -1.45), (0.0, -1.62), (-0.56, -1.45)], 0.07, axis='y',
                    at=(0, -0.3, 1.78 + z), mat=cloak, rot=(-12 - abs(sway) * 0.6, 0, sway * 0.4))
            p.box((0.66, 0.5, 0.1), at=(0, -0.02, 1.78 + z), mat=cloak, bevel=0.03)           # mantle
            p.box((0.5, 0.08, 0.08), at=(0, 0.25, 1.28 + z), mat='gold')
            p.box((0.16, 0.3, 0.3), at=(-0.36, -0.05, 1.0 + z), mat='gunmetal', bevel=0.03)    # EMP charge on the hip
            p.box((0.05, 0.1, 0.1), at=(-0.46, -0.05, 1.02 + z), mat=green)

    frames(m, build)


# ----------------------------------------------------------------------------- Seraph Nyx
@model('hero_nyx', icon='hero_nyx', ao_dist=1.0)
def hero_nyx(m):
    robe = (0.16, 0.08, 0.3)
    robe2 = (0.26, 0.13, 0.46)
    violet = glow(0.8, 0.42, 1.25)
    b = m.part('body')
    # robe: faceted cone with a flared, pointed hem
    b.lathe([(0.0, 0.25), (0.95, 0.12), (1.0, 0.35), (0.62, 1.2), (0.4, 1.95), (0.0, 1.95)], seg=8, mat=robe)
    for i in range(8):
        a = (i + 0.5) / 8 * math.tau
        b.tbox((0.5, 0.1), (0.04, 0.04), 0.5, at=(math.cos(a) * 0.9, math.sin(a) * 0.9, 0.36), mat=robe2,
               rot=(180, 0, math.degrees(a) + 90))
    b.lathe([(0.46, 1.7), (0.52, 1.82), (0.46, 1.94)], seg=8, mat='team')                       # sash
    b.box((0.2, 0.06, 0.9), at=(0, 0.52, 1.36), mat='team', rot=(-14, 0, 0))                      # tabard
    b.box((0.12, 0.04, 0.12), at=(0, 0.6, 1.62), mat='gold')
    b.tbox((0.62, 0.4), (0.8, 0.46), 0.56, at=(0, 0, 1.94), mat='panel', bevel=0.04)             # cuirass
    b.box((0.16, 0.06, 0.16), at=(0, 0.24, 2.28), mat=violet, rot=(0, 45, 0))                       # aurium heart
    # mantle
    b.prism([(-0.72, -0.34), (0.72, -0.34), (0.82, 0.1), (0.4, 0.34), (-0.4, 0.34), (-0.82, 0.1)], 0.18, axis='z',
            at=(0, 0, 2.46), mat='gold', taper=0.6, bevel=0.03)
    b.tbox((0.5, 0.5), (0.2, 0.2), 0.34, at=(0.72, 0, 2.5), mat='team', rot=(0, 22, 0), bevel=0.03, mirror=True)   # pauldrons
    # head inside a deep hood
    b.box((0.3, 0.3, 0.34), at=(0, 0.04, 2.84), mat=SKIN, bevel=0.05)
    b.box((0.26, 0.04, 0.06), at=(0, 0.2, 2.9), mat=violet)                                          # eyes
    b.prism([(-0.32, 0.0), (0.32, 0.0), (0.34, 0.44), (0.0, 0.62), (-0.34, 0.44)], 0.52, axis='y', at=(0, -0.06, 2.66), mat=robe,
            taper=0.9, bevel=0.03)
    b.box((0.5, 0.2, 0.5), at=(0, -0.36, 2.72), mat=robe, bevel=0.06, rot=(-20, 0, 0))             # hood tail
    # right arm holds the staff, left arm raised with a charge in the palm
    with b.at((0.52, 0.0, 2.42)):
        with b.at(rot=(52, 0, 14)):
            b.tbox((0.24, 0.26), (0.4, 0.44), 0.62, at=(0, 0, -0.62), mat=robe2, bevel=0.03, rot=(180, 0, 0), shift=(0, 0))
        b.box((0.16, 0.18, 0.16), at=(0.14, 0.52, -0.38), mat=SKIN)
    with b.at((-0.52, 0.0, 2.42)):
        with b.at(rot=(112, 0, -18)):
            b.tbox((0.24, 0.26), (0.4, 0.44), 0.62, at=(0, 0, -0.62), mat=robe2, bevel=0.03, rot=(180, 0, 0))
        b.box((0.16, 0.18, 0.16), at=(-0.2, 0.6, 0.28), mat=SKIN)
        b.ico(0.17, at=(-0.2, 0.66, 0.56), mat=violet)                                                 # gathered charge
    # staff
    b.cyl(0.045, 3.3, at=(0.68, 0.52, 1.95), seg=6, mat='gunmetal')
    b.cyl(0.07, 0.3, at=(0.68, 0.52, 2.05), seg=6, mat='gold')
    for a in range(3):
        ang = a * 120 + 30
        b.box((0.06, 0.06, 0.6), at=(0.68 + math.cos(math.radians(ang)) * 0.2, 0.52 + math.sin(math.radians(ang)) * 0.2, 3.72),
              mat='gold', rot=(math.sin(math.radians(ang)) * -22, math.cos(math.radians(ang)) * 22, 0))
    b.lathe([(0.0, -0.36), (0.2, 0.0), (0.0, 0.42)], at=(0.68, 0.52, 3.86), seg=4, mat=violet)

    o = m.part('orbit', role='spin', pivot=(0, 0, 2.1), speed=2.2, bob=0.12, show_preview=True)
    for i in range(3):
        a = i / 3 * math.tau
        o.lathe([(0.0, -0.3), (0.15, 0.0), (0.0, 0.34)], at=(math.cos(a) * 1.55, math.sin(a) * 1.55, 2.1 + math.sin(i * 2.1) * 0.25),
                seg=4, mat=violet)
