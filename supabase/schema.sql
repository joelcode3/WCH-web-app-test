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
-- Update 6 (Sicherungen je Stromzähler, Wachhalter ping())
-- --------------------------------------------------------------------------
alter table public.meters add column if not exists fuses jsonb not null default '[]'::jsonb;
alter table public.meters add column if not exists fuse_box_id text references public.boxes (id) on delete set null;

-- Wachhalter: harmlose Funktion für die automatische Anfrage (GitHub Actions),
-- damit Supabase das kostenlose Projekt nicht wegen Inaktivität pausiert. Liest keine Daten.
create or replace function public.ping()
returns text
language sql
stable
as $$ select 'ok'::text $$;
grant execute on function public.ping() to anon, authenticated;

notify pgrst, 'reload schema';

-- --------------------------------------------------------------------------
-- Update 7 (Ferienunterkünfte: Kalender-Link und Foto)
-- --------------------------------------------------------------------------
alter table public.places add column if not exists ical_url text not null default '';
alter table public.places add column if not exists photo    jsonb;

notify pgrst, 'reload schema';

-- --------------------------------------------------------------------------
-- WICHTIG: eigene E-Mail-Adresse(n) freischalten (Zeile anpassen & ausführen)
-- --------------------------------------------------------------------------
-- insert into public.team (email, name) values ('vorname@beispiel.de', 'Vorname Nachname')
--   on conflict (email) do nothing;


-- ==========================================================================
-- Update 8: Projektliste für das Spiel "hüfte hinten links" (Schweißkurs mit Dennis)
--
-- Einmalig im Supabase "SQL Editor" ausführen. Kann gefahrlos mehrfach laufen.
-- (Ist auch am Ende von schema.sql enthalten.)
--
-- Eigene Tabelle, völlig getrennt von den Campingplatz-Daten. Die Liste
-- (joelcode3.github.io/schweisskurs-simulator/liste/) braucht kein Login,
-- sondern einen gemeinsamen Code. Direkter Zugriff auf die Tabelle ist gesperrt,
-- alles läuft über die Funktionen unten, und die prüfen den Code.
-- Code ändern: Table Editor → asmus_einstellungen → Zeile "code" → Wert ändern.
-- ==========================================================================

create table if not exists public.asmus_eintraege (
  id          text primary key default gen_random_uuid()::text,
  art         text not null check (art in ('todo', 'idee', 'utopie', 'bug')),
  titel       text not null check (char_length(titel) between 1 and 500),
  status      text not null default 'offen' check (status in ('offen', 'erledigt')),
  reihe       integer not null default 0,
  erledigt_am date,
  warnung     text,
  erstellt    timestamptz not null default now(),
  geaendert   timestamptz not null default now()
);

create table if not exists public.asmus_einstellungen (
  schluessel text primary key,
  wert       text not null
);
insert into public.asmus_einstellungen (schluessel, wert) values ('code', '1312')
  on conflict (schluessel) do nothing;

-- Zugriff nur über die Funktionen (keine Policies = direkter Zugriff gesperrt)
alter table public.asmus_eintraege     enable row level security;
alter table public.asmus_einstellungen enable row level security;

create or replace function public.asmus_code_ok(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.asmus_einstellungen where schluessel = 'code' and wert = p_code);
$$;

create or replace function public.asmus_liste(p_code text)
returns setof public.asmus_eintraege language plpgsql stable security definer set search_path = public as $$
begin
  if not public.asmus_code_ok(p_code) then raise exception 'falscher Code' using errcode = '28000'; end if;
  return query select * from public.asmus_eintraege order by reihe, erstellt;
end $$;

create or replace function public.asmus_neu(p_code text, p_art text, p_titel text)
returns public.asmus_eintraege language plpgsql security definer set search_path = public as $$
declare r public.asmus_eintraege;
begin
  if not public.asmus_code_ok(p_code) then raise exception 'falscher Code' using errcode = '28000'; end if;
  insert into public.asmus_eintraege (art, titel, reihe)
  values (p_art, trim(p_titel), coalesce((select max(reihe) from public.asmus_eintraege where art = p_art), 0) + 1)
  returning * into r;
  return r;
end $$;

