#!/usr/bin/env python3
"""
Lageplan-Import: wandelt den AutoCAD-Plan (PDF) in die Kartengrundlage der App um.

Eingaben
  --lines   SVG der Linienebene ohne Hintergrund (aus Plan 2):
              pdftocairo -svg Platzplan_2.pdf plan2.svg
  --aerial  Luftbild-JPEG aus dem PDF (aus Plan 4):
              pdfimages -j Platzplan_4.pdf luft   ->  luft-000.jpg

Farben im Plan
  rot    = äußere Grundstücksgrenze      blau   = Wege / Straßen (Randlinien)
  grün   = Gebäude                       orange = Parzellengrenzen

Ausgaben (im Projektordner)
  assets/platzplan.svg   gezeichneter Lageplan im App-Stil (Wald, Wiese, Wege, Gebäude)
  assets/luftbild.jpg    passend zugeschnittenes Luftbild (zuschaltbar)
  js/plan-data.js        Parzellenumrisse (vereinfacht, mit Lücken) + Vorschlag Nummerierung

Benötigt: Python 3, shapely, pillow
"""
import argparse
import json
import re
from pathlib import Path

from PIL import Image
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import nearest_points, polygonize, split, unary_union

COLORS = {
    'rgb(100%, 0%, 0%)': 'red',
    'rgb(0%, 0%, 100%)': 'blue',
    'rgb(0%, 100%, 24.705505%)': 'green',
    'rgb(100%, 74.900818%, 0%)': 'orange',
}

# Seitentransformationen aus dem PDF (pdftocairo-SVG)
VEC = (0.12, 14.0, 547.0)                 # Seite = (0.12*x + 14, 547 - 0.12*y)
IMG = (0.184783, 136.76, 88.0)            # Seite = (136.76 + 0.184783*u, 88 + 0.184783*v)

# Kartenausschnitt in CAD-Einheiten (1 Einheit ≈ 10 cm) und Maßstab der Karte
EXTENT = (1240.0, 120.0, 4750.0, 3650.0)  # minx, miny, maxx, maxy
SCALE = 0.5                               # Kartenpixel je CAD-Einheit
INSET = 9.0                               # halbe Lücke zwischen Parzellen (CAD-Einheiten)
SPLIT_Y = 2300.0                          # oberhalb = Platz 2, unterhalb = Platz 1
LINE_GAP = 2.0                            # Lücken zwischen Wegrandlinien bis ~4 Einheiten überbrücken
ROAD_MIN_AREA = 20000.0                   # kleinere schmale Flächen sind Grasinseln, keine Wege


def parse_lines(svg_text):
    out = {c: [] for c in COLORS.values()}
    for m in re.finditer(r'<path [^>]*stroke="(rgb\([^)]*\))"[^>]*d="([^"]*)"', svg_text):
        col = COLORS.get(m.group(1))
        if not col:
            continue
        toks = re.findall(r'[A-Za-z]|-?\d+\.?\d*', m.group(2))
        pts, subs, cur, i = [], [], None, 0
        while i < len(toks):
            t = toks[i]
            if t.isalpha():
                cur = t
                i += 1
                if t in 'Zz' and pts:
                    pts.append(pts[0])
                continue
            if cur == 'M':
                if len(pts) > 1:
                    subs.append(pts)
                pts = [(float(toks[i]), float(toks[i + 1]))]
                i += 2
                cur = 'L'
            elif cur == 'L':
                pts.append((float(toks[i]), float(toks[i + 1])))
                i += 2
            elif cur == 'C':
                # Bézierkurve fein abtasten (Bögen an Kreuzungen und Wendekreisen)
                x0, y0 = pts[-1]
                x1, y1, x2, y2, x3, y3 = (float(t) for t in toks[i:i + 6])
                for k in range(1, 9):
                    t = k / 8
                    a_, b_, c_, d_ = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3
                    pts.append((a_ * x0 + b_ * x1 + c_ * x2 + d_ * x3, a_ * y0 + b_ * y1 + c_ * y2 + d_ * y3))
                i += 6
            else:
                raise SystemExit(f'Unbekannter Pfadbefehl: {cur}')
        if len(pts) > 1:
            subs.append(pts)
        out[col].extend(LineString(s) for s in subs)
    return out


def to_map(x, y):
    minx, _, _, maxy = EXTENT
    return (round((x - minx) * SCALE, 1), round((maxy - y) * SCALE, 1))


def ring_to_map(ring):
    return [list(to_map(x, y)) for x, y in list(ring.coords)[:-1]]


