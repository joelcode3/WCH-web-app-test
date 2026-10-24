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
    fest:       { label: 'Festwohnsitz',           short: 'Festwohnsitz',        color: '#1f4e8c' },
    wochenende: { label: 'Freizeitgrundstück',     short: 'Freizeitgrundstück',  color: '#6fa8dc' },
    reserviert: { label: 'Reserviert',             short: 'Reserviert',      color: '#2b6a33' },
    leer:       { label: 'Frei – bezugsfertig',    short: 'Frei',            color: '#6cbf5a', free: true },
    altbestand: { label: 'Frei – zu räumen',       short: 'Zu räumen',           color: '#ec8a2c', free: true },
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

  // To-Dos: Bearbeitungsstand
  const TODO_STATUS = {
    offen:    { label: 'Kein Status', short: 'Offen',      color: '#8a918b' },
    planung:  { label: 'In Planung',  short: 'In Planung', color: '#d49a0a' },
    arbeit:   { label: 'In Arbeit',   short: 'In Arbeit',  color: '#1b7fc9' },
    erledigt: { label: 'Erledigt',    short: 'Erledigt',   color: '#2b8a3e' },
  };

  // Orte auf der Karte (Gebäude, Spielplatz …), an denen To-Dos hängen können. icon = Linien-Symbol (SVG)
  const PLACE_KINDS = {
    sanitaer: { label: 'Sanitärgebäude', icon: '<svg viewBox="0 0 24 24" class="pk-ico" aria-hidden="true"><path d="M7 3h4v7H7z M5 10h14a5 5 0 0 1-5 5h-4l-1 6h6"/></svg>' },
    grill: { label: 'Grillhütte', icon: '<svg viewBox="0 0 24 24" class="pk-ico" aria-hidden="true"><path d="M4 10h16a8 8 0 0 1-16 0z M8 21l2-4 M16 21l-2-4 M9 7c0-1.5 1.5-1.5 1.5-3 M14 7c0-1.5 1.5-1.5 1.5-3"/></svg>' },
    spielplatz: { label: 'Spielplatz', icon: '<svg viewBox="0 0 24 24" class="pk-ico" aria-hidden="true"><path d="M3 21 L8 4 L13 21 M5.5 13h5 M16 21V9 M14 9h4 M16 13l4 8"/></svg>' },
    rezeption: { label: 'Rezeption / Büro', icon: '<svg viewBox="0 0 24 24" class="pk-ico" aria-hidden="true"><path d="M3 11l9-7 9 7 M5 10v10h14V10 M10 20v-5h4v5"/></svg>' },
    gebaeude: { label: 'Gebäude / Halle', icon: '<svg viewBox="0 0 24 24" class="pk-ico" aria-hidden="true"><path d="M3 20V9l9-5 9 5v11 M3 20h18 M8 20v-6h8v6"/></svg>' },
    wiese: { label: 'Camperwiese', icon: '<svg viewBox="0 0 24 24" class="pk-ico" aria-hidden="true"><path d="M12 3l-6 9h4l-4 6h12l-4-6h4z M12 18v3"/></svg>' },
    muell: { label: 'Müllplatz', icon: '<svg viewBox="0 0 24 24" class="pk-ico" aria-hidden="true"><path d="M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6"/></svg>' },
    wasser: { label: 'Wasser / Brunnen', icon: '<svg viewBox="0 0 24 24" class="pk-ico" aria-hidden="true"><path d="M12 3c3 4 6 7 6 10.5a6 6 0 0 1-12 0C6 10 9 7 12 3z"/></svg>' },
    shelter: { label: 'Shelter', icon: '<svg viewBox="0 0 24 24" class="pk-ico" aria-hidden="true"><path d="M3 9l18-4v15 M3 9v11 M3 20h18 M8 20v-6h8v6"/></svg>' },
    hundewiese: { label: 'Hundewiese', icon: '<svg viewBox="0 0 24 24" class="pk-ico" aria-hidden="true"><path d="M12 12.5c-3 0-5.5 3.3-5.5 5.3 0 1.5 1.2 2.4 2.8 2.4 1.1 0 1.8-.6 2.7-.6s1.6.6 2.7.6c1.6 0 2.8-.9 2.8-2.4 0-2-2.5-5.3-5.5-5.3z M5 10.5a1.7 2.1 0 1 0 3.4 0a1.7 2.1 0 1 0-3.4 0 M8.6 6.3a1.7 2.1 0 1 0 3.4 0a1.7 2.1 0 1 0-3.4 0 M12 6.3a1.7 2.1 0 1 0 3.4 0a1.7 2.1 0 1 0-3.4 0 M15.6 10.5a1.7 2.1 0 1 0 3.4 0a1.7 2.1 0 1 0-3.4 0"/></svg>' },
    // Draufsicht auf der Karte (drehbar) wie die airbnbs, aber ohne Kalender
    flugzeug: { label: 'Flugzeug', icon: '<svg viewBox="0 0 24 24" class="pk-ico" aria-hidden="true"><path d="M12 2.5c1 0 1.6 1 1.6 2.5v4.6l7.4 4.4v2l-7.4-2.3v4.4l2 1.5V21l-3.6-1-3.6 1v-1.4l2-1.5v-4.4L3 16v-2l7.4-4.4V5c0-1.5.6-2.5 1.6-2.5z"/></svg>', top: true },
    sonstiges: { label: 'Sonstiger Ort', icon: '<svg viewBox="0 0 24 24" class="pk-ico" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg>' },
    // Ferienunterkünfte (Airbnb): Draufsicht auf der Karte, Kalender mit Belegung
    londonbus: { label: 'Londonbus', icon: '<svg viewBox="0 0 24 24" class="pk-ico" aria-hidden="true"><path d="M5 3h14a1 1 0 0 1 1 1v13H4V4a1 1 0 0 1 1-1z M4 10h16 M7 20v-3 M17 20v-3 M7 13.5h.01 M17 13.5h.01"/></svg>', airbnb: true },
    glamping: { label: 'Glampingzelt', icon: '<svg viewBox="0 0 24 24" class="pk-ico" aria-hidden="true"><path d="M3 20L12 4l9 16z M12 4v16 M9 20l3-6 3 6"/></svg>', airbnb: true },
    baeckerwagen: { label: 'Bäckerwagen', icon: '<svg viewBox="0 0 24 24" class="pk-ico" aria-hidden="true"><path d="M2 6h12v11H2z M14 9h4.5l3.5 4v4h-8 M6.5 19.5a1.8 1.8 0 1 0 .01 0 M17.5 19.5a1.8 1.8 0 1 0 .01 0 M15.5 11h3"/></svg>', airbnb: true },
    unterkunft: { label: 'Ferienunterkunft (sonstige)', icon: '<svg viewBox="0 0 24 24" class="pk-ico" aria-hidden="true"><path d="M3 11l9-7 9 7 M5 10v10h14V10 M10 20v-5h4v5"/></svg>', airbnb: true },
  };


  // Startplätze der Ferienunterkünfte (große Wiese), später im Bearbeiten-Modus verschiebbar
  const AIRBNB_DEFAULTS = [
    { name: 'Londonbus 1', kind: 'londonbus', pos: [1200, 740] },
    { name: 'Londonbus 2', kind: 'londonbus', pos: [1330, 740] },
    { name: 'Glampingzelt 1', kind: 'glamping', pos: [1450, 740] },
    { name: 'Glampingzelt 2', kind: 'glamping', pos: [1560, 740] },
    { name: 'Bäckerwagen', kind: 'baeckerwagen', pos: [1380, 880] },
  ];

  // Orte aus dem Lageplan (tools/plan_extras.py): werden einmal automatisch angelegt, wenn sie fehlen.
  // near = gilt als vorhanden, wenn ein Ort dieser Art in diesem Umkreis (Kartenpixel) liegt; 0 = irgendwo
  const PLAN_PLACES = [
    { id: 'o-plan-grill', name: 'Grillhütte', kind: 'grill', pos: [1347, 575], near: 0 },
    { id: 'o-plan-spielplatz', name: 'Spielplatz', kind: 'spielplatz', pos: [1356, 862], near: 0 },
    { id: 'o-plan-shelter1', name: 'Shelter 1', kind: 'shelter', pos: [1457, 958], near: 12 },
    { id: 'o-plan-shelter2', name: 'Shelter 2', kind: 'shelter', pos: [1494, 967], near: 12 },
    { id: 'o-plan-shelter3', name: 'Shelter 3', kind: 'shelter', pos: [1553, 961], near: 12 },
    { id: 'o-plan-muell', name: 'Müllplatz', kind: 'muell', pos: [504, 1263], near: 60 },
    { id: 'o-plan-hundewiese', name: 'Hundewiese', kind: 'hundewiese', pos: [1469, 565], near: 0 },
    { id: 'o-plan-flugzeug', name: 'Flugzeug', kind: 'flugzeug', pos: [1600, 281, 270], near: 0 },
  ];
  const PLAN_PLACES_KEY = 'wch-plan-orte-1';

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
    return { version: 1, parcels: planParcels(), boxes: [], tanks: [], meters: [], readings: [], places: [], todos: [] };
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

    // Orte & To-Dos (Beispiele)
    const places = [
      { id: uid('o'), name: 'Sanitärgebäude 1', kind: 'sanitaer', pos: [505, 1435], notes: '' },
      { id: uid('o'), name: 'Grillhütte', kind: 'grill', pos: [1249, 458], notes: 'Schlüssel an der Rezeption' },
      { id: uid('o'), name: 'Spielplatz', kind: 'spielplatz', pos: [877, 807], notes: '' },
      ...AIRBNB_DEFAULTS.map((a) => ({ id: uid('o'), notes: '', icalUrl: 'demo', photo: null, ...a })),
    ];
    const iso = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
    const todo = (o) => ({ id: uid('d'), title: '', description: '', targetType: '', targetId: '', location: '', status: 'offen',
      deadline: '', appointment: '', assignee: '', photos: [], createdAt: new Date(Date.now() - 3 * 864e5).toISOString(), doneAt: '', ...o });
    const todos = [
      todo({ title: 'Dusche tropft', description: 'Duschkopf und Dichtung tauschen.', targetType: 'parcel', targetId: parcels[5] ? parcels[5].id : '', status: 'planung', deadline: iso(5), assignee: 'Thomas' }),
      todo({ title: 'Zähler tauschen (Eichfrist)', targetType: 'box', targetId: boxes[2] ? boxes[2].id : '', status: 'arbeit', deadline: iso(20), appointment: `${iso(9)}T10:00`, assignee: 'Elektro Meyer' }),
      todo({ title: 'Baumschnitt am Hauptweg', location: 'Hauptweg', deadline: iso(-2), assignee: 'Thomas' }),
      todo({ title: 'Reparatur im Sanitärgebäude 2', description: 'Spülkasten Herren-WC läuft nach.', location: 'Sanitärgebäude 2', status: 'offen' }),
      todo({ title: 'Grillrost erneuern', targetType: 'place', targetId: places[1].id, status: 'erledigt', doneAt: iso(-1) }),
    ];

    return { version: 1, parcels, boxes, tanks, meters, readings, places, todos, demo: true };
  }

  /* ---------- Store ---------- */

  const Store = {
    STATUS, MOVE_OUT_COLOR, GAS, HEATING, SUPPLY, OBJECT_TYPES, PURPOSES, TODO_STATUS, PLACE_KINDS, AIRBNB_DEFAULTS, supplyOf, uid, compareNr,
    isAirbnb: (o) => !!(o && (PLACE_KINDS[o.kind] || {}).airbnb),
    // Fehlende Orte aus dem Lageplan einmal je Gerät anlegen (feste IDs → kein Doppel bei mehreren Geräten).
    // Danach gelöschte Orte kommen auf diesem Gerät nicht wieder.
    ensurePlanPlaces() {
      try { if (localStorage.getItem(PLAN_PLACES_KEY)) return; } catch (e) { return; }
      if (this.mode === 'cloud' && window.Cloud && Cloud.missing.has('places')) return;
      let added = 0;
      PLAN_PLACES.forEach(({ near, ...p }) => {
        const exists = this.data.places.some((o) => o.id === p.id || (o.kind === p.kind
          && (!near || (o.pos && Math.hypot(o.pos[0] - p.pos[0], o.pos[1] - p.pos[1]) < near))));
        if (exists) return;
        this.data.places.push({ notes: '', icalUrl: '', photo: null, ...p, pos: [...p.pos] });
        added++;
      });
      try { localStorage.setItem(PLAN_PLACES_KEY, '1'); } catch (e) { /* egal */ }
      if (added) this.save();
    },
    // Reihenfolge: Londonbusse, Glampingzelte, Bäckerwagen, sonstige – innerhalb nach Name
    airbnbs() {
      const order = ['londonbus', 'glamping', 'baeckerwagen', 'unterkunft'];
      return this.data.places.filter((o) => this.isAirbnb(o))
        .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.name.localeCompare(b.name, 'de', { numeric: true }));
    },
    // Inserats-Link aus dem Kalender-Link ableiten (…/calendar/ical/123.ics → …/rooms/123)
    listingUrl(o) {
      const m = String(o.icalUrl || '').match(/^https:\/\/(www\.airbnb\.[a-z.]+)\/calendar\/ical\/(\d+)\.ics/);
      return m ? `https://${m[1]}/rooms/${m[2]}` : '';
    },
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
      ['parcels', 'boxes', 'tanks', 'meters', 'readings', 'places', 'todos'].forEach((k) => { if (!Array.isArray(d[k])) d[k] = []; });
      d.places.forEach((o) => {
        o.name = o.name || '';
        if (!PLACE_KINDS[o.kind]) o.kind = 'sonstiges';
        o.notes = o.notes || '';
        o.icalUrl = o.icalUrl || '';
        o.photo = o.photo && (o.photo.path || o.photo.data) ? o.photo : null;
      });
      d.todos.forEach((t) => {
        ['title', 'description', 'targetType', 'targetId', 'location', 'deadline', 'appointment', 'assignee', 'doneAt'].forEach((k) => { t[k] = t[k] || ''; });
        if (!TODO_STATUS[t.status]) t.status = 'offen';
        if (!Array.isArray(t.photos)) t.photos = [];
        t.createdAt = t.createdAt || new Date().toISOString();
      });
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
        m.fuses = Array.isArray(m.fuses) ? m.fuses.map((f) => ({ nr: String(f.nr || ''), label: String(f.label || '') })) : [];
        m.fuseBoxId = m.fuseBoxId || '';
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
    /*
     * Abgleich mit dem Lageplan über die Lage (nicht über die Nummer): Jede Parzelle im Bestand
     * wird der Plan-Parzelle zugeordnet, mit der sie sich am stärksten überdeckt.
     * → changes: neue Nummer; added: im Plan, aber nicht im Bestand; unmatched: nicht im Plan
     * (z. B. selbst gezeichnet). Mieter, Zähler, Ablesungen und To-Dos hängen an der Parzelle
     * (nicht an der Nummer) und bleiben beim Umnummerieren erhalten.
     */
    planSync() {
      const plan = (window.PLAN_DATA && window.PLAN_DATA.parcels) || [];
      const res = { changes: [], added: [], unmatched: [], shapes: [], matched: 0 };
      if (!plan.length || !window.polygonClipping) return res;
      const ring = (g) => [[...g.map((c) => [c[0], c[1]]), [g[0][0], g[0][1]]]];
      const area = (mp) => mp.reduce((s, poly) => s + poly.reduce((t, r, i) => {
        let a = 0;
        for (let k = 0; k < r.length - 1; k++) a += r[k][0] * r[k + 1][1] - r[k + 1][0] * r[k][1];
        return t + (i === 0 ? 1 : -1) * Math.abs(a / 2);
      }, 0), 0);
      const box = (g) => g.reduce((b, c) => [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])], [Infinity, Infinity, -Infinity, -Infinity]);
      const planB = plan.map((pp) => ({ pp, b: box(pp.geometry), a: area([ring(pp.geometry)]) }));
      const pairs = [];
      this.data.parcels.forEach((p) => {
        if (!p.geometry || p.geometry.length < 3) return;
        const b = box(p.geometry), a = area([ring(p.geometry)]);
        planB.forEach((q, qi) => {
          if (q.b[0] > b[2] || q.b[2] < b[0] || q.b[1] > b[3] || q.b[3] < b[1]) return;
          let inter = 0;
          try { inter = area(window.polygonClipping.intersection(ring(p.geometry), ring(q.pp.geometry))); } catch (_) { return; }
          const iou = inter / (a + q.a - inter);
          if (iou > 0.5) pairs.push({ p, qi, iou, inter, a });
        });
      });
      pairs.sort((x, y) => y.iou - x.iou);
      const usedP = new Set(), usedQ = new Set();
      pairs.forEach(({ p, qi, iou, inter, a }) => {
        if (usedP.has(p.id) || usedQ.has(qi)) return;
        usedP.add(p.id); usedQ.add(qi);
        res.matched++;
        if (p.nr !== plan[qi].nr) res.changes.push({ id: p.id, from: p.nr, to: plan[qi].nr });
        // Neuer Umriss im Lageplan (z. B. Parzellen vergrößert): nur übernehmen, wenn der alte Umriss
        // fast ganz im neuen liegt und nur wenig kleiner ist – selbst geteilte/gezeichnete bleiben unberührt
        const grow = planB[qi].a / a;
        if (iou < 0.995 && iou > 0.75 && inter / a > 0.98 && grow >= 1 && grow < 1.35) res.shapes.push({ id: p.id, nr: plan[qi].nr, geometry: plan[qi].geometry });
      });
      res.unmatched = this.data.parcels.filter((p) => !usedP.has(p.id)).map((p) => ({ id: p.id, nr: p.nr }));
      res.added = plan.filter((_, qi) => !usedQ.has(qi));
      return res;
    },

    // Nummern aus dem Lageplan übernehmen, neue Plan-Parzellen leer ergänzen
    applyPlanSync(sync) {
      const newNrs = new Set([...sync.changes.map((c) => c.to), ...sync.added.map((pp) => pp.nr)]);
      const byId = new Map(this.data.parcels.map((p) => [p.id, p]));
      sync.changes.forEach((c) => { const p = byId.get(c.id); if (p) p.nr = c.to; });
      (sync.shapes || []).forEach((c) => { const p = byId.get(c.id); if (p) p.geometry = c.geometry.map((xy) => [xy[0], xy[1]]); });
      // nicht zugeordnete Parzellen, deren Nummer jetzt vergeben ist, kenntlich machen
      sync.unmatched.forEach((u) => {
        const p = byId.get(u.id);
        if (p && newNrs.has(p.nr)) p.nr = `${p.nr} (alt)`;
      });
      const fresh = planParcels();
      sync.added.forEach((pp) => { const np = fresh.find((x) => x.nr === pp.nr); if (np) this.data.parcels.push(np); });
      this.save();
    },

    // Orte und To-Dos bleiben erhalten (To-Dos alter Parzellen werden zu "allgemein")
    resetToPlan() {
      const old = this.data || {};
      const labels = Object.fromEntries((old.todos || []).map((t) => [t.id, this.todoTargetText(t)]));
      this.data = emptyFromPlan();
      this.data.places = old.places || [];
      this.data.todos = (old.todos || []).map((t) => (t.targetType && t.targetType !== 'place'
        ? { ...t, targetType: '', targetId: '', location: labels[t.id] } : t));
      this.save();
    },

    importJSON(obj) {
      if (!obj || !Array.isArray(obj.parcels)) throw new Error('Keine gültige Sicherungsdatei.');
      this.data = obj;
      this._normalize();
      this.save();
    },

    clearAll() {
      this.data = { version: 1, parcels: [], boxes: [], tanks: [], meters: [], readings: [], places: [], todos: [] };
      this.save();
    },

    // Zugriff
    parcel(id) { return this.data.parcels.find((p) => p.id === id); },
    box(id) { return this.data.boxes.find((b) => b.id === id); },
    tank(id) { return this.data.tanks.find((t) => t.id === id); },
    meter(id) { return this.data.meters.find((m) => m.id === id); },
    place(id) { return this.data.places.find((o) => o.id === id); },
    todo(id) { return this.data.todos.find((t) => t.id === id); },
    placesSorted() { return [...this.data.places].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true })); },

    /* To-Dos */
    isDone: (t) => t.status === 'erledigt',
    isOverdue(t, today) { return !!t.deadline && t.status !== 'erledigt' && t.deadline < (today || new Date().toISOString().slice(0, 10)); },
    target(t) {
      const fn = { parcel: 'parcel', box: 'box', tank: 'tank', place: 'place' }[t.targetType];
      return fn ? this[fn](t.targetId) : null;
    },
    // "Parzelle 1.23", "Stromkasten 4", "Grillhütte", freier Ort oder "Allgemein"
    todoTargetText(t) {
      const o = this.target(t);
      if (o) {
        if (t.targetType === 'parcel') return `Parzelle ${o.nr}`;
        if (t.targetType === 'box') return `Stromkasten ${o.nr}`;
        if (t.targetType === 'tank') return `Gastank ${o.nr}`;
        if (t.targetType === 'place') return o.name || PLACE_KINDS[o.kind].label;
      }
      return t.location || 'Allgemein';
    },
    todosOf(type, id, withDone) {
      return this.data.todos.filter((t) => t.targetType === type && t.targetId === id && (withDone || t.status !== 'erledigt'));
    },
    // offene To-Dos je Ziel: Map "parcel:ID" → Anzahl
    openTodoCounts() {
      const m = new Map();
      this.data.todos.forEach((t) => {
        if (t.status === 'erledigt' || !t.targetType) return;
        const k = `${t.targetType}:${t.targetId}`;
        m.set(k, (m.get(k) || 0) + 1);
      });
      return m;
    },
    // Ziel wird gelöscht → To-Dos behalten den Namen als freien Ort
    _detachTodos(type, id) {
      this.data.todos.forEach((t) => {
        if (t.targetType === type && t.targetId === id) {
          t.location = `${this.todoTargetText(t)} (gelöscht)`;
          t.targetType = ''; t.targetId = '';
        }
      });
    },
    /* Sicherungen: hängen am Stromzähler; Kasten = Zählerkasten bzw. bei Zähler im Haus eigener Kasten */
    fuseBoxOf(m) { return m.type === 'strom' ? (m.inHouse ? m.fuseBoxId : m.boxId) || '' : ''; },
    normFuse: (n) => String(n || '').replace(/\s/g, '').toUpperCase(),
    fusesText(m) {
      return (m.fuses || []).filter((f) => f.nr || f.label).map((f) => (f.label ? `${f.nr || '?'} (${f.label})` : f.nr)).join(', ');
    },

    deleteTodo(id) { this.data.todos = this.data.todos.filter((t) => t.id !== id); },
    deletePlace(id) {
      this._detachTodos('place', id);
      this.data.places = this.data.places.filter((o) => o.id !== id);
    },

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
    // freier Zähler: im Kasten, aber (noch) keiner Parzelle und keinem Betrieb zugeordnet
    isFreeMeter: (m) => m.purpose === 'frei' && !m.parcelId,
    purposeText(m) {
      const base = m.purpose === 'frei' ? 'Frei (nicht zugeordnet)' : PURPOSES[m.purpose] || 'Betrieb';
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
      this._detachTodos('parcel', id);
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
      this._detachTodos('box', id);
      this.data.meters.forEach((m) => { if (m.boxId === id) m.boxId = ''; if (m.fuseBoxId === id) m.fuseBoxId = ''; });
      this.data.boxes = this.data.boxes.filter((b) => b.id !== id);
    },
    deleteTank(id) {
      this._detachTodos('tank', id);
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
