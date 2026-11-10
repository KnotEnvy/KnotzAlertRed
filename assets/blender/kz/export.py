"""Turns kit Models into the game's binary model pack and into Blender objects for previews."""
import json
import math
import struct

import bpy
import numpy as np

from .kit import EMISSIVE, PALETTES, SLOTS

SHARP_ANGLE = math.radians(38)
MAGIC = 0x504D5A4B  # 'KZMP'
VERSION = 1


def part_arrays(part):
    """Per-corner arrays for one part, in Blender space (pivot already subtracted)."""
    me = bpy.data.meshes.new('tmp')
    part.bm.to_mesh(me)
    me.set_sharp_from_angle(angle=SHARP_ANGLE)
    nl = len(me.loops)
    nf = len(me.polygons)
    nv = len(me.vertices)
    pos = np.empty(nv * 3, dtype=np.float32)
    me.vertices.foreach_get('co', pos)
    pos = pos.reshape(nv, 3)
    cv = np.empty(nl, dtype=np.int32)
    me.loops.foreach_get('vertex_index', cv)
    nrm = np.empty(nl * 3, dtype=np.float32)
    me.corner_normals.foreach_get('vector', nrm)
    nrm = nrm.reshape(nl, 3)
    slot = np.empty(nf, dtype=np.int32)
    me.attributes['slot'].data.foreach_get('value', slot)
    lit = np.empty(nf * 3, dtype=np.float32)
    me.attributes['lit'].data.foreach_get('vector', lit)
    lit = lit.reshape(nf, 3)
    ao = np.empty(nl, dtype=np.float32)
    me.attributes['ao'].data.foreach_get('value', ao)
    bpy.data.meshes.remove(me)
    assert nl == nf * 3, 'part must be triangulated'
    c_pos = pos[cv] - np.array(part.pivot, dtype=np.float32)
    c_slot = np.repeat(slot, 3)
    c_rgb = np.repeat(lit, 3, axis=0) * ao[:, None]
    return c_pos, nrm, c_slot, c_rgb


def _dedupe(c_pos, c_nrm, c_slot, c_rgb):
    n8 = np.clip(np.round(c_nrm * 127), -127, 127).astype(np.int8)
    rgb8 = np.clip(np.round(c_rgb * 255), 0, 255).astype(np.uint8)
    rec = np.zeros(len(c_pos), dtype=[('p', np.float32, 3), ('n', np.int8, 3), ('s', np.uint8), ('c', np.uint8, 3)])
    rec['p'] = np.round(c_pos, 4)
    rec['n'] = n8
    rec['s'] = c_slot
    rec['c'] = rgb8
    uniq, inv = np.unique(rec, return_inverse=True)
    return uniq, inv.astype(np.uint32)


def write_pack(models, path):
    """models: list of finished kit Models."""
    blob = bytearray()

    def put(arr):
        off = len(blob)
        blob.extend(arr.tobytes())
        while len(blob) % 4:
            blob.append(0)
        return off

    manifest = {
        'version': VERSION,
        'slots': SLOTS,
        'emissive': [s in EMISSIVE for s in SLOTS],
        'palettes': {str(k): [list(v[s]) for s in SLOTS] for k, v in PALETTES.items()},
        'models': {},
    }
    total_v = 0
    total_t = 0
    for m in models:
        parts = []
        for p in m.parts:
            uniq, idx = _dedupe(*part_arrays(p))
            # Blender (x right, y forward, z up, right-handed) -> game (x right, y up, z forward, left-handed)
            pos = uniq['p'][:, [0, 2, 1]].astype(np.float32)
            nrm = uniq['n'][:, [0, 2, 1]]
            ns = np.concatenate([nrm, uniq['s'][:, None].astype(np.int8)], axis=1).astype(np.int8)
            col = np.concatenate([uniq['c'], np.full((len(uniq), 1), 255, dtype=np.uint8)], axis=1)
            tri = idx  # Babylon is left-handed and Blender right-handed: the axis swap already flips winding to match
            idx32 = len(uniq) > 65535
            lo = pos.min(axis=0)
            hi = pos.max(axis=0)
            parts.append({
                'name': p.name,
                'role': p.role,
                'pivot': [round(float(p.pivot.x), 4), round(float(p.pivot.z), 4), round(float(p.pivot.y), 4)],
                'meta': p.meta,
                'vcount': int(len(uniq)),
                'icount': int(len(tri)),
                'pos': put(pos),
                'ns': put(ns),
                'col': put(col),
                'idx': put(tri.astype(np.uint32 if idx32 else np.uint16)),
                'idx32': bool(idx32),
                'min': [round(float(v), 3) for v in lo],
                'max': [round(float(v), 3) for v in hi],
            })
            total_v += len(uniq)
            total_t += len(tri) // 3
        manifest['models'][m.name] = {'kind': m.kind, 'meta': m.meta, 'parts': parts}
    js = json.dumps(manifest, separators=(',', ':')).encode('utf8')
    while len(js) % 4:
        js += b' '
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', MAGIC, VERSION, len(js)))
        f.write(js)
        f.write(blob)
    return total_v, total_t, 12 + len(js) + len(blob)


