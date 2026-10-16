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

  // Wild über die Wiese von A nach B: leichte Schlangenlinie mit runden Kreisen („Donuts“).
  // Jeder Kreis beginnt und endet genau in Fahrtrichtung, dadurch gibt es keine Knicke.
  // donuts: [Anteil der Strecke, Radius, Seite (1 = links, -1 = rechts)]
  function swirl(A, B, donuts) {
    const [dx, dy] = [B[0] - A[0], B[1] - A[1]];
    const len = Math.hypot(dx, dy);
    const u = [dx / len, dy / len];
    const n = [u[1], -u[0]];
    const base = (s) => {
      const w = 16 * Math.sin((s / len) * Math.PI * 4) * Math.sin((s / len) * Math.PI);
      return [A[0] + u[0] * s + n[0] * w, A[1] + u[1] * s + n[1] * w];
    };
    const pts = [];
    let next = 0;
    for (let s = 6; s < len; s += 6) {
      pts.push(base(s));
      const dn = donuts[next];
      if (dn && s / len >= dn[0]) {
        next++;
        const [, r, side] = dn;
        const p = base(s), q = base(s + 1);
        const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const tu = [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
        const tn = [tu[1] * side, -tu[0] * side];
        for (let i = 1; i < 36; i++) {
          const th = (i / 36) * 2 * Math.PI;
          const c = 1 - Math.cos(th), sn = Math.sin(th);
          pts.push([p[0] + r * (tn[0] * c + tu[0] * sn), p[1] + r * (tn[1] * c + tu[1] * sn)]);
        }
        pts.push(p);
      }
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
        [705, 935], ...swirl([705, 935], [1235, 692], [[0.25, 42, 1], [0.52, 50, -1], [0.76, 36, -1]]), [1235, 692], [1268, 672],
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

  // Draufsicht in Grau: Pritsche hinten (gelbes Werkzeug, liegendes Fahrrad), spitz zulaufende Kabine
  // vorne (Fahrtrichtung rechts); ca. 3,2 × 1,6 m
  const SVG = `<svg viewBox="0 0 64 32" aria-hidden="true">
    <rect x="9" y="0" width="9" height="4" rx="1.5" fill="#1d1f21"/><rect x="9" y="28" width="9" height="4" rx="1.5" fill="#1d1f21"/>
    <rect x="2" y="3" width="36" height="26" rx="2" fill="#7b838a" stroke="#41474c" stroke-width="1.4"/>
    <rect x="4" y="5" width="32" height="22" rx="1" fill="#686f76"/>
    <rect x="4.5" y="5.5" width="9" height="6" rx="0.8" fill="#f2c230" stroke="#9a7608" stroke-width="0.7"/>
    <path d="M7 8.5h4" stroke="#9a7608" stroke-width="0.9"/>
    <rect x="16" y="6.2" width="18" height="2.4" rx="0.5" fill="#f2c230" stroke="#9a7608" stroke-width="0.5"/>
    <rect x="24" y="6.7" width="2.4" height="1.4" fill="#5fb0d8"/>
    <g fill="none" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="10.5" cy="20.5" r="5" stroke="#1d1f21" stroke-width="1.1"/>
      <circle cx="29.5" cy="20.5" r="5" stroke="#1d1f21" stroke-width="1.1"/>
      <path d="M10.5 20.5 17 14.5 19.5 20.5ZM17 14.5h9M19.5 20.5 26 14.5l3.5 6M26 14.5l-1-2.5" stroke="#c0392b" stroke-width="1.1"/>
      <path d="M23.5 12h3" stroke="#1d1f21" stroke-width="1.2"/>
    </g>
    <rect x="15.5" y="13" width="3.2" height="1.4" rx="0.6" fill="#1d1f21"/>
    <path d="M38 4.5h9.5c4 0 8.5 3.6 13.4 9.6q1.3 1.9 0 3.8C56 23.9 51.5 27.5 47.5 27.5H38z" fill="#8a9298" stroke="#41474c" stroke-width="1.4" stroke-linejoin="round"/>
    <rect x="40" y="7.5" width="8" height="17" rx="2" fill="#a2a9ae"/>
    <path d="M50 8.6c3 .9 6.4 3.9 8.8 7.4-2.4 3.5-5.8 6.5-8.8 7.4z" fill="#232c31"/>
    <rect x="47" y="1.6" width="3" height="3" rx="1" fill="#3a4045"/><rect x="47" y="27.4" width="3" height="3" rx="1" fill="#3a4045"/>
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

  // Weg in gleich lange Stücke (step Kartenpixel) teilen: gleichmäßige Fahrt ohne Tempo-Sprünge
  function resample(pts, step) {
    const out = [pts[0]];
    let carry = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b] = [pts[i], pts[i + 1]];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let t = step - carry;
      while (t <= l) { out.push([a[0] + (b[0] - a[0]) * t / l, a[1] + (b[1] - a[1]) * t / l]); t += step; }
      carry = l - (t - step);
    }
    return out;
  }

  const Easter = {
    active: null,
    run(name = 'gross') {
      const MapView = window.MapView;
      if (this.active || !MapView || !MapView.map || document.hidden) return false;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
      const map = MapView.map;
      const route = ROUTES[name] || ROUTES.gross;
      const path = resample(smooth(route.points, 4), 2);
      const total = (path.length - 1) * 2;
      const H = window.APP_CONFIG.map.height;
      const at = (d) => {
        const f = Math.max(0, Math.min(total, d)) / 2;
        const i = Math.min(path.length - 2, Math.floor(f));
        const k = f - i;
        return [path[i][0] + (path[i + 1][0] - path[i][0]) * k, path[i][1] + (path[i + 1][1] - path[i][1]) * k];
      };

      // eigenes Element im Marker-Bereich der Karte: frei positionierbar (auch Bruchteile von Pixeln)
      const el = L.DomUtil.create('div', 'easter-trike', map.getPane('markerPane'));
      el.innerHTML = SVG;
      L.DomEvent.disableClickPropagation(el);
      // Maus: hupen schon beim Drücken (das Dreirad fährt ja weiter); Finger: beim Loslassen,
      // weil das iPhone Ton erst nach einer vollständigen Berührung erlaubt
      const press = (e) => {
        L.DomEvent.stop(e);
        if (this._lastHonk && Date.now() - this._lastHonk < 450) return;
        this._lastHonk = Date.now();
        this.honk();
        el.classList.remove('is-honk'); void el.offsetWidth; el.classList.add('is-honk');
      };
      L.DomEvent.on(el, 'pointerdown', (e) => { if (e.pointerType === 'mouse') press(e); });
      L.DomEvent.on(el, 'pointerup', (e) => { if (e.pointerType !== 'mouse') press(e); });
      L.DomEvent.on(el, 'click', press);
      const hide = () => { el.style.visibility = 'hidden'; };
      const show = () => { el.style.visibility = ''; };
      map.on('zoomstart', hide).on('zoomend', show);

      let angle = null;
      let last = performance.now();
      const t0 = last;
      const step = (now) => {
        if (!this.active) return;
        const d = ((now - t0) / 1000) * route.speed;
        if (d >= total) { this.stop(); return; }
        const p = at(d);
        // Blickrichtung aus dem Weg kurz davor und danach, zusätzlich weich nachgeführt
        const a = at(d - 6), b = at(d + 6);
        const target = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (angle === null) angle = target;
        angle += (((target - angle + 540) % 360) - 180) * (1 - Math.exp(-dt / 0.12));
        if (!map._animatingZoom) {
          const z = map.getZoom();
          const pt = map.project(L.latLng(H - p[1], p[0]), z).subtract(map.getPixelOrigin());
          const k = Math.max(0.75, Math.pow(2, z));   // echte Größe, beim Rauszoomen nicht kleiner als ca. 12 px
          const w = 16 * k, h = 8 * k;
          if (w !== this._w) { el.style.width = w + 'px'; el.style.height = h + 'px'; el.style.margin = `${-h / 2}px 0 0 ${-w / 2}px`; this._w = w; }
          el.style.transform = `translate3d(${pt.x.toFixed(2)}px, ${pt.y.toFixed(2)}px, 0) rotate(${angle.toFixed(2)}deg)`;
        }
        this.raf = requestAnimationFrame(step);
      };
      this.active = { el, off: () => map.off('zoomstart', hide).off('zoomend', show) };
      this._w = 0;
      this.raf = requestAnimationFrame(step);
      return true;
    },
    // Ton-Ausgabe anlegen bzw. aufwecken; das iPhone erlaubt das nur direkt bei einer Berührung
    unlockAudio() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      const ctx = this.audio || (this.audio = new AC());
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {});
      return ctx;
    },
    // süße kleine Hupe: zweimal kurz „mip mip“, hoch und weich (wird im Browser erzeugt, keine Tondatei)
    honk() {
      try {
        const ctx = this.unlockAudio();
        if (!ctx) return;
        const t = ctx.currentTime + 0.02;
        [0, 0.17].forEach((d) => {
          const out = ctx.createGain();
          out.gain.setValueAtTime(0.0001, t + d);
          out.gain.exponentialRampToValueAtTime(0.32, t + d + 0.015);
          out.gain.setValueAtTime(0.32, t + d + 0.09);
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
      this.active.off();
      this.active.el.remove();
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
        if (taps.length >= 3) { taps = []; this.honk(); setTimeout(() => this.run('gross'), 300); }
      });
      this.schedule(true);
    },
  };

  window.Easter = Easter;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => Easter.init());
  else Easter.init();
})();
