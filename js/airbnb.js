/*
 * Ferienunterkünfte (Airbnb): Polaroid-Motive, Belegung aus den Airbnb-Kalendern,
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
  const fmt = (s) => (s ? s.split('-').reverse().join('.') : '');
  const fmtShort = (s) => { const [, m, d] = s.split('-'); return `${+d}.${+m}.`; };
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  /* ---------- Motive für das Polaroid (bis ein echtes Foto hochgeladen ist) ---------- */
  const SKY = '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe0ef"/><stop offset="1" stop-color="#e8f3f4"/></linearGradient></defs>'
    + '<rect width="120" height="90" fill="url(#sky)"/><circle cx="98" cy="18" r="8" fill="#f6d77a"/>'
    + '<path d="M0 62 Q30 56 60 60 T120 58 V90 H0Z" fill="#9cc27a"/><path d="M0 70 Q40 66 120 70 V90 H0Z" fill="#86b265"/>'
    + '<g fill="#4f7d45"><circle cx="8" cy="56" r="9"/><circle cx="18" cy="52" r="8"/><circle cx="112" cy="54" r="9"/></g>';
  const ART = {
    londonbus: `<svg viewBox="0 0 120 90" aria-hidden="true">${SKY}
      <rect x="14" y="20" width="92" height="50" rx="7" fill="#c8322d"/>
      <rect x="14" y="44" width="92" height="4" fill="#efe3c6"/>
      <g fill="#2c3b44"><rect x="20" y="26" width="13" height="12" rx="2"/><rect x="36" y="26" width="13" height="12" rx="2"/><rect x="52" y="26" width="13" height="12" rx="2"/><rect x="68" y="26" width="13" height="12" rx="2"/><rect x="84" y="26" width="16" height="12" rx="2"/>
      <rect x="20" y="51" width="13" height="10" rx="2"/><rect x="36" y="51" width="13" height="10" rx="2"/><rect x="52" y="51" width="13" height="10" rx="2"/><rect x="68" y="51" width="13" height="10" rx="2"/><rect x="88" y="51" width="12" height="16" rx="2"/></g>
      <g fill="#bfe0ef" opacity=".35"><rect x="21" y="27" width="5" height="10"/><rect x="37" y="27" width="5" height="10"/><rect x="53" y="27" width="5" height="10"/><rect x="69" y="27" width="5" height="10"/><rect x="85" y="27" width="6" height="10"/></g>
      <rect x="40" y="40" width="34" height="3" rx="1" fill="#f3d36b"/>
      <g fill="#222"><circle cx="32" cy="71" r="7"/><circle cx="88" cy="71" r="7"/></g><g fill="#999"><circle cx="32" cy="71" r="3"/><circle cx="88" cy="71" r="3"/></g></svg>`,
    glamping: `<svg viewBox="0 0 120 90" aria-hidden="true">${SKY}
      <path d="M60 14 L100 50 V68 H20 V50 Z" fill="#f2ead8" stroke="#b9a681" stroke-width="1.5"/>
      <path d="M20 50 H100" stroke="#b9a681" stroke-width="1.5"/>
      <g stroke="#d9cdb1" stroke-width="1"><path d="M60 14 L40 50 M60 14 L80 50 M60 14 L60 50"/></g>
      <path d="M60 30 L74 68 H46 Z" fill="#8d6b45"/><path d="M60 30 L67 68 H60 Z" fill="#a8835a"/>
      <circle cx="60" cy="12" r="2.5" fill="#7a5a3a"/><path d="M60 14 V9" stroke="#7a5a3a" stroke-width="2"/>
      <g stroke="#a9997a" stroke-width=".8"><path d="M20 52 L8 68 M100 52 L112 68"/></g>
      <g fill="#f6d77a"><circle cx="34" cy="62" r="1.5"/><circle cx="86" cy="62" r="1.5"/></g></svg>`,
    baeckerwagen: `<svg viewBox="0 0 120 90" aria-hidden="true">${SKY}
      <path d="M16 30 Q60 10 104 30 V36 H16 Z" fill="#5d3b1f"/>
      <rect x="18" y="34" width="84" height="32" fill="#c08a52"/>
      <g stroke="#9c6a38" stroke-width="1.2"><path d="M30 34 V66 M42 34 V66 M54 34 V66 M66 34 V66 M78 34 V66 M90 34 V66"/></g>
      <rect x="28" y="40" width="20" height="14" rx="2" fill="#f3e3b5" stroke="#5d3b1f" stroke-width="2"/>
      <path d="M33 47 q3 -4 5 0 q2 4 5 0" stroke="#a5652a" stroke-width="2" fill="none"/>
      <rect x="70" y="40" width="16" height="24" rx="2" fill="#7a4e2a"/><circle cx="83" cy="53" r="1.2" fill="#f3d36b"/>
      <rect x="88" y="16" width="5" height="12" fill="#444"/>
      <path d="M102 62 L116 70" stroke="#5d3b1f" stroke-width="3"/>
      <g fill="#3a2a1a"><circle cx="34" cy="68" r="8"/><circle cx="86" cy="68" r="8"/></g>
      <g stroke="#c9a46a" stroke-width="1.2"><path d="M34 60 V76 M26 68 H42 M86 60 V76 M78 68 H94"/></g></svg>`,
    unterkunft: `<svg viewBox="0 0 120 90" aria-hidden="true">${SKY}
      <path d="M24 42 L60 18 L96 42 Z" fill="#7a4e2a"/><rect x="30" y="42" width="60" height="26" fill="#d9b98a"/>
      <rect x="54" y="50" width="12" height="18" fill="#7a4e2a"/><rect x="36" y="48" width="12" height="10" fill="#f3e3b5"/><rect x="72" y="48" width="12" height="10" fill="#f3e3b5"/></svg>`,
  };
  const art = (kind) => ART[kind] || ART.unterkunft;

  // leichte, aber feste Schräglage je Unterkunft (-4° … 4°)
  const tilt = (id) => { let n = 0; for (const c of String(id)) n = (n * 31 + c.charCodeAt(0)) % 997; return (n % 9) - 4; };

  /* ---------- Belegung ---------- */
  const Airbnb = {
    art, tilt,
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
      } catch (e) {
        this.state = e.message === 'missing' ? 'missing' : 'error';
        this.error = e.message;
      }
      this._emit();
    },

    // erfundene Belegung für den Testmodus (fest je Unterkunft)
    _demo() {
      this.events = {};
      window.Store.airbnbs().forEach((o) => {
        let seed = tilt(o.id) + 7 + o.name.length * 13;
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
          ? { cls: 'blk', busy: true, text: `gesperrt bis ${fmt(end)}` }
          : { cls: 'busy', busy: true, text: `belegt · Abreise ${fmt(end)}` };
      }
      const next = (this.events[o.id] || []).find((e) => e.start > t);
      return { cls: 'free', busy: false, text: next ? `frei · nächste Anreise ${fmt(next.start)}` : 'frei' };
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
        <div class="cal-legend"><span><i class="n-res"></i>belegt</span><span><i class="n-blk"></i>gesperrt</span><span><i class="free"></i>frei</span></div>
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
        const k = window.Store.PLACE_KINDS[o.kind];
        const cells = days.map((d) => {
          const wd = (new Date(d + 'T12:00:00').getDay() + 6) % 7;
          const ev = this.eventOn(o, d);
          const title = ev ? `${ev.type === 'blocked' ? 'gesperrt' : 'belegt'} ${fmtShort(ev.start)}–${fmtShort(ev.end)}` : 'frei';
          return `<span class="tl-cell ${this._dayCls(o, d)}${wd >= 5 ? ' is-we' : ''}${d === t ? ' is-today' : ''}" title="${h(o.name)}: ${fmtShort(d)} ${title}"></span>`;
        }).join('');
        return `<a class="tl-name" href="#/karte/place/${o.id}"><span>${k.icon}</span>${h(o.name)}</a>${cells}`;
      }).join('');
      return `<div class="tl-wrap"><div class="tl" style="grid-template-columns: var(--tl-name) repeat(${n}, var(--tl-col))">
        <span class="tl-corner"></span>${months}<span class="tl-corner"></span>${head}${rows}</div></div>`;
    },

    // Polaroid (Karte, Infofenster, Übersicht)
    polaroidHtml(o, opts = {}) {
      const st = this.status(o);
      const url = o.photo ? (o.photo.tdata || o.photo.data || this.photoUrls[o.id]) : '';
      const inner = url ? `<img src="${h(url)}" alt="" draggable="false">` : art(o.kind);
      return `<div class="polaroid${opts.big ? ' is-big' : ''}" style="--tilt:${opts.flat ? 0 : tilt(o.id)}deg">
        <div class="pol-photo">${inner}</div>
        <div class="pol-cap">${opts.noDot ? '' : `<i class="pol-dot is-${st.cls}" title="${h(st.text)}"></i>`}${h(o.name)}</div></div>`;
    },
  };

  window.Airbnb = Airbnb;
})();
