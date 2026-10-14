-- ==========================================================================
-- Update 4: Bewohneranzahl je Parzelle
--
-- Einmalig im Supabase "SQL Editor" ausführen. Kann gefahrlos mehrfach laufen.
-- (Ist auch am Ende von schema.sql enthalten.)
-- ==========================================================================

alter table public.parcels add column if not exists residents integer not null default 0;

-- Supabase-Schnittstelle über die neuen Spalten informieren
notify pgrst, 'reload schema';
