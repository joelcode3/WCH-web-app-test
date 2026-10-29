#!/usr/bin/env python3
"""
Zusätzliche Flächen im Lageplan (nach Skizzen des Betreibers): Wege/Schotter, Bäume, Gewässer,
Spielplatz, Seilbahn, Shelter, Hundewiese, Terrasse, weitere Gebäude.
Das Flugzeug ist kein Teil des Plans: es ist ein Ort in der App (drehbar, verschiebbar).

Eingabe   tools/plan_extras.json  (Koordinaten in Kartenpixeln, 1 px = 0,2 m)
Ausgabe   fügt <g id="extras"> in assets/platzplan.svg ein (zwischen Wegen und Gebäuden, ersetzt eine vorhandene)
Danach    node tools/render_plan.js  (PNG neu rendern)
Reihenfolge nach einem neuen Plan-Import: plan_import.py → parcels_grow.py → plan_extras.py → render_plan.js

Benötigt: Python 3, shapely
"""
import argparse
import json
import math
import random
import re
from pathlib import Path

from shapely.geometry import LineString, Point, Polygon
from shapely.ops import nearest_points, unary_union

ROOT = Path(__file__).resolve().parent.parent
WALD_FARBEN = {'#5d8a4e': '#8fae80', '#4b7a3f': '#7fa271', '#43703a': '#789c6a', '#527f44': '#86a877'}
ROAD_FILL, ROAD_EDGE = '#d9d6ce', '#b9b4a8'   # wie die Wege aus plan_import.py


def spline(p, closed=False, steps=8):
    """Weiche Kurve durch die Punkte (Catmull-Rom), als Punktliste."""
    n = len(p)
    if n < 3:
        return [tuple(q) for q in p]
    get = (lambda i: p[i % n]) if closed else (lambda i: p[max(0, min(n - 1, i))])
    out = []
    for i in range(n if closed else n - 1):
        p0, p1, p2, p3 = get(i - 1), get(i), get(i + 1), get(i + 2)
        for k in range(steps):
            t = k / steps
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                                    + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    if not closed:
        out.append(tuple(p[-1]))
    return out


def polys_of(geom):
    if geom.is_empty:
        return []
    return list(geom.geoms) if hasattr(geom, 'geoms') else [geom]


