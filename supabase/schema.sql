-- ==========================================================================
-- Platzverwaltung Waldcamping Hesedorf – Datenbankschema für Supabase
--
-- Einmalig im Supabase-Dashboard unter "SQL Editor" komplett ausführen.
-- Das Skript kann gefahrlos mehrfach ausgeführt werden (idempotent).
-- Danach unten die eigene E-Mail-Adresse in die Tabelle "team" eintragen.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- Team: nur diese E-Mail-Adressen dürfen Daten sehen und ändern
-- --------------------------------------------------------------------------
create table if not exists public.team (
  email      text primary key,
  name       text not null default '',
  role       text not null default 'admin' check (role in ('admin', 'mitarbeiter')),
  created_at timestamptz not null default now()
);

create or replace function public.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- --------------------------------------------------------------------------
-- Stammdaten
-- --------------------------------------------------------------------------
create table if not exists public.boxes (
  id         text primary key,
  nr         text not null,
  pos        jsonb,                         -- [x, y] in Pixeln des Lageplans
  location   text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.tanks (
  id         text primary key,
  nr         text not null,
  pos        jsonb,
  capacity   text not null default '',
  notes      text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.parcels (
  id             text primary key,
  nr             text not null,
  status         text not null default 'leer' check (status in ('fest', 'wochenende', 'leer')),
  tenant_name    text not null default '',
  tenant_phone   text not null default '',
  tenant_email   text not null default '',
  tenant_address text not null default '',
  size           numeric,
  gas            text not null default 'none' check (gas in ('none', 'tank', 'bottle')),
  gas_tank_id    text references public.tanks (id) on delete set null,
  heating        text not null default 'keine',
  notes          text not null default '',
  geometry       jsonb not null default '[]'::jsonb,  -- [[x, y], ...]
  updated_at     timestamptz not null default now(),
  updated_by     uuid
);

create table if not exists public.meters (
  id         text primary key,
  type       text not null check (type in ('strom', 'gas')),
  number     text not null default '',
  parcel_id  text not null references public.parcels (id) on delete cascade,
  box_id     text references public.boxes (id) on delete set null,
  location   text not null default '',
  notes      text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists meters_parcel_idx on public.meters (parcel_id);
create index if not exists meters_box_idx on public.meters (box_id);

create table if not exists public.readings (
  id         text primary key,
  meter_id   text not null references public.meters (id) on delete cascade,
  date       date not null,
  value      numeric not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists readings_meter_date_idx on public.readings (meter_id, date);

-- --------------------------------------------------------------------------
-- Änderungsvermerk: wer hat wann zuletzt geändert
-- --------------------------------------------------------------------------
create or replace function public.touch_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['boxes', 'tanks', 'parcels', 'meters', 'readings'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$I', t);
    execute format('create trigger touch_%1$s before insert or update on public.%1$I
                    for each row execute function public.touch_row()', t);
  end loop;
end;
$$;

-- --------------------------------------------------------------------------
-- Zugriffsschutz (Row Level Security)
-- Ohne Anmeldung UND Eintrag in "team" ist nichts sichtbar.
-- --------------------------------------------------------------------------
alter table public.team     enable row level security;
alter table public.boxes    enable row level security;
alter table public.tanks    enable row level security;
alter table public.parcels  enable row level security;
alter table public.meters   enable row level security;
alter table public.readings enable row level security;

revoke all on public.team, public.boxes, public.tanks, public.parcels, public.meters, public.readings from anon;

drop policy if exists team_read on public.team;
create policy team_read on public.team
  for select to authenticated using (public.is_team_member());

do $$
declare t text;
begin
  foreach t in array array['boxes', 'tanks', 'parcels', 'meters', 'readings'] loop
    execute format('drop policy if exists team_all on public.%I', t);
    execute format('create policy team_all on public.%I for all to authenticated
                    using (public.is_team_member()) with check (public.is_team_member())', t);
  end loop;
end;
$$;

-- --------------------------------------------------------------------------
-- Update 2 (Objektart, Pacht, Winterwasser, Altbestand, Zähler im Haus, Betriebszähler)
-- --------------------------------------------------------------------------
alter table public.parcels add column if not exists object_type  text    not null default 'pacht';
alter table public.parcels add column if not exists rent         numeric;
alter table public.parcels add column if not exists winter_water boolean not null default false;

alter table public.parcels drop constraint if exists parcels_status_check;
alter table public.parcels add constraint parcels_status_check
  check (status in ('fest', 'wochenende', 'altbestand', 'leer'));
alter table public.parcels drop constraint if exists parcels_object_type_check;
alter table public.parcels add constraint parcels_object_type_check
  check (object_type in ('pacht', 'miet'));

alter table public.meters alter column parcel_id drop not null;
alter table public.meters add column if not exists in_house boolean not null default false;
alter table public.meters add column if not exists purpose  text    not null default '';
alter table public.meters add column if not exists label    text    not null default '';

-- Supabase-Schnittstelle über die neuen Spalten informieren
notify pgrst, 'reload schema';

-- --------------------------------------------------------------------------
-- Update 3 (Reserviert, Hunde, Mietbeginn, frei ab, Warnschwelle Stromkasten)
-- --------------------------------------------------------------------------
alter table public.parcels add column if not exists dogs        integer not null default 0;
alter table public.parcels add column if not exists lease_start date;
alter table public.parcels add column if not exists free_from   date;

alter table public.parcels drop constraint if exists parcels_status_check;
alter table public.parcels add constraint parcels_status_check
  check (status in ('fest', 'wochenende', 'reserviert', 'altbestand', 'leer'));

alter table public.boxes add column if not exists limit_kwh numeric;

-- Supabase-Schnittstelle über die neuen Spalten informieren
notify pgrst, 'reload schema';

-- --------------------------------------------------------------------------
-- Update 4 (Bewohneranzahl)
-- --------------------------------------------------------------------------
alter table public.parcels add column if not exists residents integer not null default 0;

-- Supabase-Schnittstelle über die neuen Spalten informieren
notify pgrst, 'reload schema';

-- --------------------------------------------------------------------------
-- Update 5 (To-Dos mit Fotos, Orte auf der Karte)
-- --------------------------------------------------------------------------
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

-- --------------------------------------------------------------------------
-- WICHTIG: eigene E-Mail-Adresse(n) freischalten (Zeile anpassen & ausführen)
-- --------------------------------------------------------------------------
-- insert into public.team (email, name) values ('vorname@beispiel.de', 'Vorname Nachname')
--   on conflict (email) do nothing;
