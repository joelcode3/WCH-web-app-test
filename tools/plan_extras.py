#!/usr/bin/env python3
"""
Zusätzliche Flächen im Lageplan (nach Skizzen des Betreibers): Schotter/Wege, Bäume, Gewässer,
Spielplatz, Seilbahn, Shelter, Hundewiese, Terrasse, Flugzeug, weitere Gebäude.

Eingabe   tools/plan_extras.json  (Koordinaten in Kartenpixeln, 1 px = 0,2 m)
Ausgabe   fügt eine Gruppe <g id="extras"> in assets/platzplan.svg ein (ersetzt eine vorhandene).
Danach    node tools/render_plan.js  (PNG neu rendern)
Reihenfolge nach einem neuen Plan-Import: plan_import.py → parcels_grow.py → plan_extras.py → render_plan.js
"""
import argparse
import json
import math
import random
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def pts(p):
    return ' '.join(f'{x:.1f},{y:.1f}' for x, y in p)


def smooth_path(p, closed=False):
    """Weiche Kurve durch die Punkte (Catmull-Rom → Bézier)."""
    n = len(p)
    if n < 3:
        return 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in p) + (' Z' if closed else '')
    get = (lambda i: p[i % n]) if closed else (lambda i: p[max(0, min(n - 1, i))])
    d = [f'M{p[0][0]:.1f} {p[0][1]:.1f}']
    for i in range(n if closed else n - 1):
        p0, p1, p2, p3 = get(i - 1), get(i), get(i + 1), get(i + 2)
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d.append(f'C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}')
    return ' '.join(d) + (' Z' if closed else '')


def tree(x, y, r, rnd, style):
    if style == 'B':   # Krone mit gewelltem Rand
        k = 9
        ring = []
        for i in range(k):
            a = 2 * math.pi * i / k + rnd.random() * 0.3
            ring.append((x + math.cos(a) * r * 0.82, y + math.sin(a) * r * 0.82))
        bumps = ''.join(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="{r * 0.38:.1f}"/>' for px, py in ring)
        return (f'<g fill="#4f7f42" stroke="#3a6431" stroke-width="0.8">{bumps}'
                f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r * 0.85:.1f}" stroke="none"/></g>'
                f'<circle cx="{x - r * 0.25:.1f}" cy="{y - r * 0.25:.1f}" r="{r * 0.35:.1f}" fill="#6b9a57"/>')
    # A: runde Krone mit Schatten und Licht
    return (f'<circle cx="{x + r * 0.25:.1f}" cy="{y + r * 0.3:.1f}" r="{r:.1f}" fill="#2f4a2a" opacity="0.22"/>'
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="#4f7f42" stroke="#3d6834" stroke-width="0.8"/>'
            f'<circle cx="{x - r * 0.28:.1f}" cy="{y - r * 0.28:.1f}" r="{r * 0.5:.1f}" fill="#62924f"/>')