def d_of(geom):
    parts = []
    for poly in polys_of(geom):
        for ring in [poly.exterior, *poly.interiors]:
            parts.append('M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in ring.coords[:-1]) + ' Z')
    return ' '.join(parts)


def pts(p):
    return ' '.join(f'{x:.1f},{y:.1f}' for x, y in p)


def parse_roads(svg):
    """Wegflächen aus dem Lageplan (Gruppe mit Wegfarbe) als Shapely-Geometrie + Original-Pfade."""
    m = re.search(rf'<g fill="{ROAD_FILL}"[^>]*>(.*?)</g>', svg, re.S)
    ds = re.findall(r'<path d="([^"]*)"', m.group(1))
    polys = []
    for d in ds:
        rings = []
        for sub in re.findall(r'M([^Z]*)Z', d):
            nums = [float(v) for v in re.findall(r'-?\d+\.?\d*', sub)]
            rings.append(Polygon(list(zip(nums[::2], nums[1::2]))).buffer(0))
        rings.sort(key=lambda r: -r.area)
        shape = rings[0]
        for r in rings[1:]:
            shape = shape.symmetric_difference(r)   # evenodd
        polys.append(shape)
    return unary_union(polys), ds


def tree(x, y, r, rnd):
    """Baum von oben: Krone mit gewelltem Rand (Variante B)."""
    k = 9
    ring = []
    off = rnd.random() * 2 * math.pi
    for i in range(k):
        a = off + 2 * math.pi * i / k + rnd.random() * 0.3
        ring.append((x + math.cos(a) * r * 0.82, y + math.sin(a) * r * 0.82))
    bumps = ''.join(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="{r * 0.38:.1f}"/>' for px, py in ring)
    # etwas blasser, damit Parzellen und Symbole auf der Map besser hervortreten
    shade = ['#7fa472', '#7a9f6d', '#84a978'][rnd.randrange(3)]
    return (f'<g fill="{shade}" stroke="#6b9160" stroke-width="0.8">{bumps}'
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r * 0.85:.1f}" stroke="none"/></g>'
            f'<circle cx="{x - r * 0.25:.1f}" cy="{y - r * 0.25:.1f}" r="{r * 0.35:.1f}" fill="#9cbe8e"/>')


def playground(shape, center):
    cx, cy = center
    s = [f'<path d="M{pts(spline(shape, True))} Z" fill="url(#sand)" stroke="#d3bd85" stroke-width="1.2" stroke-linejoin="round"/>']
    # Karussell (rot)
    x, y = cx - 17, cy - 9
    s.append(f'<circle cx="{x}" cy="{y}" r="5.5" fill="#d9483b" stroke="#9e2f26" stroke-width="0.7"/>')
    s.append(f'<path d="M{x - 5.5} {y}h11 M{x} {y - 5.5}v11" stroke="#fff" stroke-width="0.9"/><circle cx="{x}" cy="{y}" r="1.4" fill="#fff"/>')
    # Wippe (gelb)
    x, y = cx + 14, cy - 14
    s.append(f'<rect x="{x - 8}" y="{y - 1.2}" width="16" height="2.4" rx="1" fill="#e9b52a" stroke="#a87d14" stroke-width="0.5" transform="rotate(-20 {x} {y})"/>')
    s.append(f'<circle cx="{x}" cy="{y}" r="1.6" fill="#7a5b10"/>')
    # Klettergerüst (blau)
    x, y = cx + 15, cy + 10
    s.append(f'<rect x="{x - 6}" y="{y - 6}" width="12" height="12" fill="none" stroke="#2f6fc4" stroke-width="1.3"/>')
    s.append(f'<path d="M{x - 2} {y - 6}v12 M{x + 2} {y - 6}v12 M{x - 6} {y - 2}h12 M{x - 6} {y + 2}h12" stroke="#2f6fc4" stroke-width="0.6"/>')
    # Schaukel (grün)
    x, y = cx - 14, cy + 13
    s.append(f'<path d="M{x - 8} {y}h16" stroke="#3a8f4b" stroke-width="1.6" stroke-linecap="round"/>')
    s.append(f'<rect x="{x - 5.5}" y="{y + 2}" width="3.5" height="2" fill="#3a8f4b"/><rect x="{x + 2}" y="{y + 2}" width="3.5" height="2" fill="#3a8f4b"/>')
    return ''.join(s)


def ropeway(a, b):
    (x1, y1), (x2, y2) = a, b
    s = [f'<path d="M{x1} {y1} L{x2} {y2}" stroke="#3d4a55" stroke-width="1"/>']
    for (x, y), d in (((x1, y1), -1), ((x2, y2), 1)):   # Y-förmige Abspannung wie in der Skizze
        s.append(f'<path d="M{x} {y} l{6 * d} -6 M{x} {y} l{6 * d} 6" stroke="#3d4a55" stroke-width="1"/>')
        s.append(f'<rect x="{x - 2}" y="{y - 2}" width="4" height="4" fill="#7a5a3a"/>')
    s.append(f'<circle cx="{x1 + (x2 - x1) * 0.3:.1f}" cy="{y1 + (y2 - y1) * 0.3:.1f}" r="2" fill="#e05a2b"/>')
    return ''.join(s)


def ways(F, roads):
    """Schotterflächen und Wege als eine Fläche; Wegenden werden an Wege/Flächen in der Nähe angeschlossen."""
    gravel = [Polygon(spline(p, True)).buffer(0) for p in F['gravel']]
    lines = [(w, spline(p)) for w, p in F['paths']]
    out = list(gravel)
    for i, (w, line) in enumerate(lines):
        others = unary_union([roads, *gravel, *[LineString(l).buffer(ww * 2.5) for j, (ww, l) in enumerate(lines) if j != i]])
        line = list(line)
        for end in (0, -1):
            p = Point(line[end])
            if others.contains(p):
                continue
            q = nearest_points(others, p)[0]
            dist = p.distance(q)
            prev = line[1] if end == 0 else line[-2]
            seg = math.hypot(p.x - prev[0], p.y - prev[1]) or 1
            ux, uy = (q.x - p.x) / (dist or 1), (q.y - p.y) / (dist or 1)
            forward = (ux * (p.x - prev[0]) + uy * (p.y - prev[1])) / seg > 0.35   # nur in Wegrichtung verlängern
            if 0 < dist < 30 and forward:   # bis 6 m Lücke schließen, 1 m in die Fläche hinein
                tip = (q.x + ux * 5, q.y + uy * 5)
                if end == 0:
                    line.insert(0, tip)
                else:
                    line.append(tip)
        out.append(LineString(line).buffer(w * 2.5, cap_style=1, join_style=1))
    return unary_union(out)


def more_trees(F, blocked, rnd):
    """Wo viele Bäume skizziert sind (Wald), Lücken mit weiteren Bäumen füllen."""
    sketch = [t for g in F['trees'].values() for t in g]
    dense = []
    for x, y, _ in sketch:
        n = sum(1 for a, b, _ in sketch if 0 < math.hypot(a - x, b - y) < 95)
        if n >= 3:
            dense.append(Point(x, y).buffer(55))
    if not dense:
        return []
    area = unary_union(dense).difference(blocked)
    placed = [(x, y, r) for x, y, r in sketch]
    new = []
    minx, miny, maxx, maxy = area.bounds
    for _ in range(6000):
        x, y = rnd.uniform(minx, maxx), rnd.uniform(miny, maxy)
        r = rnd.uniform(8.5, 13.5)
        if not area.contains(Point(x, y).buffer(r * 0.6)):
            continue
        if any(math.hypot(a - x, b - y) < (r + max(9.0, min(17.0, rr * 1.05))) * 0.82 for a, b, rr in placed + new):
            continue
        new.append((x, y, r))
    return new


def build(F, svg, preview_plane=False):
    rnd = random.Random(7)
    roads, road_ds = parse_roads(svg)
    area = ways(F, roads)
    g = ['<g id="extras">',
         '<defs>'
         '<pattern id="sand" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#f1e3b8"/>'
         '<circle cx="2" cy="2" r="0.5" fill="#dcc890"/><circle cx="6" cy="5" r="0.5" fill="#dcc890"/></pattern>'
         '<pattern id="hund" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="#d3e4b4"/>'
         '<path d="M4 12 l2 -4 M12 6 l1.5 -3" stroke="#bccf98" stroke-width="1.2"/></pattern>'
         '<pattern id="dielen" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-3.8)"><rect width="4" height="4" fill="#dcc196"/>'
         '<path d="M0 3.6h4" stroke="#bfa070" stroke-width="0.5"/></pattern>'
         '</defs>']
    # Wege: Rand der neuen Flächen, Füllung, dann die alten Wegflächen ohne Rand darüber → nahtlose Übergänge
    g.append(f'<path d="{d_of(area)}" fill="{ROAD_FILL}" stroke="{ROAD_EDGE}" stroke-width="1.5" stroke-linejoin="round" fill-rule="evenodd"/>')
    g.append(f'<g fill="{ROAD_FILL}" fill-rule="evenodd">' + ''.join(f'<path d="{d}"/>' for d in road_ds) + '</g>')
    g.append(f'<path d="{d_of(area)}" fill="{ROAD_FILL}" fill-rule="evenodd"/>')
    # Gewässer
    g += [f'<path d="M{pts(spline(p, True))} Z" fill="#9ccbe3" stroke="#5f9fc2" stroke-width="1.4" stroke-linejoin="round"/>' for p in F['ponds']]
    # Hundewiese (umzäunt)
    h = F['hundewiese']
    g.append(f'<polygon points="{pts(h)}" fill="url(#hund)" stroke="#7d6446" stroke-width="1.1"/>')
    g.append(f'<polygon points="{pts(h)}" fill="none" stroke="#7d6446" stroke-width="2.6" stroke-dasharray="0.01 8" stroke-linecap="round"/>')
    # Spielplatz
    g.append(playground(F['spielplatz']['shape'], F['spielplatz']['center']))
    # Terrasse
    g += [f'<polygon points="{pts(p)}" fill="url(#dielen)" stroke="#9c7d55" stroke-width="1" stroke-linejoin="round"/>' for p in F['terrace']]
    # Bäume (skizzierte + aufgefüllter Wald)
    parcels = []
    pd = (ROOT / 'js' / 'plan-data.js').read_text()
    for p in json.loads(pd[pd.index('{'):pd.rindex('}') + 1])['parcels']:
        parcels.append(Polygon(p['geometry']))
    ends = [Point(p[e]) for _, p in F['paths'] for e in (0, -1)]   # Wegenden: dort stehen Unterkünfte
    blocked = unary_union([roads.buffer(4), area.buffer(5), *[Polygon(b).buffer(4) for b in F['buildings'].values()],
                           *[Polygon(p).buffer(4) for p in F['ponds']], Polygon(h).buffer(6),
                           Polygon(F['spielplatz']['shape']).buffer(6), *[pl.buffer(3) for pl in parcels],
                           *[Point(s).buffer(14) for s in F['shelter']], LineString(F['seilbahn']).buffer(8),
                           *[e.buffer(26) for e in ends], Point(F['flugzeug']['pos']).buffer(30)])
    if 'wald' not in F:   # einmal erzeugen und in der JSON festhalten (danach einzeln löschbar)
        sketch = [(x, y, max(9.0, min(17.0, r * 1.05))) for grp in F['trees'].values() for x, y, r in grp]
        F['wald'] = [[round(v, 1) for v in t] for t in sorted(sketch + more_trees(F, blocked, rnd), key=lambda t: t[1])]
    shapes = random.Random(11)
    for x, y, r in F['wald']:
        g.append(tree(x, y, r, shapes))
    # Gebäude wie im Plan
    g.append('<g fill="#c9a66b" stroke="#7a6a4f" stroke-width="1.5">')
    g += [f'<polygon points="{pts(p)}"/>' for p in F['buildings'].values()]
    g.append('</g>')
    # Shelter (hellgraue Quadrate)
    for x, y in F['shelter']:
        g.append(f'<rect x="{x - 7.5:.1f}" y="{y - 7.5:.1f}" width="15" height="15" fill="#d6d6d3" stroke="#9a9a96" stroke-width="1"/>')
    g.append(ropeway(*F['seilbahn']))
    if preview_plane:   # nur für Entwurfsbilder: in der App ist das Flugzeug ein drehbarer Ort
        x, y = F['flugzeug']['pos']
        g.append(f'<g transform="translate({x - 22.5} {y - 8.5}) rotate({F["flugzeug"]["rot"]} 22.5 8.5)">'
                 f'<svg width="45" height="17" viewBox="0 0 90 34">{(ROOT / "tools" / "fokker.svg").read_text()}</svg></g>')
    g.append('</g><!-- /extras -->')
    return '\n'.join(g)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--svg', default=str(ROOT / 'assets' / 'platzplan.svg'))
    ap.add_argument('--preview-plane', action='store_true')
    ap.add_argument('--neuer-wald', action='store_true', help='Bäume neu aus den Skizzen-Kringeln erzeugen')
    args = ap.parse_args()
    src = ROOT / 'tools' / 'plan_extras.json'
    F = json.loads(src.read_text())
    if args.neuer_wald:
        F.pop('wald', None)
    had = 'wald' in F
    svg = Path(args.svg).read_text()
    svg = re.sub(r'<g id="extras">.*?<!-- /extras -->\n', '', svg, flags=re.S)   # alte Extras entfernen
    # Waldhintergrund blasser (ältere Pläne aus plan_import.py hatten kräftigere Farben)
    for old, new in WALD_FARBEN.items():
        svg = svg.replace(f'fill="{old}"', f'fill="{new}"')
    mark = '<g fill="#c9a66b"'
    svg = svg.replace(mark, build(F, svg, args.preview_plane) + '\n' + mark, 1)
    Path(args.svg).write_text(svg)
    if not had:
        src.write_text(json.dumps(F, separators=(',', ':')))
    print('Extras in', args.svg, 'eingefügt')


if __name__ == '__main__':
    main()
