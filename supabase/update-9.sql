-- ==========================================================================
-- Update 9: Stromausfall- und Frostwarnung für die Unterkünfte (Hue Bridge, SMS)
--
-- Einmalig im Supabase "SQL Editor" ausführen. Kann gefahrlos mehrfach laufen.
-- (Ist auch am Ende von schema.sql enthalten.)
--
-- Die Supabase-Funktion "hue-waechter" prüft alle 5 Minuten, ob die Hue Bridge einer
-- Unterkunft erreichbar ist (= Strom im Bus) und wie warm es an den Hue-Bewegungsmeldern ist.
-- Bei Ausfall bzw. Frostgefahr schickt sie eine SMS. Den 5-Minuten-Takt richtet
-- supabase/waechter-zeitplan.sql ein (erst nach dem Einrichten der Funktion ausführen).
-- ==========================================================================

-- Hue-Zugänge je Unterkunft – geheim: kein Zugriff aus der App, nur die Funktion liest/schreibt
create table if not exists public.hue_bridges (
  place_id      text primary key,
  bridge_id     text not null default '',
  access_token  text not null default '',
  refresh_token text not null default '',
  token_expires timestamptz,
  app_key       text not null default '',
  connected_at  timestamptz not null default now()
);
alter table public.hue_bridges enable row level security;
revoke all on public.hue_bridges from anon, authenticated;

-- laufende Hue-Anmeldungen (kurzlebig)
create table if not exists public.hue_oauth (
  state      text primary key,
  place_id   text not null,
  return_url text not null default '',
  created_at timestamptz not null default now()
);
alter table public.hue_oauth enable row level security;
revoke all on public.hue_oauth from anon, authenticated;

-- Zustand je Unterkunft – die App darf ihn lesen (nur Team), schreiben nur die Funktion
create table if not exists public.waechter_status (
  place_id      text primary key,
  connected     boolean not null default false,
  online        boolean,                         -- Bridge erreichbar?
  since         timestamptz,                     -- seit wann der aktuelle Zustand gilt
  last_check    timestamptz,
  last_ok       timestamptz,                     -- zuletzt erreichbar
  sensors       jsonb not null default '[]'::jsonb,   -- [{ name, temp, battery, updated }]
  min_temp      numeric,
  frost_since   timestamptz,
  alarm_offline boolean not null default false,  -- SMS "nicht erreichbar" verschickt
  alarm_frost   boolean not null default false,  -- SMS "Frostgefahr" verschickt
  alarm_battery boolean not null default false,  -- SMS "Batterie schwach" verschickt
  error         text not null default '',
  sms_error     text not null default ''
);
alter table public.waechter_status enable row level security;
revoke all on public.waechter_status from anon;
drop policy if exists team_read on public.waechter_status;
create policy team_read on public.waechter_status for select to authenticated
  using (public.is_team_member());
