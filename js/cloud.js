/*
 * Anbindung an Supabase (Datenbank + Login).
 *
 * Aktiv nur, wenn in js/config.js "supabase.url" und "supabase.anonKey" gesetzt sind.
 * Andernfalls läuft die App im lokalen Testmodus (Daten nur im Browser).
 *
 * Speichern: Die App ändert ihre Daten im Speicher und ruft Store.save() auf.
 * Hier wird der aktuelle Stand mit dem zuletzt gespeicherten verglichen und
 * nur geänderte/neue Zeilen hochgeladen bzw. entfernte gelöscht.
 */
(function () {
  'use strict';

  const cfg = (window.APP_CONFIG && window.APP_CONFIG.supabase) || {};
  const nz = (v) => (v === '' || v === undefined ? null : v);
  const num = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));

  // Reihenfolge = Reihenfolge beim Hochladen (Fremdschlüssel!). Löschen erfolgt umgekehrt.
  const TABLES = [
    {
      key: 'boxes',
      toRow: (b) => ({ id: b.id, nr: String(b.nr), pos: b.pos || null, location: b.location || '', limit_kwh: num(b.limitKwh) }),
      fromRow: (r) => ({ id: r.id, nr: r.nr, pos: r.pos, location: r.location || '', limitKwh: r.limit_kwh === null || r.limit_kwh === undefined ? '' : Number(r.limit_kwh) }),
    },
    {
      key: 'tanks',
      toRow: (t) => ({ id: t.id, nr: String(t.nr), pos: t.pos || null, capacity: t.capacity || '', notes: t.notes || '' }),
      fromRow: (r) => ({ id: r.id, nr: r.nr, pos: r.pos, capacity: r.capacity || '', notes: r.notes || '' }),
    },
    {
      key: 'parcels',
      toRow: (p) => ({
        id: p.id, nr: String(p.nr), status: p.status,
        tenant_name: p.tenant.name || '', tenant_phone: p.tenant.phone || '',
        tenant_email: p.tenant.email || '', tenant_address: p.tenant.address || '',
        size: num(p.size), gas: p.gas || 'none', gas_tank_id: nz(p.gasTankId),
        heating: p.heating || 'keine', notes: p.notes || '', geometry: p.geometry || [],
        object_type: p.objectType || 'pacht', rent: num(p.rent), winter_water: !!p.winterWater,
        dogs: Math.max(0, parseInt(p.dogs, 10) || 0), lease_start: nz(p.leaseStart), free_from: nz(p.freeFrom),
        residents: Math.max(0, parseInt(p.residents, 10) || 0),
      }),
      fromRow: (r) => ({
        id: r.id, nr: r.nr, status: r.status,
        tenant: { name: r.tenant_name, phone: r.tenant_phone, email: r.tenant_email, address: r.tenant_address },
        size: r.size === null ? '' : Number(r.size), gas: r.gas, gasTankId: r.gas_tank_id || '',
        heating: r.heating, notes: r.notes, geometry: r.geometry || [],
        objectType: r.object_type || 'pacht', rent: r.rent === null || r.rent === undefined ? '' : Number(r.rent),
        winterWater: !!r.winter_water,
        dogs: r.dogs || 0, leaseStart: r.lease_start || '', freeFrom: r.free_from || '', residents: r.residents || 0,
      }),
    },
    {
      key: 'meters',
      toRow: (m) => ({
        id: m.id, type: m.type, number: m.number || '', parcel_id: nz(m.parcelId),
        box_id: nz(m.boxId), location: m.location || '', notes: m.notes || '',
        in_house: !!m.inHouse, purpose: m.purpose || '', label: m.label || '',
        fuses: (m.fuses || []).filter((f) => f.nr || f.label), fuse_box_id: nz(m.fuseBoxId),
      }),
      fromRow: (r) => ({
        id: r.id, type: r.type, number: r.number, parcelId: r.parcel_id || '',
        boxId: r.box_id || '', location: r.location, notes: r.notes,
        inHouse: !!r.in_house, purpose: r.purpose || '', label: r.label || '',
        fuses: r.fuses || [], fuseBoxId: r.fuse_box_id || '',
      }),
    },
    {
      key: 'readings',
      toRow: (r) => ({ id: r.id, meter_id: r.meterId, date: r.date, value: Number(r.value) }),
      fromRow: (r) => ({ id: r.id, meterId: r.meter_id, date: r.date, value: Number(r.value) }),
    },
    // Neu mit Update 5 – fehlen die Tabellen noch, läuft die App ohne sie weiter (optional)
    {
      key: 'places',
      optional: true,
      toRow: (o) => ({ id: o.id, name: o.name || '', kind: o.kind || 'sonstiges', pos: o.pos || null, notes: o.notes || '',
        ical_url: o.icalUrl || '', photo: o.photo || null }),
      fromRow: (r) => ({ id: r.id, name: r.name || '', kind: r.kind || 'sonstiges', pos: r.pos, notes: r.notes || '',
        icalUrl: r.ical_url || '', photo: r.photo || null }),
    },
    {
      key: 'todos',
      optional: true,
      toRow: (t) => ({
        id: t.id, title: t.title || '', description: t.description || '',
        target_type: t.targetType || '', target_id: t.targetId || '', location: t.location || '',
        status: t.status || 'offen', deadline: nz(t.deadline), appointment: nz(t.appointment),
        assignee: t.assignee || '', photos: t.photos || [], created_at: t.createdAt, done_at: nz(t.doneAt),
      }),
      fromRow: (r) => ({
        id: r.id, title: r.title || '', description: r.description || '',
        targetType: r.target_type || '', targetId: r.target_id || '', location: r.location || '',
        status: r.status || 'offen', deadline: r.deadline || '', appointment: r.appointment ? String(r.appointment).slice(0, 16) : '',
        assignee: r.assignee || '', photos: r.photos || [], createdAt: r.created_at, doneAt: r.done_at || '',
      }),
    },
  ];

  // Spalten aus späteren Updates: fehlen sie noch, werden sie beim Speichern weggelassen
  const OPTIONAL_COLS = { meters: ['fuses', 'fuse_box_id'], places: ['ical_url', 'photo'] };

  const PAGE = 1000;
  const BUCKET = 'todo-fotos';
  // Tabelle fehlt (Datenbank-Update noch nicht ausgeführt)?
  const isMissingTable = (e) => /PGRST205|42P01|schema cache|does not exist|Could not find the table/i.test(`${e && e.code} ${e && e.message}`);
  const CHUNK = 500;

  const Cloud = {
    enabled: !!(cfg.url && cfg.anonKey),
    client: null,
    user: null,
    missing: new Set(),     // Tabellen, die in der Datenbank noch fehlen (z. B. "todos")
    missingCols: new Set(), // Spalten, die noch fehlen (z. B. "meters.fuses")

    // Zeile für die Datenbank (ohne noch fehlende Spalten)
    rowOf(t, x) {
      const row = t.toRow(x);
      (OPTIONAL_COLS[t.key] || []).forEach((c) => { if (this.missingCols.has(`${t.key}.${c}`)) delete row[c]; });
      return row;
    },

    init() {
      if (!this.enabled || this.client) return;
      this.client = window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    },

    /* ---------- Login ---------- */

    async getSession() {
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      this.user = data.session ? data.session.user : null;
      return data.session;
    },

    async signIn(email, password) {
      const { data, error } = await this.client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      this.user = data.user;
      return data.session;
    },

    async signOut() {
      await this.client.auth.signOut();
      this.user = null;
    },

    async sendPasswordReset(email) {
      const redirectTo = location.origin + location.pathname;
      const { error } = await this.client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
    },

    async setPassword(password) {
      const { error } = await this.client.auth.updateUser({ password });
      if (error) throw error;
    },

    onSignedOut(fn) {
      this.client.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') fn(); });
    },

    // true = Mitglied im Team; wirft Fehler, wenn die Datenbank nicht eingerichtet ist
    async isMember() {
      const { data, error } = await this.client.from('team').select('email').limit(1);
      if (error) throw error;
      return data.length > 0;
    },

    /* ---------- Daten ---------- */

    async fetchTable(name) {
      const out = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await this.client.from(name).select('*').order('id').range(from, from + PAGE - 1);
        if (error) throw error;
        out.push(...data);
        if (data.length < PAGE) break;
      }
      return out;
    },

    async fetchAll() {
      const result = { version: 1 };
      // fehlende Spalten erkennen (Datenbank-Update noch nicht ausgeführt)
      await Promise.all(Object.entries(OPTIONAL_COLS).flatMap(([table, cols]) => cols.map(async (c) => {
        const { error } = await this.client.from(table).select(c).limit(1);
        if (error && /42703|PGRST204|column|schema cache/i.test(`${error.code} ${error.message}`)) this.missingCols.add(`${table}.${c}`);
        else if (!error) this.missingCols.delete(`${table}.${c}`);
      })));
      const rows = await Promise.all(TABLES.map((t) => this.fetchTable(t.key).then((r) => { this.missing.delete(t.key); return r; }, (e) => {
        if (t.optional && isMissingTable(e)) { this.missing.add(t.key); return []; }
        throw e;
      })));
      TABLES.forEach((t, i) => { result[t.key] = rows[i].map(t.fromRow); });
      return result;
    },

    // Zustand, gegen den beim nächsten Speichern verglichen wird
    snapshot(data) {
      const snap = {};
      TABLES.forEach((t) => {
        snap[t.key] = new Map((data[t.key] || []).map((x) => {
          const row = this.rowOf(t, x);
          return [row.id, JSON.stringify(row)];
        }));
      });
      return snap;
    },

    // Änderungen zwischen "cur" und dem Snapshot "prev" hochladen
    async push(cur, prev) {
      let changes = 0;
      const tables = TABLES.filter((t) => !this.missing.has(t.key));
      for (const t of tables) {
        const before = prev[t.key];
        const rows = (cur[t.key] || []).map((x) => this.rowOf(t, x)).filter((row) => before.get(row.id) !== JSON.stringify(row));
        for (let i = 0; i < rows.length; i += CHUNK) {
          const { error } = await this.client.from(t.key).upsert(rows.slice(i, i + CHUNK));
          if (error) throw error;
        }
        changes += rows.length;
      }
      for (const t of [...tables].reverse()) {
        const ids = new Set((cur[t.key] || []).map((x) => x.id));
        const gone = [...prev[t.key].keys()].filter((id) => !ids.has(id));
        for (let i = 0; i < gone.length; i += CHUNK) {
          const { error } = await this.client.from(t.key).delete().in('id', gone.slice(i, i + CHUNK));
          if (error) throw error;
        }
        changes += gone.length;
      }
      return changes;
    },
  };

  /* ---------- Airbnb-Kalender (Supabase Edge Function "airbnb-kalender") ---------- */
  // liefert { units: [{ id, events: [{ start, end, type }] | error }], fetchedAt } – wirft bei fehlender Funktion 'missing'
  Cloud.calendars = async function () {
    // Anmeldung vorher auffrischen: nach dem Aufwecken der App (v. a. iPhone) ist sie oft gerade abgelaufen
    try { await Cloud.client.auth.getSession(); } catch (_) { /* weiter versuchen */ }
    let { data, error } = await Cloud.client.functions.invoke('airbnb-kalender', { body: {} });
    if (error && error.context && error.context.status === 401) {
      try { await Cloud.client.auth.refreshSession(); } catch (_) { /* ignorieren */ }
      ({ data, error } = await Cloud.client.functions.invoke('airbnb-kalender', { body: {} }));
    }
    if (error) {
      const status = error.context && error.context.status;
      const e = new Error(status === 404 ? 'missing' : (error.message || 'Fehler'));
      e.status = status;
      throw e;
    }
    return data;
  };

  /* ---------- Fotos (Supabase Storage, privater Ordner "todo-fotos") ---------- */
  const urlCache = new Map();   // Pfad → { url, until }
  Cloud.photos = {
    async upload(path, blob) {
      const { error } = await Cloud.client.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
      if (error) {
        if (/bucket not found|not found/i.test(error.message)) throw new Error('Foto-Speicher fehlt – bitte supabase/update-5.sql ausführen.');
        throw error;
      }
    },
    // zeitlich begrenzte Links (1 Std.), gesammelt abgefragt
    async urls(paths) {
      const now = Date.now();
      const need = [...new Set(paths.filter((p) => p && !(urlCache.get(p) && urlCache.get(p).until > now)))];
      if (need.length) {
        const { data, error } = await Cloud.client.storage.from(BUCKET).createSignedUrls(need, 3600);
        if (error) throw error;
        data.forEach((d) => { if (d.signedUrl) urlCache.set(d.path, { url: d.signedUrl, until: now + 50 * 60000 }); });
      }
      return Object.fromEntries(paths.map((p) => [p, urlCache.get(p) ? urlCache.get(p).url : '']));
    },
    async remove(paths) {
      if (!paths.length) return;
      const { error } = await Cloud.client.storage.from(BUCKET).remove(paths);
      if (error) console.warn('Fotos konnten nicht gelöscht werden', error);
    },
  };

  window.Cloud = Cloud;
})();
