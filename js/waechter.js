/*
 * Stromwächter: Stromausfall- und Frostwarnung für die Unterkünfte (Hue Bridge je Bus).
 *
 * Die eigentliche Überwachung (alle 5 Minuten, SMS) macht die Supabase-Funktion "hue-waechter".
 * Die App zeigt nur den Zustand aus der Tabelle waechter_status und bietet „Mit Hue verbinden“
 * und „Test-SMS“ an. Ohne Supabase (Testmodus) gibt es Beispielwerte.
 */
(function () {
  'use strict';

  const OFFLINE_MIN = 15, FROST_TEMP = 5;
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const time = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '') : '');
  const deg = (t) => `${Number(t).toFixed(1).replace('.', ',')} °C`;
  const ago = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 60000 : 0);

  const Waechter = {
    state: 'idle',       // idle | ok | demo | missing (Update 9 fehlt) | error
    rows: {},            // place_id → Zeile aus waechter_status
    listeners: [],
    onChange(fn) { this.listeners.push(fn); },
    _emit() { this.listeners.forEach((fn) => fn()); },

    async load() {
      const S = window.Store;
      if (S.mode !== 'cloud') { this._demo(); this._emit(); return; }
      try {
        const { data, error } = await Cloud.client.from('waechter_status').select('*');
        if (error) throw error;
        this.rows = Object.fromEntries((data || []).map((r) => [r.place_id, r]));
        this.state = 'ok';
      } catch (e) {
        // Tabelle gibt es noch nicht → Update 9 nicht ausgeführt: Wächter einfach ausblenden
        this.state = /relation|does not exist|schema cache|not find/i.test(e.message || '') ? 'missing' : 'error';
        this.error = e.message || String(e);
      }
      this._emit();
    },

    // Testmodus: Bus 1 mit Melder im Bad, Bus 2 ohne Melder
    _demo() {
      this.state = 'demo';
      const buses = window.Store.airbnbs().filter((o) => o.kind === 'londonbus');
      const now = new Date().toISOString();
      this.rows = {};
      buses.forEach((o, i) => {
        this.rows[o.id] = { place_id: o.id, connected: true, online: true, since: now, last_check: now, last_ok: now,
          sensors: i === 0 ? [{ name: 'Bad Bus 1', temp: 11.5, battery: 86, updated: now }] : [], min_temp: i === 0 ? 11.5 : null,
          alarm_offline: false, alarm_frost: false, alarm_battery: false, error: '', sms_error: '' };
      });
    },

    get(id) { return this.rows[id] || null; },
    available() { return this.state === 'ok' || this.state === 'demo'; },

    // Zusammenfassung: level ok | warn | alarm | wait, kurzer Text
    summary(id) {
      const r = this.get(id);
      if (!r || !r.connected) return null;
      if (r.error) return { level: 'warn', text: 'Hue-Zugang erneuern' };
      if (r.online === false) {
        const m = ago(r.last_ok || r.since);
        return { level: m >= OFFLINE_MIN ? 'alarm' : 'warn', text: `kein Kontakt seit ${time(r.last_ok || r.since)}` };
      }
      if (r.online == null) return { level: 'wait', text: 'wird geprüft' };
      const cold = (r.sensors || []).filter((x) => typeof x.temp === 'number' && x.temp < FROST_TEMP);
      if (cold.length) return { level: 'alarm', text: `Frostgefahr ${deg(Math.min(...cold.map((x) => x.temp)))}` };
      if (typeof r.min_temp === 'number') return { level: 'ok', text: `Strom ok · ${deg(r.min_temp)}` };
      return { level: 'ok', text: 'Strom ok' };
    },

    // kleines Warnzeichen am Kartensymbol (nur bei Problemen)
    badgeHtml(id) {
      const s = this.available() && this.summary(id);
      if (!s || s.level === 'ok' || s.level === 'wait') return '';
      return `<span class="wd-badge is-${s.level}" title="${h(s.text)}">!</span>`;
    },

    // aktuelle Temperatur gut sichtbar oben im Infofenster der Unterkunft
    tempHtml(o) {
      if (!this.available()) return '';
      const r = this.get(o.id);
      const temps = ((r && r.sensors) || []).filter((x) => typeof x.temp === 'number');
      if (!temps.length) return o.kind === 'londonbus' ? '<div class="wd-temp is-none"><span class="small muted">Temperatur: noch kein Sensor</span></div>' : '';
      const t = Math.min(...temps.map((x) => x.temp));
      const upd = temps.map((x) => x.updated).filter(Boolean).sort().pop();
      return `<div class="wd-temp${t < FROST_TEMP ? ' is-alarm' : ''}" title="${h(temps.map((x) => `${x.name}: ${deg(x.temp)}`).join(', '))}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0z M12 9v6"/></svg>
        <strong>${deg(t)}</strong><span class="small muted">innen${upd ? ` · ${time(upd)}` : ''}</span></div>`;
    },

    // Zeile für die Karten im Reiter airbnb
    chipHtml(id) {
      const s = this.available() && this.summary(id);
      if (!s) return '';
      return `<span class="wd-chip is-${s.level}"><i></i>${h(s.text)}</span>`;
    },

    // Abschnitt im Infofenster der Unterkunft
    panelHtml(o, editMode) {
      if (!this.available()) {
        return this.state === 'missing' && editMode
          ? '<section class="wd-box"><h3>Stromwächter</h3><p class="small muted">Noch nicht eingerichtet: <code>supabase/update-9.sql</code> ausführen (Anleitung in SETUP.md, „Stromausfall- und Frostwarnung“).</p></section>'
          : '';
      }
      const r = this.get(o.id);
      const isBus = o.kind === 'londonbus';
      if (!r || !r.connected) {
        if (!isBus && !editMode) return '';
        return `<section class="wd-box"><h3>Stromwächter</h3>
          <p class="small muted">Warnt per SMS bei Stromausfall (Hue Bridge nicht erreichbar) und Frostgefahr (Hue-Bewegungsmelder unter 5 °C).</p>
          <div class="wd-actions"><button type="button" class="btn btn-sm" data-wd="connect">Mit Hue verbinden</button></div></section>`;
      }
      const s = this.summary(o.id);
      const lines = [];
      if (r.online === false) lines.push(`<li class="is-alarm"><i></i><span>Hue Bridge nicht erreichbar seit ${time(r.last_ok || r.since)} – möglicher Stromausfall${ago(r.last_ok || r.since) >= OFFLINE_MIN ? (r.alarm_offline ? ' (SMS verschickt)' : '') : ' (Warnung nach 15 Min.)'}</span></li>`);
      else if (r.online === true) lines.push(`<li class="is-ok"><i></i><span>Strom ok – Hue Bridge erreichbar</span></li>`);
      else lines.push('<li class="is-wait"><i></i><span>Wird gleich geprüft …</span></li>');
      (r.sensors || []).forEach((x) => {
        const cold = typeof x.temp === 'number' && x.temp < FROST_TEMP;
        const weak = typeof x.battery === 'number' && x.battery <= 15;
        const stale = x.updated && ago(x.updated) > 180;
        lines.push(`<li class="${cold ? 'is-alarm' : weak ? 'is-warn' : 'is-ok'}"><i></i><span>${h(x.name)}: <strong>${typeof x.temp === 'number' ? deg(x.temp) : '–'}</strong>${typeof x.battery === 'number' ? ` · Batterie ${x.battery} %` : ''}${stale ? ` · letzte Meldung ${time(x.updated)}` : ''}</span></li>`);
      });
      if (r.online === true && !(r.sensors || []).length) lines.push('<li class="is-wait"><i></i><span>Noch kein Hue-Bewegungsmelder an dieser Bridge – sobald er angemeldet ist, erscheint hier die Temperatur.</span></li>');
      return `<section class="wd-box is-${s ? s.level : 'wait'}"><h3>Stromwächter</h3>
        <ul class="wd-list">${lines.join('')}</ul>
        ${r.error ? `<p class="small warn">${h(r.error)}</p>` : ''}
        ${r.sms_error ? `<p class="small warn">${h(r.sms_error)}</p>` : ''}
        <p class="small muted">Zuletzt geprüft ${time(r.last_check) || '–'} · prüft alle 5 Minuten, warnt per SMS</p>
        <div class="wd-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-wd="test">Test-SMS</button>
          ${r.error || editMode ? '<button type="button" class="btn btn-ghost btn-sm" data-wd="connect">Hue neu verbinden</button>' : ''}
          ${editMode ? '<button type="button" class="btn btn-ghost btn-sm" data-wd="disconnect">Trennen</button>' : ''}
        </div></section>`;
    },

    // Knöpfe im Infofenster
    bind(root, o, toast) {
      root.querySelectorAll('[data-wd]').forEach((b) => {
        b.onclick = async () => {
          const act = b.dataset.wd;
          if (window.Store.mode !== 'cloud') { toast('Im Testmodus nicht möglich'); return; }
          b.disabled = true;
          try {
            if (act === 'connect') {
              const ret = location.origin + location.pathname;
              const res = await this._call({ action: 'connect', place_id: o.id, return_url: ret });
              location.href = res.url;   // weiter zur Hue-Anmeldung, danach zurück in die App
              return;
            }
            if (act === 'test') { await this._call({ action: 'test-sms' }); toast('Test-SMS verschickt'); }
            if (act === 'disconnect') {
              if (!confirm(`Stromwächter für „${o.name}“ wirklich trennen? Es gibt dann keine Warnungen mehr.`)) return;
              await this._call({ action: 'disconnect', place_id: o.id });
              toast('Stromwächter getrennt');
              await this.load();
            }
          } catch (e) {
            alert(e.message);
          } finally {
            b.disabled = false;
          }
        };
      });
    },

    async _call(body) {
      const { data, error } = await Cloud.client.functions.invoke('hue-waechter', { body });
      if (error) {
        const status = error.context && error.context.status;
        let msg = '';
        try { msg = (await error.context.json()).error || ''; } catch (_) { /* ohne Text */ }
        if (status === 404) throw new Error('Die Supabase-Funktion „hue-waechter“ fehlt noch (siehe SETUP.md).');
        throw new Error(msg || error.message || 'Fehler');
      }
      if (data && data.error) throw new Error(data.error);
      return data;
    },

    // Rücksprung von der Hue-Anmeldung: ?hue=ok|fehler&hueMsg=…
    handleReturn(toast) {
      const q = new URLSearchParams(location.search);
      if (!q.get('hue')) return;
      const msg = q.get('hueMsg') || '';
      history.replaceState(null, '', location.pathname + location.hash);
      if (q.get('hue') === 'ok') toast(msg || 'Hue verbunden'); else setTimeout(() => alert('Hue-Verbindung: ' + msg), 300);
    },
  };

  window.Waechter = Waechter;
})();
