-- ==========================================================================
-- Update 7: Ferienunterkünfte (Airbnb) – Kalender-Link und Foto je Ort
--
-- Einmalig im Supabase "SQL Editor" ausführen. Kann gefahrlos mehrfach laufen.
-- (Ist auch am Ende von schema.sql enthalten.)
-- Danach die Edge Function "airbnb-kalender" einrichten (siehe SETUP.md).
-- ==========================================================================

alter table public.places add column if not exists ical_url text not null default '';
alter table public.places add column if not exists photo    jsonb;

-- Supabase-Schnittstelle über die neuen Spalten informieren
notify pgrst, 'reload schema';
