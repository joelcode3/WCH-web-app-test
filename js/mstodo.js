/*
 * Microsoft To Do: Aufgaben mit „Camping“ am Anfang werden von der Supabase-Funktion "ms-todo"
 * alle 15 Minuten übernommen (To-Do-IDs beginnen mit "ms-"); in der App erledigte werden in To Do abgehakt.
 * Hier nur: Verbindungszustand (Tabelle ms_todo_status), Karte im Reiter Einstellungen, Rücksprung nach der Anmeldung.
 */
(function () {
  'use strict';

  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ',') + ' Uhr' : '–');

  const MsTodo = {
    state: 'idle',    // idle | ok | missing (Update 15 fehlt) | error | demo
    row: null,

    isImported: (t) => typeof t.id === 'string' && t.id.startsWith('ms-'),
    badgeHtml(t) { return this.isImported(t) ? '<span class="ms-badge" title="aus Microsoft To Do übernommen">To Do</span>' : ''; },

    async load() {
      if (window.Store.mode !== 'cloud') { this.state = 'demo'; this.row = null; return; }
      try {
        const { data, error } = await Cloud.client.from('ms_todo_status').select('*');
        if (error) throw error;
        this.row = (data || [])[0] || null;
        this.state = 'ok';
      } catch (e) {
        this.state = /relation|does not exist|schema cache|not find/i.test(e.message || '') ? 'missing' : 'error';
        this.error = e.message || String(e);
      }
    },

    // Karte im Reiter Einstellungen
    cardHtml() {
      const r = this.row;
      let body;
      if (this.state === 'demo') body = '<p class="small muted">Im Testmodus nicht verfügbar.</p>';
      else if (this.state === 'missing') body = '<p class="small muted">Noch nicht eingerichtet: <code>supabase/update-15.sql</code> ausführen (SETUP.md, „Microsoft To Do“).</p>';
      else if (!r || !r.verbunden) {
        body = `<p class="small" style="margin-top:0">Übernimmt Aufgaben, deren Titel mit <strong>„Camping“</strong> beginnt, alle 15 Minuten in die To-Do-Liste. In der App erledigte Aufgaben werden in To Do abgehakt.</p>
          <div class="card-actions" style="margin-top:0"><button class="btn" data-ms="connect">Mit Microsoft verbinden</button></div>`;
      } else {
        body = `<p class="small" style="margin-top:0">Verbunden${r.konto ? ` mit <strong>${h(r.konto)}</strong>` : ''} · ${r.anzahl} Camping-Aufgabe${r.anzahl === 1 ? '' : 'n'}<br>
          <span class="muted">Letzter Abgleich: ${when(r.letzter_abgleich)} · alle 15 Minuten</span></p>
          ${r.fehler ? `<p class="small warn">${h(r.fehler)}</p>` : ''}
          <div class="card-actions" style="margin-top:0">
            <button class="btn btn-ghost" data-ms="sync">Jetzt abgleichen</button>
            ${r.fehler ? '<button class="btn btn-ghost" data-ms="connect">Neu verbinden</button>' : ''}
            <button class="btn btn-ghost" data-ms="disconnect">Trennen</button>
          </div>`;
      }
      return `<section class="card"><h2>Microsoft To Do</h2>${body}</section>`;
    },

    bind(root, toast, rerender) {
      root.querySelectorAll('[data-ms]').forEach((b) => {
        b.onclick = async () => {
          b.disabled = true;
          try {
            if (b.dataset.ms === 'connect') {
              const res = await this._call({ action: 'connect', return_url: location.origin + location.pathname });
              location.href = res.url;
              return;
            }
            if (b.dataset.ms === 'sync') {
              const r = await this._call({ action: 'sync-now' });
              if (r && r.ok === false) throw new Error(r.error);
              await window.Store.refresh();
              window.Store.save();
              toast(r && r.neu ? `${r.neu} neue Aufgabe${r.neu === 1 ? '' : 'n'} übernommen` : 'Abgeglichen');
            }
            if (b.dataset.ms === 'disconnect') {
              if (!confirm('Verbindung zu Microsoft To Do trennen? Bereits übernommene Aufgaben bleiben in der App.')) return;
              await this._call({ action: 'disconnect' });
              toast('Microsoft To Do getrennt');
            }
            await this.load();
            rerender();
          } catch (e) {
            alert(e.message || String(e));
          } finally {
            b.disabled = false;
          }
        };
      });
    },

    async _call(body) {
      const { data, error } = await Cloud.client.functions.invoke('ms-todo', { body });
      if (error) {
        const status = error.context && error.context.status;
        let msg = '';
        try { msg = (await error.context.json()).error || ''; } catch (_) { /* ohne Text */ }
        if (status === 404) throw new Error('Die Supabase-Funktion „ms-todo“ fehlt noch (siehe SETUP.md).');
        throw new Error(msg || error.message || 'Fehler');
      }
      if (data && data.error) throw new Error(data.error);
      return data;
    },

    // Rücksprung von der Microsoft-Anmeldung: ?mstodo=ok|fehler&mstodoMsg=…
    handleReturn(toast) {
      const q = new URLSearchParams(location.search);
      if (!q.get('mstodo')) return;
      const msg = q.get('mstodoMsg') || '';
      history.replaceState(null, '', location.pathname + location.hash);
      if (q.get('mstodo') === 'ok') toast(msg || 'Microsoft To Do verbunden'); else setTimeout(() => alert('Microsoft To Do: ' + msg), 300);
    },
  };

  window.MsTodo = MsTodo;
})();
