#!/usr/bin/env python3
"""Bake the real Mesa-Gilbert layout into web/geo.js.

Reads tools/osm/roads.json (OpenStreetMap, via Overpass: the canals and the
primary/secondary roads in the box below - re-fetch it with the query in
HANDOFF.md) and writes the few hundred numbers the game needs:

  - the mile-grid arterials, by real name and real position (a name can
    change part way along: Mesa Drive becomes McQueen Road at Baseline)
  - the two freeways, straightened (US-60 and Loop 101 are ruler-straight
    here anyway)
  - every canal, clipped to the map and simplified
  - the landmarks, by latitude and longitude

Everything is squeezed 5x: a real mile is about 320 m in the game, so the
drive from Watson's on Main Street to Grandpa's in Gilbert is about a
minute flat out instead of fifteen. Street widths are not squeezed - only
the distances between things.

The neighbourhoods between the arterials are not real: map.js invents them
from a seed. OpenStreetMap data is (c) OpenStreetMap contributors, ODbL.
"""
import json, math, os, statistics as st

HERE = os.path.dirname(os.path.abspath(__file__))
SQUEEZE = 5.0
W, E, N, S = -111.905, -111.728, 33.4290, 33.3290      # the box
LAT0 = (N + S) / 2
MX = math.cos(math.radians(LAT0)) * 111320 / SQUEEZE   # game metres per degree of longitude
MZ = 110540 / SQUEEZE                                    # ... per degree of latitude

def gx(lon): return round((lon - W) * MX, 1)
def gz(lat): return round((N - lat) * MZ, 1)

d = json.load(open(os.path.join(HERE, 'osm', 'roads.json')))

# ---- arterials: median position of every named primary/secondary line
ns, ew = {}, {}
for e in d['elements']:
    t = e['tags']; n = t.get('name'); g = e.get('geometry', [])
    if 'waterway' in t or t.get('highway') == 'motorway' or not n or len(g) < 2: continue
    parts = n.split(' ', 1)
    base = parts[1] if parts[0] in ('North', 'South', 'East', 'West') else n
    lats = [p['lat'] for p in g]; lons = [p['lon'] for p in g]
    if max(lats) - min(lats) > max(lons) - min(lons):
        ns.setdefault(base, []).append((st.median(lons), min(lats), max(lats), len(g)))
    else:
        ew.setdefault(base, []).append((st.median(lats), min(lons), max(lons), len(g)))

def med(v): return st.median([a[0] for a in v for _ in range(a[3])])

# The mile roads that make the grid. A line keeps one position; where the
# real name changes part way down, the line carries both names with the
# latitude where it changes.
NS_LINES = [
    [('Dobson Road', None)],
    [('Alma School Road', None)],
    [('Country Club Drive', 33.364), ('Arizona Avenue', None)],
    [('Mesa Drive', 33.379), ('McQueen Road', None)],
    [('Stapley Drive', 33.379), ('Cooper Road', None)],
    [('Gilbert Road', None)],
    [('Lindsay Road', None)],
    [('Val Vista Drive', None)],
    [('Greenfield Road', None)],
]
EW_LINES = ['University Drive', 'Main Street', 'Broadway Road', 'Southern Avenue',
            'Baseline Road', 'Guadalupe Road', 'Elliot Road', 'Warner Road']

arts_ns = []
for line in NS_LINES:
    xs = [med(ns[name]) for name, _ in line if name in ns]
    x = gx(st.mean(xs))
    names = [{'name': name, 'z': gz(cut) if cut else None} for name, cut in line]
    arts_ns.append({'x': x, 'names': names})
arts_ew = [{'z': gz(med(ew[n])), 'names': [{'name': n, 'z': None}]} for n in EW_LINES]

# ---- freeways (straightened)
fwys = []
mot = [e for e in d['elements'] if e['tags'].get('highway') == 'motorway']
def mot_med(name, key):
    v = [p[key] for e in mot if e['tags'].get('name') == name for p in e['geometry']
         if W <= p['lon'] <= E and S <= p['lat'] <= N]
    return st.median(v)
fwys.append({'name': 'US 60 Superstition Freeway', 'axis': 'ew', 'z': gz(mot_med('Superstition Freeway', 'lat'))})
fwys.append({'name': 'Loop 101 Price Freeway', 'axis': 'ns', 'x': gx(mot_med('Price Freeway', 'lon'))})

