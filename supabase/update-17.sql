-- ==========================================================================
-- Update 17: Füllstand der Gastanks (Einträge mit Datum und Prozent)
--
-- Einmalig im Supabase "SQL Editor" komplett ausführen. Kann gefahrlos mehrfach laufen.
-- (Ist auch am Ende von schema.sql enthalten.)
-- ==========================================================================

alter table public.tanks add column if not exists fuellstand jsonb;

notify pgrst, 'reload schema';
