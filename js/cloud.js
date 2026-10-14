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
      }),
      fromRow: (r) => ({
        id: r.id, type: r.type, number: r.number, parcelId: r.parcel_id || '',
        boxId: r.box_id || '', location: r.location, notes: r.notes,
        inHouse: !!r.in_house, purpose: r.purpose || '', label: r.label || '',
      }),
    },
    {
      key: 'readings',
      toRow: (r) => ({ id: r.id, meter_id: r.meterId, date: r.date, value: Number(r.value) }),
      fromRow: (r) => ({ id: r.id, meterId: r.meter_id, date: r.date, value: Number(r.value) }),
    },
  ];

  const PAGE = 1000;
  const CHUNK = 500;

  const Cloud = {
    enabled: !!(cfg.url && cfg.anonKey),
    client: null,
    user: null,

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
      const rows = await Promise.all(TABLES.map((t) => this.fetchTable(t.key)));
      TABLES.forEach((t, i) => { result[t.key] = rows[i].map(t.fromRow); });
      return result;
    },

    // Zustand, gegen den beim nächsten Speichern verglichen wird
    snapshot(data) {
      const snap = {};
      TABLES.forEach((t) => {
        snap[t.key] = new Map((data[t.key] || []).map((x) => {
          const row = t.toRow(x);
          return [row.id, JSON.stringify(row)];
        }));
      });
      return snap;
    },

    // Änderungen zwischen "cur" und dem Snapshot "prev" hochladen
    async push(cur, prev) {
      let changes = 0;
      for (const t of TABLES) {
        const before = prev[t.key];
        const rows = (cur[t.key] || []).map(t.toRow).filter((row) => before.get(row.id) !== JSON.stringify(row));
        for (let i = 0; i < rows.length; i += CHUNK) {
          const { error } = await this.client.from(t.key).upsert(rows.slice(i, i + CHUNK));
          if (error) throw error;
        }
        changes += rows.length;
      }
      for (const t of [...TABLES].reverse()) {
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

  window.Cloud = Cloud;
})();
