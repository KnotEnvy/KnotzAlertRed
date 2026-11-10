"""Model registry: each model is a function that fills in a kit Model."""
import time

from .kit import Model

_REGISTRY = []


def model(name, kind='unit', **opts):
    """
    Register a model builder. Options are forwarded to kit.Model (ground, ao_dist, ao_strength)
    and anything else lands in the model's metadata (icon, team, ...).
    """
    def deco(fn):
        _REGISTRY.append((name, kind, fn, opts))
        return fn
    return deco


def names():
    return [r[0] for r in _REGISTRY]


def build_all(only=None):
    out = []
    for name, kind, fn, opts in _REGISTRY:
        o = dict(opts)
        factions = o.pop('factions', False)
        kw = {k: o.pop(k) for k in ('ground', 'ao_dist', 'ao_strength', 'ground_z') if k in o}
        if kind == 'building':
            kw.setdefault('ao_dist', 3.2)
            kw.setdefault('ground_z', -0.3)
        # a faction variant is exported as `name@team` and wins over the shared model in game
        for faction in ((0, 1) if factions else (0,)):
            full = f'{name}@{faction}' if faction else name
            if only and full not in only and not (faction and name in only and f'{name}@0' not in only):
                continue
            t = time.time()
            meta = dict(o)
            if faction:
                meta.pop('icon', None)
                meta['team'] = faction
            m = Model(f'{name}@{faction}' if faction else name, kind, **kw, **meta)
            m.faction = faction
            fn(m)
            m.finish()
            tris = sum(len(p.bm.faces) for p in m.parts)
            print(f'[kz]   {m.name:<18} {len(m.parts)} parts {tris:>6} tris  {time.time() - t:.2f}s')
            out.append(m)
    return out