def svg_path(poly):
    parts = []
    for ring in [poly.exterior, *poly.interiors]:
        pts = [to_map(x, y) for x, y in ring.coords]
        parts.append('M' + ' L'.join(f'{x} {y}' for x, y in pts) + ' Z')
    return ' '.join(parts)


def polys_of(geom):
    if geom.is_empty:
        return []
    return list(geom.geoms) if hasattr(geom, 'geoms') else [geom]


def from_map(x, y):
    minx, _, _, maxy = EXTENT
    return (x / SCALE + minx, maxy - y / SCALE)


# Manuelle Korrekturen nach Rückmeldung vom Platz (Koordinaten in Kartenpixeln).
#   ('cut', Punkt in der Parzelle, Schnittlinie)  → Parzelle entlang der Linie teilen
#   ('add', Rechteck x1, y1, x2, y2)              → neue Parzelle auf freier Wiese (ohne Wege/Nachbarn)
#   ('clip', Punkt in der Parzelle, Rechteck)     → Parzelle auf das Rechteck zuschneiden
EDITS = [
    ('add', (303.5, 1104.5, 380.0, 1178.5)),                    # neu rechts neben 1.28 (bis zum Weg)
    ('cut', (970, 425), [(975.6, 300), (975.6, 466)]),            # 2.30 senkrecht teilen
    ('cut', (800, 430), [(700, 466.5), (900, 466.5)]),            # 2.44 waagerecht teilen
    ('add', (824.9, 465.8, 879.0, 543.0)),                      # neu links neben 2.47
    # 2.38 in 4 Parzellen; Grenzen treffen sich in der Mitte des Wendehammers (≈ 603.5 / 467.5)
    ('cut', (520, 500), [(380, 462), (720, 462)]),
    ('cut', (620, 510), [(603.5, 440), (603.5, 600)]),
    ('cut', (450, 510), [(496, 440), (496, 600)]),
    ('add', (590.0, 380.0, 676.0, 469.0)),                      # neu links neben 2.27 (oben rechts am Wendehammer)
    ('clip', (290, 550), (0, 0, 302.0, 2000)),                 # 2.25 ohne Fortsatz oben, so schmal wie 2.24 unten
]


def apply_edits(raw, site, road_union):
    for op, *args in EDITS:
        if op == 'cut':
            pt = Point(*from_map(*args[0]))
            line = LineString([from_map(*c) for c in args[1]])
            hit = next((p for p in raw if p.contains(pt)), None)
            if hit is None:
                print(f'Hinweis: keine Parzelle bei {args[0]} gefunden – Schnitt übersprungen')
                continue
            pieces = [g for g in polys_of(split(hit, line)) if g.area > 300]
            raw = [p for p in raw if p is not hit] + pieces
        elif op == 'clip':
            pt = Point(*from_map(*args[0]))
            hit = next((p for p in raw if p.contains(pt)), None)
            if hit is None:
                print(f'Hinweis: keine Parzelle bei {args[0]} gefunden – Zuschnitt übersprungen')
                continue
            x1, y1, x2, y2 = args[1]
            (ax, ay), (bx, by) = from_map(x1, y1), from_map(x2, y2)
            rect = Polygon([(ax, ay), (bx, ay), (bx, by), (ax, by)])
            cut = max(polys_of(hit.intersection(rect)), key=lambda g: g.area, default=None)
            raw = [p for p in raw if p is not hit] + ([cut] if cut is not None and cut.area > 1500 else [])
        elif op == 'add':
            x1, y1, x2, y2 = args[0]
            (ax, ay), (bx, by) = from_map(x1, y1), from_map(x2, y2)
            rect = Polygon([(ax, ay), (bx, ay), (bx, by), (ax, by)])
            free = rect.intersection(site).difference(unary_union(raw))
            if road_union is not None:
                free = free.difference(road_union)
            best = max(polys_of(free), key=lambda g: g.area, default=None)
            if best is None or best.area < 1500:
                print(f'Hinweis: zu wenig freie Fläche bei {args[0]}')
                continue
            raw.append(best)
    return raw


