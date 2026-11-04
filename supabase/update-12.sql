-- ==========================================================================
-- Update 12: Kalender-Kategorie „Extern“ (Termine auf dem Platz ohne das Team)
--
-- Einmalig im Supabase "SQL Editor" komplett ausführen. Kann gefahrlos mehrfach laufen.
-- (Ist auch am Ende von schema.sql enthalten.)
-- ==========================================================================

alter table public.termine drop constraint if exists termine_art_check;
alter table public.termine add constraint termine_art_check
  check (art in ('termin', 'arbeit', 'abwesenheit', 'reservierung', 'extern'));

notify pgrst, 'reload schema';
