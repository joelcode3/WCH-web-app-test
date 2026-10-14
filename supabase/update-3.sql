-- ==========================================================================
-- Update 3: Status "Reserviert", Hunde, Mietbeginn, "frei ab", Warnschwelle je Stromkasten
--
-- Einmalig im Supabase "SQL Editor" ausführen. Kann gefahrlos mehrfach laufen.
-- (Ist auch am Ende von schema.sql enthalten.)
-- ==========================================================================

alter table public.parcels add column if not exists dogs        integer not null default 0;
alter table public.parcels add column if not exists lease_start date;
alter table public.parcels add column if not exists free_from   date;

alter table public.parcels drop constraint if exists parcels_status_check;
alter table public.parcels add constraint parcels_status_check
  check (status in ('fest', 'wochenende', 'reserviert', 'altbestand', 'leer'));

alter table public.boxes add column if not exists limit_kwh numeric;

-- Supabase-Schnittstelle über die neuen Spalten informieren
notify pgrst, 'reload schema';
