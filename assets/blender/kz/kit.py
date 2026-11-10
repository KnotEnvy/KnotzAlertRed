"""
KnotZ: Alert Red -- Blender modelling kit.

Models are authored in Blender space (X right, Y forward, Z up, 1 unit = 1 game unit) as a
set of Parts. Every face carries a palette *slot* instead of a colour, so one mesh serves
every faction: the game resolves slots against the team palette when it loads the pack.
Ambient occlusion and a little panel variation are baked per face-corner.
"""
import math
import random

import bmesh
from mathutils import Euler, Matrix, Vector
from mathutils.bvhtree import BVHTree

# ----------------------------------------------------------------------------- palette
# Slot order is part of the pack format: append only.
SLOTS = [
    'lit',        # 0  literal colour stored on the vertex
    'lit_glow',   # 1  literal colour, emissive
    'team',       # 2  faction paint
    'team_dark',  # 3  darker faction paint
    'panel',      # 4  the faction's second hull colour (Aegis white / Crimson charcoal)
    'panel_dark', # 5  shaded panel
    'metal',      # 6  bare structural metal
    'gunmetal',   # 7  barrels, tracks housings
    'black',      # 8  rubber, treads, deep recesses
    'glass',      # 9  canopy glass (emissive-ish)
    'glow',       # 10 faction lights (emissive)
    'concrete',   # 11 foundations
    'concrete_dark',  # 12
    'gold',       # 13 hero / rank trim
    'crystal',    # 14 aurium (emissive)
    'hazard',     # 15 warning stripes
    'window',     # 16 lit windows (emissive)
    'leaf',       # 17 scenery: foliage (themed per battlefield)
    'leaf2',      # 18
    'trunk',      # 19
    'rock',       # 20
    'rock2',      # 21
    'cap',        # 22 snow cap / sun-bleached highlight
    'crystal_lit',  # 23 aurium facets that still take light and shadow
]
SLOT = {name: i for i, name in enumerate(SLOTS)}
EMISSIVE = {'lit_glow', 'glass', 'glow', 'crystal', 'window'}

# Linear-ish colours as the game's material sees them. Emissive entries may exceed 1 (bloom).
PALETTES = {
    0: {  # Aegis Coalition
        'lit': (1, 1, 1), 'lit_glow': (2.2, 2.2, 2.2),
        'team': (0.10, 0.30, 0.86), 'team_dark': (0.05, 0.14, 0.44),
        'panel': (0.80, 0.84, 0.88), 'panel_dark': (0.50, 0.55, 0.62),
        'metal': (0.36, 0.39, 0.45), 'gunmetal': (0.17, 0.19, 0.23), 'black': (0.055, 0.06, 0.075),
        'glass': (0.30, 0.95, 1.25), 'glow': (0.45, 1.75, 2.6),
        'concrete': (0.46, 0.47, 0.49), 'concrete_dark': (0.30, 0.31, 0.34),
        'gold': (1.0, 0.70, 0.20), 'crystal': (0.30, 1.6, 1.75),
        'hazard': (0.95, 0.72, 0.12), 'window': (0.55, 1.5, 2.0),
        'leaf': (0.13, 0.36, 0.15), 'leaf2': (0.22, 0.42, 0.13), 'trunk': (0.3, 0.2, 0.13),
        'rock': (0.5, 0.48, 0.46), 'rock2': (0.4, 0.385, 0.37), 'cap': (0.2, 0.46, 0.17),
        'crystal_lit': (0.22, 1.25, 1.45),
    },
    1: {  # Crimson Dominion
        'lit': (1, 1, 1), 'lit_glow': (2.2, 2.2, 2.2),
        'team': (0.80, 0.09, 0.09), 'team_dark': (0.40, 0.04, 0.05),
        'panel': (0.25, 0.26, 0.30), 'panel_dark': (0.15, 0.155, 0.185),
        'metal': (0.27, 0.27, 0.30), 'gunmetal': (0.12, 0.12, 0.14), 'black': (0.045, 0.045, 0.055),
        'glass': (1.5, 0.62, 0.16), 'glow': (2.8, 0.95, 0.22),
        'concrete': (0.33, 0.31, 0.31), 'concrete_dark': (0.21, 0.20, 0.21),
        'gold': (1.0, 0.70, 0.20), 'crystal': (0.30, 1.6, 1.75),
        'hazard': (0.95, 0.55, 0.10), 'window': (2.3, 0.85, 0.2),
        'leaf': (0.13, 0.36, 0.15), 'leaf2': (0.22, 0.42, 0.13), 'trunk': (0.3, 0.2, 0.13),
        'rock': (0.5, 0.48, 0.46), 'rock2': (0.4, 0.385, 0.37), 'cap': (0.2, 0.46, 0.17),
        'crystal_lit': (0.22, 1.25, 1.45),
    },
    2: {  # Neutral / derelict
        'lit': (1, 1, 1), 'lit_glow': (2.2, 2.2, 2.2),
        'team': (0.62, 0.52, 0.30), 'team_dark': (0.36, 0.29, 0.17),
        'panel': (0.50, 0.48, 0.44), 'panel_dark': (0.34, 0.33, 0.31),
        'metal': (0.36, 0.35, 0.34), 'gunmetal': (0.19, 0.19, 0.20), 'black': (0.06, 0.06, 0.07),
        'glass': (1.3, 1.05, 0.5), 'glow': (2.2, 1.7, 0.7),
        'concrete': (0.40, 0.39, 0.37), 'concrete_dark': (0.27, 0.26, 0.25),
        'gold': (1.0, 0.70, 0.20), 'crystal': (0.30, 1.6, 1.75),
        'hazard': (0.9, 0.68, 0.14), 'window': (1.9, 1.5, 0.6),
        'leaf': (0.13, 0.36, 0.15), 'leaf2': (0.22, 0.42, 0.13), 'trunk': (0.3, 0.2, 0.13),
        'rock': (0.5, 0.48, 0.46), 'rock2': (0.4, 0.385, 0.37), 'cap': (0.2, 0.46, 0.17),
        'crystal_lit': (0.22, 1.25, 1.45),
    },
}