# ----------------------------------------------------------------------------- preview objects
_MAT = None


def preview_material():
    global _MAT
    existing = bpy.data.materials.get('kz_vertex')   # looked up by name: resetting the scene frees old datablocks
    if existing:
        return existing
    mat = bpy.data.materials.new('kz_vertex')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    col = nt.nodes.new('ShaderNodeAttribute')
    col.attribute_name = 'Col'
    emit = nt.nodes.new('ShaderNodeAttribute')
    emit.attribute_name = 'Emit'
    mul = nt.nodes.new('ShaderNodeMixRGB')
    mul.blend_type = 'MULTIPLY'
    mul.inputs[0].default_value = 1.0
    nt.links.new(col.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(col.outputs['Color'], mul.inputs[1])
    nt.links.new(emit.outputs['Color'], mul.inputs[2])
    nt.links.new(mul.outputs[0], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 1.0
    bsdf.inputs['Roughness'].default_value = 0.62
    bsdf.inputs['Specular IOR Level'].default_value = 0.35
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    _MAT = mat
    return mat


def to_objects(model, team=0, collection=None, at=(0, 0, 0), yaw=0.0):
    """Instantiate a model as Blender objects with resolved colours (for previews and portraits)."""
    pal = PALETTES[team]
    coll = collection or bpy.context.scene.collection
    root = bpy.data.objects.new(model.name, None)
    root.location = at
    root.rotation_euler = (0, 0, yaw)
    coll.objects.link(root)
    objs = []
    for p in model.parts:
        if p.role in ('walk', 'cargo') or p.meta.get('hide_preview'):
            if not p.meta.get('show_preview'):
                continue
        me = bpy.data.meshes.new(f'{model.name}_{p.name}')
        p.bm.to_mesh(me)
        me.set_sharp_from_angle(angle=SHARP_ANGLE)
        nf = len(me.polygons)
        nl = len(me.loops)
        slot = np.empty(nf, dtype=np.int32)
        me.attributes['slot'].data.foreach_get('value', slot)
        lit = np.empty(nf * 3, dtype=np.float32)
        me.attributes['lit'].data.foreach_get('vector', lit)
        ao = np.empty(nl, dtype=np.float32)
        me.attributes['ao'].data.foreach_get('value', ao)
        base = np.array([pal[s] for s in SLOTS], dtype=np.float32)[slot]
        em = np.array([1.0 if s in EMISSIVE else 0.0 for s in SLOTS], dtype=np.float32)[slot]
        rgb = np.repeat(base * lit.reshape(nf, 3), 3, axis=0) * ao[:, None]
        rgba = np.concatenate([rgb, np.ones((nl, 1), dtype=np.float32)], axis=1)
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        ca.data.foreach_set('color', rgba.reshape(-1))
        e = np.repeat(em, 3)
        ea = me.color_attributes.new('Emit', 'FLOAT_COLOR', 'CORNER')
        ea.data.foreach_set('color', np.stack([e, e, e, np.ones_like(e)], axis=1).reshape(-1))
        me.materials.append(preview_material())
        ob = bpy.data.objects.new(me.name, me)
        ob.parent = root
        coll.objects.link(ob)
        objs.append(ob)
    return root, objs