def cluster(values, tol):
    """Gruppiert sortierte Werte, deren Abstand < tol ist → Gruppenindex je Wert."""
    groups, last, gi = {}, None, -1
    for v in sorted(values):
        if last is None or v - last > tol:
            gi += 1
        groups[v] = gi
        last = v
    return groups


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--lines', required=True)
    ap.add_argument('--aerial', required=True)
    ap.add_argument('--out', default=str(Path(__file__).resolve().parent.parent))
    args = ap.parse_args()
    out = Path(args.out)

    L = parse_lines(Path(args.lines).read_text())

    # Wege: Flächen, die von den blauen Randlinien eingeschlossen werden. Die CAD-Linien
    # berühren sich an Kreuzungen nicht exakt → Linien minimal verbreitern (überbrückt
    # Lücken bis ~2*LINE_GAP), Platzfläche damit zerschneiden, schmale Teilflächen = Wege.
    blue = unary_union(L['blue'])
    site_ = max(polygonize(unary_union(L['red'])), key=lambda p: p.area)
    pieces = polys_of(site_.difference(blue.buffer(LINE_GAP)))
    roads = [f.buffer(LINE_GAP + 0.5, join_style=2).simplify(1.0) for f in pieces
             if 2 * f.area / f.length < 50 and f.area > ROAD_MIN_AREA]
    road_union = unary_union(roads) if roads else None
    # Parzellen: nur geschlossene orange Flächen
    raw = []
    for p in polygonize(unary_union(L['orange'])):
        if p.area <= 1500:
            continue
        # Parzellen liegen nie auf Wegen: Wegfläche abziehen (z. B. Wendekreis)
        if road_union is not None:
            p = max(polys_of(p.difference(road_union)), key=lambda g: g.area, default=Polygon())
        if not p.is_empty and p.area >= 1500:
            raw.append(p)
    raw = apply_edits(raw, site_, road_union)

    parcels = []
    for p in raw:
        q = p.simplify(4).buffer(-INSET, join_style=2, mitre_limit=3).simplify(2)
        q = max(polys_of(q), key=lambda g: g.area) if not q.is_empty else None
        if q is None or q.area < 800:
            continue
        parcels.append({'poly': q, 'raw': p, 'area_m2': round(p.area * 0.01), 'c': p.representative_point()})

    # Nummerierung: blockweise. Aneinandergrenzende Parzellen bilden einen Block; Blöcke von
    # oben links nach unten rechts, innerhalb eines Blocks reihenweise (breiter Block) bzw.
    # spaltenweise (hoher Block). Reihen/Spalten über die Kante zum Weg (Ober- bzw. linke Kante).
    def numbered(group, by_columns=None):
        if not group:
            return []
        n = len(group)
        parent = list(range(n))
        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i
        for i in range(n):
            for j in range(i + 1, n):
                if group[i]['raw'].buffer(2).intersects(group[j]['raw']):
                    parent[find(i)] = find(j)
        blocks = {}
        for i in range(n):
            blocks.setdefault(find(i), []).append(group[i])
        blocks = list(blocks.values())
        def bbox(items):
            b = [g['raw'].bounds for g in items]
            return (min(x[0] for x in b), min(x[1] for x in b), max(x[2] for x in b), max(x[3] for x in b))
        tops = cluster([round(-bbox(b)[3]) for b in blocks], 120)
        blocks.sort(key=lambda b: (tops[round(-bbox(b)[3])], bbox(b)[0]))
        out = []
        for b in blocks:
            x0, y0, x1, y1 = bbox(b)
            cols = (y1 - y0) > (x1 - x0)
            edge = (lambda g: round(g['raw'].bounds[0])) if cols else (lambda g: round(-g['raw'].bounds[3]))
            cl = cluster([edge(g) for g in b], 40)
            out += sorted(b, key=lambda g: (cl[edge(g)], -g['raw'].bounds[3] if cols else g['raw'].bounds[0]))
        return out

    lower = numbered([g for g in parcels if g['c'].y < SPLIT_Y])
    upper = numbered([g for g in parcels if g['c'].y >= SPLIT_Y])
    for platz, group in ((1, lower), (2, upper)):
        for i, g in enumerate(group, 1):
            g['nr'] = f'{platz}.{i:02d}'

    # Gebäude: fast geschlossene Umrisse schließen (im CAD fehlt teils ein kurzes Kantenstück)
    green = []
    for l in L['green']:
        c = list(l.coords)
        if not l.is_closed and len(c) >= 4 and Point(c[0]).distance(Point(c[-1])) < 0.25 * l.length:
            l = LineString(c + [c[0]])
        green.append(l)
    buildings = [p for p in polygonize(unary_union(green)) if p.area > 200]
    # Überschneidungen: das untere Gebäude endet an der Kante des oberen
    buildings.sort(key=lambda b: b.centroid.y)
    clipped = []
    for i, b in enumerate(buildings):
        above = [o for o in buildings[i + 1:] if o.centroid.y > b.centroid.y + 50 and o.intersects(b)]
        if above:
            b = max(polys_of(b.difference(unary_union(above))), key=lambda g: g.area, default=b)
        clipped.append(b)
    buildings = clipped
    boundary_lines = unary_union(L['red'])
    site = max(polygonize(boundary_lines), key=lambda p: p.area)

    # Demo-Stromkästen: je ~6 Parzellen einer am nächstgelegenen Weg
    demo_boxes = []
    ordered = lower + upper
    for i in range(0, len(ordered), 6):
        chunk = ordered[i:i + 6]
        cx = sum(g['c'].x for g in chunk) / len(chunk)
        cy = sum(g['c'].y for g in chunk) / len(chunk)
        pt = Point(cx, cy)
        if road_union is not None:
            pt = nearest_points(road_union, pt)[0]
        demo_boxes.append(list(to_map(pt.x, pt.y)))

    W = round((EXTENT[2] - EXTENT[0]) * SCALE)
    H = round((EXTENT[3] - EXTENT[1]) * SCALE)

    # --- Lageplan-SVG im Stil der App ---
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">',
           '<!-- Erzeugt mit tools/plan_import.py aus dem AutoCAD-Lageplan. Nicht von Hand bearbeiten. -->',
           '<defs>',
           '<pattern id="wald" width="44" height="44" patternUnits="userSpaceOnUse"><rect width="44" height="44" fill="#5d8a4e"/>'
           '<circle cx="11" cy="11" r="10" fill="#4b7a3f"/><circle cx="33" cy="20" r="11" fill="#43703a"/>'
           '<circle cx="18" cy="35" r="9" fill="#527f44"/><circle cx="40" cy="41" r="6" fill="#4b7a3f"/></pattern>',
           '<pattern id="gras" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="#e4ebd5"/>'
           '<path d="M4 12 l2 -4 M12 6 l1.5 -3" stroke="#cfdcb9" stroke-width="1.2"/></pattern>',
           '</defs>',
           f'<rect width="{W}" height="{H}" fill="url(#wald)"/>',
           f'<path d="{svg_path(site)}" fill="url(#gras)" stroke="#9fb58a" stroke-width="2"/>']
    svg.append('<g fill="#d9d6ce" stroke="#b9b4a8" stroke-width="1.5">')
    svg += [f'<path d="{svg_path(r)}"/>' for r in roads]
    svg.append('</g>')
    svg.append('<g fill="#c9a66b" stroke="#7a6a4f" stroke-width="1.5">')
    svg += [f'<path d="{svg_path(b)}"/>' for b in buildings]
    svg.append('</g></svg>')
    (out / 'assets' / 'platzplan.svg').write_text('\n'.join(svg))

    # --- Luftbild zuschneiden ---
    k, ox, oy = IMG
    s, vx, vy = VEC
    def cad_to_img(x, y):
        return ((s * x + vx - ox) / k, (vy - s * y - oy) / k)
    u0, v0 = cad_to_img(EXTENT[0], EXTENT[3])
    u1, v1 = cad_to_img(EXTENT[2], EXTENT[1])
    im = Image.open(args.aerial).convert('RGB')
    crop = im.crop((round(u0), round(v0), round(u1), round(v1)))
    crop.save(out / 'assets' / 'luftbild.jpg', quality=78, optimize=True, progressive=True)

    # --- Parzellendaten für die App ---
    data = {
        'width': W, 'height': H, 'metersPerPixel': round(0.1 / SCALE, 3),
        'parcels': [{'nr': g['nr'], 'area': g['area_m2'], 'geometry': ring_to_map(g['poly'].exterior)}
                    for g in sorted(lower + upper, key=lambda g: (g['nr'].split('.')[0], int(g['nr'].split('.')[1])))],
        'demoBoxes': demo_boxes,
    }
    js = ('/* Erzeugt mit tools/plan_import.py aus dem AutoCAD-Lageplan – nicht von Hand bearbeiten. */\n'
          'window.PLAN_DATA = ' + json.dumps(data, separators=(',', ':')) + ';\n')
    (out / 'js' / 'plan-data.js').write_text(js)
    print(f'{len(parcels)} Parzellen ({len(lower)} auf Platz 1, {len(upper)} auf Platz 2), '
          f'{len(roads)} Wegflächen, {len(buildings)} Gebäude, Karte {W}x{H}px, Luftbild {crop.size}')


if __name__ == '__main__':
    main()
