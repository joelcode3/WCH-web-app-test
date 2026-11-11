// Supabase Edge Function "klima" – Klimaanlagen (Heizung) in den airbnb-Unterkünften über die Tuya-Cloud
//
// Je Unterkunft ist in der Tabelle "klima" eine Tuya-Geräte-ID hinterlegt (Kältebringer KB34 = TCL-Gerät,
// gekoppelt mit der App „Smart Life“, verknüpft mit dem Tuya-Cloud-Projekt „Platzverwaltung“).
// Werte des Geräts: switch (an/aus), mode (hot = Heizen), temp_set (Zehntelgrad, 0,5er-Schritte),
// temp_current (ganze Grad, gemessen oben am Innengerät).
//
// Stündlich (Zeitplan: supabase/klima-zeitplan.sql):
//   - Zustand aller Geräte lesen und in "klima" speichern (für die Anzeige in der App)
//   - Automatik (Oktober–April, je Unterkunft abschaltbar), nach dem airbnb-Kalender:
//       Abreisetag ab 11 Uhr → Heizen auf Sparbetrieb (Standard 16 °C)
//       Anreisetag ab 13 Uhr → Heizen auf Wohlfühltemperatur (Standard 22 °C)
//     Geschaltet wird nur einmal je Ereignis – was Gäste danach einstellen, bleibt.
// Verweigert Tuya den Zugriff (z. B. Probezeitraum abgelaufen), gibt es einmal eine SMS.
//
// Aufrufe (POST, JSON):
//   { action: "check" }                              – Zeitplan
//   { action: "refresh", place_id? }                 – Team: sofort lesen (und Automatik prüfen)
//   { action: "set", place_id, an?: bool, soll?: °C } – Team: schalten / Soll-Temperatur
//
// Geheime Einstellungen (Edge Functions → Secrets):
//   TUYA_CLIENT_ID, TUYA_CLIENT_SECRET   (platform.tuya.com → Projekt → Overview: Access ID / Access Secret)
//   TUYA_HOST (optional)                 Standard https://openapi.tuyaeu.com (Rechenzentrum Mitteleuropa)
//   SEVEN_API_KEY, SMS_EMPFAENGER        (wie beim Stromwächter, für die Hinweis-SMS)

import { createClient } from 'npm:@supabase/supabase-js@2';

export const AUTO_MONTHS = [10, 11, 12, 1, 2, 3, 4];   // Automatik nur in der Heizperiode
export const SPAR_AB = 11;                              // Abreisetag: ab 11 Uhr Sparbetrieb
export const KOMFORT_AB = 13;                           // Anreisetag: ab 13 Uhr hochheizen
const MIN_SOLL = 16, MAX_SOLL = 30;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export type Row = {
  place_id: string; device_id: string; auto: boolean; temp_spar: number; temp_komfort: number;
  online: boolean | null; an: boolean | null; modus: string; soll: number | null; ist: number | null;
  geprueft: string | null; auto_letzte: string; auto_info: string; fehler: string;
};
export type Db = {
  rows(): Promise<Row[]>;
  save(r: Row): Promise<void>;
  bookings(placeId: string): Promise<{ start: string; end: string }[] | null>;   // null = kein Kalender
  isTeamMember(auth: string): Promise<boolean>;
};

// Datum und Stunde in deutscher Zeit
export function berlin(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, month: Number(p.month), hour: Number(p.hour) };
}
const clock = (d: Date) => d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const deg = (t: number) => `${t.toLocaleString('de-DE', { maximumFractionDigits: 1 })} °C`;
const clampSoll = (t: number) => Math.min(MAX_SOLL, Math.max(MIN_SOLL, Math.round(t * 2) / 2));

