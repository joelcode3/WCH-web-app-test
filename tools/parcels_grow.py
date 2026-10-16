#!/usr/bin/env python3
"""
Parzellen etwas größer zeichnen: kleinere Lücken zwischen Nachbarn, Abstand zu den Wegen bleibt.

Läuft NACH tools/plan_import.py und überschreibt die Umrisse in js/plan-data.js.
Jede Kante, die einer Nachbarparzelle gegenüberliegt (ohne Weg dazwischen), rückt gerade nach
außen, bis die Lücke ca. TARGET_GAP beträgt (höchstens MAX_SHIFT je Kante). Kanten, die dadurch
näher an einen Weg kämen, bleiben stehen. Läuft nur einmal je Import (Merker „grown“ in plan-data.js).
In der App: „Daten → Neue Umrisse übernehmen“ überträgt die Umrisse auf den Bestand.

Aufruf:  python3 tools/parcels_grow.py
"""
import json, math, re
from pathlib import Path
from shapely.geometry import Polygon, LineString
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
TARGET_GAP = 3.0   # Kartenpixel (1 px = 0,2 m) → ca. 0,6 m Lücke
MAX_SHIFT = 4.0    # höchstens 0,8 m je Kante
REACH = 16.0       # Nachbarn bis 3,2 m Abstand gelten als „gegenüber“


def load_roads(svg):
    roads = []
    for g in re.findall(r'<g fill="#d9d6ce"[^>]*>(.*?)</g>', svg, re.S):
        for d in re.findall(r'd="([^"]+)"', g):
            geom = None
            for sub in re.findall(r'M[^M]+', d):
                pts = [tuple(map(float, p)) for p in re.findall(r'(-?[\d.]+) (-?[\d.]+)', sub)]
                if len(pts) < 3:
                    continue
                pg = Polygon(pts).buffer(0)
                geom = pg if geom is None else geom.symmetric_difference(pg)
            if geom is not None:
                roads.append(geom)
    return unary_union(roads)


def normal(a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy) or 1.0
    return dy / length, -dx / length   # Ring gegen den Uhrzeigersinn: außen = rechts


def grow(P, others, road):
    coords = list(P.exterior.coords)[:-1]
    edges = [(coords[i], coords[(i + 1) % len(coords)]) for i in range(len(coords))]
    shifts = []
    for a, b in edges:
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy)
        if length < 2:
            shifts.append(0.0)
            continue
        n = normal(a, b)
        sweep = lambda d: Polygon([a, b, (b[0] + n[0] * d, b[1] + n[1] * d), (a[0] + n[0] * d, a[1] + n[1] * d)])
        probe = sweep(REACH)
        best = 0.0
        for Q in others:
            hit = probe.intersection(Q)
            if hit.is_empty or hit.area < 1 or hit.geom_type != 'Polygon':
                continue
            proj = [((x - a[0]) * dx + (y - a[1]) * dy) / length for x, y in hit.exterior.coords]
            cover = (min(length, max(proj)) - max(0.0, min(proj))) / length
            gap = LineString([a, b]).distance(Q)
            if cover < 0.35 or gap > REACH or sweep(gap).intersects(road.buffer(1.0)):
                continue   # kaum gegenüber, zu weit weg oder ein Weg dazwischen
            s = max(0.0, min(MAX_SHIFT, (gap - TARGET_GAP) / 2))
            best = s if best == 0 else min(best, s)
        if best > 0 and sweep(best).distance(road) < min(P.distance(road), 25) - 0.2:
            best = 0.0   # käme näher an einen Weg
        shifts.append(best)
    # neue Ecken = Schnittpunkt der beiden verschobenen Nachbarkanten
    pts = []
    for k in range(len(edges)):
        na, nb = normal(*edges[k - 1]), normal(*edges[k])
        da, db = shifts[k - 1], shifts[k]
        det = na[0] * nb[1] - na[1] * nb[0]
        if abs(det) < 1e-3:
            s = max(da, db)
            ux, uy = na[0] * s, na[1] * s
        else:
            ux = (da * nb[1] - db * na[1]) / det
            uy = (na[0] * db - nb[0] * da) / det
            if math.hypot(ux, uy) > 3 * MAX_SHIFT:
                ux, uy = 0.0, 0.0
        pts.append((coords[k][0] + ux, coords[k][1] + uy))
    N = Polygon(pts).buffer(0)
    return N if N.geom_type == 'Polygon' and N.area >= P.area else P


def main():
    path = ROOT / 'js' / 'plan-data.js'
    src = path.read_text(encoding='utf-8')
    head, body = src[:src.index('{')], src[src.index('{'):src.rindex('}') + 1]
    data = json.loads(body)
    if data.get('grown'):
        print('Schon vergrößert – erst tools/plan_import.py neu ausführen.')
        return
    road = load_roads((ROOT / 'assets' / 'platzplan.svg').read_text(encoding='utf-8'))
    polys = []
    for p in data['parcels']:
        pg = Polygon(p['geometry']).buffer(0)
        if not pg.exterior.is_ccw:
            pg = Polygon(list(pg.exterior.coords)[::-1])
        polys.append(pg)
    out = [grow(P, [Q for j, Q in enumerate(polys) if j != i and Q.distance(P) < REACH], road) for i, P in enumerate(polys)]
    for p, N in zip(data['parcels'], out):
        p['geometry'] = [[round(x, 1), round(y, 1)] for x, y in list(N.exterior.coords)[:-1]]
    data['grown'] = True
    path.write_text(head + json.dumps(data, separators=(',', ':'), ensure_ascii=False) + ';\n', encoding='utf-8')
    gain = sum(o.area for o in out) / sum(p.area for p in polys) - 1
    print(f'{sum(1 for P, N in zip(polys, out) if N.area > P.area + 0.5)} Parzellen vergrößert, Fläche gesamt +{gain * 100:.1f} %')


if __name__ == '__main__':
    main()
