/*
 * Klimaanlagen (Heizung) in den airbnb-Unterkünften – Anzeige und Bedienung.
 *
 * Gesteuert wird über die Supabase-Funktion "klima" (Tuya-Cloud). Die Funktion liest stündlich
 * den Zustand und schaltet nach der Belegung (Abreise ab 11 Uhr Sparbetrieb, Anreise ab 13 Uhr
 * Wohlfühltemperatur). Die App zeigt den Zustand aus der Tabelle "klima" und bietet an/aus,
 * Soll-Temperatur − / +, Automatik an/aus und „Aktualisieren“ (fragt Klima und Stromwächter live ab).
 * Ohne Supabase (Testmodus) gibt es Beispielwerte.
 */
(function () {
  'use strict';

  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const deg = (t) => `${Number(t).toLocaleString('de-DE', { minimumFractionDigits: Number.isInteger(Number(t)) ? 0 : 1, maximumFractionDigits: 1 })} °C`;
  const hm = (iso) => {
    if (!iso) return '–';
    const d = new Date(iso), t = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString() ? t : `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ${t}`;
  };
  const MODUS = { hot: 'Heizen', cold: 'Kühlen', wet: 'Entfeuchten', wind: 'Lüften', auto: 'Auto' };
  const FLAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.6 1.6-4.3 2.6-5.8.6 1.5 1.4 2.3 2.4 2.3 0-2.4-.8-4.3 0-6.5z"/></svg>';
  const POWER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v8M6.3 7.3a8 8 0 1 0 11.4 0"/></svg>';
  const REFRESH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/></svg>';

  const Klima = {
    state: 'idle',   // idle | ok | demo | missing (Update 14 fehlt) | error
    rows: {},        // place_id → Zeile aus "klima"
    busy: {},        // place_id → Befehl läuft
    listeners: [],
    onChange(fn) { this.listeners.push(fn); },
    _emit() { this.listeners.forEach((fn) => fn()); },

    async load() {
      const S = window.Store;
      if (S.mode !== 'cloud') { if (this.state !== 'demo') this._demo(); this._emit(); return; }
      try {
        const { data, error } = await Cloud.client.from('klima').select('*');
        if (error) throw error;
        this.rows = Object.fromEntries((data || []).filter((r) => r.device_id).map((r) => [r.place_id, r]));
        this.state = 'ok';
      } catch (e) {
        this.state = /relation|does not exist|schema cache|not find/i.test(e.message || '') ? 'missing' : 'error';
        this.error = e.message || String(e);
      }
      this._emit();
    },

    // Testmodus: beide Busse mit Klimaanlage
    _demo() {
      this.state = 'demo';
      const now = new Date().toISOString();
      this.rows = {};
      window.Store.airbnbs().filter((o) => o.kind === 'londonbus').forEach((o, i) => {
        this.rows[o.id] = { place_id: o.id, device_id: 'demo' + i, auto: true, temp_spar: 16, temp_komfort: 23, online: true,
          an: true, modus: 'hot', soll: i ? 16 : 23, ist: i ? 17 : 22, geprueft: now, auto_letzte: '', fehler: '',
          auto_info: i ? 'Abreise heute – Sparbetrieb: 16 °C (11:00)' : 'Anreise heute – hochgeheizt: 23 °C (13:00)' };
      });
    },

    get(id) { return this.rows[id] || null; },
    available() { return this.state === 'ok' || this.state === 'demo'; },

    // kurze Zeile für die Karten im Reiter airbnb
    chipHtml(id) {
      const r = this.available() && this.get(id);
      if (!r) return '';
      const lvl = r.fehler || r.online === false ? 'warn' : r.an ? 'ok' : 'wait';
      const txt = r.online === false ? 'Heizung offline' : r.an ? `Heizung ${typeof r.soll === 'number' ? deg(r.soll) : 'an'}` : 'Heizung aus';
      return `<span class="wd-chip is-${lvl}"><i></i>${h(txt)}</span>`;
    },

    // Kasten im Infofenster der Unterkunft (unter Foto und Stromwächter)
    panelHtml(o, editMode) {
      if (!this.available()) {
        return this.state === 'missing' && editMode && o.kind === 'londonbus'
          ? '<div class="kl-box"><span class="small muted">Heizung: <code>supabase/update-14.sql</code> fehlt (SETUP.md)</span></div>' : '';
      }
      const r = this.get(o.id);
      if (!r) return '';
      const busy = !!this.busy[o.id];
      const off = r.online === false;
      const state = off ? 'offline' : r.an == null ? '–' : r.an ? `an${r.modus && r.modus !== 'hot' ? ' · ' + (MODUS[r.modus] || r.modus) : ''}` : 'aus';
      return `<div class="kl-box${off || r.fehler ? ' is-warn' : ''}${busy ? ' is-busy' : ''}" data-kl="${h(o.id)}">
        <div class="kl-top">
          <span class="kl-t">${FLAME}<strong>Heizung</strong> <span class="kl-state is-${off ? 'off' : r.an ? 'on' : 'aus'}">${h(state)}</span></span>
          <button type="button" class="kl-icon" data-kl-act="refresh" title="Aktualisieren (Heizung und Stromwächter live abfragen)" aria-label="Aktualisieren"${busy ? ' disabled' : ''}>${REFRESH}</button>
        </div>
        <div class="kl-main">
          <span class="kl-ist" title="gemessen oben am Innengerät – unten im Bus ist es kühler">${typeof r.ist === 'number' ? `<strong>${deg(r.ist)}</strong> <span class="small muted">am Gerät</span>` : '<span class="small muted">Temperatur –</span>'}</span>
          <span class="kl-soll">
            <button type="button" class="kl-btn" data-kl-act="minus" aria-label="Soll-Temperatur senken"${busy || off ? ' disabled' : ''}>−</button>
            <span class="kl-sv"><span class="small muted">Soll</span> <strong>${typeof r.soll === 'number' ? deg(r.soll) : '–'}</strong></span>
            <button type="button" class="kl-btn" data-kl-act="plus" aria-label="Soll-Temperatur erhöhen"${busy || off ? ' disabled' : ''}>+</button>
          </span>
          <button type="button" class="kl-btn kl-power${r.an ? ' is-on' : ''}" data-kl-act="power" title="${r.an ? 'Ausschalten' : 'Einschalten'}" aria-label="${r.an ? 'Ausschalten' : 'Einschalten'}"${busy || off ? ' disabled' : ''}>${POWER}</button>
        </div>
        <label class="kl-auto"><input type="checkbox" data-kl-act="auto"${r.auto ? ' checked' : ''}${busy ? ' disabled' : ''}>
          <span>Automatik: <span class="nw">Abreise ${deg(r.temp_spar)}</span> · <span class="nw">Anreise ab 13 Uhr ${deg(r.temp_komfort)}</span>${editMode ? ' · <button type="button" class="link-btn muted-link" data-kl-act="temps">ändern</button>' : ''}</span></label>
        ${r.fehler ? `<span class="small warn" title="${h(r.fehler)}">${/expired|permission|subscription/i.test(r.fehler) ? 'Tuya-Zugang abgelaufen – Probezeit verlängern' : 'Fehler: ' + h(r.fehler)}</span>` : ''}
        <span class="small muted">Stand ${hm(r.geprueft)}${r.auto_info ? ` · ${h(r.auto_info)}` : ''}</span>
      </div>`;
    },

    // Knöpfe im Infofenster; refreshAll = Stromwächter mit abfragen
    bind(root, o, toast) {
      const box = root.querySelector(`.kl-box[data-kl="${CSS.escape(o.id)}"]`);
      if (!box) return;
      box.querySelectorAll('[data-kl-act]').forEach((el) => {
        const act = el.dataset.klAct;
        const ev = act === 'auto' ? 'change' : 'click';
        el.addEventListener(ev, async (e) => {
          if (act !== 'auto') e.preventDefault();
          const r = this.get(o.id);
          if (!r) return;
          if (act === 'temps') { this.editTemps(o, toast); return; }
          if (window.Store.mode !== 'cloud') {
            // Testmodus: nur in der Anzeige ändern
            if (act === 'power') r.an = !r.an;
            if (act === 'plus') r.soll = Math.min(30, (r.soll || 20) + 0.5);
            if (act === 'minus') r.soll = Math.max(16, (r.soll || 20) - 0.5);
            if (act === 'auto') r.auto = el.checked;
            if (act === 'refresh') { r.geprueft = new Date().toISOString(); toast('Aktualisiert (Testmodus)'); }
            this._emit();
            return;
          }
          this.busy[o.id] = true;
          this._emit();
          try {
            if (act === 'refresh') {
              const jobs = [this._call({ action: 'refresh', place_id: o.id })];
              if (window.Waechter && Waechter.get(o.id)) jobs.push(Waechter._call({ action: 'check-now', place_id: o.id }).then(() => Waechter.load()).catch(() => {}));
              await Promise.all(jobs);
              toast('Aktualisiert');
            }
            if (act === 'power') { await this._call({ action: 'set', place_id: o.id, an: !r.an }); toast(r.an ? 'Heizung aus' : 'Heizung an'); }
            if (act === 'plus' || act === 'minus') {
              const soll = (typeof r.soll === 'number' ? r.soll : 20) + (act === 'plus' ? 0.5 : -0.5);
              await this._call({ action: 'set', place_id: o.id, soll });
            }
            if (act === 'auto') {
              const { error } = await Cloud.client.from('klima').update({ auto: el.checked }).eq('place_id', o.id);
              if (error) throw error;
              toast(el.checked ? 'Automatik an' : 'Automatik aus');
            }
          } catch (err) {
            alert(err.message || String(err));
          } finally {
            this.busy[o.id] = false;
            await this.load();
          }
        });
      });
    },

    // Spar- und Wohlfühltemperatur ändern (im Bearbeiten-Modus der Map)
    async editTemps(o, toast) {
      const r = this.get(o.id);
      const spar = prompt(`Sparbetrieb nach der Abreise für „${o.name}“ (°C, 16–30):`, String(r.temp_spar).replace('.', ','));
      if (spar === null) return;
      const komfort = prompt(`Wohlfühltemperatur am Anreisetag ab 13 Uhr (°C, 16–30):\nGemessen wird oben am Gerät – unten ist es etwas kühler.`, String(r.temp_komfort).replace('.', ','));
      if (komfort === null) return;
      const n = (v) => Math.min(30, Math.max(16, Math.round(parseFloat(String(v).replace(',', '.')) * 2) / 2));
      const vals = { temp_spar: n(spar), temp_komfort: n(komfort) };
      if (isNaN(vals.temp_spar) || isNaN(vals.temp_komfort)) { alert('Bitte Zahlen eingeben, z. B. 16 oder 22,5'); return; }
      if (window.Store.mode === 'cloud') {
        const { error } = await Cloud.client.from('klima').update(vals).eq('place_id', o.id);
        if (error) { alert(error.message); return; }
        await this.load();
      } else { Object.assign(r, vals); this._emit(); }
      toast('Automatik-Temperaturen gespeichert');
    },

    async _call(body) {
      const { data, error } = await Cloud.client.functions.invoke('klima', { body });
      if (error) {
        const status = error.context && error.context.status;
        let msg = '';
        try { msg = (await error.context.json()).error || ''; } catch (_) { /* ohne Text */ }
        if (status === 404) throw new Error('Die Supabase-Funktion „klima“ fehlt noch (siehe SETUP.md).');
        throw new Error(msg || error.message || 'Fehler');
      }
      if (data && data.error) throw new Error(data.error);
      return data;
    },
  };

  window.Klima = Klima;
})();