# ---- canals: clip to the box, simplify, name by the longest named piece nearby
def simplify(pts, tol):
    if len(pts) < 3: return pts
    (x0, z0), (x1, z1) = pts[0], pts[-1]
    dx, dz = x1 - x0, z1 - z0; L = math.hypot(dx, dz) or 1e-9
    far, fi = -1, 0
    for i in range(1, len(pts) - 1):
        x, z = pts[i]
        dd = abs((x - x0) * dz - (z - z0) * dx) / L
        if dd > far: far, fi = dd, i
    if far <= tol: return [pts[0], pts[-1]]
    return simplify(pts[:fi + 1], tol)[:-1] + simplify(pts[fi:], tol)

canals = []
for e in d['elements']:
    t = e['tags']
    if t.get('waterway') != 'canal' or t.get('tunnel') or t.get('culvert'): continue
    g = e['geometry']
    pts = [(gx(p['lon']), gz(p['lat'])) for p in g if W <= p['lon'] <= E and S <= p['lat'] <= N]
    if len(pts) < 2: continue
    pts = simplify(pts, 2.0)
    canals.append({'name': t.get('name'), 'pts': [[round(x, 1), round(z, 1)] for x, z in pts]})

# join pieces end to end so a canal is one line where it can be
def join(cs):
    cs = [dict(c) for c in cs]
    changed = True
    while changed:
        changed = False
        for i in range(len(cs)):
            for j in range(len(cs)):
                if i == j or cs[i] is None or cs[j] is None: continue
                a, b = cs[i]['pts'], cs[j]['pts']
                if math.dist(a[-1], b[0]) < 16:
                    cs[i] = {'name': cs[i]['name'] or cs[j]['name'], 'pts': a + b[1:]}
                    cs[j] = None; changed = True
        cs = [c for c in cs if c]
    return cs
canals = join(canals)
# names the real map leaves blank
for c in canals:
    if c['name']: continue
    zs = [p[1] for p in c['pts']]; xs = [p[0] for p in c['pts']]
    if max(zs) - min(zs) < 30: c['name'] = 'Western Canal'
    else: c['name'] = 'Consolidated Canal'
canals = [c for c in canals if sum(math.dist(c['pts'][i], c['pts'][i + 1]) for i in range(len(c["pts"]) - 1)) > 120]

# ---- landmarks (latitude, longitude)
LM = {
    'watsons':   (33.41473, -111.88415, "Watson's Flowers, 2525 W Main St"),
    'grandpa':   (33.34804, -111.78635, "Grandpa's, 122 E Palo Verde St"),
    'temple':    (33.41276, -111.81967, 'Mesa Arizona Temple'),
    'neon':      (33.41560, -111.83350, 'The Neon Garden'),
    'artsctr':   (33.41416, -111.83029, 'Mesa Arts Center'),
    'tower':     (33.35460, -111.79073, 'Gilbert Water Tower'),
    'heritage':  (33.35860, -111.78950, 'Heritage District'),
    'riparian':  (33.36116, -111.73489, 'Riparian Preserve'),
    'freestone': (33.35890, -111.76879, 'Freestone Park'),
    'mcc':       (33.38977, -111.87021, 'Mesa Community College'),
    'dobranch':  (33.37153, -111.86306, 'Dobson Ranch'),
    'civic':     (33.33077, -111.78828, 'Gilbert Civic Center'),
}
lms = {k: {'x': gx(lon), 'z': gz(lat), 'label': lab} for k, (lat, lon, lab) in LM.items()}

out = {
    'note': 'Baked by tools/bake.py from OpenStreetMap (c) OpenStreetMap contributors, ODbL. Squeezed %gx.' % SQUEEZE,
    'squeeze': SQUEEZE,
    'size': [gx(E), gz(S)],
    'box': {'w': W, 'e': E, 'n': N, 's': S},
    'ns': arts_ns, 'ew': arts_ew, 'fwy': fwys, 'canals': canals, 'lm': lms,
}
js = ('/* Generated by tools/bake.py - do not edit by hand. Real Mesa-Gilbert\n'
      '   positions, squeezed 5x. Map data (c) OpenStreetMap contributors, ODbL. */\n'
      '(function(root){ root.WGEO = ' + json.dumps(out, separators=(',', ':')) + '; })(typeof window !== "undefined" ? window : globalThis);\n')
open(os.path.join(HERE, '..', 'web', 'geo.js'), 'w').write(js)
print('size %.0f x %.0f m, %d canals (%s), %d bytes' % (out['size'][0], out['size'][1], len(canals),
      ', '.join(sorted(set(c['name'] for c in canals))), len(js)))
for a in arts_ns: print('NS', a['x'], [n['name'] for n in a['names']])
for a in arts_ew: print('EW', a['z'], a['names'][0]['name'])
print(fwys)
for k, v in lms.items(): print(k, v['x'], v['z'])
