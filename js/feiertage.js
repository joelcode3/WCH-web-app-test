/*
 * Feiertage (werden hier berechnet, alle Bundesländer) und Schulferien (OpenHolidays-API,
 * kostenlos, ohne Anmeldung; je Jahr im Browser zwischengespeichert) für den Kalender.
 */
(function () {
  'use strict';

  const LAENDER = { BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen', HH: 'Hamburg',
    HE: 'Hessen', MV: 'Mecklenburg-Vorpommern', NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen', RP: 'Rheinland-Pfalz',
    SL: 'Saarland', SN: 'Sachsen', ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen' };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  // Ostersonntag (Gauß/Meeus)
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day, 12);
  }

  // [{ date, name, states: [] = bundesweit }]
  const cache = {};
  function publicHolidays(y) {
    if (cache[y]) return cache[y];
    const E = easter(y), D = (m, d) => new Date(y, m - 1, d, 12);
    const nov23 = D(11, 23);
    const bussBettag = add(nov23, -(((nov23.getDay() + 7 - 3) % 7) || 7));   // Mittwoch vor dem 23.11.
    const list = [
      [D(1, 1), 'Neujahr'], [D(1, 6), 'Heilige Drei Könige', ['BW', 'BY', 'ST']], [D(3, 8), 'Frauentag', ['BE', 'MV']],
      [add(E, -2), 'Karfreitag'], [E, 'Ostersonntag', ['BB']], [add(E, 1), 'Ostermontag'], [D(5, 1), 'Tag der Arbeit'],
      [add(E, 39), 'Christi Himmelfahrt'], [add(E, 49), 'Pfingstsonntag', ['BB']], [add(E, 50), 'Pfingstmontag'],
      [add(E, 60), 'Fronleichnam', ['BW', 'BY', 'HE', 'NW', 'RP', 'SL']], [D(8, 15), 'Mariä Himmelfahrt', ['SL']],
      [D(9, 20), 'Weltkindertag', ['TH']], [D(10, 3), 'Tag der Deutschen Einheit'],
      [D(10, 31), 'Reformationstag', ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH']],
      [D(11, 1), 'Allerheiligen', ['BW', 'BY', 'NW', 'RP', 'SL']], [bussBettag, 'Buß- und Bettag', ['SN']],
      [D(12, 25), '1. Weihnachtstag'], [D(12, 26), '2. Weihnachtstag'],
    ];
    cache[y] = list.map(([d, name, states]) => ({ date: iso(d), name, states: states || [] }));
    return cache[y];
  }

  const Feiertage = {
    LAENDER,
    ferien: {},        // Jahr → [{ start, end, name, states }]
    listeners: [],
    onChange(fn) { this.listeners.push(fn); },
    _emit() { this.listeners.forEach((fn) => fn()); },

    holidaysOn(d) { return publicHolidays(+d.slice(0, 4)).filter((x) => x.date === d); },
    // Feiertag in Niedersachsen? (wird wie ein Wochenendtag dargestellt)
    isNiHoliday(d) { return this.holidaysOn(d).some((x) => !x.states.length || x.states.includes('NI')); },
    // Bundesländer mit Schulferien an Tag d
    ferienOn(d) {
      const list = this.ferien[+d.slice(0, 4)] || [];
      const st = new Set();
      list.forEach((f) => { if (f.start <= d && d <= f.end) f.states.forEach((s) => st.add(s)); });
      return [...st].sort();
    },
    ferienNames(d) {
      const list = this.ferien[+d.slice(0, 4)] || [];
      return list.filter((f) => f.start <= d && d <= f.end).map((f) => `${f.name} (${f.states.join(', ')})`);
    },

    // Schulferien eines Jahres laden (einmal je Jahr, 14 Tage im Browser gemerkt)
    async loadFerien(y) {
      if (this.ferien[y] || this['_l' + y]) return;
      const key = `wch-ferien-${y}`;
      try {
        const c = JSON.parse(localStorage.getItem(key) || 'null');
        if (c && Date.now() - c.at < 14 * 864e5) { this.ferien[y] = c.list; this._emit(); return; }
      } catch (e) { /* egal */ }
      this['_l' + y] = true;
      try {
        const url = `https://openholidaysapi.org/SchoolHolidays?countryIsoCode=DE&languageIsoCode=DE&validFrom=${y}-01-01&validTo=${y}-12-31`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const list = data.map((f) => ({
          start: f.startDate, end: f.endDate,
          name: ((f.name || []).find((n) => n.language === 'DE') || (f.name || [])[0] || {}).text || 'Ferien',
          states: f.nationwide ? Object.keys(LAENDER) : (f.subdivisions || []).map((s) => (s.shortName || s.code || '').replace(/^DE-/, '')).filter(Boolean),
        }));
        this.ferien[y] = list;
        try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), list })); } catch (e) { /* egal */ }
        this._emit();
      } catch (e) {
        console.warn('Schulferien nicht abrufbar', e);
      } finally {
        this['_l' + y] = false;
      }
    },
  };

  window.Feiertage = Feiertage;
})();
