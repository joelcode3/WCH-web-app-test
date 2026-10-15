/*
 * Osterei: Ein kleines Dreirad mit Kabine und Pritsche fährt ab und zu über den Platz.
 *
 * - Große Runde: von der Einfahrt unten über die Wege, den Hauptweg entlang und diagonal
 *   über die große Wiese zum oberen Ausgang.
 * - Kurzer Sprint: nur schnell über den Hauptweg.
 * Erscheint einmal pro Besuch nach ein paar Minuten auf der Map und danach gelegentlich.
 * Sofort starten: dreimal schnell auf das Tannen-Logo oben links tippen.
 *
 * Koordinaten in Kartenpixeln des Lageplans (1 Pixel = 0,2 m).
 */
(function () {
  'use strict';

  const ROUTES = {
    gross: {
      speed: 46,   // Kartenpixel pro Sekunde (≈ 33 km/h)
      points: [
        [428, 1790], [428, 1600], [415, 1545], [372, 1505], [342, 1470], [337, 1415], [352, 1375],
        [392, 1350], [440, 1320], [462, 1285], [457, 1150], [462, 1045], [480, 1000], [510, 980],
        [800, 980], [1150, 979], [1255, 976],
        // diagonal über die große Wiese
        [1420, 760], [1560, 560], [1615, 440], [1650, 385],
        [1700, 377], [1800, 377],
      ],
    },
    sprint: {
      speed: 95,
      points: [[470, 1030], [510, 981], [800, 980], [1150, 979], [1262, 975], [1290, 930], [1290, 860]],
    },
  };

  // Draufsicht: Pritsche hinten, Kabine vorne (Fahrtrichtung rechts); ca. 3,2 × 1,5 m
  const SVG = `<svg viewBox="0 0 64 32" aria-hidden="true">
    <rect x="9" y="0" width="9" height="4" rx="1.5" fill="#222"/><rect x="9" y="28" width="9" height="4" rx="1.5" fill="#222"/>
    <rect x="2" y="3" width="36" height="26" rx="2" fill="#b98a55" stroke="#6f4a26" stroke-width="1.6"/>
    <g stroke="#9c7041" stroke-width="1.2"><path d="M4 10H36M4 16H36M4 22H36"/></g>
    <path d="M38 5h12c8 0 12 5 12 11s-4 11-12 11H38z" fill="#2f8f83" stroke="#1d5d55" stroke-width="1.6"/>
    <rect x="40" y="8" width="9" height="16" rx="2" fill="#3fa596"/>
    <path d="M52 8c4 1.5 6 4.5 6 8s-2 6.5-6 8z" fill="#28343b"/>
    <rect x="49" y="2" width="3" height="3" rx="1" fill="#1d5d55"/><rect x="49" y="27" width="3" height="3" rx="1" fill="#1d5d55"/>
  </svg>`;

  // Ecken abrunden (Chaikin), damit das Dreirad weich abbiegt
  function smooth(pts, rounds) {
    let p = pts;
    for (let r = 0; r < rounds; r++) {
      const out = [p[0]];
      for (let i = 0; i < p.length - 1; i++) {
        const [a, b] = [p[i], p[i + 1]];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      out.push(p[p.length - 1]);
      p = out;
    }
    return p;
  }

  const Easter = {
    active: null,
    run(name = 'gross') {
      const MapView = window.MapView;
      if (this.active || !MapView || !MapView.map || document.hidden) return false;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
      const route = ROUTES[name] || ROUTES.gross;
      const pts = smooth(route.points, 3);
      const segs = [];
      let total = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        segs.push({ a: pts[i], b: pts[i + 1], l, start: total });
        total += l;
      }
      const H = window.APP_CONFIG.map.height;
      const ll = (p) => L.latLng(H - p[1], p[0]);
      const marker = L.marker(ll(pts[0]), {
        icon: L.divIcon({ className: '', html: `<div class="easter-trike" title="Tuk tuk!"><div class="easter-body">${SVG}</div></div>`, iconSize: [0, 0] }),
        interactive: true, keyboard: false, zIndexOffset: 2000,
      }).addTo(MapView.map);
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        const t = document.getElementById('toast');
        if (t) { t.textContent = 'Tuk tuk!'; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => { t.hidden = true; }, 1600); }
      });
      const t0 = performance.now();
      let angle = null;
      const step = (now) => {
        if (!this.active) return;
        const d = ((now - t0) / 1000) * route.speed;
        if (d >= total || !MapView.map.hasLayer(marker)) { this.stop(); return; }
        let s = segs.find((x) => d < x.start + x.l) || segs[segs.length - 1];
        const k = s.l ? (d - s.start) / s.l : 0;
        const p = [s.a[0] + (s.b[0] - s.a[0]) * k, s.a[1] + (s.b[1] - s.a[1]) * k];
        // Blickrichtung weich nachführen
        const target = Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]) * 180 / Math.PI;
        if (angle === null) angle = target;
        let diff = ((target - angle + 540) % 360) - 180;
        angle += diff * 0.25;
        marker.setLatLng(ll(p));
        const el = marker.getElement();
        if (el) {
          const body = el.firstChild && el.firstChild.firstChild;
          const scale = Math.max(1.3, Math.pow(2, MapView.map.getZoom()));
          if (body) body.style.transform = `translate(-50%, -50%) rotate(${angle.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
        }
        this.raf = requestAnimationFrame(step);
      };
      this.active = { marker };
      this.raf = requestAnimationFrame(step);
      return true;
    },
    stop() {
      if (!this.active) return;
      cancelAnimationFrame(this.raf);
      this.active.marker.remove();
      this.active = null;
    },

    // gelegentlich von selbst: einmal nach 2–4 Minuten, danach alle 8–15 Minuten (meist der Sprint)
    schedule(first) {
      const wait = first ? 120000 + Math.random() * 120000 : 480000 + Math.random() * 420000;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        const onMap = !document.getElementById('view-karte').hidden;
        const busy = window.MapView && (MapView.mode || MapView.editMode);
        if (onMap && !busy) this.run(first || Math.random() < 0.35 ? 'gross' : 'sprint');
        this.schedule(false);
      }, wait);
    },

    init() {
      // dreimal schnell auf das Logo tippen → sofort losfahren
      const logo = document.querySelector('.brand .tree');
      let taps = [];
      if (logo) logo.addEventListener('click', () => {
        const now = Date.now();
        taps = taps.filter((t) => now - t < 900).concat(now);
        if (taps.length >= 3) { taps = []; setTimeout(() => this.run('gross'), 300); }
      });
      this.schedule(true);
    },
  };

  window.Easter = Easter;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => Easter.init());
  else Easter.init();
})();
