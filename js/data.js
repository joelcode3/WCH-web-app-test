/*
 * Datenmodell & Speicherung.
 *
 * Vorerst wird alles im localStorage des Browsers gespeichert (pro Gerät!).
 * Über "Daten → Export/Import" lässt sich der Stand als JSON sichern/übertragen.
 *
 * Koordinaten sind Bildpixel des Lageplans: [x, y], Ursprung oben links.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'wch-platzverwaltung-v1';

  const STATUS = {
    fest:       { label: 'Festwohnsitz',          short: 'Fest',              color: '#3f7d3a' },
    wochenende: { label: 'Wochenendgrundstück',   short: 'Wochenende',        color: '#2f6fa3' },
    altbestand: { label: 'Frei (mit Altbestand)', short: 'Frei (Altbestand)', color: '#b9874a', free: true },
    leer:       { label: 'Frei',                  short: 'Frei',              color: '#a39d8f', free: true },
  };

  // Wem gehört das Haus auf der Parzelle?
  const OBJECT_TYPES = {
    pacht: { label: 'Pachtgrundstück', hint: 'eigenes Mobilheim / Tiny House des Mieters', rentLabel: 'Monatliche Pacht' },
    miet:  { label: 'Mietobjekt',      hint: 'Haus gehört dem Platz und ist vermietet',     rentLabel: 'Monatliche Miete' },
  };

  // Zähler ohne Parzelle = Betriebsstrom
  const PURPOSES = {
    licht:     'Platzbeleuchtung',
    sanitaer:  'Sanitäranlagen',
    camper:    'Camperstrom',
    rezeption: 'Rezeption / Gebäude',
    sonstiges: 'Sonstiger Betrieb',
  };

  const GAS = {
    none:   'kein Gas',
    tank:   'Gastank (gemeinsam)',
    bottle: 'Gasflaschen',
  };

  const HEATING = {
    strom: 'Strom',
    gas:   'Gas',
    holz:  'Holz / Kamin',
    oel:   'Öl',
    keine: 'keine / unbekannt',
  };

  // Farbschema "Versorgung" auf der Karte
  const SUPPLY = {
    tank:   { label: 'Gastank',          color: '#d9822b' },
    bottle: { label: 'Gasflaschen',      color: '#8a5aa8' },
    strom:  { label: 'Heizt mit Strom',  color: '#d4a90a' },
    other:  { label: 'Sonstiges / kein Gas', color: '#a39d8f' },
  };

  function supplyOf(p) {
    if (p.gas === 'tank') return 'tank';
    if (p.gas === 'bottle') return 'bottle';
    if (p.heating === 'strom') return 'strom';
    return 'other';
  }

  function uid(prefix) {
    return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function compareNr(a, b) {
    return String(a).localeCompare(String(b), 'de', { numeric: true });
  }

  /* ---------- Demo-Daten (Platzhalter) ---------- */

  function seed() {
    let s = 42;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

    const first = ['Anke', 'Bernd', 'Claudia', 'Dieter', 'Elke', 'Frank', 'Gabi', 'Heiko', 'Ingrid', 'Jürgen',
      'Karin', 'Lars', 'Monika', 'Norbert', 'Petra', 'Rainer', 'Sabine', 'Thomas', 'Ute', 'Werner'];
    const last = ['Ahrens', 'Behrens', 'Brandt', 'Cordes', 'Dittmer', 'Eckhoff', 'Gerdes', 'Hinck', 'Indorf',
      'Kück', 'Lühmann', 'Meyer', 'Oetjen', 'Prigge', 'Rathjen', 'Steffens', 'Tiedemann', 'Viebrock', 'Wahlers', 'Zabel'];

    const blocks = [
      { cols: [100, 196], w: 86 },
      { cols: [324, 413, 502], w: 80 },
      { cols: [624, 712], w: 78 },
    ];
    const rows = [110, 179, 248, 317, 424, 490, 556, 622];
    const rowH = 60;

    const boxes = [];
    const boxXs = [303, 603, 811];
    const boxYs = [180, 320, 490, 630];
    let bn = 1;
    boxXs.forEach((x) => boxYs.forEach((y) => {
      boxes.push({ id: uid('b'), nr: String(bn++), pos: [x, y], location: '' });
    }));
    boxes[0].location = 'am Weg, gegenüber Rezeption';

    const tanks = [
      { id: uid('t'), nr: '1', pos: [603, 250], capacity: '2.900 l', notes: 'Füllstand prüfen lassen' },
      { id: uid('t'), nr: '2', pos: [303, 560], capacity: '2.100 l', notes: '' },
    ];

    const parcels = [];
    const meters = [];
    const readings = [];
    let nr = 1;

    blocks.forEach((b) => b.cols.forEach((x) => rows.forEach((y) => {
      const geometry = [[x, y], [x + b.w, y], [x + b.w, y + rowH], [x, y + rowH]];
      const cx = x + b.w / 2, cy = y + rowH / 2;
      const r = rnd();
      const status = r < 0.09 ? 'leer' : r < 0.15 ? 'altbestand' : r < 0.55 ? 'wochenende' : 'fest';
      const free = STATUS[status].free;

      // Gasversorgung: Tank nur in der Nähe eines Tanks
      const nearTank = tanks.find((t) => Math.hypot(t.pos[0] - cx, t.pos[1] - cy) < 150);
      const g = rnd();
      let gas = g < 0.35 ? 'none' : g < 0.65 ? 'bottle' : 'tank';
      if (gas === 'tank' && !nearTank) gas = 'bottle';
      let heating;
      if (gas === 'tank') heating = 'gas';
      else if (gas === 'bottle') heating = rnd() < 0.6 ? 'gas' : 'holz';
      else heating = rnd() < 0.7 ? 'strom' : 'holz';
      if (free) heating = 'keine';

      const p = {
        id: uid('p'),
        nr: String(nr++),
        status,
        tenant: { name: '', phone: '', email: '', address: '' },
        size: Math.round(b.w * rowH * 0.09 + (rnd() - 0.5) * 30),
        gas,
        gasTankId: gas === 'tank' ? nearTank.id : '',
        heating,
        objectType: rnd() < 0.15 ? 'miet' : 'pacht',
        rent: free ? '' : Math.round((status === 'fest' ? 180 : 120) + rnd() * 80),
        winterWater: status === 'fest' ? rnd() < 0.85 : status === 'wochenende' ? rnd() < 0.3 : false,
        notes: '',
        geometry,
      };
      if (!free) {
        const fn = pick(first), ln = pick(last);
        p.tenant = {
          name: `${fn} ${ln}`,
          phone: `0171 ${Math.floor(1000000 + rnd() * 8999999)}`,
          email: `${fn}.${ln}@example.de`.toLowerCase().replace(/ü/g, 'ue').replace(/ö/g, 'oe').replace(/ä/g, 'ae'),
          address: status === 'fest' ? 'Zum Waldbad 3, 27404 Gyhum-Hesedorf' : '',
        };
      }
      parcels.push(p);

      // Stromzähler im nächstgelegenen Kasten
      const box = boxes.reduce((best, bx) =>
        Math.hypot(bx.pos[0] - cx, bx.pos[1] - cy) < Math.hypot(best.pos[0] - cx, best.pos[1] - cy) ? bx : best);
      const inHouse = rnd() < 0.12;
      const sm = { id: uid('m'), type: 'strom', number: `1ESY${Math.floor(10000000 + rnd() * 89999999)}`,
        parcelId: p.id, boxId: inHouse ? '' : box.id, inHouse, purpose: '', label: '', location: '', notes: '' };
      meters.push(sm);
      const s1 = Math.round(5000 + rnd() * 30000);
      const use = free ? Math.round(rnd() * 40) : Math.round((heating === 'strom' ? 3500 : 1200) + rnd() * 2500);
      readings.push({ id: uid('r'), meterId: sm.id, date: '2024-10-01', value: s1 });
      readings.push({ id: uid('r'), meterId: sm.id, date: '2025-10-01', value: s1 + use });

      if (gas === 'tank') {
        const gm = { id: uid('m'), type: 'gas', number: `G${Math.floor(100000 + rnd() * 899999)}`,
          parcelId: p.id, boxId: '', inHouse: false, purpose: '', label: '', location: 'Hauswand, Eingangsseite', notes: '' };
        meters.push(gm);
        const g1 = Math.round(800 + rnd() * 4000);
        readings.push({ id: uid('r'), meterId: gm.id, date: '2024-10-01', value: g1 });
        readings.push({ id: uid('r'), meterId: gm.id, date: '2025-10-01', value: g1 + Math.round(300 + rnd() * 900) });
      }
    })));

    parcels[2].notes = 'Schlüssel für Stromkasten beim Mieter hinterlegt.';

    // Betriebszähler (ohne Parzelle)
    [[9, 'sanitaer', 'Sanitärgebäude'], [10, 'licht', 'Wegbeleuchtung Ost'], [11, 'camper', 'Säulen Wiese B'], [1, 'rezeption', 'Rezeption']]
      .forEach(([boxNr, purpose, label]) => {
        const m = { id: uid('m'), type: 'strom', number: `1ESY${Math.floor(10000000 + rnd() * 89999999)}`,
          parcelId: '', boxId: boxes[boxNr - 1].id, inHouse: false, purpose, label, location: '', notes: '' };
        meters.push(m);
        const v = Math.round(20000 + rnd() * 40000);
        readings.push({ id: uid('r'), meterId: m.id, date: '2024-10-01', value: v });
        readings.push({ id: uid('r'), meterId: m.id, date: '2025-10-01', value: v + Math.round(2000 + rnd() * 9000) });
      });

    return { version: 1, parcels, boxes, tanks, meters, readings, demo: true };
  }

  /* ---------- Store ---------- */

  const Store = {
    STATUS, GAS, HEATING, SUPPLY, OBJECT_TYPES, PURPOSES, supplyOf, uid, compareNr,
    isFree: (p) => !!(STATUS[p.status] || STATUS.leer).free,
    data: null,
    listeners: [],

    mode: 'local',          // 'local' (Browser-Speicher) | 'cloud' (Supabase)
    sync: { state: 'idle', error: '' },
    syncListeners: [],
    _dirty: false,
    _flushing: false,
    _snapshot: null,
    lastFetch: 0,

    async init() {
      if (window.Cloud && Cloud.enabled) {
        this.mode = 'cloud';
        await this.refresh();
      } else {
        this.mode = 'local';
        this._loadLocal();
      }
    },

    _loadLocal() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          this.data = JSON.parse(raw);
          this._normalize();
          return;
        }
      } catch (e) {
        console.warn('Konnte Daten nicht laden', e);
      }
      this.data = seed();
      this.save();
    },

    // Cloud: kompletten Stand neu vom Server holen
    async refresh() {
      const data = await Cloud.fetchAll();
      // Während des Ladens lokal geändert? Dann nicht überschreiben (wird gerade gespeichert)
      if (this.data && this.hasPending) return false;
      this.data = data;
      this._normalize();
      this._snapshot = Cloud.snapshot(this.data);
      this.lastFetch = Date.now();
      return true;
    },

    _normalize() {
      const d = this.data;
      ['parcels', 'boxes', 'tanks', 'meters', 'readings'].forEach((k) => { if (!Array.isArray(d[k])) d[k] = []; });
      d.parcels.forEach((p) => {
        p.tenant = Object.assign({ name: '', phone: '', email: '', address: '' }, p.tenant);
        if (!OBJECT_TYPES[p.objectType]) p.objectType = 'pacht';
        if (p.rent === undefined || p.rent === null) p.rent = '';
        p.winterWater = !!p.winterWater;
        if (!STATUS[p.status]) p.status = 'leer';
      });
      d.meters.forEach((m) => {
        m.parcelId = m.parcelId || '';
        m.boxId = m.boxId || '';
        m.inHouse = !!m.inHouse;
        m.purpose = m.purpose || '';
        m.label = m.label || '';
      });
    },

    save() {
      if (this.mode === 'cloud') {
        this._dirty = true;
        if (!this._flushing) this._flush();
      } else {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        } catch (e) {
          alert('Speichern fehlgeschlagen: ' + e.message);
        }
      }
      this.listeners.forEach((fn) => fn());
    },

    // Cloud: Änderungen nacheinander hochladen, bis nichts mehr offen ist
    async _flush() {
      this._flushing = true;
      this._setSync('saving');
      try {
        while (this._dirty) {
          this._dirty = false;
          const cur = JSON.parse(JSON.stringify(this.data));
          await Cloud.push(cur, this._snapshot);
          this._snapshot = Cloud.snapshot(cur);
        }
        this._setSync('saved');
      } catch (e) {
        console.error('Speichern fehlgeschlagen', e);
        this._dirty = true;
        this._setSync('error', e.message || String(e));
      } finally {
        this._flushing = false;
      }
    },

    retry() {
      if (this.mode === 'cloud' && this._dirty && !this._flushing) this._flush();
    },

    get hasPending() { return this._dirty || this._flushing; },

    _setSync(state, error = '') {
      this.sync = { state, error };
      this.syncListeners.forEach((fn) => fn(this.sync));
    },
    onSync(fn) { this.syncListeners.push(fn); },

    onChange(fn) { this.listeners.push(fn); },

    reset() { this.data = seed(); this.save(); },

    importJSON(obj) {
      if (!obj || !Array.isArray(obj.parcels)) throw new Error('Keine gültige Sicherungsdatei.');
      this.data = obj;
      this._normalize();
      this.save();
    },

    clearAll() {
      this.data = { version: 1, parcels: [], boxes: [], tanks: [], meters: [], readings: [] };
      this.save();
    },

    // Zugriff
    parcel(id) { return this.data.parcels.find((p) => p.id === id); },
    box(id) { return this.data.boxes.find((b) => b.id === id); },
    tank(id) { return this.data.tanks.find((t) => t.id === id); },
    meter(id) { return this.data.meters.find((m) => m.id === id); },

    parcelsSorted() { return [...this.data.parcels].sort((a, b) => compareNr(a.nr, b.nr)); },
    boxesSorted() { return [...this.data.boxes].sort((a, b) => compareNr(a.nr, b.nr)); },
    tanksSorted() { return [...this.data.tanks].sort((a, b) => compareNr(a.nr, b.nr)); },

    metersOf(parcelId) { return parcelId ? this.data.meters.filter((m) => m.parcelId === parcelId) : []; },
    // Sortierung: erst Parzellen nach Nummer, dann Betriebszähler
    sortMeters(list) {
      const key = (m) => { const p = this.parcel(m.parcelId); return p ? '0 ' + p.nr : '1 ' + (PURPOSES[m.purpose] || '') + m.label; };
      return [...list].sort((a, b) => compareNr(key(a), key(b)));
    },
    metersInBox(boxId) {
      return this.sortMeters(this.data.meters.filter((m) => m.boxId === boxId && !m.inHouse));
    },
    serviceMeters() { return this.sortMeters(this.data.meters.filter((m) => !this.parcel(m.parcelId))); },
    isService(m) { return !this.parcel(m.parcelId); },
    // "Betrieb: Sanitäranlagen – Sanitärgebäude"
    purposeText(m) {
      const base = PURPOSES[m.purpose] || 'Betrieb';
      return m.label ? `${base} – ${m.label}` : base;
    },
    // Wo hängt der Zähler?
    meterPlace(m) {
      if (m.type === 'gas') return m.location || '';
      if (m.inHouse) return 'im Haus';
      const b = this.box(m.boxId);
      return b ? `Kasten ${b.nr}` : '';
    },
    // Gleiche Zählernummer schon vergeben? (Leerzeichen/Groß-Klein egal)
    findMeterByNumber(number, exceptIds = []) {
      const n = String(number || '').replace(/\s/g, '').toLowerCase();
      if (!n) return null;
      return this.data.meters.find((m) => !exceptIds.includes(m.id) && String(m.number).replace(/\s/g, '').toLowerCase() === n) || null;
    },
    findParcelByNr(nr, exceptId) {
      const n = String(nr || '').trim().toLowerCase();
      return this.data.parcels.find((p) => p.id !== exceptId && String(p.nr).trim().toLowerCase() === n) || null;
    },
    parcelsOnTank(tankId) {
      return this.data.parcels.filter((p) => p.gas === 'tank' && p.gasTankId === tankId).sort((a, b) => compareNr(a.nr, b.nr));
    },

    readingsOf(meterId) {
      return this.data.readings.filter((r) => r.meterId === meterId).sort((a, b) => a.date.localeCompare(b.date));
    },
    // letzte Ablesung vor (exklusiv) bzw. bis (inklusiv) einem Datum
    readingBefore(meterId, date, inclusive) {
      const list = this.readingsOf(meterId).filter((r) => (inclusive ? r.date <= date : r.date < date));
      return list[list.length - 1] || null;
    },
    lastReading(meterId) {
      const list = this.readingsOf(meterId);
      return list[list.length - 1] || null;
    },
    upsertReading(meterId, date, value) {
      const existing = this.data.readings.find((r) => r.meterId === meterId && r.date === date);
      if (existing) existing.value = value;
      else this.data.readings.push({ id: uid('r'), meterId, date, value });
    },
    readingDates(type) {
      const ids = new Set(this.data.meters.filter((m) => m.type === type).map((m) => m.id));
      return [...new Set(this.data.readings.filter((r) => ids.has(r.meterId)).map((r) => r.date))].sort();
    },

    // Löschen mit Aufräumen
    deleteParcel(id) {
      const meterIds = this.metersOf(id).map((m) => m.id);
      this.data.readings = this.data.readings.filter((r) => !meterIds.includes(r.meterId));
      this.data.meters = this.data.meters.filter((m) => m.parcelId !== id);
      this.data.parcels = this.data.parcels.filter((p) => p.id !== id);
    },
    deleteMeter(id) {
      this.data.readings = this.data.readings.filter((r) => r.meterId !== id);
      this.data.meters = this.data.meters.filter((m) => m.id !== id);
    },
    deleteBox(id) {
      this.data.meters.forEach((m) => { if (m.boxId === id) m.boxId = ''; });
      this.data.boxes = this.data.boxes.filter((b) => b.id !== id);
    },
    deleteTank(id) {
      this.data.parcels.forEach((p) => { if (p.gasTankId === id) p.gasTankId = ''; });
      this.data.tanks = this.data.tanks.filter((t) => t.id !== id);
    },

    // Fläche eines Polygons in m² (falls Maßstab bekannt)
    polygonArea(geometry) {
      const mpp = window.APP_CONFIG.map.metersPerPixel;
      if (!mpp || !geometry || geometry.length < 3) return null;
      let a = 0;
      for (let i = 0; i < geometry.length; i++) {
        const [x1, y1] = geometry[i];
        const [x2, y2] = geometry[(i + 1) % geometry.length];
        a += x1 * y2 - x2 * y1;
      }
      return Math.round(Math.abs(a / 2) * mpp * mpp);
    },
  };

  window.Store = Store;
})();