def _slot_of(mat):
    """mat is a slot name, an (r,g,b) literal, or ('glow', (r,g,b)) for an emissive literal."""
    if isinstance(mat, str):
        return SLOT[mat], (1.0, 1.0, 1.0)
    if isinstance(mat, tuple) and len(mat) == 2 and mat[0] == 'glow':
        return SLOT['lit_glow'], tuple(mat[1])
    return SLOT['lit'], tuple(mat)


def glow(r, g, b):
    return ('glow', (r, g, b))


def _xf(at=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    if isinstance(scale, (int, float)):
        scale = (scale, scale, scale)
    m = Matrix.Translation(Vector(at)) @ Euler([math.radians(a) for a in rot], 'XYZ').to_matrix().to_4x4()
    return m @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0))


class Part:
    """One rigid piece of a model (hull, turret, rotor, a walk-cycle frame...)."""

    def __init__(self, name, role='body', pivot=(0, 0, 0), **meta):
        self.name = name
        self.role = role
        self.pivot = Vector(pivot)
        self.meta = meta
        self.bm = bmesh.new()
        self.l_slot = self.bm.faces.layers.int.new('slot')
        self.l_lit = self.bm.faces.layers.float_vector.new('lit')
        self.l_ao = self.bm.loops.layers.float.new('ao')
        self.l_noao = self.bm.faces.layers.int.new('noao')
        self._stack = [Matrix.Identity(4)]

    def at(self, at=(0, 0, 0), rot=(0, 0, 0), scale=1):
        """Context manager: primitives created inside are placed in this local frame (nestable)."""
        part = self

        class _Frame:
            def __enter__(self_inner):
                part._stack.append(part._stack[-1] @ _xf(at, rot, scale))
                return part

            def __exit__(self_inner, *exc):
                part._stack.pop()
                return False

        return _Frame()

    # ------------------------------------------------------------------ core
    def _add(self, coords, faces, mat, at=(0, 0, 0), rot=(0, 0, 0), scale=1, bevel=0.0, mirror=False,
             smooth=True, m=None, noao=False):
        bm = self.bm
        mtx = self._stack[-1] @ (m if m is not None else _xf(at, rot, scale))
        verts = [bm.verts.new(mtx @ Vector(c)) for c in coords]
        slot, lit = _slot_of(mat)
        new_faces = []
        for idx in faces:
            try:
                f = bm.faces.new([verts[i] for i in idx])
            except ValueError:
                continue
            new_faces.append(f)
        bmesh.ops.recalc_face_normals(bm, faces=new_faces)
        if bevel > 0:
            edges = list({e for f in new_faces for e in f.edges})
            before = set(bm.faces)
            bmesh.ops.bevel(bm, geom=edges, offset=bevel, offset_type='OFFSET', segments=1, profile=0.5, affect='EDGES', clamp_overlap=True)
            # bevel replaces faces: collect everything that belongs to this primitive
            vs = set()
            alive = [f for f in new_faces if f.is_valid]
            created = [f for f in bm.faces if f not in before]
            new_faces = list({*alive, *created})
            bmesh.ops.recalc_face_normals(bm, faces=new_faces)
        for f in new_faces:
            f[self.l_slot] = slot
            f[self.l_lit] = lit
            f[self.l_noao] = 1 if noao else 0
            f.smooth = smooth
        if mirror:
            geom = list({v for f in new_faces for v in f.verts}) + list({e for f in new_faces for e in f.edges}) + new_faces
            ret = bmesh.ops.duplicate(bm, geom=geom)
            dup_faces = [g for g in ret['geom'] if isinstance(g, bmesh.types.BMFace)]
            for v in [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]:
                v.co.x = -v.co.x
            bmesh.ops.reverse_faces(bm, faces=dup_faces)
            new_faces = new_faces + dup_faces
        return new_faces

    def paint(self, faces, mat, where=None):
        """Recolour some faces of a primitive: where(normal, center) -> bool."""
        slot, lit = _slot_of(mat)
        for f in faces:
            if not f.is_valid:
                continue
            if where is None or where(f.normal, f.calc_center_median()):
                f[self.l_slot] = slot
                f[self.l_lit] = lit
        return faces

    # ------------------------------------------------------------------ primitives
    def box(self, size, at=(0, 0, 0), mat='panel', bevel=0.0, rot=(0, 0, 0), mirror=False, **kw):
        """Axis-aligned box centred on `at`. size = (x, y, z)."""
        x, y, z = size[0] / 2, size[1] / 2, size[2] / 2
        co = [(-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z), (-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z)]
        fa = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        return self._add(co, fa, mat, at, rot, 1, bevel, mirror, **kw)

    def tbox(self, base, top, h, at=(0, 0, 0), mat='panel', shift=(0, 0), bevel=0.0, rot=(0, 0, 0), mirror=False, **kw):
        """Frustum: base=(x,y) rectangle at z=0, top=(x,y) rectangle at z=h (shifted by `shift`). `at` is the base centre."""
        bx, by = base[0] / 2, base[1] / 2
        tx, ty = top[0] / 2, top[1] / 2
        sx, sy = shift
        co = [(-bx, -by, 0), (bx, -by, 0), (bx, by, 0), (-bx, by, 0),
              (-tx + sx, -ty + sy, h), (tx + sx, -ty + sy, h), (tx + sx, ty + sy, h), (-tx + sx, ty + sy, h)]
        fa = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        return self._add(co, fa, mat, at, rot, 1, bevel, mirror, **kw)

    def prism(self, profile, length, axis='x', at=(0, 0, 0), mat='panel', taper=1.0, shift=(0, 0), bevel=0.0,
              rot=(0, 0, 0), mirror=False, **kw):
        """
        Extrude a 2D polygon.
          axis='x': profile is (y, z), extruded across X, centred on at.x
          axis='y': profile is (x, z), extruded along Y, centred on at.y
          axis='z': profile is (x, y), extruded up from at.z by `length`
        `taper` scales the far end of the extrusion about the profile origin; `shift` offsets it.
        """
        n = len(profile)
        co = []
        for end in (0, 1):
            k = 1.0 if end == 0 else taper
            for a, b in profile:
                a2 = a * k + (shift[0] if end else 0)
                b2 = b * k + (shift[1] if end else 0)
                if axis == 'x':
                    co.append(((-0.5 + end) * length, a2, b2))
                elif axis == 'y':
                    co.append((a2, (-0.5 + end) * length, b2))
                else:
                    co.append((a2, b2, end * length))
        fa = [tuple(range(n)), tuple(range(n, 2 * n))]
        for i in range(n):
            j = (i + 1) % n
            fa.append((i, j, n + j, n + i))
        return self._add(co, fa, mat, at, rot, 1, bevel, mirror, **kw)

    def cyl(self, r, h, at=(0, 0, 0), mat='metal', axis='z', seg=12, r2=None, bevel=0.0, rot=(0, 0, 0),
            mirror=False, phase=0.5, **kw):
        """Cylinder / cone centred on `at`, along `axis`. r2 = radius at the +axis end."""
        r2 = r if r2 is None else r2
        co = []
        for end, rr in ((0, r), (1, r2)):
            for i in range(seg):
                a = (i + phase) / seg * math.tau
                co.append((math.cos(a) * rr, math.sin(a) * rr, (-0.5 + end) * h))
        fa = [tuple(range(seg)), tuple(range(seg, 2 * seg))]
        for i in range(seg):
            j = (i + 1) % seg
            fa.append((i, j, seg + j, seg + i))
        base = {'z': (0, 0, 0), 'x': (0, 90, 0), 'y': (-90, 0, 0)}[axis]
        m = _xf(at, rot) @ _xf(rot=base)
        return self._add(co, fa, mat, bevel=bevel, mirror=mirror, m=m, **kw)

    def lathe(self, profile, at=(0, 0, 0), mat='metal', seg=12, axis='z', rot=(0, 0, 0), mirror=False, phase=0.5,
              scale=1, closed=False, **kw):
        """
        Revolve (r, z) points around the axis. r = 0 at either end closes the shape to a point.
        closed=True joins the last point back to the first (rings, ducts, hollow shrouds).
        """
        co = []
        rings = []
        for r, z in profile:
            if r <= 1e-6:
                rings.append([len(co)])
                co.append((0, 0, z))
            else:
                start = len(co)
                for i in range(seg):
                    a = (i + phase) / seg * math.tau
                    co.append((math.cos(a) * r, math.sin(a) * r, z))
                rings.append(list(range(start, start + seg)))
        fa = []
        if not closed:
            if len(rings[0]) > 1:
                fa.append(tuple(rings[0]))
            if len(rings[-1]) > 1:
                fa.append(tuple(rings[-1]))
        pairs = list(zip(rings, rings[1:]))
        if closed:
            pairs.append((rings[-1], rings[0]))
        for a, b in pairs:
            for i in range(seg):
                j = (i + 1) % seg
                if len(a) == 1 and len(b) == 1:
                    continue
                if len(a) == 1:
                    fa.append((a[0], b[j], b[i]))
                elif len(b) == 1:
                    fa.append((a[i], a[j], b[0]))
                else:
                    fa.append((a[i], a[j], b[j], b[i]))
        base = {'z': (0, 0, 0), 'x': (0, 90, 0), 'y': (-90, 0, 0)}[axis]
        m = _xf(at, rot, scale) @ _xf(rot=base)
        return self._add(co, fa, mat, mirror=mirror, m=m, **kw)

    def ico(self, r, at=(0, 0, 0), mat='metal', scale=(1, 1, 1), rot=(0, 0, 0), subdiv=1, mirror=False, jitter=0.0,
            seed=0, **kw):
        """Faceted blob (rocks, crystals, foliage). `jitter` displaces vertices for an organic look."""
        tmp = bmesh.new()
        bmesh.ops.create_icosphere(tmp, subdivisions=subdiv, radius=r)
        rnd = random.Random(seed)
        co = []
        for v in tmp.verts:
            c = v.co.copy()
            if jitter:
                c *= 1 + (rnd.random() - 0.5) * 2 * jitter
            co.append(tuple(c))
        fa = [tuple(v.index for v in f.verts) for f in tmp.faces]
        tmp.free()
        kw.setdefault('smooth', False)
        return self._add(co, fa, mat, at, rot, scale, mirror=mirror, **kw)

    def sphere(self, r, at=(0, 0, 0), mat='metal', seg=12, rings=6, scale=(1, 1, 1), rot=(0, 0, 0), mirror=False, **kw):
        prof = [(0, -r)] + [(math.sin(i / rings * math.pi) * r, -math.cos(i / rings * math.pi) * r) for i in range(1, rings)] + [(0, r)]
        return self.lathe(prof, at, mat, seg, rot=rot, mirror=mirror, scale=scale, **kw)

    def dome(self, r, at=(0, 0, 0), mat='metal', seg=12, rings=4, squash=1.0, **kw):
        """Half sphere sitting on z = at.z."""
        prof = [(math.cos(i / rings * math.pi / 2) * r, math.sin(i / rings * math.pi / 2) * r * squash) for i in range(rings)] + [(0, r * squash)]
        return self.lathe(prof, at, mat, seg, **kw)

    def ring(self, r_out, r_in, h, at=(0, 0, 0), mat='metal', seg=12, **kw):
        """Hollow cylinder (annulus) centred on `at`."""
        prof = [(r_in, -h / 2), (r_out, -h / 2), (r_out, h / 2), (r_in, h / 2)]
        return self.lathe(prof, at, mat, seg, closed=True, **kw)

    def pipe(self, points, r, mat='metal', seg=6, mirror=False, closed=False, **kw):
        """Tube along a polyline with mitred corners."""
        pts = [Vector(p) for p in points]
        n = len(pts)
        co = []
        up = Vector((0, 0, 1))
        prev_x = None
        for i, p in enumerate(pts):
            if closed:
                d0 = (p - pts[i - 1]).normalized()
                d1 = (pts[(i + 1) % n] - p).normalized()
            else:
                d0 = (p - pts[i - 1]).normalized() if i > 0 else (pts[1] - p).normalized()
                d1 = (pts[i + 1] - p).normalized() if i < n - 1 else d0
            t = (d0 + d1)
            t = t.normalized() if t.length > 1e-6 else d1
            ref = up if abs(t.dot(up)) < 0.95 else Vector((1, 0, 0))
            x = t.cross(ref).normalized()
            if prev_x is not None:
                # keep the frame from flipping between segments
                x2 = (prev_x - t * prev_x.dot(t))
                if x2.length > 1e-6:
                    x = x2.normalized()
            prev_x = x
            y = t.cross(x).normalized()
            # widen at mitres so the tube keeps its thickness through a bend
            cosh = max(0.35, math.sqrt(max(0.0, (1 + d0.dot(d1)) / 2)))
            for k in range(seg):
                a = (k + 0.5) / seg * math.tau
                co.append(tuple(p + (x * math.cos(a) + y * math.sin(a)) * (r / cosh)))
        fa = []
        rings = n if closed else n - 1
        for i in range(rings):
            a0 = i * seg
            b0 = ((i + 1) % n) * seg
            for k in range(seg):
                j = (k + 1) % seg
                fa.append((a0 + k, a0 + j, b0 + j, b0 + k))
        if not closed:
            fa.append(tuple(range(seg)))
            fa.append(tuple(range((n - 1) * seg, n * seg)))
        return self._add(co, fa, mat, mirror=mirror, **kw)

    # ------------------------------------------------------------------ helpers
    def bounds(self):
        xs = [v.co for v in self.bm.verts]
        if not xs:
            return Vector((0, 0, 0)), Vector((0, 0, 0))
        lo = Vector((min(v.x for v in xs), min(v.y for v in xs), min(v.z for v in xs)))
        hi = Vector((max(v.x for v in xs), max(v.y for v in xs), max(v.z for v in xs)))
        return lo, hi

    def transform(self, at=(0, 0, 0), rot=(0, 0, 0), scale=1):
        bmesh.ops.transform(self.bm, matrix=_xf(at, rot, scale), verts=self.bm.verts[:])
        return self


