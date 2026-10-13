-- ==========================================================================
-- Update 2: Objektart, Pacht/Miete, Winterwasser, Status "Frei (mit Altbestand)",
--           Stromzähler im Haus, Betriebszähler (ohne Parzelle)
--
-- Einmalig im Supabase "SQL Editor" ausführen. Kann gefahrlos mehrfach laufen.
-- (Ist auch am Ende von schema.sql enthalten.)
-- ==========================================================================

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
