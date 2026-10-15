-- ==========================================================================
-- Update 6: Sicherungen je Stromzähler, Wachhalter-Funktion ping()
--
-- Einmalig im Supabase "SQL Editor" ausführen. Kann gefahrlos mehrfach laufen.
-- (Ist auch am Ende von schema.sql enthalten.)
-- ==========================================================================

-- Sicherungen als Liste [{ "nr": "F3", "label": "16 A Haus" }, …]
alter table public.meters add column if not exists fuses jsonb not null default '[]'::jsonb;
-- Kasten der Sicherung, wenn der Zähler im Haus hängt (sonst = Kasten des Zählers)
alter table public.meters add column if not exists fuse_box_id text references public.boxes (id) on delete set null;

-- Wachhalter: harmlose Funktion für die automatische Anfrage (GitHub Actions),
-- damit Supabase das kostenlose Projekt nicht wegen Inaktivität pausiert. Liest keine Daten.
create or replace function public.ping()
returns text
language sql
stable
as $$ select 'ok'::text $$;
grant execute on function public.ping() to anon, authenticated;

-- Supabase-Schnittstelle über die neuen Spalten informieren
notify pgrst, 'reload schema';
