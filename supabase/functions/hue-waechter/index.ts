// Supabase Edge Function "hue-waechter" – Stromausfall- und Frostwarnung für die Unterkünfte
//
// Je Unterkunft (z. B. Londonbus) ist eine Philips Hue Bridge verbunden. Alle 5 Minuten
// (Zeitplan: supabase/waechter-zeitplan.sql) prüft die Funktion über die Hue-Fernsteuerung:
//   - Ist die Bridge erreichbar? Nein, länger als 15 Min. → SMS „möglicher Stromausfall“
//   - Temperatur der Hue-Bewegungsmelder: unter 5 °C (10 Min. lang) → SMS „Frostgefahr“
//   - Batterie eines Melders unter 15 % → SMS
// Kommt alles wieder in Ordnung, gibt es eine Entwarnung. Den Zustand liest die App aus der
// Tabelle waechter_status (nur Team-Mitglieder).
//
// Aufrufe (POST, JSON):
//   { action: "check" }                       – Zeitplan; prüft alle Unterkünfte
//   { action: "connect", place_id, return_url } – Team: Hue-Anmeldung starten → { url }
//   { action: "disconnect", place_id }        – Team: Verbindung lösen
//   { action: "test-sms" }                    – Team: Test-SMS an alle Empfänger
//   GET ?code=…&state=…                       – Rücksprung von der Hue-Anmeldung
//
// Geheime Einstellungen (Edge Functions → Secrets), trägt der Betreiber selbst ein:
//   HUE_CLIENT_ID, HUE_CLIENT_SECRET   (developers.meethue.com → Remote Hue API)
//   SEVEN_API_KEY                      (seven.io → API-Schlüssel)
//   SMS_EMPFAENGER                     Handynummern, mit Komma getrennt, z. B. 0171 1234567, 0160 7654321
//   SMS_ABSENDER (optional)            max. 11 Zeichen, Standard „WCHesedorf“
//
// Einrichten: siehe SETUP.md, Abschnitt „Stromausfall- und Frostwarnung“.

import { createClient } from 'npm:@supabase/supabase-js@2';

export const OFFLINE_MIN = 15;     // Minuten nicht erreichbar → Warnung
export const FROST_TEMP = 5;       // °C – darunter Frostwarnung
export const FROST_CLEAR = 6;      // °C – ab hier Entwarnung (kein Hin und Her um 5 °C)
export const FROST_MIN = 10;       // Minuten unter FROST_TEMP → Warnung
export const BATTERY_LOW = 15;     // % – Batterie schwach
const HUE = 'https://api.meethue.com';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type Bridge = { place_id: string; bridge_id: string; access_token: string; refresh_token: string; token_expires: string | null; app_key: string };
type Sensor = { name: string; temp: number | null; battery: number | null; updated: string | null };
type Status = {
  place_id: string; connected: boolean; online: boolean | null; since: string | null; last_check: string | null; last_ok: string | null;
  sensors: Sensor[]; min_temp: number | null; frost_since: string | null;
  alarm_offline: boolean; alarm_frost: boolean; alarm_battery: boolean; error: string; sms_error: string;
};

// Datenbank-Zugriff (austauschbar für Tests)
export type Db = {
  bridges(): Promise<Bridge[]>;
  bridge(placeId: string): Promise<Bridge | null>;
  saveBridge(b: Bridge): Promise<void>;
  deleteBridge(placeId: string): Promise<void>;
  statuses(): Promise<Status[]>;
  saveStatus(s: Status): Promise<void>;
  deleteStatus(placeId: string): Promise<void>;
  placeNames(): Promise<Record<string, string>>;
  saveOauth(state: string, placeId: string, returnUrl: string): Promise<void>;
  takeOauth(state: string): Promise<{ place_id: string; return_url: string } | null>;
  isTeamMember(auth: string): Promise<boolean>;
};

export type Env = (k: string) => string | undefined;

const emptyStatus = (placeId: string): Status => ({
  place_id: placeId, connected: true, online: null, since: null, last_check: null, last_ok: null, sensors: [], min_temp: null,
  frost_since: null, alarm_offline: false, alarm_frost: false, alarm_battery: false, error: '', sms_error: '',
});

