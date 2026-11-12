// Supabase Edge Function "ms-todo" – Aufgaben aus Microsoft To Do übernehmen
//
// Übernommen werden nur Aufgaben, deren Titel mit „Camping“ beginnt (Groß-/Kleinschreibung egal);
// das Wort samt Doppelpunkt/Strich fällt im Titel weg. Alle 15 Minuten (supabase/ms-todo-zeitplan.sql):
//   - neue Aufgaben → To-Do in der Platzverwaltung (ohne Ort/Zuständigkeit – das wird in der App geklärt)
//   - Änderungen in To Do (Titel, Notiz, Fälligkeit, erledigt / wieder offen) → To-Do in der App
//   - in der App auf „Erledigt“ gesetzt → in To Do abgehakt (sonst wird nichts nach To Do geschrieben)
// In der App ergänzte Angaben (Ort, Fotos, Zuständig, Status „In Arbeit“) bleiben unangetastet.
// In To Do gelöschte Aufgaben bleiben in der App stehen; in der App gelöschte werden nicht neu angelegt.
//
// Aufrufe (POST, JSON):
//   { action: "check" }                          – Zeitplan
//   { action: "connect", return_url }            – Team: Microsoft-Anmeldung starten → { url }
//   { action: "sync-now" }                       – Team: sofort abgleichen
//   { action: "disconnect" }                     – Team: Verbindung lösen
//   GET ?code=…&state=…                          – Rücksprung von der Microsoft-Anmeldung
//
// Geheime Einstellungen (Edge Functions → Secrets): MS_CLIENT_ID, MS_CLIENT_SECRET
// (Microsoft Entra „App-Registrierung“, nur private Microsoft-Konten; Anleitung in SETUP.md)

import { createClient } from 'npm:@supabase/supabase-js@2';

const LOGIN = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPE = 'offline_access Tasks.ReadWrite User.Read';
export const PREFIX = /^\s*camping\b[\s:\-–—.,;|/]*/i;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export type Konto = { refresh_token: string; konto: string };
export type Link = { task_id: string; list_id: string; todo_id: string; ms_geaendert: string | null; ms_erledigt: boolean };
export type Todo = { id: string; title: string; description: string; status: string; deadline: string | null; done_at: string | null; created_at?: string };
export type Status = { verbunden: boolean; konto: string; letzter_abgleich: string | null; anzahl: number; fehler: string };
export type Db = {
  konto(): Promise<Konto | null>;
  saveKonto(k: Konto): Promise<void>;
  deleteKonto(): Promise<void>;
  links(): Promise<Link[]>;
  saveLink(l: Link): Promise<void>;
  todos(ids: string[]): Promise<Todo[]>;
  insertTodo(t: Todo): Promise<void>;
  updateTodo(id: string, fields: Partial<Todo>): Promise<void>;
  status(): Promise<Status | null>;
  saveStatus(s: Status): Promise<void>;
  saveOauth(state: string, returnUrl: string): Promise<void>;
  takeOauth(state: string): Promise<{ return_url: string } | null>;
  isTeamMember(auth: string): Promise<boolean>;
};