def playground(cx, cy, r):
    s = [f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#sand)" stroke="#d3bd85" stroke-width="1.2"/>']
    # Karussell (rot)
    x, y = cx - r * 0.42, cy - r * 0.3
    s.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="5.5" fill="#d9483b" stroke="#9e2f26" stroke-width="0.7"/>')
    s.append(f'<path d="M{x - 5.5:.1f} {y:.1f}h11 M{x:.1f} {y - 5.5:.1f}v11" stroke="#fff" stroke-width="0.9"/>')
    s.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="1.4" fill="#fff"/>')
    # Wippe (gelb)
    x, y = cx + r * 0.38, cy - r * 0.42
    s.append(f'<rect x="{x - 8:.1f}" y="{y - 1.2:.1f}" width="16" height="2.4" rx="1" fill="#e9b52a" stroke="#a87d14" stroke-width="0.5" transform="rotate(-20 {x:.1f} {y:.1f})"/>')
    s.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="1.6" fill="#7a5b10"/>')
    # Klettergerüst (blau)
    x, y = cx + r * 0.25, cy + r * 0.28
    s.append(f'<rect x="{x - 6:.1f}" y="{y - 6:.1f}" width="12" height="12" fill="none" stroke="#2f6fc4" stroke-width="1.3"/>')
    s.append(f'<path d="M{x - 2:.1f} {y - 6:.1f}v12 M{x + 2:.1f} {y - 6:.1f}v12 M{x - 6:.1f} {y - 2:.1f}h12 M{x - 6:.1f} {y + 2:.1f}h12" stroke="#2f6fc4" stroke-width="0.6"/>')
    # Schaukel (grün)
    x, y = cx - r * 0.38, cy + r * 0.4
    s.append(f'<path d="M{x - 8:.1f} {y:.1f}h16" stroke="#3a8f4b" stroke-width="1.6" stroke-linecap="round"/>')
    s.append(f'<rect x="{x - 5.5:.1f}" y="{y + 2:.1f}" width="3.5" height="2" fill="#3a8f4b"/><rect x="{x + 2:.1f}" y="{y + 2:.1f}" width="3.5" height="2" fill="#3a8f4b"/>')
    return ''.join(s)


def ropeway(a, b):
    (x1, y1), (x2, y2) = a, b
    s = [f'<path d="M{x1} {y1} L{x2} {y2}" stroke="#3d4a55" stroke-width="1"/>']
    for (x, y), d in (((x1, y1), -1), ((x2, y2), 1)):   # Y-förmige Abspannung wie in der Skizze
        s.append(f'<path d="M{x} {y} l{6 * d} -6 M{x} {y} l{6 * d} 6" stroke="#3d4a55" stroke-width="1"/>')
        s.append(f'<rect x="{x - 2}" y="{y - 2}" width="4" height="4" fill="#7a5a3a"/>')
    s.append(f'<circle cx="{x1 + (x2 - x1) * 0.3:.1f}" cy="{y1 + (y2 - y1) * 0.3:.1f}" r="2" fill="#e05a2b"/>')
    return ''.join(s)


def airplane(x, y, rot=0, scale=1.0):
    # Draufsicht Kleinflugzeug, Nase nach oben, ca. 9 m lang / 10 m Spannweite (1 px = 0,2 m)
    body = ('M0 -23 C2.6 -23 3.2 -18 3.2 -12 L3.2 14 L2 21 L-2 21 L-3.2 14 L-3.2 -12 C-3.2 -18 -2.6 -23 0 -23 Z')
    wing = 'M-25 -8 L25 -8 L25 -2 L-25 -2 Z'
    tail = 'M-9 15 L9 15 L9 19 L-9 19 Z'
    return (f'<g transform="translate({x} {y}) rotate({rot}) scale({scale})">'
            f'<g transform="translate(1.5 2)" fill="#2f3a30" opacity="0.2"><path d="{wing}"/><path d="{body}"/><path d="{tail}"/></g>'
            f'<g fill="#f3f3f0" stroke="#7d848a" stroke-width="0.8"><path d="{wing}"/><path d="{tail}"/><path d="{body}"/></g>'
            f'<path d="M-1.8 -15 h3.6 v4 h-3.6 z" fill="#8fb3cc"/>'
            f'<path d="M-25 -8 h4 v6 h-4 z M21 -8 h4 v6 h-4 z" fill="#c8453a"/></g>')


def build(F, tree_style='A'):
    rnd = random.Random(7)
    g = ['<g id="extras">',
         '<defs>'
         '<pattern id="schotter" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#e3ddcf"/>'
         '<circle cx="2" cy="3" r="0.7" fill="#c9c0ab"/><circle cx="7" cy="7" r="0.6" fill="#c9c0ab"/><circle cx="6" cy="1.5" r="0.5" fill="#d2cab6"/></pattern>'
         '<pattern id="sand" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#f1e3b8"/>'
         '<circle cx="2" cy="2" r="0.5" fill="#dcc890"/><circle cx="6" cy="5" r="0.5" fill="#dcc890"/></pattern>'
         '<pattern id="hund" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="#d3e4b4"/>'
         '<path d="M4 12 l2 -4 M12 6 l1.5 -3" stroke="#bccf98" stroke-width="1.2"/></pattern>'
         '<pattern id="dielen" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#dcc196"/>'
         '<path d="M0 3.6h4" stroke="#bfa070" stroke-width="0.5"/></pattern>'
         '</defs>']
    # Schotterflächen und Wege
    edge = '#c3baa4'
    g.append(f'<g fill="url(#schotter)" stroke="{edge}" stroke-width="1.2" stroke-linejoin="round">')
    g += [f'<path d="{smooth_path(p, True)}"/>' for p in F['gravel']]
    g.append('</g>')
    for w, p in F['paths']:
        g.append(f'<path d="{smooth_path(p)}" fill="none" stroke="{edge}" stroke-width="{w * 5 + 2.4}" stroke-linecap="round" stroke-linejoin="round"/>')
    for w, p in F['paths']:
        g.append(f'<path d="{smooth_path(p)}" fill="none" stroke="#e3ddcf" stroke-width="{w * 5}" stroke-linecap="round" stroke-linejoin="round"/>')
    # Gewässer
    g += [f'<path d="{smooth_path(p, True)}" fill="#9ccbe3" stroke="#5f9fc2" stroke-width="1.4"/>' for p in F['ponds']]
    # Hundewiese (umzäunt)
    h = F['hundewiese']
    g.append(f'<polygon points="{pts(h)}" fill="url(#hund)"/>')
    g.append(f'<polygon points="{pts(h)}" fill="none" stroke="#7d6446" stroke-width="1.1"/>')
    g.append(f'<polygon points="{pts(h)}" fill="none" stroke="#7d6446" stroke-width="2.6" stroke-dasharray="0.01 8" stroke-linecap="round"/>')
    # Spielplatz
    g.append(playground(*F['spielplatz']))
    # Terrasse
    g += [f'<polygon points="{pts(p)}" fill="url(#dielen)" stroke="#9c7d55" stroke-width="1"/>' for p in F['terrace']]
    # Bäume
    for group in F['trees'].values():
        for x, y, r in group:
            g.append(tree(x, y, max(9.0, min(17.0, r * 1.05)), rnd, tree_style))
    # Gebäude wie im Plan
    g.append('<g fill="#c9a66b" stroke="#7a6a4f" stroke-width="1.5">')
    g += [f'<polygon points="{pts(p)}"/>' for p in F['buildings'].values()]
    g.append('</g>')
    # Shelter (hellgraue Quadrate)
    for x, y in F['shelter']:
        g.append(f'<rect x="{x - 7.5:.1f}" y="{y - 7.5:.1f}" width="15" height="15" fill="#d6d6d3" stroke="#9a9a96" stroke-width="1"/>')
    g.append(ropeway(*F['seilbahn']))
    g.append(airplane(*F['flugzeug']))
    g.append('</g>')
    return '\n'.join(g)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--trees', default='A', choices=['A', 'B'])
    ap.add_argument('--svg', default=str(ROOT / 'assets' / 'platzplan.svg'))
    args = ap.parse_args()
    F = json.loads((ROOT / 'tools' / 'plan_extras.json').read_text())
    svg = Path(args.svg).read_text()
    svg = re.sub(r'\n?<g id="extras">.*?</g>\n?(?=</svg>)', '', svg, flags=re.S)
    svg = svg.replace('</svg>', '\n' + build(F, args.trees) + '\n</svg>')
    Path(args.svg).write_text(svg)
    print('Extras in', args.svg, 'eingefügt')


if __name__ == '__main__':
    main()
