/*
 * Interaktive Karte (Leaflet mit Bild-Lageplan, ohne Geo-Koordinaten).
 */
(function () {
  'use strict';

  const cfg = window.APP_CONFIG.map;
  const H = cfg.height, W = cfg.width;

  const toLL = ([x, y]) => L.latLng(H - y, x);
  const fromLL = (ll) => [Math.round(ll.lng), Math.round(H - ll.lat)];

  function centroid(geometry) {
    let x = 0, y = 0;
    geometry.forEach((p) => { x += p[0]; y += p[1]; });
    return [x / geometry.length, y / geometry.length];
  }

  const MapView = {
    map: null,
    colorMode: 'status',   // 'status' | 'supply'
    show: { boxes: true, tanks: true },
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
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        wheelPxPerZoomLevel: 120,
        attributionControl: false,
        maxBounds: bounds.pad(0.25),
        maxBoundsViscosity: 0.8,
        doubleClickZoom: false,
      });
      L.imageOverlay(cfg.url, bounds).addTo(this.map);
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
      this.map.on('zoomend', () => this._updateLabelClass());
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

    _updateLabelClass() {
      const z = this.map.getZoom();
      const c = this.map.getContainer();
      c.classList.toggle('labels-small', z < -0.9);
      c.classList.toggle('labels-tiny', z < -1.6);
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
        const poly = L.polygon(p.geometry.map(toLL), {
          color: isSel || isLinked ? '#1b2a1e' : '#ffffff',
          weight: isSel ? 4 : isLinked ? 3 : 1.5,
          fillColor: color,
          fillOpacity: dimOthers && !isLinked ? 0.25 : (Store.isFree(p) && this.colorMode === 'status' ? 0.45 : 0.75),
          dashArray: Store.isFree(p) ? '5 4' : null,
        });
        poly.bindTooltip(String(p.nr), { permanent: true, direction: 'center', className: 'parcel-label', interactive: false });
        poly.on('click', (e) => {
          if (this.mode) return; // Klick geht an die Karte (Zeichnen/Platzieren)
          L.DomEvent.stopPropagation(e);
          this.handlers.onSelect('parcel', p.id);
        });
        poly.addTo(L_.parcels);
      });

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
          if (isSel) this._drawLinks(t.pos, Store.parcelsOnTank(t.id), '#d9822b');
        });
      }
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
        this.mode.points.push(pt);
        this._renderDraw();
        this.handlers.onModeChange();
        return;
      }
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
      this._endMode();
      onDone(points);
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
      this.layers.draw.clearLayers();
      this.map.getContainer().classList.remove('is-drawing');
      this.handlers.onModeChange();
      this.render();
    },
    _renderDraw() {
      const g = this.layers.draw;
      g.clearLayers();
      const pts = this.mode.points.map(toLL);
      if (pts.length >= 3) L.polygon(pts, { color: '#1b2a1e', weight: 2, fillColor: '#e0a526', fillOpacity: 0.35, interactive: false }).addTo(g);
      else if (pts.length === 2) L.polyline(pts, { color: '#1b2a1e', weight: 2, interactive: false }).addTo(g);
      pts.forEach((ll, i) => L.circleMarker(ll, {
        radius: i === 0 ? 7 : 5, color: '#1b2a1e', weight: 2, fillColor: i === 0 ? '#e0a526' : '#fff', fillOpacity: 1, interactive: false,
      }).addTo(g));
    },

    mapCenter() { return fromLL(this.map.getCenter()); },
  };

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.MapView = MapView;
})();