const minutes = (from: string | null, now: Date) => (from ? (now.getTime() - new Date(from).getTime()) / 60000 : 0);
const clock = (iso: string | null) => {
  if (!iso) return '?';
  return new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
};
const deg = (t: number) => `${t.toFixed(1).replace('.', ',')} °C`;

// Handynummern für seven.io: nur Ziffern, deutsche Vorwahl ergänzen
export function phoneList(raw: string) {
  return raw.split(/[,;\n]/).map((n) => n.replace(/[^\d+]/g, '')).filter(Boolean)
    .map((n) => (n.startsWith('+') ? n.slice(1) : n.startsWith('00') ? n.slice(2) : n.startsWith('0') ? '49' + n.slice(1) : n));
}

export function createWaechter(db: Db, env: Env, fetchFn: typeof fetch = fetch, nowFn = () => new Date()) {
  // ---------- SMS ----------
  async function sendSms(text: string): Promise<{ ok: boolean; configured: boolean; error: string }> {
    const key = env('SEVEN_API_KEY'), to = phoneList(env('SMS_EMPFAENGER') || '');
    if (!key || !to.length) return { ok: false, configured: false, error: 'SMS nicht eingerichtet (SEVEN_API_KEY / SMS_EMPFAENGER fehlen)' };
    try {
      const res = await fetchFn('https://gateway.seven.io/api/sms', {
        method: 'POST',
        headers: { 'X-Api-Key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ to: to.join(','), text, from: (env('SMS_ABSENDER') || 'WCHesedorf').slice(0, 11) }),
      });
      const body = await res.json().catch(() => ({}));
      const code = String(body.success ?? '');
      if (res.ok && (code === '100' || code === '101')) return { ok: true, configured: true, error: '' };
      return { ok: false, configured: true, error: `SMS-Versand fehlgeschlagen (HTTP ${res.status}, Code ${code || '?'})` };
    } catch (e) {
      return { ok: false, configured: true, error: 'SMS-Versand fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)) };
    }
  }

  // ---------- Hue-Zugang ----------
  const basic = () => 'Basic ' + btoa(`${env('HUE_CLIENT_ID') || ''}:${env('HUE_CLIENT_SECRET') || ''}`);

  async function token(params: Record<string, string>) {
    const res = await fetchFn(`${HUE}/v2/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: basic(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) throw new Error(`Hue-Anmeldung fehlgeschlagen (HTTP ${res.status})`);
    const expires = new Date(nowFn().getTime() + (Number(body.expires_in) || 7 * 86400) * 1000).toISOString();
    return { access_token: String(body.access_token), refresh_token: String(body.refresh_token || params.refresh_token || ''), token_expires: expires };
  }

  async function refresh(b: Bridge) {
    Object.assign(b, await token({ grant_type: 'refresh_token', refresh_token: b.refresh_token }));
    await db.saveBridge(b);
  }

  async function hue(b: Bridge, path: string) {
    const go = () => fetchFn(`${HUE}/route/clip/v2/resource/${path}`, {
      headers: { Authorization: `Bearer ${b.access_token}`, 'hue-application-key': b.app_key },
      signal: AbortSignal.timeout(12000),
    });
    let res = await go();
    if (res.status === 401) { await refresh(b); res = await go(); }
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  }

  // ---------- Prüfung einer Unterkunft ----------
  // Ergebnis: 'online' | 'offline' | 'unknown' (z. B. Hue-Zugang abgelaufen, Hue überlastet)
  async function probe(b: Bridge): Promise<{ state: 'online' | 'offline' | 'unknown'; error: string; sensors?: Sensor[] }> {
    try {
      if (b.token_expires && new Date(b.token_expires).getTime() - nowFn().getTime() < 86400000) await refresh(b);
      const r = await hue(b, 'bridge');
      if (r.status === 401 || r.status === 403) return { state: 'unknown', error: 'Hue-Zugang abgelaufen – bitte die Unterkunft neu mit Hue verbinden.' };
      if (r.status === 429) return { state: 'unknown', error: '' };
      const data = Array.isArray(r.body?.data) ? r.body.data : [];
      if (r.status >= 300 || !data.length) return { state: 'offline', error: '' };
      // Temperatur, Namen und Batterie der Melder
      const [t, d, p] = await Promise.all([hue(b, 'temperature'), hue(b, 'device'), hue(b, 'device_power')]);
      const names: Record<string, string> = {};
      (d.body?.data || []).forEach((x: any) => { names[x.id] = x.metadata?.name || 'Sensor'; });
      const battery: Record<string, number> = {};
      (p.body?.data || []).forEach((x: any) => { if (x.owner?.rid && typeof x.power_state?.battery_level === 'number') battery[x.owner.rid] = x.power_state.battery_level; });
      const sensors: Sensor[] = (t.body?.data || []).filter((x: any) => x.enabled !== false).map((x: any) => {
        const rep = x.temperature?.temperature_report;
        const temp = typeof rep?.temperature === 'number' ? rep.temperature : typeof x.temperature?.temperature === 'number' ? x.temperature.temperature : null;
        const dev = x.owner?.rid || '';
        return { name: names[dev] || 'Sensor', temp, battery: battery[dev] ?? null, updated: rep?.changed || null };
      });
      return { state: 'online', error: '', sensors };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/Hue-Anmeldung/.test(msg)) return { state: 'unknown', error: 'Hue-Zugang abgelaufen – bitte die Unterkunft neu mit Hue verbinden.' };
      return { state: 'offline', error: '' };   // Zeitüberschreitung / keine Verbindung
    }
  }

  // ---------- Prüfung aller Unterkünfte, SMS bei Änderungen ----------
  async function check(onlyPlace?: string) {
    const now = nowFn(), iso = now.toISOString();
    const [bridges, statuses, names] = await Promise.all([db.bridges(), db.statuses(), db.placeNames()]);
    const byId = new Map(statuses.map((s) => [s.place_id, s]));
    const alerts: { s: Status; flag?: 'alarm_offline' | 'alarm_frost' | 'alarm_battery'; value?: boolean; text: string }[] = [];
    const results: Status[] = [];

    for (const b of bridges) {
      if (onlyPlace && b.place_id !== onlyPlace) continue;
      const s: Status = { ...emptyStatus(b.place_id), ...(byId.get(b.place_id) || {}), connected: true };
      const name = names[b.place_id] || 'Unterkunft';
      const r = await probe(b);
      s.last_check = iso;
      // Zugang abgelaufen: Überwachung ist blind → einmal Bescheid geben
      if (r.error && r.error !== s.error) alerts.push({ s, text: `Stromwächter ${name}: ${r.error} Bis dahin keine Überwachung.` });
      s.error = r.error;

      if (r.state === 'online') {
        if (s.online !== true) s.since = iso;
        if (s.alarm_offline) alerts.push({ s, flag: 'alarm_offline', value: false, text: `Entwarnung: ${name} ist wieder erreichbar (ausgefallen seit ${clock(s.last_ok)}).` });
        s.online = true;
        s.last_ok = iso;
        s.sensors = r.sensors || [];
        const temps = s.sensors.map((x) => x.temp).filter((x): x is number => typeof x === 'number');
        s.min_temp = temps.length ? Math.min(...temps) : null;
        // Frost
        const cold = s.sensors.filter((x) => typeof x.temp === 'number' && x.temp < FROST_TEMP);
        if (cold.length) {
          s.frost_since = s.frost_since || iso;
          if (!s.alarm_frost && minutes(s.frost_since, now) >= FROST_MIN - 0.5) {
            alerts.push({ s, flag: 'alarm_frost', value: true, text: `FROSTGEFAHR ${name}: ${cold.map((x) => `${x.name} ${deg(x.temp as number)}`).join(', ')}. Bitte Heizung/Strom prüfen!` });
          }
        } else if (s.min_temp === null || s.min_temp >= FROST_CLEAR) {
          if (s.alarm_frost) alerts.push({ s, flag: 'alarm_frost', value: false, text: `Entwarnung Frost: ${name} wieder ${s.min_temp !== null ? deg(s.min_temp) : 'ok'}.` });
          s.frost_since = null;
        }
        // Batterie
        const weak = s.sensors.filter((x) => typeof x.battery === 'number' && x.battery <= BATTERY_LOW);
        if (weak.length && !s.alarm_battery) {
          alerts.push({ s, flag: 'alarm_battery', value: true, text: `Batterie schwach ${name}: ${weak.map((x) => `${x.name} ${x.battery} %`).join(', ')}. Bitte wechseln (Lithium-AAA).` });
        } else if (!weak.length && s.sensors.every((x) => x.battery === null || x.battery > BATTERY_LOW + 10)) {
          s.alarm_battery = false;
        }
      } else if (r.state === 'offline') {
        if (s.online !== false) s.since = iso;
        s.online = false;
        // gezählt ab „zuletzt erreichbar“ (der Ausfall begann irgendwann danach)
        const gone = s.last_ok || s.since;
        if (!s.alarm_offline && minutes(gone, now) >= OFFLINE_MIN - 0.5) {
          alerts.push({ s, flag: 'alarm_offline', value: true, text: `ACHTUNG ${name}: Hue Bridge nicht erreichbar (zuletzt ${clock(gone)}) – möglicher Stromausfall oder Internet weg. Bitte prüfen!` });
        }
      }
      results.push(s);
    }

    // eine gemeinsame SMS für alles, was sich geändert hat
    if (alerts.length) {
      const both = alerts.filter((a) => a.flag === 'alarm_offline' && a.value).length > 1;
      const text = alerts.map((a) => a.text).join('\n') + (both ? '\n(Mehrere Unterkünfte gleichzeitig – evtl. Internet- oder Hue-Störung.)' : '');
      const sms = await sendSms(text);
      // bei echtem Fehler Merker nicht setzen → nächster Durchlauf versucht es erneut
      if (sms.ok || !sms.configured) alerts.forEach((a) => { if (a.flag) a.s[a.flag] = a.value as boolean; });
      results.forEach((s) => { s.sms_error = sms.ok ? '' : sms.error; });
    }
    for (const s of results) await db.saveStatus(s);
    return { checked: results.length, alerts: alerts.map((a) => a.text) };
  }

  // ---------- Hue verbinden ----------
  function authorizeUrl(state: string) {
    const q = new URLSearchParams({ client_id: env('HUE_CLIENT_ID') || '', response_type: 'code', state });
    return `${HUE}/v2/oauth2/authorize?${q}`;
  }

  async function callback(code: string, state: string) {
    const st = await db.takeOauth(state);
    const back = (ok: boolean, msg: string, placeId = '') => {
      const base = st?.return_url || 'https://joelcode3.github.io/WCH-web-app-test/';
      const u = new URL(base);
      u.search = new URLSearchParams({ hue: ok ? 'ok' : 'fehler', hueMsg: msg }).toString();
      u.hash = placeId ? `#/karte/place/${placeId}` : '#/airbnb';
      return new Response(null, { status: 302, headers: { Location: u.toString() } });
    };
    if (!st) return back(false, 'Anmeldung abgelaufen – bitte noch einmal „Mit Hue verbinden“ tippen.');
    try {
      const tok = await token({ grant_type: 'authorization_code', code });
      const auth = { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' };
      // App an der Bridge anmelden (Fern-„Link-Taste“), Zugangsschlüssel holen
      await fetchFn(`${HUE}/route/api/0/config`, { method: 'PUT', headers: auth, body: JSON.stringify({ linkbutton: true }) });
      const reg = await fetchFn(`${HUE}/route/api`, { method: 'POST', headers: auth, body: JSON.stringify({ devicetype: 'platzverwaltung#waechter' }) });
      const regBody = await reg.json().catch(() => null);
      const appKey = Array.isArray(regBody) ? regBody[0]?.success?.username : undefined;
      if (!appKey) throw new Error('Die Bridge hat die App nicht angenommen. Ist die Bridge online?');
      const b: Bridge = { place_id: st.place_id, bridge_id: '', app_key: String(appKey), ...tok };
      const info = await hue(b, 'bridge');
      b.bridge_id = String(info.body?.data?.[0]?.bridge_id || '');
      const taken = (await db.bridges()).find((x) => x.bridge_id && x.bridge_id === b.bridge_id && x.place_id !== b.place_id);
      if (taken) {
        const names = await db.placeNames();
        return back(false, `Diese Bridge ist schon mit „${names[taken.place_id] || 'einer anderen Unterkunft'}“ verbunden. Bitte bei der Hue-Anmeldung die andere Bridge auswählen.`, st.place_id);
      }
      await db.saveBridge(b);
      await check(b.place_id);
      return back(true, 'Hue verbunden – der Stromwächter ist aktiv.', st.place_id);
    } catch (e) {
      return back(false, e instanceof Error ? e.message : String(e), st.place_id);
    }
  }

  // ---------- Anfragen ----------
  async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    const url = new URL(req.url);
    if (req.method === 'GET' && url.searchParams.get('state')) {
      const err = url.searchParams.get('error');
      if (err) return callback('', url.searchParams.get('state') || '');
      return callback(url.searchParams.get('code') || '', url.searchParams.get('state') || '');
    }
    let body: any = {};
    try { body = await req.json(); } catch (_) { /* leer */ }
    const action = body.action || 'check';

    if (action === 'check') {
      // Schutz gegen zu häufige Aufrufe von außen: höchstens einmal pro Minute
      const recent = (await db.statuses()).some((s) => s.last_check && minutes(s.last_check, nowFn()) < 1);
      if (recent) return json({ skipped: true });
      return json(await check());
    }

    if (!(await db.isTeamMember(req.headers.get('Authorization') || ''))) return json({ error: 'Kein Zugriff' }, 403);

    if (action === 'connect') {
      if (!env('HUE_CLIENT_ID') || !env('HUE_CLIENT_SECRET')) return json({ error: 'HUE_CLIENT_ID / HUE_CLIENT_SECRET fehlen in den Secrets der Funktion.' }, 400);
      if (!body.place_id) return json({ error: 'place_id fehlt' }, 400);
      const state = crypto.randomUUID();
      const ret = String(body.return_url || '');
      const okRet = /^https:\/\/joelcode3\.github\.io\//.test(ret) || /^http:\/\/localhost(:\d+)?\//.test(ret);
      await db.saveOauth(state, String(body.place_id), okRet ? ret : '');
      return json({ url: authorizeUrl(state) });
    }
    if (action === 'disconnect') {
      await db.deleteBridge(String(body.place_id || ''));
      await db.deleteStatus(String(body.place_id || ''));
      return json({ ok: true });
    }
    if (action === 'test-sms') {
      const r = await sendSms('Test: Der Stromwächter Waldcamping Hesedorf ist eingerichtet. Diese SMS kommt bei Stromausfall oder Frostgefahr in den Unterkünften.');
      return json(r, r.ok ? 200 : 400);
    }
    if (action === 'check-now') return json(await check(body.place_id ? String(body.place_id) : undefined));
    return json({ error: 'Unbekannte Aktion' }, 400);
  }

  return { handle, check, sendSms, probe };
}

// ---------- echte Datenbank (Supabase, Service-Rolle) ----------
function supabaseDb(): Db {
  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(url, service, { auth: { persistSession: false } });
  const must = <T>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data; };
  return {
    async bridges() { return must(await sb.from('hue_bridges').select('*')) as Bridge[]; },
    async bridge(id) { return (must(await sb.from('hue_bridges').select('*').eq('place_id', id)) as Bridge[])[0] || null; },
    async saveBridge(b) { must(await sb.from('hue_bridges').upsert(b)); },
    async deleteBridge(id) { must(await sb.from('hue_bridges').delete().eq('place_id', id)); },
    async statuses() { return must(await sb.from('waechter_status').select('*')) as Status[]; },
    async saveStatus(s) { must(await sb.from('waechter_status').upsert(s)); },
    async deleteStatus(id) { must(await sb.from('waechter_status').delete().eq('place_id', id)); },
    async placeNames() {
      const rows = must(await sb.from('places').select('id, name')) as { id: string; name: string }[];
      return Object.fromEntries(rows.map((r) => [r.id, r.name]));
    },
    async saveOauth(state, placeId, returnUrl) {
      await sb.from('hue_oauth').delete().lt('created_at', new Date(Date.now() - 3600000).toISOString());
      must(await sb.from('hue_oauth').insert({ state, place_id: placeId, return_url: returnUrl }));
    },
    async takeOauth(state) {
      const rows = must(await sb.from('hue_oauth').select('*').eq('state', state)) as { place_id: string; return_url: string }[];
      await sb.from('hue_oauth').delete().eq('state', state);
      return rows[0] || null;
    },
    async isTeamMember(auth) {
      if (!auth) return false;
      const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
      const user = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
      const { data, error } = await user.rpc('is_team_member');
      return !error && data === true;
    },
  };
}

Deno.serve((req) => createWaechter(supabaseDb(), (k) => Deno.env.get(k)).handle(req));