class Model:
    """A named set of parts plus the metadata the game needs to animate them."""

    def __init__(self, name, kind='unit', ground=True, ao_dist=1.6, ao_strength=0.8, ground_z=0.0, **meta):
        self.name = name
        self.kind = kind
        self.ground = ground
        self.ground_z = ground_z
        self.ao_dist = ao_dist
        self.ao_strength = ao_strength
        self.meta = meta
        self.parts = []

    def part(self, name='body', role='body', pivot=(0, 0, 0), **meta):
        p = Part(name, role, pivot, **meta)
        self.parts.append(p)
        return p

    # ------------------------------------------------------------------ baking
    def finish(self, seed=7):
        """Triangulate and bake ambient occlusion into every part."""
        for p in self.parts:
            bmesh.ops.triangulate(p.bm, faces=p.bm.faces[:], quad_method='BEAUTY', ngon_method='BEAUTY')
            p.bm.normal_update()
        # Occluders: body-role parts always; other parts only occlude themselves and receive from the body.
        static = [p for p in self.parts if p.role in ('body', 'turret', 'barrel')]
        tree_all = self._bvh(static if static else self.parts)
        dirs = _hemisphere(28, seed)
        for p in self.parts:
            tree = tree_all if p in static else self._bvh([q for q in self.parts if q.role == 'body'] + [p])
            self._bake(p, tree, dirs)
        return self

    def _bvh(self, parts):
        verts = []
        polys = []
        for p in parts:
            base = len(verts)
            p.bm.verts.ensure_lookup_table()
            for i, v in enumerate(p.bm.verts):
                v.index = i
                verts.append(v.co.copy())
            for f in p.bm.faces:
                polys.append([base + v.index for v in f.verts])
        if self.ground:
            base = len(verts)
            g = 60
            z = self.ground_z
            verts += [Vector((-g, -g, z)), Vector((g, -g, z)), Vector((g, g, z)), Vector((-g, g, z))]
            polys.append([base, base + 1, base + 2, base + 3])
        return BVHTree.FromPolygons(verts, polys, all_triangles=False, epsilon=0.0)

    def _bake(self, part, tree, dirs):
        D = self.ao_dist
        strength = self.ao_strength
        ao = part.l_ao
        for f in part.bm.faces:
            if f[part.l_noao] or SLOTS[f[part.l_slot]] in EMISSIVE:
                for l in f.loops:
                    l[ao] = 1.0
                continue
            n = f.normal
            # tangent frame
            t = n.cross(Vector((0, 0, 1)))
            if t.length < 1e-4:
                t = n.cross(Vector((1, 0, 0)))
            t.normalize()
            b = n.cross(t)
            c = f.calc_center_median()
            for l in f.loops:
                o = l.vert.co.lerp(c, 0.22) + n * 0.012
                occ = 0.0
                for dx, dy, dz in dirs:
                    d = t * dx + b * dy + n * dz
                    hit = tree.ray_cast(o, d, D)
                    if hit[0] is not None:
                        occ += 1.0 - (hit[3] / D) ** 0.6
                v = 1.0 - (occ / len(dirs))
                v = max(0.0, min(1.0, v)) ** 1.25
                l[ao] = 1.0 - strength * (1.0 - v)


def _hemisphere(n, seed):
    """Cosine-weighted directions in the +Z hemisphere (deterministic)."""
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        u = (i + rnd.random()) / n
        v = rnd.random()
        r = math.sqrt(u)
        a = v * math.tau
        out.append((r * math.cos(a), r * math.sin(a), math.sqrt(max(0.0, 1 - u))))
    return out


# ----------------------------------------------------------------------------- shape helpers
def ngon(n, r, phase=0.5, sx=1.0, sy=1.0):
    """Regular polygon footprint for prism(axis='z')."""
    return [(math.cos((i + phase) / n * math.tau) * r * sx, math.sin((i + phase) / n * math.tau) * r * sy) for i in range(n)]


def rect(w, d, chamfer=0.0):
    """Rectangle footprint with optional chamfered corners."""
    x, y = w / 2, d / 2
    c = chamfer
    if c <= 0:
        return [(-x, -y), (x, -y), (x, y), (-x, y)]
    return [(-x + c, -y), (x - c, -y), (x, -y + c), (x, y - c), (x - c, y), (-x + c, y), (-x, y - c), (-x, -y + c)]
