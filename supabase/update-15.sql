-- ==========================================================================
-- Update 15: Aufgaben aus Microsoft To Do übernehmen (nur Titel, die mit „Camping“ beginnen)
--
-- Einmalig im Supabase "SQL Editor" komplett ausführen. Kann gefahrlos mehrfach laufen.
-- (Ist auch am Ende von schema.sql enthalten.)
--
-- Die Supabase-Funktion "ms-todo" holt alle 15 Minuten die Camping-Aufgaben und legt sie in "todos" an;
-- in der App erledigte Aufgaben werden in To Do abgehakt. Den Takt richtet supabase/ms-todo-zeitplan.sql ein.
-- ==========================================================================

-- Microsoft-Zugang – geheim: kein Zugriff aus der App, nur die Funktion liest/schreibt
create table if not exists public.ms_todo_konto (
  id            text primary key default 'ms',
  refresh_token text not null default '',
  konto         text not null default '',
  verbunden_am  timestamptz not null default now()
);
alter table public.ms_todo_konto enable row level security;
revoke all on public.ms_todo_konto from anon, authenticated;

-- laufende Microsoft-Anmeldungen (kurzlebig)
create table if not exists public.ms_todo_oauth (
  state      text primary key,
  return_url text not null default '',
  created_at timestamptz not null default now()
);
alter table public.ms_todo_oauth enable row level security;
revoke all on public.ms_todo_oauth from anon, authenticated;

-- Zuordnung To-Do-Aufgabe ↔ To-Do in der App
create table if not exists public.ms_todo_aufgaben (
  task_id      text primary key,
  list_id      text not null default '',
  todo_id      text not null,
  ms_geaendert timestamptz,
  ms_erledigt  boolean not null default false
);
alter table public.ms_todo_aufgaben enable row level security;
revoke all on public.ms_todo_aufgaben from anon, authenticated;

-- Zustand der Verbindung – die App darf ihn lesen (nur Team)
create table if not exists public.ms_todo_status (
  id               text primary key default 'ms',
  verbunden        boolean not null default false,
  konto            text not null default '',
  letzter_abgleich timestamptz,
  anzahl           integer not null default 0,
  fehler           text not null default ''
);
alter table public.ms_todo_status enable row level security;
revoke all on public.ms_todo_status from anon;
drop policy if exists team_read on public.ms_todo_status;
create policy team_read on public.ms_todo_status for select to authenticated
  using (public.is_team_member());

notify pgrst, 'reload schema';
