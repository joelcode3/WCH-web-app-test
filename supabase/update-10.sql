-- ==========================================================================
-- Update 10: Kalender (eigene Termine, längere Arbeiten, Abwesenheiten) und
--            Belegungsverlauf der airbnb-Unterkünfte
--
-- Einmalig im Supabase "SQL Editor" komplett ausführen. Kann gefahrlos mehrfach laufen.
-- (Ist auch am Ende von schema.sql enthalten.)
-- ==========================================================================

-- Kalender-Einträge (Termine aus To-Dos stehen weiter bei den To-Dos)
create table if not exists public.termine (
  id         text primary key,
  art        text not null default 'termin' check (art in ('termin', 'arbeit', 'abwesenheit')),
  titel      text not null default '',
  beginn     date not null,
  ende       date not null,
  zeit_von   text not null default '',        -- "HH:MM" oder leer = ganztägig
  zeit_bis   text not null default '',
  orte       jsonb not null default '[]'::jsonb,   -- ["place:…", "parcel:…", …]
  personen   jsonb not null default '[]'::jsonb,   -- ["Thomas", …]
  notizen    text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
drop trigger if exists touch_termine on public.termine;
create trigger touch_termine before insert or update on public.termine
  for each row execute function public.touch_row();

-- airbnb liefert vergangene Buchungen nicht mehr mit – die App merkt sie sich hier
-- (nur Zeiträume, keine Gästedaten), damit die Belegung vergangener Monate stimmt
create table if not exists public.airbnb_belegung (
  place_id text not null,
  anreise  date not null,
  abreise  date not null,
  art      text not null default 'reserved',      -- reserved | blocked
  seen_at  timestamptz not null default now(),   -- zuerst gesehen
  primary key (place_id, anreise, abreise)
);

-- Zugriffsschutz: nur angemeldete Team-Mitglieder
alter table public.termine         enable row level security;
alter table public.airbnb_belegung enable row level security;
revoke all on public.termine, public.airbnb_belegung from anon;

drop policy if exists team_all on public.termine;
create policy team_all on public.termine for all to authenticated
  using (public.is_team_member()) with check (public.is_team_member());
drop policy if exists team_all on public.airbnb_belegung;
create policy team_all on public.airbnb_belegung for all to authenticated
  using (public.is_team_member()) with check (public.is_team_member());

-- Supabase-Schnittstelle über die neuen Tabellen informieren
notify pgrst, 'reload schema';
