/*
 * Ferienunterkünfte (Airbnb): Draufsichten für die Karte, Belegung aus den Airbnb-Kalendern,
 * Monatskalender (Infofenster) und Belegungsübersicht (Reiter "Airbnb").
 *
 * Die Kalender holt die Supabase-Funktion "airbnb-kalender" (der Browser darf Airbnb nicht
 * direkt abfragen). Im lokalen Testmodus gibt es erfundene Beispiel-Belegungen.
 */
(function () {
  'use strict';

  const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayIso = () => iso(new Date());
  const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
  const fmtShort = (s) => { const [, m, d] = s.split('-'); return `${+d}.${+m}.`; };
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  /* ---------- Draufsichten (Maßstab: 1 Einheit = 0,2 m, wie der Lageplan) ---------- */
  const TOP = {
    // Doppeldecker ca. 9,5 × 2,5 m, Front rechts
    londonbus: { w: 48, h: 13, svg: `<svg viewBox="0 0 96 26" aria-hidden="true">
      <rect x="1" y="1" width="94" height="24" rx="5" fill="#c8322d" stroke="#7d1c18" stroke-width="1.5"/>
      <rect x="5" y="4.5" width="83" height="17" rx="3" fill="#d84a3f"/>
      <rect x="88" y="4" width="5" height="18" rx="2" fill="#2c3b44"/>
      <rect x="18" y="8.5" width="10" height="9" rx="1.5" fill="#9e2621"/><rect x="60" y="8.5" width="10" height="9" rx="1.5" fill="#9e2621"/>
      <path d="M36 13 H52" stroke="#efe3c6" stroke-width="2.5" stroke-linecap="round"/></svg>` },
    // Glockenzelt ca. 5 m Durchmesser, Eingang unten
    glamping: { w: 27, h: 27, svg: `<svg viewBox="0 0 54 54" aria-hidden="true">
      <circle cx="27" cy="27" r="25" fill="#f2ead8" stroke="#a8946c" stroke-width="1.5"/>
      <g stroke="#cfc09c" stroke-width="1"><path d="M27 2 V52 M2 27 H52 M9.3 9.3 L44.7 44.7 M44.7 9.3 L9.3 44.7"/></g>
      <path d="M27 27 L19 50 A25 25 0 0 0 35 50 Z" fill="#c9b48a"/>
      <circle cx="27" cy="27" r="4" fill="#8d6b45"/></svg>` },
    // Bäckerwagen: Kastenwagen ca. 5,6 × 2,2 m, cremefarbener Aufbau, dunkelgrüne Front rechts
    baeckerwagen: { w: 28, h: 11, svg: `<svg viewBox="0 0 112 44" aria-hidden="true">
      <rect x="80" y="-1" width="7" height="5" rx="1.5" fill="#1a3a2e"/><rect x="80" y="40" width="7" height="5" rx="1.5" fill="#1a3a2e"/>
      <rect x="2" y="3" width="84" height="38" rx="4" fill="#efe3c4" stroke="#8e7d57" stroke-width="2"/>
      <rect x="9" y="9" width="70" height="26" rx="2" fill="#e6d8b4"/>
      <g stroke="#d3c39b" stroke-width="1.5"><path d="M23 9v26M37 9v26M51 9v26M65 9v26"/></g>
      <path d="M84 4h10c9 0 15 6 15 18s-6 18-15 18H84z" fill="#1f4a3a" stroke="#122d23" stroke-width="2"/>
      <path d="M86 8h7c3 0 4 2 4 4v20c0 2-1 4-4 4h-7z" fill="#2c3b44"/>
      <path d="M101 14q4 8 0 16" stroke="#3b6b58" stroke-width="2" fill="none"/></svg>` },
    // sonstige Unterkunft: Hütte mit Satteldach
    unterkunft: { w: 30, h: 22, svg: `<svg viewBox="0 0 60 44" aria-hidden="true">
      <rect x="1" y="1" width="58" height="42" rx="2" fill="#9a6b40" stroke="#5d3b1f" stroke-width="1.5"/>
      <path d="M1 22 H59" stroke="#c49461" stroke-width="2.5"/><path d="M1 1 L59 43 M59 1 L1 43" stroke="#7d5432" stroke-width=".8" opacity=".5"/></svg>` },
  };
  const top = (kind) => TOP[kind] || TOP.unterkunft;
  // fester Zufallswert je Unterkunft (für die Beispiel-Belegung im Testmodus)
  const hash = (id) => { let n = 0; for (const c of String(id)) n = (n * 31 + c.charCodeAt(0)) % 997; return n; };

  /* ---------- Belegung ---------- */
  const Airbnb = {
    top,
    events: {},          // Ort-ID → [{ start, end, type }]
    errors: {},          // Ort-ID → Fehlermeldung
    state: 'idle',       // idle | loading | ok | demo | missing | needsUpdate | error
    error: '',
    fetchedAt: null,
    photoUrls: {},       // Ort-ID → Link zum Vorschaubild
    listeners: [],
    onChange(fn) { this.listeners.push(fn); },
    _emit() { this.listeners.forEach((fn) => fn()); },

    async load(force) {
      if (this.state === 'loading') return;
      if (!force && this.fetchedAt && Date.now() - this.fetchedAt < 10 * 60000) return;
      const S = window.Store;
      if (!S.airbnbs().length) return;
      if (S.mode !== 'cloud') { this._demo(); this._emit(); return; }
      // auch erfolglose Versuche merken – sonst löst jede Anzeige sofort einen neuen Versuch aus
      this.fetchedAt = Date.now();
      if (Cloud.missingCols.has('places.ical_url')) { this.state = 'needsUpdate'; this._emit(); return; }
      if (!S.airbnbs().some((o) => o.icalUrl)) { this.state = 'ok'; this.events = {}; this._emit(); return; }
      this.state = 'loading';
      this._emit();
      try {
        const data = await Cloud.calendars();
        this.events = {}; this.errors = {};
        (data.units || []).forEach((u) => { if (u.error) this.errors[u.id] = u.error; else this.events[u.id] = u.events || []; });
        this.state = 'ok';
        this.error = '';
        this.fetchedAt = Date.now();
        clearTimeout(this._retry); this._retry = null;
      } catch (e) {
        // einmal nach kurzer Zeit erneut versuchen (z. B. Netz nach dem Aufwecken noch nicht da)
        if (!this._retry) { this._retry = setTimeout(() => { this._retry = null; this.load(true); }, 20000); }
        this.state = e.message === 'missing' ? 'missing' : 'error';
        this.error = e.status === 401
          ? 'Supabase hat den Aufruf abgelehnt (401). Bitte bei der Funktion „airbnb-kalender“ unter „Details“ die Option „Verify JWT“ ausschalten (siehe SETUP.md).'
          : e.message;
      }
      this._emit();
    },

    // erfundene Belegung für den Testmodus (fest je Unterkunft)
    _demo() {
      this.events = {};
      window.Store.airbnbs().forEach((o) => {
        let seed = hash(o.id) + 7 + o.name.length * 13;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        const out = [];
        let d = addDays(todayIso(), -20 + Math.floor(rnd() * 5));
        while (d < addDays(todayIso(), 120)) {
          const nights = 2 + Math.floor(rnd() * 5);
          const blocked = rnd() < 0.1;
          out.push({ start: d, end: addDays(d, nights), type: blocked ? 'blocked' : 'reserved' });
          d = addDays(d, nights + Math.floor(rnd() * 6));
        }
        this.events[o.id] = out;
      });
      this.state = 'demo';
      this.fetchedAt = Date.now();
    },

    // Buchung, die die Nacht ab Tag d enthält
    eventOn(o, d) { return (this.events[o.id] || []).find((e) => e.start <= d && d < e.end) || null; },
    hasData(o) { return !!this.events[o.id]; },

    // { busy, text, cls } für heute
    status(o) {
      if (this.errors[o.id]) return { cls: 'unk', text: 'Kalender nicht abrufbar' };
      if (!o.icalUrl) return { cls: 'unk', text: 'kein Kalender-Link hinterlegt' };
      if (!this.hasData(o)) return { cls: 'unk', text: this.state === 'loading' ? 'Kalender wird geladen …' : 'Belegung unbekannt' };
      const t = todayIso();
      const cur = this.eventOn(o, t);
      if (cur) {
        // zusammenhängende Buchungen zusammenfassen
        let end = cur.end, next;
        while ((next = this.eventOn(o, end)) && next.type === cur.type) end = next.end;
        return cur.type === 'blocked'
          ? { cls: 'blk', busy: true, text: `geblockt bis ${fmtShort(end)}` }
          : { cls: 'busy', busy: true, text: `belegt bis ${fmtShort(end)}` };
      }
      const next = (this.events[o.id] || []).find((e) => e.start > t);
      return { cls: 'free', busy: false, text: next ? `frei bis ${fmtShort(next.start)}` : 'frei' };
    },

    // Anteil belegter Nächte im Monat (0…1)
    occupancy(o, y, m) {
      const days = new Date(y, m + 1, 0).getDate();
      let n = 0;
      for (let d = 1; d <= days; d++) if (this.eventOn(o, `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)) n++;
      return n / days;
    },

    // Tagesklasse: belegt / gesperrt, Anreise- bzw. Abreisetag halb
    _dayCls(o, d) {
      const ev = this.events[o.id] || [];
      const night = ev.find((e) => e.start <= d && d < e.end);
      const out = ev.find((e) => e.end === d);
      const cls = [];
      if (night) cls.push(night.type === 'blocked' ? 'n-blk' : 'n-res');
      if (night && night.start === d && !out) cls.push('d-in');
      if (out && !night) cls.push(out.type === 'blocked' ? 'o-blk' : 'o-res');
      return cls.join(' ');
    },

    // Monatskalender für das Infofenster
    monthHtml(o, y, m) {
      const first = new Date(y, m, 1);
      const lead = (first.getDay() + 6) % 7;
      const days = new Date(y, m + 1, 0).getDate();
      const t = todayIso();
      let cells = '';
      for (let i = 0; i < lead; i++) cells += '<span class="cal-day is-empty"></span>';
      for (let d = 1; d <= days; d++) {
        const s = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        cells += `<span class="cal-day ${this._dayCls(o, s)}${s === t ? ' is-today' : ''}${s < t ? ' is-past' : ''}">${d}</span>`;
      }
      const occ = this.hasData(o) ? Math.round(this.occupancy(o, y, m) * 100) : null;
      return `<div class="cal">
        <div class="cal-head"><button type="button" class="cal-nav" data-cal="-1" aria-label="Vormonat">‹</button>
          <strong>${MONTHS[m]} ${y}</strong>${occ !== null ? `<span class="muted small">${occ} % belegt</span>` : ''}
          <button type="button" class="cal-nav" data-cal="1" aria-label="Nächster Monat">›</button></div>
        <div class="cal-grid">${WD.map((w) => `<span class="cal-wd">${w}</span>`).join('')}${cells}</div>
        <div class="cal-legend"><span><i class="n-res"></i>belegt</span><span><i class="n-blk"></i>geblockt</span><span><i class="free"></i>frei</span></div>
      </div>`;
    },

    // Übersicht: alle Unterkünfte untereinander, Tage nebeneinander
    timelineHtml(units, start, n) {
      const t = todayIso();
      const days = Array.from({ length: n }, (_, i) => addDays(start, i));
      let months = '', cur = '', span = 0;
      days.forEach((d, i) => {
        const key = d.slice(0, 7);
        if (key !== cur && span) { months += `<span class="tl-month" style="grid-column: span ${span}">${MONTHS[+cur.slice(5) - 1]}</span>`; span = 0; }
        cur = key; span++;
        if (i === days.length - 1) months += `<span class="tl-month" style="grid-column: span ${span}">${MONTHS[+cur.slice(5) - 1]}</span>`;
      });
      const head = days.map((d) => {
        const wd = (new Date(d + 'T12:00:00').getDay() + 6) % 7;
        return `<span class="tl-day${wd >= 5 ? ' is-we' : ''}${d === t ? ' is-today' : ''}"><small>${WD[wd]}</small>${+d.slice(8)}</span>`;
      }).join('');
      const rows = units.map((o) => {
        const cells = days.map((d) => {
          const wd = (new Date(d + 'T12:00:00').getDay() + 6) % 7;
          const ev = this.eventOn(o, d);
          const title = ev ? `${ev.type === 'blocked' ? 'geblockt' : 'belegt'} ${fmtShort(ev.start)}–${fmtShort(ev.end)}` : 'frei';
          return `<span class="tl-cell ${this._dayCls(o, d)}${wd >= 5 ? ' is-we' : ''}${d === t ? ' is-today' : ''}" title="${h(o.name)}: ${fmtShort(d)} ${title}"></span>`;
        }).join('');
        return `<a class="tl-name" href="#/karte/place/${o.id}">${h(o.name)}</a>${cells}`;
      }).join('');
      return `<div class="tl-wrap"><div class="tl" style="grid-template-columns: var(--tl-name) repeat(${n}, var(--tl-col))">
        <span class="tl-corner"></span>${months}<span class="tl-corner"></span>${head}${rows}</div></div>`;
    },

    // Kartensymbol: Draufsicht in Originalgröße (gedreht), darunter Name mit Belegungspunkt
    markerHtml(o, opts = {}) {
      const t = top(o.kind);
      const st = this.status(o);
      const rot = (o.pos && o.pos[2]) || 0;
      // halbe Höhe/Breite der gedrehten Form → Abstand für Namen und To-Do-Zähler
      const a = rot * Math.PI / 180;
      const ry = (Math.abs(t.w * Math.sin(a)) + Math.abs(t.h * Math.cos(a))) / 2;
      const rx = (Math.abs(t.w * Math.cos(a)) + Math.abs(t.h * Math.sin(a))) / 2;
      return `<div class="unit-mk${opts.selected ? ' is-selected' : ''}" style="--w:${t.w}px;--h:${t.h}px;--r:${ry.toFixed(1)}px;--rx:${rx.toFixed(1)}px;--rot:${rot}deg">
        <div class="unit-shape">${t.svg}</div>
        <span class="unit-name"><i class="pol-dot is-${st.cls}"></i>${h(o.name)}</span>${opts.extra || ''}</div>`;
    },

    // Kachel: eigenes Foto oder Draufsicht (Infofenster, Übersicht)
    tileHtml(o, opts = {}) {
      const url = o.photo ? (o.photo.tdata || o.photo.data || this.photoUrls[o.id]) : '';
      if (url) return `<div class="unit-tile${opts.big ? ' is-big' : ''}"><img src="${h(url)}" alt="" draggable="false"></div>`;
      const t = top(o.kind);
      return `<div class="unit-tile is-drawing${opts.big ? ' is-big' : ''}"><div class="unit-tile-art" style="aspect-ratio:${t.w} / ${t.h}">${t.svg}</div></div>`;
    },
  };

  window.Airbnb = Airbnb;
})();
