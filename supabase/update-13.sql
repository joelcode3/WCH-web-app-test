-- ==========================================================================
-- Update 13: Mietangaben je Parzelle (Zusammensetzung der Miete, Zahlungsrhythmus,
-- Kaution, Häkchen „Strom/Gas-Abrechnung bezahlt“ je Jahr)
--
-- Einmalig im Supabase "SQL Editor" komplett ausführen. Kann gefahrlos mehrfach laufen.
-- (Ist auch am Ende von schema.sql enthalten.)
-- ==========================================================================

alter table public.parcels add column if not exists miete jsonb;

notify pgrst, 'reload schema';
