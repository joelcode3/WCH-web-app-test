-- ==========================================================================
-- Update 5: To-Dos (mit Fotos) und Orte auf der Karte (Spielplatz, Grillhütte …)
--
-- Einmalig im Supabase "SQL Editor" komplett ausführen. Kann gefahrlos mehrfach laufen.
-- (Ist auch am Ende von schema.sql enthalten.)
-- ==========================================================================

-- Orte auf der Karte
create table if not exists public.places (
  id         text primary key,
  name       text not null default '',
  kind       text not null default 'sonstiges',
  pos        jsonb,                         -- [x, y] in Pixeln des Lageplans
  notes      text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- To-Dos (Ziel = Parzelle, Stromkasten, Gastank, Ort – oder leer = allgemein)
create table if not exists public.todos (
  id          text primary key,
  title       text not null default '',
  description text not null default '',
  target_type text not null default '' check (target_type in ('', 'parcel', 'box', 'tank', 'place')),
  target_id   text not null default '',
  location    text not null default '',     -- freier Ort, z. B. "Sanitärgebäude 2"
  status      text not null default 'offen' check (status in ('offen', 'planung', 'arbeit', 'erledigt')),
  deadline    date,
  appointment timestamp,                    -- Termin, z. B. Techniker kommt
  assignee    text not null default '',
  photos      jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  done_at     date,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-- Änderungsvermerk
drop trigger if exists touch_places on public.places;
create trigger touch_places before insert or update on public.places
  for each row execute function public.touch_row();
drop trigger if exists touch_todos on public.todos;
create trigger touch_todos before insert or update on public.todos
  for each row execute function public.touch_row();

-- Zugriffsschutz: nur angemeldete Team-Mitglieder
alter table public.places enable row level security;
alter table public.todos  enable row level security;
revoke all on public.places, public.todos from anon;

drop policy if exists team_all on public.places;
create policy team_all on public.places for all to authenticated
  using (public.is_team_member()) with check (public.is_team_member());
drop policy if exists team_all on public.todos;
create policy team_all on public.todos for all to authenticated
  using (public.is_team_member()) with check (public.is_team_member());

-- Fotos: privater Speicherordner "todo-fotos" (max. 5 MB je Bild)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('todo-fotos', 'todo-fotos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists todo_fotos_team on storage.objects;
create policy todo_fotos_team on storage.objects for all to authenticated
  using (bucket_id = 'todo-fotos' and public.is_team_member())
  with check (bucket_id = 'todo-fotos' and public.is_team_member());

-- Supabase-Schnittstelle über die neuen Tabellen informieren
notify pgrst, 'reload schema';
