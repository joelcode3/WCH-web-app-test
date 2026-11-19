-- ==========================================================================
-- Update 16: Wasserschächte (Absperrhähne mit Bereichen, Foto-Markierungen,
-- optionaler Wasserzähler, Sommerwasser) als Zusatzfeld an den Orten
--
-- Einmalig im Supabase "SQL Editor" komplett ausführen. Kann gefahrlos mehrfach laufen.
-- (Ist auch am Ende von schema.sql enthalten.)
-- ==========================================================================

alter table public.places add column if not exists wasser jsonb;

notify pgrst, 'reload schema';
