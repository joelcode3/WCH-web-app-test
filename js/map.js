/*
 * Interaktive Karte (Leaflet mit Bild-Lageplan, ohne Geo-Koordinaten).
 */
(function () {
  'use strict';

  const cfg = window.APP_CONFIG.map;
  const H = cfg.height, W = cfg.width;

  const toLL = ([x, y]) => L.latLng(H - y, x);
  // Parzellennummern: Größe in Pixeln bei Zoomstufe 0, Unter-/Obergrenze
  const LABEL_BASE = 10, LABEL_MIN = 3.5, LABEL_MAX = 14;
  const fromLL = (ll) => [Math.round(ll.lng), Math.round(H - ll.lat)];

  function centroid(geometry) {
    let x = 0, y = 0;
    geometry.forEach((p) => { x += p[0]; y += p[1]; });
    return [x / geometry.length, y / geometry.length];
  }

  const MapView = {
    map: null,
    colorMode: 'status',   // 'status' | 'supply'
    // Ebenen & Symbole zum An-/Abwählen
    show: { boxes: true, tanks: true, aerial: false, ww: false, dogs: false, persons: false, miet: false, pacht: false },
    snap: true,            // beim Zeichnen auf rechte Winkel einrasten
    editMode: false,
    selected: null,        // { type: 'parcel'|'box'|'tank', id }
    mode: null,            // null | { kind: 'draw', points, onDone, onCancel } | { kind: 'place', onDone, onCancel }
    handlers: {},          // onSelect(type, id), onClear(), onModeChange()

    init(el, handlers) {
      this.handlers = handlers;
      const bounds = L.latLngBounds([0, 0], [H, W]);
      this.map = L.map(el, {
        crs: L.CRS.Simple,
        minZoom: -3,
        maxZoom: 2,
        zoomSnap: 0,
        zoomDelta: 1,
        scrollWheelZoom: false,   // eigene Steuerung: Mausrad zoomt, Trackpad verschiebt (s. _initWheel)
        attributionControl: false,
        maxBounds: bounds.pad(0.25),
        maxBoundsViscosity: 0.8,
        doubleClickZoom: false,
      });
      this.planLayer = L.imageOverlay(cfg.url, bounds).addTo(this.map);
      this.aerialLayer = cfg.aerial ? L.imageOverlay(cfg.aerial, bounds) : null;
      // eigener SVG-Renderer, damit Farbverläufe (zweifarbige Parzellen) definiert werden können
      this.renderer = L.svg({ padding: 0.5 });
      this.bounds = bounds;
      this.fit();

      this.layers = {
        links: L.layerGroup().addTo(this.map),
        parcels: L.layerGroup().addTo(this.map),
        tanks: L.layerGroup().addTo(this.map),
        boxes: L.layerGroup().addTo(this.map),
        draw: L.layerGroup().addTo(this.map),
      };

      this.map.on('click', (e) => this._onMapClick(e));
      this.map.on('mousemove', (e) => this._onMouseMove(e));
      this._initWheel(el);
      // Beschriftung stufenlos mitskalieren (auch während des Zoomens → kein Nachhinken)
      this.map.on('zoom zoomend', () => this._updateLabelClass());
      this.map.on('zoomanim', (e) => this._updateLabelClass(e.zoom));
      this._updateLabelClass();
      this.render();
    },

    fit() {
      this.map.fitBounds(this.bounds, { padding: [8, 8] });
    },

    invalidate() {
      if (!this.map) return;
      const first = !this._sized;
      this.map.invalidateSize();
      if (first && this.map.getSize().x > 0) { this._sized = true; this.fit(); }
    },

    // Schriftgröße proportional zur Karte: wie aufgedruckt, passt immer in die Parzelle
    _updateLabelClass(zoom) {
      const z = zoom === undefined ? this.map.getZoom() : zoom;
      const c = this.map.getContainer();
      const px = Math.min(LABEL_MAX, LABEL_BASE * Math.pow(2, z));
      c.style.setProperty('--lbl', px.toFixed(2) + 'px');
      c.classList.toggle('labels-hidden', px < LABEL_MIN);
      c.classList.toggle('labels-small', z < -0.4);   // nur noch für Kasten-/Tank-Symbole
      c.classList.toggle('labels-tiny', z < -1.1);
    },

    parcelColor(p) {
      if (this.colorMode === 'supply') return Store.SUPPLY[Store.supplyOf(p)].color;
      return (Store.STATUS[p.status] || Store.STATUS.leer).color;
    },

    // Welche Parzellen gehören zum aktuell ausgewählten Kasten / Tank?
    _linkedParcelIds() {
      const s = this.selected;
      if (!s) return new Set();
      if (s.type === 'box') return new Set(Store.metersInBox(s.id).map((m) => m.parcelId));
      if (s.type === 'tank') return new Set(Store.parcelsOnTank(s.id).map((p) => p.id));
      return new Set();
    },

    render() {
      if (!this.map) return;
      const L_ = this.layers;
      L_.parcels.clearLayers();
      L_.boxes.clearLayers();
      L_.tanks.clearLayers();
      L_.links.clearLayers();

      const linked = this._linkedParcelIds();
      const sel = this.selected;
      const dimOthers = sel && (sel.type === 'box' || sel.type === 'tank');

      Store.data.parcels.forEach((p) => {
        if (!p.geometry || p.geometry.length < 3) return;
        const isSel = sel && sel.type === 'parcel' && sel.id === p.id;
        const isLinked = linked.has(p.id);
        const color = this.parcelColor(p);
        const split = this.colorMode === 'status' && Store.movingOut(p);
        const poly = L.polygon(p.geometry.map(toLL), {
          renderer: this.renderer,
          color: isSel || isLinked ? '#1b2a1e' : '#ffffff',
          weight: isSel ? 4 : isLinked ? 3 : 1.5,
          fillColor: split ? `url(#split-${p.status})` : color,
          fillOpacity: dimOthers && !isLinked ? 0.25 : (this.show.aerial ? 0.6 : 0.8),
          dashArray: Store.isFree(p) ? '5 4' : null,
        });
        poly.bindTooltip(this.labelHtml(p), { permanent: true, direction: 'center', className: 'parcel-label', interactive: false });
        poly.on('click', (e) => {
          if (this.mode && this.mode.kind === 'pick') {
            L.DomEvent.stopPropagation(e);
            const done = this.mode.onDone;
            this._endMode();
            done(p.id);
            return;
          }
          if (this.mode) return; // Klick geht an die Karte (Zeichnen/Platzieren)
          L.DomEvent.stopPropagation(e);
          this.handlers.onSelect('parcel', p.id);
        });
        poly.addTo(L_.parcels);
      });
      this._ensureDefs();

      if (this.show.boxes) {
        Store.data.boxes.forEach((b) => {
          if (!b.pos) return;
          const isSel = sel && sel.type === 'box' && sel.id === b.id;
          const m = L.marker(toLL(b.pos), {
            icon: L.divIcon({
              className: '',
              html: `<div class="pin pin-box${isSel ? ' is-selected' : ''}" title="Stromkasten ${b.nr}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg><span>${escapeHtml(b.nr)}</span></div>`,
              iconSize: [44, 28],
              iconAnchor: [22, 14],
            }),
            draggable: this.editMode && !this.mode,
            zIndexOffset: isSel ? 1000 : 500,
            keyboard: true,
            title: `Stromkasten ${b.nr}`,
          });
          m.on('click', (e) => { if (this.mode) return; L.DomEvent.stopPropagation(e); this.handlers.onSelect('box', b.id); });
          m.on('dragend', () => { b.pos = fromLL(m.getLatLng()); Store.save(); });
          m.addTo(L_.boxes);
          if (isSel) this._drawLinks(b.pos, Store.metersInBox(b.id).map((mt) => Store.parcel(mt.parcelId)), '#e0a526');
        });
      }

      if (this.show.tanks) {
        Store.data.tanks.forEach((t) => {
          if (!t.pos) return;
          const isSel = sel && sel.type === 'tank' && sel.id === t.id;
          const m = L.marker(toLL(t.pos), {
            icon: L.divIcon({
              className: '',
              html: `<div class="pin pin-tank${isSel ? ' is-selected' : ''}" title="Gastank ${t.nr}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3 0-3-1-5 0-8z"/></svg><span>T${escapeHtml(t.nr)}</span></div>`,
              iconSize: [50, 28],
              iconAnchor: [25, 14],
            }),
            draggable: this.editMode && !this.mode,
            zIndexOffset: isSel ? 1000 : 400,
            title: `Gastank ${t.nr}`,
          });
          m.on('click', (e) => { if (this.mode) return; L.DomEvent.stopPropagation(e); this.handlers.onSelect('tank', t.id); });
          m.on('dragend', () => { t.pos = fromLL(m.getLatLng()); Store.save(); });
          m.addTo(L_.tanks);
          if (isSel) this._drawLinks(t.pos, Store.parcelsOnTank(t.id), '#2f9e74');
        });
      }
    },

    // Beschriftung: Nummer, ggf. "frei ab", Symbole der eingeschalteten Ebenen
    labelHtml(p) {
      const sh = this.show;
      const badges = [];
      if (sh.ww && p.winterWater) badges.push('<span class="pb pb-ww" title="Winterwasser">WW</span>');
      if (sh.persons && p.residents > 0) badges.push(iconBadge('pb-person', ICON_PERSON, p.residents, `${p.residents} Bewohner`));
      if (sh.dogs && p.dogs > 0) badges.push(iconBadge('pb-dog', ICON_DOG, p.dogs, `${p.dogs} Hund${p.dogs > 1 ? 'e' : ''}`));
      if (sh.miet && p.objectType === 'miet') badges.push('<span class="pb pb-miet" title="Mietobjekt">M</span>');
      if (sh.pacht && p.objectType === 'pacht') badges.push('<span class="pb pb-pacht" title="Pachtgrundstück">P</span>');
      const free = Store.movingOut(p) ? `<span class="pl-free">frei ab ${escapeHtml(p.freeFrom.split('-').reverse().join('.'))}</span>` : '';
      return `<span class="pl-nr">${escapeHtml(p.nr)}</span>${free}${badges.length ? `<span class="pl-badges">${badges.join('')}</span>` : ''}`;
    },

    // Farbverläufe für "bewohnt, Auszug steht fest" (diagonal: Statusfarbe / frei)
    _ensureDefs() {
      const svg = this.renderer && this.renderer._container;
      if (!svg || svg.querySelector('#split-fest')) return;
      const NS = 'http://www.w3.org/2000/svg';
      const defs = document.createElementNS(NS, 'defs');
      ['fest', 'wochenende'].forEach((key) => {
        const g = document.createElementNS(NS, 'linearGradient');
        g.setAttribute('id', `split-${key}`);
        [['x1', 0], ['y1', 0], ['x2', 1], ['y2', 1]].forEach(([k, v]) => g.setAttribute(k, v));
        [[0, Store.STATUS[key].color], [0.5, Store.STATUS[key].color], [0.5, Store.MOVE_OUT_COLOR], [1, Store.MOVE_OUT_COLOR]].forEach(([o, c]) => {
          const st = document.createElementNS(NS, 'stop');
          st.setAttribute('offset', o);
          st.setAttribute('stop-color', c);
          g.appendChild(st);
        });
        defs.appendChild(g);
      });
      svg.insertBefore(defs, svg.firstChild);
    },

    setAerial(on) {
      this.show.aerial = on;
      if (!this.aerialLayer) return;
      if (on) { this.map.removeLayer(this.planLayer); this.aerialLayer.addTo(this.map).bringToBack(); }
      else { this.map.removeLayer(this.aerialLayer); this.planLayer.addTo(this.map).bringToBack(); }
      this.render();
    },

    _drawLinks(from, parcels, color) {
      parcels.forEach((p) => {
        if (!p || !p.geometry || p.geometry.length < 3) return;
        L.polyline([toLL(from), toLL(centroid(p.geometry))], {
          color, weight: 2.5, dashArray: '6 5', opacity: 0.95, interactive: false,
        }).addTo(this.layers.links);
      });
    },

    select(type, id, opts = {}) {
      this.selected = type ? { type, id } : null;
      this.render();
      if (!type || !opts.focus) return;
      if (type === 'parcel') {
        const p = Store.parcel(id);
        if (p && p.geometry && p.geometry.length >= 3) {
          const b = L.latLngBounds(p.geometry.map(toLL));
          const maxZ = window.matchMedia('(max-width: 860px)').matches ? -0.25 : 0.5;
          const z = Math.min(this.map.getBoundsZoom(b, false, L.point(220, 220)), maxZ);
          this._flyTo(b.getCenter(), Math.max(z, Math.min(this.map.getZoom(), maxZ)));
        }
      } else {
        const obj = type === 'box' ? Store.box(id) : Store.tank(id);
        if (obj && obj.pos) this._flyTo(toLL(obj.pos), Math.max(this.map.getZoom(), -0.5));
      }
    },

    // Ziel so anfliegen, dass es nicht unter dem Infofenster liegt
    _flyTo(ll, zoom) {
      const c = this.map.getContainer();
      const mobile = window.matchMedia('(max-width: 860px)').matches;
      const off = mobile ? L.point(0, c.clientHeight * 0.3) : L.point(c.clientWidth > 900 ? 195 : 0, 0);
      const pt = this.map.project(ll, zoom).add(off);
      this.map.flyTo(this.map.unproject(pt, zoom), zoom, { duration: 0.5 });
    },

    setEditMode(on) {
      this.editMode = on;
      this.render();
    },

    _onMapClick(e) {
      const pt = fromLL(e.latlng);
      if (this.mode && this.mode.kind === 'draw') {
        this.mode.points.push(this._snapped(pt));
        this._renderDraw();
        this.handlers.onModeChange();
        return;
      }
      if (this.mode && this.mode.kind === 'line') {
        this.mode.points.push(this._snapped(pt));
        if (this.mode.points.length === 2) {
          const { points, onDone } = this.mode;
          this._endMode();
          onDone(points);
        } else {
          this._renderDraw();
          this.handlers.onModeChange();
        }
        return;
      }
      if (this.mode && this.mode.kind === 'pick') return; // Parzelle anklicken
      if (this.mode && this.mode.kind === 'place') {
        const done = this.mode.onDone;
        this.mode = null;
        this.handlers.onModeChange();
        done(pt);
        return;
      }
      if (this.selected) this.handlers.onClear();
    },

    /* --- Umriss zeichnen --- */
    startDraw(onDone, onCancel) {
      this.mode = { kind: 'draw', points: [], onDone, onCancel };
      this.map.getContainer().classList.add('is-drawing');
      this._renderDraw();
      this.handlers.onModeChange();
    },
    undoPoint() {
      if (!this.mode || this.mode.kind !== 'draw') return;
      this.mode.points.pop();
      this._renderDraw();
      this.handlers.onModeChange();
    },
    finishDraw() {
      if (!this.mode || this.mode.kind !== 'draw' || this.mode.points.length < 3) return;
      const { points, onDone } = this.mode;
      if (this.snap) closeOrthogonal(points);
      this._endMode();
      onDone(points);
    },
    // Schnittlinie (2 Punkte) zeichnen, z. B. zum Teilen; refDir = Ausrichtung der Parzelle
    startLine(onDone, onCancel, refDir) {
      this.mode = { kind: 'line', points: [], onDone, onCancel, refDir };
      this.map.getContainer().classList.add('is-drawing');
      this._renderDraw();
      this.handlers.onModeChange();
    },
    // Eine Parzelle auf der Karte anklicken lassen (z. B. Nachbar zum Verbinden)
    startPick(onDone, onCancel) {
      this.mode = { kind: 'pick', onDone, onCancel };
      this.handlers.onModeChange();
    },
    setSnap(on) {
      this.snap = on;
      if (this.mode) this._renderDraw();
    },

    // Neuen Punkt auf rechte Winkel ausrichten (relativ zur ersten Kante bzw. zur Parzelle)
    _snapped(pt) {
      const m = this.mode;
      if (!this.snap || !m || !m.points || !m.points.length) return pt;
      const prev = m.points[m.points.length - 1];
      let ref = m.refDir;
      if (!ref && m.points.length >= 2) ref = unit(sub(m.points[1], m.points[0]));
      if (!ref) {
        // erste Kante: nur einrasten, wenn fast waagerecht/senkrecht (< 8°)
        const v = sub(pt, prev);
        const ang = Math.abs(Math.atan2(v[1], v[0]) * 180 / Math.PI) % 90;
        if (ang > 8 && ang < 82) return pt;
        ref = [1, 0];
      }
      const perp = [-ref[1], ref[0]];
      const v = sub(pt, prev);
      const a = dot(v, ref), b = dot(v, perp);
      const out = Math.abs(a) >= Math.abs(b) ? [prev[0] + ref[0] * a, prev[1] + ref[1] * a] : [prev[0] + perp[0] * b, prev[1] + perp[1] * b];
      return [Math.round(out[0] * 10) / 10, Math.round(out[1] * 10) / 10];
    },

    _onMouseMove(e) {
      const m = this.mode;
      if (!m || (m.kind !== 'draw' && m.kind !== 'line') || !m.points.length) return;
      this._preview = this._snapped(fromLL(e.latlng));
      this._renderDraw();
    },

    // Mausrad = zoomen, Trackpad zwei Finger = verschieben, Kneifen (Strg) = zoomen
    _initWheel(el) {
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        const map = this.map;
        const pt = map.mouseEventToContainerPoint(e);
        if (e.ctrlKey) {
          map.setZoomAround(pt, map.getZoom() - e.deltaY * 0.015, { animate: false });
          return;
        }
        const lines = e.deltaMode !== 0;
        const mouseWheel = lines || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40);
        if (mouseWheel) {
          const step = Math.min(1, Math.abs(lines ? e.deltaY * 33 : e.deltaY) / 100) * 0.75;
          map.setZoomAround(pt, map.getZoom() - Math.sign(e.deltaY) * step, { animate: false });
        } else {
          map.panBy([e.deltaX, e.deltaY], { animate: false });
        }
      }, { passive: false });
    },

    startPlace(onDone, onCancel) {
      this.mode = { kind: 'place', onDone, onCancel };
      this.map.getContainer().classList.add('is-drawing');
      this.handlers.onModeChange();
    },
    cancelMode() {
      if (!this.mode) return;
      const cb = this.mode.onCancel;
      this._endMode();
      if (cb) cb();
    },
    _endMode() {
      this.mode = null;
      this._preview = null;
      this.layers.draw.clearLayers();
      this.map.getContainer().classList.remove('is-drawing');
      this.handlers.onModeChange();
      this.render();
    },
    _renderDraw() {
      const g = this.layers.draw;
      g.clearLayers();
      if (!this.mode || !this.mode.points) return;
      const pts = this.mode.points.map(toLL);
      if (this._preview && pts.length) {
        L.polyline([pts[pts.length - 1], toLL(this._preview)], { color: '#1b2a1e', weight: 2, dashArray: '6 5', interactive: false }).addTo(g);
      }
      if (this.mode.kind === 'line') {
        if (pts.length === 1) L.circleMarker(pts[0], { radius: 6, color: '#b3402e', weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(g);
        return;
      }
      if (pts.length >= 3) L.polygon(pts, { color: '#1b2a1e', weight: 2, fillColor: '#e0a526', fillOpacity: 0.35, interactive: false }).addTo(g);
      else if (pts.length === 2) L.polyline(pts, { color: '#1b2a1e', weight: 2, interactive: false }).addTo(g);
      pts.forEach((ll, i) => L.circleMarker(ll, {
        radius: i === 0 ? 7 : 5, color: '#1b2a1e', weight: 2, fillColor: i === 0 ? '#e0a526' : '#fff', fillOpacity: 1, interactive: false,
      }).addTo(g));
    },

    mapCenter() { return fromLL(this.map.getCenter()); },
  };

  // kleine Vektor-Helfer
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const unit = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };

  // Letzten Punkt so verschieben, dass auch die Schlusskante rechtwinklig ist
  function closeOrthogonal(pts) {
    if (pts.length < 3) return;
    const P = pts[pts.length - 2], Lp = pts[pts.length - 1], F = pts[0];
    const d = unit(sub(Lp, P));
    const n = [-d[1], d[0]];
    // Schnittpunkt: P + s*d  =  F + t*n
    const det = d[0] * (-n[1]) - d[1] * (-n[0]);
    if (Math.abs(det) < 1e-9) return;
    const rx = F[0] - P[0], ry = F[1] - P[1];
    const sParam = (rx * (-n[1]) - ry * (-n[0])) / det;
    pts[pts.length - 1] = [Math.round((P[0] + d[0] * sParam) * 10) / 10, Math.round((P[1] + d[1] * sParam) * 10) / 10];
  }

  const ICON_DOG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3l1.6 2.2 2.4.5-.5 2.6-2.4.4-1 2.3V15l-1.5 6h-2l-.6-4.5H9.5L8.5 21h-2l-.3-5.6C4.6 14.6 4 13.2 4 11.5V9.7L2.6 8.4 3.8 7 6 8.6c.7-.4 1.5-.6 2.3-.6H14l1.4-2.4z"/></svg>';
  const ICON_PERSON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="6" r="3.6"/><path d="M5 22v-5.5C5 13.5 8 11 12 11s7 2.5 7 5.5V22z"/></svg>';
  // n Symbole nebeneinander (ab 5: "4+")
  function iconBadge(cls, icon, n, title) {
    const k = Math.min(n, 4);
    return `<span class="pb pb-icons ${cls}" title="${title}">${icon.repeat(k)}${n > 4 ? '<b>+</b>' : ''}</span>`;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  MapView.icons = { dog: ICON_DOG, person: ICON_PERSON };
  window.MapView = MapView;
})();
