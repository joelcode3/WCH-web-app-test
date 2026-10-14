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

  // Reihenfolge = Reihenfolge in Auswahllisten und Legende
  const STATUS = {
    fest:       { label: 'Festwohnsitz',           short: 'Fest',            color: '#1f4e8c' },
    wochenende: { label: 'Wochenendparzelle',      short: 'Wochenende',      color: '#6fa8dc' },
    reserviert: { label: 'Reserviert',             short: 'Reserviert',      color: '#2b6a33' },
    leer:       { label: 'Frei – bezugsfertig',    short: 'Frei',            color: '#6cbf5a', free: true },
    altbestand: { label: 'Frei – noch zu räumen',  short: 'Noch zu räumen',  color: '#ec8a2c', free: true },
  };
  // Bewohnt, aber Auszugstermin steht fest → diagonal zweifarbig (Status / frei)
  const MOVE_OUT_COLOR = STATUS.leer.color;

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
    tank:   { label: 'Gastank',          color: '#5cc49a' },
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

  // Leerer Bestand: alle Parzellen aus dem Lageplan, ohne Mieter/Zähler
  function planParcels() {
    const plan = window.PLAN_DATA || { parcels: [] };
    return plan.parcels.map((pp) => ({
      id: uid('p'), nr: pp.nr, status: 'leer',
      tenant: { name: '', phone: '', email: '', address: '' },
      size: pp.area || '', gas: 'none', gasTankId: '', heating: 'keine',
      objectType: 'pacht', rent: '', winterWater: false, dogs: 0, residents: 0, leaseStart: '', freeFrom: '',
      notes: '', geometry: pp.geometry.map((c) => [c[0], c[1]]),
    }));
  }

  function emptyFromPlan() {
    return { version: 1, parcels: planParcels(), boxes: [], tanks: [], meters: [], readings: [] };
  }

  /* ---------- Demo-Daten (auf dem echten Lageplan, Namen/Nummern erfunden) ---------- */

  function seed() {
    let s = 42;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const pad = (n) => String(n).padStart(2, '0');

    const first = ['Anke', 'Bernd', 'Claudia', 'Dieter', 'Elke', 'Frank', 'Gabi', 'Heiko', 'Ingrid', 'Jürgen',
      'Karin', 'Lars', 'Monika', 'Norbert', 'Petra', 'Rainer', 'Sabine', 'Thomas', 'Ute', 'Werner'];
    const last = ['Ahrens', 'Behrens', 'Brandt', 'Cordes', 'Dittmer', 'Eckhoff', 'Gerdes', 'Hinck', 'Indorf',
      'Kück', 'Lühmann', 'Meyer', 'Oetjen', 'Prigge', 'Rathjen', 'Steffens', 'Tiedemann', 'Viebrock', 'Wahlers', 'Zabel'];

    const plan = window.PLAN_DATA || { parcels: [], demoBoxes: [] };
    const boxes = (plan.demoBoxes || []).map((pos, i) => ({ id: uid('b'), nr: String(i + 1), pos: [pos[0], pos[1]], location: '', limitKwh: '' }));
    if (boxes[0]) boxes[0].location = 'am Weg bei der Rezeption';
    if (boxes[2]) boxes[2].limitKwh = 1500;
    // Tank neben einem Kasten platzieren, aber nicht auf einem anderen Symbol
    const tankAt = (i) => {
      const base = boxes[i] ? boxes[i].pos : [100, 100];
      const free = (pt) => boxes.every((bx) => Math.hypot(bx.pos[0] - pt[0], bx.pos[1] - pt[1]) > 60);
      const offsets = [[0, 45], [0, -45], [60, 0], [-60, 0], [50, 45], [-50, 45], [50, -45], [-50, -45], [0, 90], [90, 0]];
      const hit = offsets.map(([dx, dy]) => [base[0] + dx, base[1] + dy]).find(free);
      return hit || [base[0], base[1] + 45];
    };
    const tanks = [
      { id: uid('t'), nr: '1', pos: tankAt(12), capacity: '2.900 l', notes: 'Füllstand prüfen lassen' },
      { id: uid('t'), nr: '2', pos: tankAt(5), capacity: '2.100 l', notes: '' },
    ];

    const parcels = planParcels();
    const meters = [];
    const readings = [];
    const center = (g) => g.reduce((a, c) => [a[0] + c[0] / g.length, a[1] + c[1] / g.length], [0, 0]);

    parcels.forEach((p) => {
      const [cx, cy] = center(p.geometry);
      const r = rnd();
      const status = r < 0.08 ? 'leer' : r < 0.14 ? 'altbestand' : r < 0.18 ? 'reserviert' : r < 0.55 ? 'wochenende' : 'fest';
      const free = STATUS[status].free;
      const nearTank = tanks.find((t) => Math.hypot(t.pos[0] - cx, t.pos[1] - cy) < 170);
      const g = rnd();
      let gas = g < 0.35 ? 'none' : g < 0.65 ? 'bottle' : 'tank';
      if (gas === 'tank' && !nearTank) gas = 'bottle';
      let heating = gas === 'tank' ? 'gas' : gas === 'bottle' ? (rnd() < 0.6 ? 'gas' : 'holz') : (rnd() < 0.7 ? 'strom' : 'holz');
      if (free) { heating = 'keine'; gas = 'none'; }
      Object.assign(p, {
        status, gas, heating,
        gasTankId: gas === 'tank' ? nearTank.id : '',
        objectType: rnd() < 0.15 ? 'miet' : 'pacht',
        rent: free ? '' : Math.round((status === 'fest' ? 180 : 120) + rnd() * 80),
        winterWater: status === 'fest' ? rnd() < 0.85 : status === 'wochenende' ? rnd() < 0.3 : false,
        dogs: free ? 0 : (rnd() < 0.3 ? (rnd() < 0.25 ? 2 : 1) : 0),
        residents: free ? 0 : status === 'reserviert' ? 0 : 1 + Math.floor(rnd() * (status === 'fest' ? 3 : 4)),
        leaseStart: free ? '' : `${2005 + Math.floor(rnd() * 20)}-${pad(1 + Math.floor(rnd() * 12))}-01`,
        freeFrom: (status === 'fest' || status === 'wochenende') && rnd() < 0.07 ? `2027-${pad(3 + Math.floor(rnd() * 6))}-01` : '',
      });
      if (!free) {
        const fn = pick(first), ln = pick(last);
        p.tenant = {
          name: `${fn} ${ln}`,
          phone: `0171 ${Math.floor(1000000 + rnd() * 8999999)}`,
          email: `${fn}.${ln}@example.de`.toLowerCase().replace(/ü/g, 'ue').replace(/ö/g, 'oe').replace(/ä/g, 'ae'),
          address: status === 'fest' ? 'Zum Waldbad 3, 27404 Gyhum-Hesedorf' : '',
        };
      }

      // Stromzähler im nächstgelegenen Kasten (manche im Haus)
      if (!boxes.length) return;
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
    });
    if (parcels[2]) parcels[2].notes = 'Schlüssel für Stromkasten beim Mieter hinterlegt.';

    // Betriebszähler (ohne Parzelle)
    [[1, 'rezeption', 'Rezeption'], [2, 'sanitaer', 'Sanitärgebäude'], [8, 'licht', 'Wegbeleuchtung'], [12, 'camper', 'Säulen Wiese']]
      .forEach(([boxNr, purpose, label]) => {
        const box = boxes[boxNr - 1];
        if (!box) return;
        const m = { id: uid('m'), type: 'strom', number: `1ESY${Math.floor(10000000 + rnd() * 89999999)}`,
          parcelId: '', boxId: box.id, inHouse: false, purpose, label, location: '', notes: '' };
        meters.push(m);
        const v = Math.round(20000 + rnd() * 40000);
        readings.push({ id: uid('r'), meterId: m.id, date: '2024-10-01', value: v });
        readings.push({ id: uid('r'), meterId: m.id, date: '2025-10-01', value: v + Math.round(2000 + rnd() * 9000) });
      });

    return { version: 1, parcels, boxes, tanks, meters, readings, demo: true };
  }

  /* ---------- Store ---------- */

  const Store = {
    STATUS, MOVE_OUT_COLOR, GAS, HEATING, SUPPLY, OBJECT_TYPES, PURPOSES, supplyOf, uid, compareNr,
    // Bewohnt, aber Auszug steht fest?
    movingOut: (p) => !!p.freeFrom && (p.status === 'fest' || p.status === 'wochenende'),
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
        p.dogs = Math.max(0, parseInt(p.dogs, 10) || 0);
        p.residents = Math.max(0, parseInt(p.residents, 10) || 0);
        p.leaseStart = p.leaseStart || '';
        p.freeFrom = p.freeFrom || '';
        if (!STATUS[p.status]) p.status = 'leer';
      });
      d.boxes.forEach((b) => { if (b.limitKwh === undefined || b.limitKwh === null) b.limitKwh = ''; });
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

    // Alle Daten durch die leeren Parzellen aus dem Lageplan ersetzen
    resetToPlan() { this.data = emptyFromPlan(); this.save(); },

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
