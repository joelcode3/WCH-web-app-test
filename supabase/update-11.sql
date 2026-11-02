-- ==========================================================================
-- Update 11: Kalender „Reservierungen / VA“ (z. B. Vantreffen) mit Anzahl und To-Dos,
--            To-Do-Termine erscheinen im gewählten Kalender
--
-- Einmalig im Supabase "SQL Editor" komplett ausführen. Kann gefahrlos mehrfach laufen.
-- (Ist auch am Ende von schema.sql enthalten.)
-- ==========================================================================

-- neue Art "reservierung" im Kalender
alter table public.termine drop constraint if exists termine_art_check;
alter table public.termine add constraint termine_art_check
  check (art in ('termin', 'arbeit', 'abwesenheit', 'reservierung'));

-- erwartete Anzahl (Fahrzeuge / Personen)
alter table public.termine add column if not exists anzahl integer;

-- To-Do mit Termin: in welchem Kalender er erscheint (termin, arbeit, reservierung, abwesenheit)
alter table public.todos add column if not exists kalender text not null default '';

-- To-Dos können jetzt auch an einer Reservierung / VA hängen
alter table public.todos drop constraint if exists todos_target_type_check;
alter table public.todos add constraint todos_target_type_check
  check (target_type in ('', 'parcel', 'box', 'tank', 'place', 'termin'));

-- Supabase-Schnittstelle über die Änderungen informieren
notify pgrst, 'reload schema';
