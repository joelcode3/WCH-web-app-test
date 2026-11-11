-- ==========================================================================
-- Update 14: Klimaanlagen (Heizung) in den airbnb-Unterkünften über die Tuya-Cloud
--
-- Einmalig im Supabase "SQL Editor" komplett ausführen. Kann gefahrlos mehrfach laufen.
-- (Ist auch am Ende von schema.sql enthalten.)
--
-- Je Unterkunft eine Zeile: Tuya-Geräte-ID, Automatik (Spar-/Wohlfühltemperatur) und der zuletzt
-- gelesene Zustand. Die Supabase-Funktion "klima" liest stündlich und schaltet nach der Belegung;
-- den Stundentakt richtet supabase/klima-zeitplan.sql ein.
-- ==========================================================================

create table if not exists public.klima (
  place_id     text primary key,
  device_id    text not null default '',          -- Tuya-Geräte-ID (platform.tuya.com → Devices)
  auto         boolean not null default true,     -- Automatik nach airbnb-Belegung
  temp_spar    numeric not null default 16,       -- nach der Abreise (ab 11 Uhr)
  temp_komfort numeric not null default 23,       -- am Anreisetag (ab 13 Uhr)
  online       boolean,
  an           boolean,
  modus        text not null default '',          -- hot = Heizen, cold, wet, wind, auto
  soll         numeric,                           -- Soll-Temperatur in °C
  ist          numeric,                           -- gemessen oben am Innengerät
  geprueft     timestamptz,
  auto_letzte  text not null default '',          -- zuletzt ausgeführt, z. B. 2026-11-16:spar
  auto_info    text not null default '',
  fehler       text not null default ''
);
alter table public.klima enable row level security;
revoke all on public.klima from anon;
drop policy if exists team_all on public.klima;
create policy team_all on public.klima for all to authenticated
  using (public.is_team_member()) with check (public.is_team_member());

-- die beiden Klimaanlagen der Londonbusse (Bus 1 = Wald, Bus 2 = Teich)
insert into public.klima (place_id, device_id)
  select id, '1632020148e72974109f' from public.places where name = 'Londonbus 1'
  on conflict (place_id) do nothing;
insert into public.klima (place_id, device_id)
  select id, '5835847824d7ebc9885b' from public.places where name = 'Londonbus 2'
  on conflict (place_id) do nothing;

notify pgrst, 'reload schema';
