// Supabase Edge Function "airbnb-kalender"
//
// Holt die Kalender (iCal-Links) aller Ferienunterkünfte und gibt nur die belegten Zeiträume
// zurück: { units: [{ id, events: [{ start, end, type }] }], fetchedAt }
//   start/end = Anreise-/Abreisetag (YYYY-MM-DD, Abreise ist frei), type = "reserved" | "blocked"
// Keine Gästedaten: Beschreibung, Buchungs-Links und Telefonnummern werden verworfen.
//
// Zugriff: Die Unterkünfte werden mit dem Login des Aufrufers gelesen – die Zugriffsregeln der
// Datenbank (nur Team-Mitglieder) gelten also auch hier. Ohne Login gibt es keine Daten.
//
// Einrichten: Supabase-Dashboard → Edge Functions → "Deploy a new function" → "Via Editor",
// Name "airbnb-kalender", diesen Text einfügen, "Deploy". Details in SETUP.md.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// nur Kalender bekannter Buchungsportale abrufen
const ALLOWED = /^(www\.)?(airbnb\.[a-z.]+|booking\.com|admin\.booking\.com|ical\.booking\.com)$/i;

function parseIcs(text: string) {
  // gefaltete Zeilen (Fortsetzung beginnt mit Leerzeichen) zusammenfügen
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const events: { start: string; end: string; type: string }[] = [];
  let cur: Record<string, string> | null = null;
  const day = (v: string) => {
    const m = v.match(/(\d{4})(\d{2})(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
  };
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT' && cur) {
      const start = day(cur.DTSTART || ''), end = day(cur.DTEND || '') || start;
      const blocked = /not available|blocked|nicht verfügbar|closed/i.test(cur.SUMMARY || '');
      if (start) events.push({ start, end, type: blocked ? 'blocked' : 'reserved' });
      cur = null;
    } else if (cur) {
      const i = line.indexOf(':');
      if (i > 0) cur[line.slice(0, i).split(';')[0].toUpperCase()] = line.slice(i + 1);
    }
  }
  return events.sort((a, b) => a.start.localeCompare(b.start));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const auth = req.headers.get('Authorization') ?? '';
  const key = Deno.env.get('SUPABASE_ANON_KEY') ?? req.headers.get('apikey') ?? '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, key, { global: { headers: { Authorization: auth } } });

  const { data: units, error } = await sb.from('places').select('id, ical_url').neq('ical_url', '');
  if (error) return json({ error: error.message }, 403);

  const result = await Promise.all((units ?? []).map(async (u: { id: string; ical_url: string }) => {
    try {
      const url = new URL(u.ical_url);
      if (url.protocol !== 'https:' || !ALLOWED.test(url.hostname)) throw new Error('Kalender-Link nicht erlaubt');
      const res = await fetch(url, { headers: { 'User-Agent': 'Platzverwaltung Waldcamping Hesedorf' } });
      if (!res.ok) throw new Error(`Kalender nicht abrufbar (HTTP ${res.status})`);
      return { id: u.id, events: parseIcs(await res.text()) };
    } catch (e) {
      return { id: u.id, error: e instanceof Error ? e.message : String(e) };
    }
  }));
  return json({ units: result, fetchedAt: new Date().toISOString() });
});