// Was die Automatik jetzt tun soll: null oder { key, temp, info }
export function autoAction(r: Row, bookings: { start: string; end: string }[], now: Date) {
  if (!r.auto) return null;
  const b = berlin(now);
  if (!AUTO_MONTHS.includes(b.month)) return null;
  const arrive = bookings.some((x) => x.start === b.day);
  const depart = bookings.some((x) => x.end === b.day);
  if (arrive && b.hour >= KOMFORT_AB && r.auto_letzte !== `${b.day}:komfort`) {
    return { key: `${b.day}:komfort`, temp: Number(r.temp_komfort) || 22, info: 'Anreise heute – hochgeheizt' };
  }
  if (depart && !arrive && b.hour >= SPAR_AB && r.auto_letzte !== `${b.day}:spar`) {
    return { key: `${b.day}:spar`, temp: Number(r.temp_spar) || 16, info: 'Abreise heute – Sparbetrieb' };
  }
  return null;
}

export function createKlima(db: Db, env: (k: string) => string | undefined, fetchFn: typeof fetch = fetch, nowFn = () => new Date()) {
  const HOST = (env('TUYA_HOST') || 'https://openapi.tuyaeu.com').replace(/\/$/, '');
  const enc = new TextEncoder();
  const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
  const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  async function hmac(key: string, msg: string) {
    const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return hex(await crypto.subtle.sign('HMAC', k, enc.encode(msg))).toUpperCase();
  }

  let token = '';
  // Anfrage an die Tuya-Cloud mit Signatur (Tuya OpenAPI, HMAC-SHA256)
  async function tuya(method: string, path: string, body?: unknown, withToken = true): Promise<any> {
    const id = env('TUYA_CLIENT_ID') || '', secret = env('TUYA_CLIENT_SECRET') || '';
    if (!id || !secret) throw new Error('TUYA_CLIENT_ID / TUYA_CLIENT_SECRET fehlen in den Secrets der Funktion.');
    if (withToken && !token) await getToken();
    const raw = body === undefined ? '' : JSON.stringify(body);
    const t = String(nowFn().getTime());
    const nonce = crypto.randomUUID();
    const stringToSign = `${method}\n${await sha256(raw)}\n\n${path}`;
    const sign = await hmac(secret, id + (withToken ? token : '') + t + nonce + stringToSign);
    const headers: Record<string, string> = { client_id: id, sign, t, nonce, sign_method: 'HMAC-SHA256', 'Content-Type': 'application/json' };
    if (withToken) headers.access_token = token;
    const res = await fetchFn(HOST + path, { method, headers, body: raw || undefined, signal: AbortSignal.timeout(20000) });
    const j = await res.json().catch(() => ({}));
    if (!j.success) {
      const err = new Error(`Tuya: ${j.msg || 'HTTP ' + res.status}${j.code ? ' (' + j.code + ')' : ''}`) as Error & { code?: number };
      err.code = j.code;
      throw err;
    }
    return j.result;
  }
  async function getToken() {
    const r = await tuya('GET', '/v1.0/token?grant_type=1', undefined, false);
    token = r.access_token;
  }

  // Zustand mehrerer Geräte in einer Abfrage, dazu online/offline
  async function readAll(ids: string[]) {
    const out: Record<string, { status: Record<string, unknown>; online: boolean | null }> = {};
    if (!ids.length) return out;
    const st = await tuya('GET', `/v1.0/iot-03/devices/status?device_ids=${ids.join(',')}`);
    (Array.isArray(st) ? st : []).forEach((d: any) => {
      out[d.id] = { status: Object.fromEntries((d.status || []).map((x: any) => [x.code, x.value])), online: null };
    });
    try {
      const info = await tuya('GET', `/v2.0/cloud/thing/batch?device_ids=${ids.join(',')}`);
      const list = Array.isArray(info) ? info : (info && info.list) || [];
      list.forEach((d: any) => { if (out[d.id]) out[d.id].online = typeof d.is_online === 'boolean' ? d.is_online : (typeof d.online === 'boolean' ? d.online : null); });
    } catch (_) { /* online-Status optional */ }
    return out;
  }

  function apply(r: Row, s: Record<string, unknown>) {
    if (typeof s.switch === 'boolean') r.an = s.switch;
    if (typeof s.mode === 'string') r.modus = s.mode;
    if (typeof s.temp_set === 'number') r.soll = s.temp_set / 10;
    if (typeof s.temp_current === 'number') r.ist = s.temp_current;
  }

  async function command(r: Row, cmds: { code: string; value: unknown }[]) {
    await tuya('POST', `/v1.0/iot-03/devices/${r.device_id}/commands`, { commands: cmds });
    apply(r, Object.fromEntries(cmds.map((c) => [c.code, c.value])));
  }
  const heat = (t: number) => [{ code: 'switch', value: true }, { code: 'mode', value: 'hot' }, { code: 'temp_set', value: Math.round(clampSoll(t) * 10) }];

  async function sendSms(text: string) {
    // wie beim Stromwächter: Ziffern, deutsche Vorwahl ergänzen
    const key = env('SEVEN_API_KEY') || '';
    const nums = (env('SMS_EMPFAENGER') || '').split(/[,;\n]/).map((n) => n.replace(/[^\d+]/g, '')).filter(Boolean)
      .map((n) => (n.startsWith('+') ? n.slice(1) : n.startsWith('00') ? n.slice(2) : n.startsWith('0') ? '49' + n.slice(1) : n));
    if (!key || !nums.length) return;
    try {
      await fetchFn('https://gateway.seven.io/api/sms', { method: 'POST', headers: { 'X-Api-Key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ to: nums.join(','), text, from: (env('SMS_ABSENDER') || 'WCHesedorf').slice(0, 11) }) });
    } catch (e) { console.warn('SMS', e); }
  }

  // Lesen + Automatik für alle (oder eine) Unterkunft
  async function check(onlyPlace?: string, runAuto = true) {
    const now = nowFn(), iso = now.toISOString();
    const rows = (await db.rows()).filter((r) => r.device_id && (!onlyPlace || r.place_id === onlyPlace));
    const hadError = rows.some((r) => r.fehler);
    let data: Awaited<ReturnType<typeof readAll>> = {};
    let error = '';
    try { data = await readAll(rows.map((r) => r.device_id)); } catch (e) { error = e instanceof Error ? e.message : String(e); }
    const done: string[] = [];
    for (const r of rows) {
      r.geprueft = iso;
      r.fehler = error;
      const d = data[r.device_id];
      if (!error && !d) r.fehler = 'Gerät nicht gefunden (Geräte-ID prüfen / in Tuya verknüpft?)';
      if (d) { apply(r, d.status); r.online = d.online; }
      if (!error && runAuto) {
        const bookings = await db.bookings(r.place_id).catch(() => null);
        const act = bookings ? autoAction(r, bookings, now) : null;
        if (act && r.online !== false) {
          try {
            await command(r, heat(act.temp));
            r.auto_letzte = act.key;
            r.auto_info = `${act.info}: ${deg(clampSoll(act.temp))} (${clock(now)})`;
            done.push(`${r.place_id}: ${r.auto_info}`);
          } catch (e) { r.fehler = e instanceof Error ? e.message : String(e); }
        }
      }
      await db.save(r);
    }
    // Zugang verweigert (z. B. Probezeitraum abgelaufen) → einmal Bescheid geben
    if (error && !hadError && !onlyPlace) {
      console.warn('Tuya', error);
      await sendSms('Klimasteuerung: Tuya-Zugang klemmt, Automatik pausiert. Heizung läuft weiter wie eingestellt. Evtl. Tuya-Probezeit verlängern (platform.tuya.com).');
    }
    return { checked: rows.length, error, auto: done, rows };
  }

  async function set(placeId: string, an?: boolean, soll?: number) {
    const r = (await db.rows()).find((x) => x.place_id === placeId && x.device_id);
    if (!r) throw new Error('Für diese Unterkunft ist keine Klimaanlage hinterlegt.');
    const cmds: { code: string; value: unknown }[] = [];
    if (typeof an === 'boolean') cmds.push({ code: 'switch', value: an });
    if (typeof soll === 'number' && isFinite(soll)) cmds.push({ code: 'temp_set', value: Math.round(clampSoll(soll) * 10) });
    if (!cmds.length) throw new Error('Nichts zu tun');
    await command(r, cmds);
    r.fehler = '';
    r.geprueft = nowFn().toISOString();
    await db.save(r);
    return r;
  }

  async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    let body: any = {};
    try { body = await req.json(); } catch (_) { /* leer */ }
    const action = body.action || 'check';
    try {
      if (action === 'check') {
        // Schutz gegen zu häufige Aufrufe von außen: höchstens einmal pro Minute
        const recent = (await db.rows()).some((r) => r.geprueft && nowFn().getTime() - new Date(r.geprueft).getTime() < 60000);
        if (recent) return json({ skipped: true });
        const r = await check();
        return json({ checked: r.checked, error: r.error, auto: r.auto });
      }
      if (!(await db.isTeamMember(req.headers.get('Authorization') || ''))) return json({ error: 'Kein Zugriff' }, 403);
      if (action === 'refresh') return json(await check(body.place_id ? String(body.place_id) : undefined));
      if (action === 'set') {
        const r = await set(String(body.place_id || ''), typeof body.an === 'boolean' ? body.an : undefined, body.soll === undefined ? undefined : Number(body.soll));
        return json({ row: r });
      }
      return json({ error: 'Unbekannte Aktion' }, 400);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  }

  return { handle, check, set, tuya };
}

// ---------- airbnb-Kalender (nur Buchungen, keine Gästedaten) ----------
const ALLOWED = /^(www\.)?(airbnb\.[a-z.]+|booking\.com|admin\.booking\.com|ical\.booking\.com)$/i;
export function parseIcs(text: string) {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const out: { start: string; end: string }[] = [];
  let cur: Record<string, string> | null = null;
  const day = (v: string) => { const m = v.match(/(\d{4})(\d{2})(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : ''; };
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT' && cur) {
      const start = day(cur.DTSTART || ''), end = day(cur.DTEND || '') || start;
      const blocked = /not available|blocked|nicht verfügbar|closed/i.test(cur.SUMMARY || '');
      if (start && !blocked) out.push({ start, end });   // geblockte Tage sind keine Gäste
      cur = null;
    } else if (cur) {
      const i = line.indexOf(':');
      if (i > 0) cur[line.slice(0, i).split(';')[0].toUpperCase()] = line.slice(i + 1);
    }
  }
  return out;
}

// ---------- echte Datenbank (Supabase, Service-Rolle) ----------
function supabaseDb(): Db {
  const url = Deno.env.get('SUPABASE_URL')!;
  const sb = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const must = <T>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data; };
  return {
    async rows() { return must(await sb.from('klima').select('*')) as Row[]; },
    async save(r) {
      const { place_id, online, an, modus, soll, ist, geprueft, auto_letzte, auto_info, fehler } = r;
      must(await sb.from('klima').update({ online, an, modus, soll, ist, geprueft, auto_letzte, auto_info, fehler }).eq('place_id', place_id));
    },
    async bookings(placeId) {
      const rows = must(await sb.from('places').select('ical_url').eq('id', placeId)) as { ical_url: string }[];
      const link = rows[0] && rows[0].ical_url;
      if (!link) return null;
      const u = new URL(link);
      if (u.protocol !== 'https:' || !ALLOWED.test(u.hostname)) return null;
      const res = await fetch(link, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return null;
      return parseIcs(await res.text());
    },
    async isTeamMember(auth) {
      if (!auth) return false;
      const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') || '', { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
      const { data, error } = await user.rpc('is_team_member');
      return !error && data === true;
    },
  };
}

if (typeof Deno !== 'undefined' && Deno.serve && !Deno.env.get('KLIMA_TEST')) {
  Deno.serve((req) => createKlima(supabaseDb(), (k) => Deno.env.get(k)).handle(req));
}