-- p_daten: nur die Felder, die sich ändern (titel, status, erledigt_am, warnung, reihe)
create or replace function public.asmus_aendern(p_code text, p_id text, p_daten jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.asmus_code_ok(p_code) then raise exception 'falscher Code' using errcode = '28000'; end if;
  update public.asmus_eintraege set
    titel       = case when p_daten ? 'titel'       then trim(p_daten->>'titel')            else titel end,
    status      = case when p_daten ? 'status'      then p_daten->>'status'                 else status end,
    erledigt_am = case when p_daten ? 'erledigt_am' then (p_daten->>'erledigt_am')::date    else erledigt_am end,
    warnung     = case when p_daten ? 'warnung'     then nullif(p_daten->>'warnung', '')    else warnung end,
    reihe       = case when p_daten ? 'reihe'       then (p_daten->>'reihe')::integer       else reihe end,
    geaendert   = now()
  where id = p_id;
end $$;

create or replace function public.asmus_loeschen(p_code text, p_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.asmus_code_ok(p_code) then raise exception 'falscher Code' using errcode = '28000'; end if;
  delete from public.asmus_eintraege where id = p_id;
end $$;

revoke all on function public.asmus_code_ok(text) from public, anon, authenticated;
grant execute on function public.asmus_liste(text)                to anon, authenticated;
grant execute on function public.asmus_neu(text, text, text)      to anon, authenticated;
grant execute on function public.asmus_aendern(text, text, jsonb) to anon, authenticated;
grant execute on function public.asmus_loeschen(text, text)       to anon, authenticated;

-- Bisherige Einträge (Stand 19.10.2026) übernehmen – nur beim ersten Ausführen
insert into public.asmus_eintraege (id, art, titel, status, reihe, erstellt) values
  ('0sjw247ybna9t89f9t4l', 'idee', 'irgendwas, was dennis wieder beruhigt', 'offen', 12, '2026-10-19T21:24:57.748Z'),
  ('2nam5p7xjhruq6txxb9c', 'todo', 'Termin finden', 'offen', 12, '2026-10-19T20:55:02.331Z'),
  ('5ph3ei169g7y0rof9gkp', 'idee', 'fernseher mit möglichkeit videos zu schauen.', 'offen', 10, '2026-10-19T21:24:08.223Z'),
  ('819v943sq3fxza259l7g', 'idee', 'Dennis muss telefonieren', 'offen', 8, '2026-10-19T20:52:33.429Z'),
  ('98jvsle2grgya7roasi0', 'idee', 'fotos von seinen schrottmöhren, also seine autos der letzten jahre, ausser der benz', 'offen', 13, '2026-10-19T21:26:08.646Z'),
  ('b6sdoj2dq0rdrkywanyy', 'idee', 'irgendwas mit uwe?', 'offen', 7, '2026-10-19T20:52:23.884Z'),
  ('bm2d6l0gmrkv565s0s6d', 'utopie', 'multiplayer?', 'offen', 1, '2026-10-19T20:49:57.385Z'),
  ('egzu5uflyfdtkstpxim5', 'idee', 'Torben kommt, schleppt Stahlträger, Dennis hilft ihm nicht beim tragen, fällt auf torbens fuß, torben muss dringend verarztet werden.', 'offen', 6, '2026-10-19T20:52:10.305Z'),
  ('i01', 'idee', 'grillen draußen?', 'offen', 1, '2026-10-19'),
  ('i02', 'idee', 'Werkzeugwagen einsortieren, den jemand vorher umwirft, oder geliehen hat und kaputt zurückbringt', 'offen', 2, '2026-10-19'),
  ('i03', 'idee', 'MAG-Schweißen als zweites Verfahren', 'offen', 3, '2026-10-19'),
  ('i04', 'idee', 'Weitere Fehler, die Dennis auf die Palme bringen', 'offen', 4, '2026-10-19'),
  ('i05', 'idee', 'Hintergrundmusik (vorerst geparkt)', 'offen', 5, '2026-10-19'),
  ('isot8au65v3z1j6sewj7', 'todo', 'KI Stimme organisieren', 'offen', 11, '2026-10-19T20:50:37.078Z'),
  ('laa4d0m3snkacwt5i4gu', 'idee', 'gasflasche vorher von draussen holen, weidemann steht im weg, muss erstmal bei seite gefahren werden', 'offen', 9, '2026-10-19T21:20:52.940Z'),
  ('t02', 'todo', 'Foto von Dennis für das Plakat am Werkstatttor raussuchen', 'offen', 2, '2026-10-19'),
  ('t04', 'todo', 'Claude: Startbildschirm „Werkstatt von außen“ mit Plakat und Zahlenschloss (Code 1312) freischalten, sobald das Plakat-Foto da ist', 'offen', 3, '2026-10-19'),
  ('t07', 'todo', 'Im Projektchat Ja oder Nein sagen: Soll Claude die todo-Regel per Pull Request ins Spiel-Projekt schreiben?', 'offen', 9, '2026-10-19'),
  ('t09', 'todo', 'Claude: Spiel auf dem iPhone spielbar machen (Steuerung per Touch, Anzeige passend zum Bildschirm)', 'offen', 10, '2026-10-19'),
  ('t11', 'todo', 'Claude: Aus den 50 Sätzen die 10 wichtigsten zum Einsprechen auswählen und dir als Liste geben', 'offen', 5, '2026-10-19'),
  ('tfqzx16q96av7ft561lj', 'idee', 'kalender mit 12 fotos zum durchblättern an der wand', 'offen', 11, '2026-10-19T21:24:28.239Z'),
  ('tqv1nb1mhgmq2gos0he6', 'todo', 'fotos für charaktere suchen, johnny, torben, uwe? wir?', 'offen', 14, '2026-10-19T21:23:32.936Z'),
  ('w3nkmea5pejxn30y13r7', 'todo', 'Driveordner oder so für videos sammeln und alle fragen', 'offen', 13, '2026-10-19T20:55:34.143Z')
on conflict (id) do nothing;

notify pgrst, 'reload schema';
