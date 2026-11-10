"""Preview sheets and HUD portraits rendered straight from the kit models."""
import math
import os

import bpy
from mathutils import Vector

from .export import to_objects


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.view_settings.view_transform = 'Standard'
    try:
        sc.view_settings.look = 'None'
    except TypeError:
        pass
    sc.render.film_transparent = False
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    sc.world = world
    return sc


def _world(sc, color, strength):
    bg = sc.world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (*color, 1)
    bg.inputs[1].default_value = strength


def _sun(sc, rot, energy, color=(1, 0.96, 0.9), angle=6.0):
    l = bpy.data.lights.new('sun', 'SUN')
    l.energy = energy
    l.color = color
    l.angle = math.radians(angle)
    o = bpy.data.objects.new('sun', l)
    o.rotation_euler = [math.radians(a) for a in rot]
    sc.collection.objects.link(o)
    return o


def _camera(sc, loc, target, ortho=None, lens=50):
    cam = bpy.data.cameras.new('cam')
    if ortho:
        cam.type = 'ORTHO'
        cam.ortho_scale = ortho
    else:
        cam.lens = lens
    cam.clip_start = 0.1
    cam.clip_end = 2000
    o = bpy.data.objects.new('cam', cam)
    o.location = loc
    d = Vector(target) - Vector(loc)
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.collection.objects.link(o)
    sc.camera = o
    return o


def _eevee(sc, samples=32):
    ee = sc.eevee
    for attr, val in (('taa_render_samples', samples), ('use_shadows', True), ('use_raytracing', False), ('use_gtao', True)):
        if hasattr(ee, attr):
            try:
                setattr(ee, attr, val)
            except Exception:
                pass


def _bbox(model):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for p in model.parts:
        if p.role in ('walk', 'cargo'):
            continue
        a, b = p.bounds()
        for i in range(3):
            lo[i] = min(lo[i], a[i])
            hi[i] = max(hi[i], b[i])
    return lo, hi


def render_sheet(models, path, team=0, fit=False, cols=None, size=(1800, 1100), view=(0, 56), ground=(0.045, 0.05, 0.065), yaw=-145):
    """Lay the models out on a grid and render one three-quarter picture."""
    sc = reset_scene()
    _world(sc, (0.55, 0.62, 0.75), 0.32)
    _sun(sc, (48, 0, 150), 2.5)
    _sun(sc, (60, 0, -40), 0.5, color=(0.6, 0.75, 1.0))
    _eevee(sc)
    n = len(models)
    cols = min(n, cols or max(1, math.ceil(math.sqrt(n * 1.6))))
    spans = []
    tall = 1.0
    boxes = []
    for m in models:
        lo, hi = _bbox(m)
        boxes.append((lo, hi))
        spans.append(max(math.hypot(hi.x - lo.x, hi.y - lo.y), 1.0))
        tall = max(tall, hi.z)
    cell = max(spans) * 1.08
    rows = math.ceil(n / cols)
    cyaw, syaw = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    for i, m in enumerate(models):
        lo, hi = boxes[i]
        ox, oy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
        cx = (i % cols - (cols - 1) / 2) * cell - (ox * cyaw - oy * syaw)
        cy = -((i // cols) - (rows - 1) / 2) * cell - (ox * syaw + oy * cyaw)
        k = cell / (spans[i] * 1.08) if fit else 1.0
        if fit:
            cx = (i % cols - (cols - 1) / 2) * cell - (ox * cyaw - oy * syaw) * k
            cy = -((i // cols) - (rows - 1) / 2) * cell - (ox * syaw + oy * cyaw) * k
            tall = max(tall, hi.z * k)
        root, _ = to_objects(m, team=team if not isinstance(team, (list, tuple)) else team[i], at=(cx, cy, 0), yaw=math.radians(yaw))
        root.scale = (k, k, k)
    # ground
    me = bpy.data.meshes.new('ground')
    g = cell * max(cols, rows) * 2
    me.from_pydata([(-g, -g, 0), (g, -g, 0), (g, g, 0), (-g, g, 0)], [], [(0, 1, 2, 3)])
    gm = bpy.data.materials.new('ground')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*ground, 1)
    gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9
    me.materials.append(gm)
    sc.collection.objects.link(bpy.data.objects.new('ground', me))
    az, el = math.radians(view[0]), math.radians(view[1])
    dist = 200
    w = cols * cell
    h = rows * cell
    loc = (math.sin(az) * math.sin(el) * dist, -math.cos(az) * math.sin(el) * dist, math.cos(el) * dist)
    sc.render.resolution_x, sc.render.resolution_y = size
    aspect = size[0] / size[1]
    need_w = math.hypot(w * math.cos(az), h * math.sin(az)) if n > 1 else w
    need_w = max(need_w, abs(w * math.cos(az)) + abs(h * math.sin(az))) * 1.02
    need_h = ((abs(w * math.sin(az)) + abs(h * math.cos(az))) * math.cos(el) + tall * math.sin(el)) * 1.04
    tz = tall * 0.45
    loc = (loc[0], loc[1], loc[2] + tz)
    _camera(sc, loc, (0, 0, tz), ortho=max(need_w, need_h * aspect))
    sc.render.filepath = path
    sc.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)


def render_icon(model, path, team=0, size=256, yaw=-140, elev=58):
    """A HUD portrait: transparent background, model framed to fill the tile."""
    sc = reset_scene()
    sc.render.film_transparent = True
    _world(sc, (0.6, 0.7, 0.9), 0.75)
    _sun(sc, (50, 0, 150), 4.0)
    _sun(sc, (65, 0, -40), 1.2, color=(0.55, 0.75, 1.0))
    _eevee(sc, 48)
    to_objects(model, team=team, yaw=math.radians(yaw))
    lo, hi = _bbox(model)
    # rotate bbox corners by yaw to find a tight framing
    cy, sy = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    el = math.radians(elev)
    cam_dir = Vector((0, -math.sin(el), math.cos(el)))
    right = Vector((1, 0, 0))
    up = cam_dir.cross(right).normalized() * -1
    us, vs = [], []
    for x in (lo.x, hi.x):
        for y in (lo.y, hi.y):
            for z in (lo.z, hi.z):
                p = Vector((x * cy - y * sy, x * sy + y * cy, z))
                us.append(p.dot(right))
                vs.append(p.dot(up))
    cu = (min(us) + max(us)) / 2
    cv = (min(vs) + max(vs)) / 2
    span = max(max(us) - min(us), max(vs) - min(vs)) * 1.06
    center = right * cu + up * cv
    _camera(sc, center + cam_dir * 150, center, ortho=span)
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.filepath = path
    ext = os.path.splitext(path)[1].lower()
    sc.render.image_settings.file_format = 'WEBP' if ext == '.webp' else 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    if ext == '.webp':
        sc.render.image_settings.quality = 90
    bpy.ops.render.render(write_still=True)
