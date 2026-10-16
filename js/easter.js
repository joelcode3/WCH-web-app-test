/*
 * Osterei: Ein kleines Dreirad mit Kabine und Pritsche fährt ab und zu über den Platz.
 *
 * - Große Runde: von der Einfahrt unten über die Wege zum Hauptweg, dann mit ein paar wilden
 *   Schleifen diagonal über die breite Wiese, den rechten Weg hoch und oben raus.
 * - Kurzer Sprint: nur schnell über den Hauptweg.
 * Erscheint einmal pro Besuch nach ein paar Minuten auf der Map und danach gelegentlich.
 * Sofort starten: dreimal schnell auf das Tannen-Logo oben links tippen. Antippen des Dreirads hupt.
 *
 * Koordinaten in Kartenpixeln des Lageplans (1 Pixel = 0,2 m).
 */
(function () {
  'use strict';

  // Kreis-Schleife auf der Wiese (dir 1 = im Uhrzeigersinn auf dem Bildschirm, -1 = dagegen)
  function loop(cx, cy, r, start, dir) {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const a = (start + dir * i * 30) * Math.PI / 180;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;
  }

  const ROUTES = {
    gross: {
      speed: 46,   // Kartenpixel pro Sekunde (≈ 33 km/h)
      points: [
        // Einfahrt unten, zwischen den Gebäuden hoch zum Hauptweg
        [428, 1790], [428, 1600], [415, 1545], [372, 1505], [342, 1470], [337, 1415], [352, 1375],
        [392, 1350], [440, 1320], [462, 1285], [457, 1150], [462, 1045], [480, 1000], [510, 980],
        [600, 979], [650, 970],
        // wild und diagonal über die breite Wiese zwischen Hauptweg und oberem Querweg
        [720, 935], ...loop(790, 880, 55, 135, 1), [880, 800], [930, 730], [985, 750], [1010, 815],
        ...loop(1060, 860, 50, 180, -1), [1110, 830], [1150, 775], ...loop(1180, 735, 40, 135, 1),
        [1235, 700], [1270, 672],
        // rechten Weg hoch und oben raus
        [1289, 650], [1299, 600], [1314, 500], [1324, 450], [1338, 408], [1365, 386], [1410, 378],
        [1600, 377], [1700, 377], [1800, 377],
      ],
    },
    sprint: {
      speed: 95,
      points: [[470, 1030], [510, 981], [800, 980], [1150, 979], [1262, 975], [1289, 930], [1289, 860]],
    },
  };

  // Draufsicht in Silbergrau: Pritsche hinten (gelbes Werkzeug, liegendes Fahrrad), Kabine vorne
  // (Fahrtrichtung rechts); ca. 3,2 × 1,5 m
  const SVG = `<svg viewBox="0 0 64 32" aria-hidden="true">
    <rect x="9" y="0" width="9" height="4" rx="1.5" fill="#222"/><rect x="9" y="28" width="9" height="4" rx="1.5" fill="#222"/>
    <rect x="2" y="3" width="36" height="26" rx="2" fill="#a9b0b6" stroke="#5f676e" stroke-width="1.6"/>
    <rect x="4" y="5" width="32" height="22" rx="1" fill="#959ca3"/>
    <rect x="4.5" y="5.5" width="9" height="6" rx="0.8" fill="#f2c230" stroke="#9a7608" stroke-width="0.7"/>
    <path d="M7 8.5h4" stroke="#9a7608" stroke-width="0.9"/>
    <rect x="16" y="6.2" width="18" height="2.4" rx="0.5" fill="#f2c230" stroke="#9a7608" stroke-width="0.5"/>
    <rect x="24" y="6.7" width="2.4" height="1.4" fill="#5fb0d8"/>
    <g fill="none" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="10.5" cy="20.5" r="5" stroke="#222" stroke-width="1.1"/>
      <circle cx="29.5" cy="20.5" r="5" stroke="#222" stroke-width="1.1"/>
      <path d="M10.5 20.5 17 14.5 19.5 20.5ZM17 14.5h9M19.5 20.5 26 14.5l3.5 6M26 14.5l-1-2.5" stroke="#c0392b" stroke-width="1.1"/>
      <path d="M23.5 12h3" stroke="#222" stroke-width="1.2"/>
    </g>
    <rect x="15.5" y="13" width="3.2" height="1.4" rx="0.6" fill="#222"/>
    <path d="M38 5h12c8 0 12 5 12 11s-4 11-12 11H38z" fill="#c4c9ce" stroke="#6b737a" stroke-width="1.6"/>
    <rect x="40" y="8" width="9" height="16" rx="2" fill="#dde1e4"/>
    <path d="M52 8c4 1.5 6 4.5 6 8s-2 6.5-6 8z" fill="#28343b"/>
    <rect x="49" y="2" width="3" height="3" rx="1" fill="#555c62"/><rect x="49" y="27" width="3" height="3" rx="1" fill="#555c62"/>
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
        icon: L.divIcon({ className: '', html: `<div class="easter-trike"><div class="easter-body">${SVG}</div></div>`, iconSize: [0, 0] }),
        interactive: true, keyboard: false, zIndexOffset: 2000,
      }).addTo(MapView.map);
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        this.honk();
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
    // süße kleine Hupe: zweimal kurz „mip mip“, hoch und weich (wird im Browser erzeugt, keine Tondatei)
    honk() {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = this.audio || (this.audio = new AC());
        if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {});
        const t = ctx.currentTime + 0.02;
        [0, 0.17].forEach((d) => {
          const out = ctx.createGain();
          out.gain.setValueAtTime(0.0001, t + d);
          out.gain.exponentialRampToValueAtTime(0.18, t + d + 0.015);
          out.gain.setValueAtTime(0.18, t + d + 0.09);
          out.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.13);
          out.connect(ctx.destination);
          // zwei leicht verstimmte Töne klingen wie eine kleine Gummi-Hupe
          [[880, 'triangle', 1], [1320, 'sine', 0.45]].forEach(([f, type, vol]) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = type;
            o.frequency.setValueAtTime(f * 1.06, t + d);
            o.frequency.exponentialRampToValueAtTime(f, t + d + 0.05);
            g.gain.value = vol;
            o.connect(g).connect(out);
            o.start(t + d);
            o.stop(t + d + 0.15);
          });
        });
      } catch (err) { /* ohne Ton weiter */ }
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