// Titel ohne „Camping“ davor; null = keine Camping-Aufgabe
export function campingTitle(title: string) {
  if (!PREFIX.test(title || '')) return null;
  return title.replace(PREFIX, '').trim() || title.trim();
}
// Notiz aus To Do (Text oder HTML) als einfacher Text
export function plain(body: { content?: string; contentType?: string } | undefined) {
  let s = (body && body.content) || '';
  if (body && /html/i.test(body.contentType || '')) {
    s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }
  return s.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
}
const dueDate = (t: any) => (t.dueDateTime && t.dueDateTime.dateTime ? String(t.dueDateTime.dateTime).slice(0, 10) : null);
async function todoId(taskId: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(taskId));
  return 'ms-' + [...new Uint8Array(buf)].slice(0, 8).map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function createMsTodo(db: Db, env: (k: string) => string | undefined, fetchFn: typeof fetch = fetch, nowFn = () => new Date()) {
  const redirectUri = () => `${env('SUPABASE_URL') || ''}/functions/v1/ms-todo`;

  async function token(params: Record<string, string>) {
    const res = await fetchFn(`${LOGIN}/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env('MS_CLIENT_ID') || '', client_secret: env('MS_CLIENT_SECRET') || '', scope: SCOPE, ...params }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.access_token) throw new Error(`Microsoft-Anmeldung: ${j.error_description || j.error || 'HTTP ' + res.status}`.slice(0, 300));
    return j as { access_token: string; refresh_token?: string };
  }

  async function graph(at: string, method: string, path: string, body?: unknown) {
    const res = await fetchFn(path.startsWith('http') ? path : GRAPH + path, {
      method, headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Microsoft To Do: ${(j.error && (j.error.message || j.error.code)) || 'HTTP ' + res.status}`.slice(0, 300));
    return j;
  }
  async function all(at: string, path: string) {
    const out: any[] = [];
    let next: string | undefined = path;
    for (let i = 0; next && i < 30; i++) {
      const j: any = await graph(at, 'GET', next);
      out.push(...(j.value || []));
      next = j['@odata.nextLink'];
    }
    return out;
  }

  // ---------- Abgleich ----------
  async function sync() {
    const now = nowFn().toISOString();
    const k = await db.konto();
    if (!k || !k.refresh_token) return { skipped: 'nicht verbunden' };
    const prev = await db.status();
    try {
      const t = await token({ grant_type: 'refresh_token', refresh_token: k.refresh_token });
      if (t.refresh_token && t.refresh_token !== k.refresh_token) await db.saveKonto({ ...k, refresh_token: t.refresh_token });
      const at = t.access_token;
      const lists = await all(at, '/me/todo/lists');
      const tasks: { list: string; t: any }[] = [];
      for (const l of lists) {
        (await all(at, `/me/todo/lists/${encodeURIComponent(l.id)}/tasks?$top=100`)).forEach((t) => tasks.push({ list: l.id, t }));
      }
      const links = new Map((await db.links()).map((l) => [l.task_id, l]));
      const existing = new Map((await db.todos([...links.values()].map((l) => l.todo_id))).map((x) => [x.id, x]));
      const stats = { neu: 0, geaendert: 0, erledigtNachToDo: 0 };
      let anzahl = 0;
      for (const { list, t } of tasks) {
        const link = links.get(t.id);
        const title = campingTitle(t.title || '');
        if (!link && title === null) continue;            // keine Camping-Aufgabe
        anzahl++;
        const done = t.status === 'completed';
        const doneDay = done ? String(t.completedDateTime && t.completedDateTime.dateTime || now).slice(0, 10) : null;
        if (!link) {
          const id = await todoId(t.id);
          if (!existing.has(id)) {
            await db.insertTodo({ id, title: title as string, description: plain(t.body), status: done ? 'erledigt' : 'offen',
              deadline: dueDate(t), done_at: doneDay, created_at: t.createdDateTime || now });
            stats.neu++;
          }
          await db.saveLink({ task_id: t.id, list_id: list, todo_id: id, ms_geaendert: t.lastModifiedDateTime || now, ms_erledigt: done });
          continue;
        }
        const todo = existing.get(link.todo_id);
        if (!todo) continue;                               // in der App gelöscht → nicht neu anlegen
        // 1. App → To Do: in der App erledigt, in To Do noch offen und vorher nie abgehakt → abhaken
        if (todo.status === 'erledigt' && !done && !link.ms_erledigt) {
          const r = await graph(at, 'PATCH', `/me/todo/lists/${encodeURIComponent(list)}/tasks/${encodeURIComponent(t.id)}`, { status: 'completed' });
          await db.saveLink({ ...link, list_id: list, ms_geaendert: r.lastModifiedDateTime || now, ms_erledigt: true });
          stats.erledigtNachToDo++;
          continue;
        }
        // 2. To Do → App: nur wenn sich in To Do etwas geändert hat
        const changed = t.lastModifiedDateTime && (!link.ms_geaendert || new Date(t.lastModifiedDateTime) > new Date(link.ms_geaendert));
        if (changed) {
          const f: Partial<Todo> = {};
          if (title !== null && title !== todo.title) f.title = title;
          const d = plain(t.body);
          if (d !== todo.description) f.description = d;
          if (dueDate(t) !== (todo.deadline || null)) f.deadline = dueDate(t);
          if (done && todo.status !== 'erledigt') { f.status = 'erledigt'; f.done_at = doneDay; }
          if (!done && link.ms_erledigt && todo.status === 'erledigt') { f.status = 'offen'; f.done_at = null; }   // in To Do wieder geöffnet
          if (Object.keys(f).length) { await db.updateTodo(todo.id, f); stats.geaendert++; }
        }
        if (changed || link.list_id !== list || link.ms_erledigt !== done) {
          await db.saveLink({ ...link, list_id: list, ms_geaendert: t.lastModifiedDateTime || link.ms_geaendert, ms_erledigt: done });
        }
      }
      await db.saveStatus({ verbunden: true, konto: k.konto, letzter_abgleich: now, anzahl, fehler: '' });
      return { ok: true, anzahl, ...stats };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.saveStatus({ verbunden: true, konto: k.konto, letzter_abgleich: prev ? prev.letzter_abgleich : null, anzahl: prev ? prev.anzahl : 0, fehler: msg });
      return { ok: false, error: msg };
    }
  }

  // ---------- Microsoft-Anmeldung ----------
  function authorizeUrl(state: string) {
    const q = new URLSearchParams({ client_id: env('MS_CLIENT_ID') || '', response_type: 'code', redirect_uri: redirectUri(),
      response_mode: 'query', scope: SCOPE, state, prompt: 'select_account' });
    return `${LOGIN}/authorize?${q}`;
  }
  async function callback(code: string, state: string, error: string) {
    const o = await db.takeOauth(state);
    const back = (ok: boolean, msg: string) => {
      const base = (o && o.return_url) || '';
      if (!base) return new Response(msg, { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      return Response.redirect(`${base}?mstodo=${ok ? 'ok' : 'fehler'}&mstodoMsg=${encodeURIComponent(msg)}#/daten`, 302);
    };
    if (!o) return back(false, 'Anmeldung abgelaufen – bitte noch einmal „Mit Microsoft verbinden“.');
    if (error || !code) return back(false, 'Anmeldung abgebrochen.');
    try {
      const t = await token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
      let konto = '';
      try { const me = await graph(t.access_token, 'GET', '/me'); konto = me.userPrincipalName || me.mail || me.displayName || ''; } catch (_) { /* egal */ }
      await db.saveKonto({ refresh_token: t.refresh_token || '', konto });
      await db.saveStatus({ verbunden: true, konto, letzter_abgleich: null, anzahl: 0, fehler: '' });
      const r = await sync();
      return back(true, `Microsoft To Do verbunden${konto ? ' (' + konto + ')' : ''}${'anzahl' in r ? ` – ${r.anzahl} Camping-Aufgaben` : ''}`);
    } catch (e) {
      return back(false, e instanceof Error ? e.message : String(e));
    }
  }

  async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    const url = new URL(req.url);
    if (req.method === 'GET' && url.searchParams.get('state')) {
      return callback(url.searchParams.get('code') || '', url.searchParams.get('state') || '', url.searchParams.get('error') || '');
    }
    let body: any = {};
    try { body = await req.json(); } catch (_) { /* leer */ }
    const action = body.action || 'check';
    try {
      if (action === 'check') {
        const s = await db.status();
        if (s && s.letzter_abgleich && nowFn().getTime() - new Date(s.letzter_abgleich).getTime() < 60000) return json({ skipped: true });
        return json(await sync());
      }
      if (!(await db.isTeamMember(req.headers.get('Authorization') || ''))) return json({ error: 'Kein Zugriff' }, 403);
      if (action === 'connect') {
        if (!env('MS_CLIENT_ID') || !env('MS_CLIENT_SECRET')) return json({ error: 'MS_CLIENT_ID / MS_CLIENT_SECRET fehlen in den Secrets der Funktion.' }, 400);
        const ret = String(body.return_url || '');
        const okRet = /^https:\/\/joelcode3\.github\.io\//.test(ret) || /^http:\/\/localhost(:\d+)?\//.test(ret);
        const state = crypto.randomUUID();
        await db.saveOauth(state, okRet ? ret : '');
        return json({ url: authorizeUrl(state) });
      }
      if (action === 'sync-now') return json(await sync());
      if (action === 'disconnect') {
        await db.deleteKonto();
        await db.saveStatus({ verbunden: false, konto: '', letzter_abgleich: null, anzahl: 0, fehler: '' });
        return json({ ok: true });
      }
      return json({ error: 'Unbekannte Aktion' }, 400);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  }

  return { handle, sync };
}

// ---------- echte Datenbank (Supabase, Service-Rolle) ----------
function supabaseDb(): Db {
  const url = Deno.env.get('SUPABASE_URL')!;
  const sb = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const must = <T>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data; };
  return {
    async konto() { return ((must(await sb.from('ms_todo_konto').select('*').eq('id', 'ms')) as Konto[])[0]) || null; },
    async saveKonto(k) { must(await sb.from('ms_todo_konto').upsert({ id: 'ms', refresh_token: k.refresh_token, konto: k.konto })); },
    async deleteKonto() { must(await sb.from('ms_todo_konto').delete().eq('id', 'ms')); },
    async links() { return must(await sb.from('ms_todo_aufgaben').select('*')) as Link[]; },
    async saveLink(l) { must(await sb.from('ms_todo_aufgaben').upsert(l)); },
    async todos(ids) {
      const out: Todo[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        out.push(...(must(await sb.from('todos').select('id, title, description, status, deadline, done_at').in('id', ids.slice(i, i + 200))) as Todo[]));
      }
      return out;
    },
    async insertTodo(t) {
      must(await sb.from('todos').insert({ id: t.id, title: t.title, description: t.description, status: t.status, deadline: t.deadline,
        done_at: t.done_at, created_at: t.created_at, target_type: '', target_id: '' }));
    },
    async updateTodo(id, f) { must(await sb.from('todos').update(f).eq('id', id)); },
    async status() { return ((must(await sb.from('ms_todo_status').select('*').eq('id', 'ms')) as Status[])[0]) || null; },
    async saveStatus(s) { must(await sb.from('ms_todo_status').upsert({ id: 'ms', ...s })); },
    async saveOauth(state, returnUrl) {
      await sb.from('ms_todo_oauth').delete().lt('created_at', new Date(Date.now() - 3600000).toISOString());
      must(await sb.from('ms_todo_oauth').insert({ state, return_url: returnUrl }));
    },
    async takeOauth(state) {
      const rows = must(await sb.from('ms_todo_oauth').select('*').eq('state', state)) as { return_url: string }[];
      await sb.from('ms_todo_oauth').delete().eq('state', state);
      return rows[0] || null;
    },
    async isTeamMember(auth) {
      if (!auth) return false;
      const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') || '', { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
      const { data, error } = await user.rpc('is_team_member');
      return !error && data === true;
    },
  };
}

if (typeof Deno !== 'undefined' && Deno.serve && !Deno.env.get('MSTODO_TEST')) {
  Deno.serve((req) => createMsTodo(supabaseDb(), (k) => Deno.env.get(k)).handle(req));
}
