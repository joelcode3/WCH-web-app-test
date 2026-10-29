/*
 * Wettervorhersage für den Platz (27404 Hesedorf/Gyhum) – kostenloser Dienst Open-Meteo, ohne Anmeldung.
 * Aktuell + 7 Tage: Temperatur, Wetterlage (Sonne/Wolken/Regen/Schnee/Gewitter), Niederschlag, Wind.
 * Wird höchstens alle 30 Minuten neu geholt (Zwischenspeicher im Browser).
 */
(function () {
  'use strict';

  const LAT = 53.23, LON = 9.32;   // Hesedorf bei Gyhum
  const URL = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${LAT}&longitude=${LON}&timezone=Europe%2FBerlin&forecast_days=7&wind_speed_unit=kmh`
    + '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,precipitation'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max';
  const CACHE = 'wch-wetter-1';
  const MAX_AGE = 30 * 60000;

  // Linien-Symbole (24er-Raster)
  const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>';
  const CLOUD = '<path d="M7 18h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.7A3.2 3.2 0 0 0 7 18z"/>';
  const ICONS = {
    sun: SUN,
    partly: '<path d="M8.5 3v1.5M3 8.5h1.5M4.6 4.6l1 1M12.4 4.6l-1 1"/><path d="M5.6 10.6A3.5 3.5 0 1 1 11.9 7"/><path d="M9 20h8.5a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6 1.4A2.8 2.8 0 0 0 9 20z"/>',
    cloud: CLOUD,
    fog: '<path d="M4 9h16M3 13h18M5 17h14"/>',
    drizzle: '<path d="M7 14h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.7A3.2 3.2 0 0 0 7 14z"/><path d="M9 18v1M13 18v1M17 18v1"/>',
    rain: '<path d="M7 14h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.7A3.2 3.2 0 0 0 7 14z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
    snow: '<path d="M7 14h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.7A3.2 3.2 0 0 0 7 14z"/><path d="M8 18h.01M12 17h.01M16 18h.01M10 21h.01M14 21h.01"/>',
    storm: '<path d="M7 14h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.7A3.2 3.2 0 0 0 7 14z"/><path d="M12.5 15l-2 3.5h3l-2 3.5"/>',
    wind: '<path d="M3 8h10a2.5 2.5 0 1 0-2.5-2.5M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
    drop: '<path d="M12 3.5c3 3.6 5.5 6.5 5.5 9.7a5.5 5.5 0 0 1-11 0c0-3.2 2.5-6.1 5.5-9.7z"/>',
  };

  // WMO-Wettercode → Symbol und Text
  function kind(code) {
    if (code === 0) return ['sun', 'Sonnig'];
    if (code === 1) return ['partly', 'Überwiegend sonnig'];
    if (code === 2) return ['partly', 'Teils bewölkt'];
    if (code === 3) return ['cloud', 'Bewölkt'];
    if (code === 45 || code === 48) return ['fog', 'Nebel'];
    if (code >= 51 && code <= 57) return ['drizzle', 'Nieselregen'];
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ['rain', code >= 80 ? 'Regenschauer' : code >= 65 ? 'Starker Regen' : 'Regen'];
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['snow', 'Schnee'];
    if (code >= 95) return ['storm', 'Gewitter'];
    return ['cloud', 'Bewölkt'];
  }
  const icon = (name, cls = '') => `<svg class="wx-ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  const Wetter = {
    data: null,       // { current: { temp, feels, code, wind, gusts }, days: [{ date, code, max, min, rain, prob, snow, wind, gusts }], at }
    state: 'idle',    // idle | loading | ok | error
    listeners: [],
    onChange(fn) { this.listeners.push(fn); },
    _emit() { this.listeners.forEach((fn) => fn()); },
    icon,
    kind,

    async load(force) {
      if (this.state === 'loading') return;
      if (!this.data) {
        try { const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (c && c.days) this.data = c; } catch (e) { /* egal */ }
      }
      if (!force && this.data && Date.now() - this.data.at < MAX_AGE) { this.state = 'ok'; this._emit(); return; }
      this.state = 'loading';
      try {
        const res = await fetch(URL);
        if (!res.ok) throw new Error(`Wetterdienst antwortet nicht (HTTP ${res.status})`);
        const j = await res.json();
        const c = j.current || {}, d = j.daily || {};
        this.data = {
          at: Date.now(),
          current: { temp: c.temperature_2m, feels: c.apparent_temperature, code: c.weather_code, wind: c.wind_speed_10m, gusts: c.wind_gusts_10m },
          days: (d.time || []).map((date, i) => ({
            date, code: d.weather_code[i], max: d.temperature_2m_max[i], min: d.temperature_2m_min[i],
            rain: d.precipitation_sum[i], prob: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null,
            snow: d.snowfall_sum ? d.snowfall_sum[i] : 0, wind: d.wind_speed_10m_max[i], gusts: d.wind_gusts_10m_max ? d.wind_gusts_10m_max[i] : null,
          })),
        };
        try { localStorage.setItem(CACHE, JSON.stringify(this.data)); } catch (e) { /* egal */ }
        this.state = 'ok';
      } catch (e) {
        this.state = this.data ? 'ok' : 'error';
        this.error = e.message || String(e);
      }
      this._emit();
    },

    day(date) { return this.data ? this.data.days.find((x) => x.date === date) || null : null; },
  };

  window.Wetter = Wetter;
})();
