-- ==========================================================================
-- Update 8: Projektliste für das Spiel "hüfte hinten links" (Schweißkurs mit Dennis)
--
-- Einmalig im Supabase "SQL Editor" ausführen. Kann gefahrlos mehrfach laufen.
-- (Ist auch am Ende von schema.sql enthalten.)
--
-- Eigene Tabelle, völlig getrennt von den Campingplatz-Daten. Die Liste
-- (joelcode3.github.io/schweisskurs-simulator/liste/) braucht kein Login,
-- sondern einen gemeinsamen Code. Direkter Zugriff auf die Tabelle ist gesperrt,
-- alles läuft über die Funktionen unten, und die prüfen den Code.
-- Code ändern: Table Editor → asmus_einstellungen → Zeile "code" → Wert ändern.
-- ==========================================================================

create table if not exists public.asmus_eintraege (
  id          text primary key default gen_random_uuid()::text,
  art         text not null check (art in ('todo', 'idee', 'utopie', 'bug')),
  titel       text not null check (char_length(titel) between 1 and 500),
  status      text not null default 'offen' check (status in ('offen', 'erledigt')),
  reihe       integer not null default 0,
  erledigt_am date,
  warnung     text,
  erstellt    timestamptz not null default now(),
  geaendert   timestamptz not null default now()
);

create table if not exists public.asmus_einstellungen (
  schluessel text primary key,
  wert       text not null
);
insert into public.asmus_einstellungen (schluessel, wert) values ('code', '1312')
  on conflict (schluessel) do nothing;

-- Zugriff nur über die Funktionen (keine Policies = direkter Zugriff gesperrt)
alter table public.asmus_eintraege     enable row level security;
alter table public.asmus_einstellungen enable row level security;

create or replace function public.asmus_code_ok(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.asmus_einstellungen where schluessel = 'code' and wert = p_code);
$$;

create or replace function public.asmus_liste(p_code text)
returns setof public.asmus_eintraege language plpgsql stable security definer set search_path = public as $$
begin
  if not public.asmus_code_ok(p_code) then raise exception 'falscher Code' using errcode = '28000'; end if;
  return query select * from public.asmus_eintraege order by reihe, erstellt;
end $$;

create or replace function public.asmus_neu(p_code text, p_art text, p_titel text)
returns public.asmus_eintraege language plpgsql security definer set search_path = public as $$
declare r public.asmus_eintraege;
begin
  if not public.asmus_code_ok(p_code) then raise exception 'falscher Code' using errcode = '28000'; end if;
  insert into public.asmus_eintraege (art, titel, reihe)
  values (p_art, trim(p_titel), coalesce((select max(reihe) from public.asmus_eintraege where art = p_art), 0) + 1)
  returning * into r;
  return r;
end $$;

-- p_daten: nur die Felder, die sich ändern (titel, status, erledigt_am, warnung, reihe)
create or replace function public.asmus_aendern(p_code text, p_id text, p_daten jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.asmus_code_ok(p_code) then raise exception 'falscher Code' using errcode = '28000'; end if;
  update public.asmus_eintraege set
    titel       = case when p_daten ? 'titel'       then trim(p_daten->>'titel')            else titel end,
    status      = case when p_daten ? 'status'      then p_daten->>'status'                 else status end,
    erledigt_am = case when p_daten ? 'erledigt_am' then (p_daten->>'erledigt_am')::date    else erledigt_am end,
    warnung     = case when p_daten ? 'warnung'     then nullif(p_daten->>'warnung', '')    else warnung end,
    reihe       = case when p_daten ? 'reihe'       then (p_daten->>'reihe')::integer       else reihe end,
    geaendert   = now()
  where id = p_id;
end $$;

create or replace function public.asmus_loeschen(p_code text, p_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.asmus_code_ok(p_code) then raise exception 'falscher Code' using errcode = '28000'; end if;
  delete from public.asmus_eintraege where id = p_id;
end $$;

revoke all on function public.asmus_code_ok(text) from public, anon, authenticated;
grant execute on function public.asmus_liste(text)                to anon, authenticated;
grant execute on function public.asmus_neu(text, text, text)      to anon, authenticated;
grant execute on function public.asmus_aendern(text, text, jsonb) to anon, authenticated;
grant execute on function public.asmus_loeschen(text, text)       to anon, authenticated;

-- Bisherige Einträge (Stand 19.10.2026) übernehmen – nur beim ersten Ausführen
insert into public.asmus_eintraege (id, art, titel, status, reihe, erstellt) values
  ('0sjw247ybna9t89f9t4l', 'idee', 'irgendwas, was dennis wieder beruhigt', 'offen', 12, '2026-10-19T21:24:57.748Z'),
  ('2nam5p7xjhruq6txxb9c', 'todo', 'Termin finden', 'offen', 12, '2026-10-19T20:55:02.331Z'),
  ('5ph3ei169g7y0rof9gkp', 'idee', 'fernseher mit möglichkeit videos zu schauen.', 'offen', 10, '2026-10-19T21:24:08.223Z'),
  ('819v943sq3fxza259l7g', 'idee', 'Dennis muss telefonieren', 'offen', 8, '2026-10-19T20:52:33.429Z'),
  ('98jvsle2grgya7roasi0', 'idee', 'fotos von seinen schrottmöhren, also seine autos der letzten jahre, ausser der benz', 'offen', 13, '2026-10-19T21:26:08.646Z'),
  ('b6sdoj2dq0rdrkywanyy', 'idee', 'irgendwas mit uwe?', 'offen', 7, '2026-10-19T20:52:23.884Z'),
  ('bm2d6l0gmrkv565s0s6d', 'utopie', 'multiplayer?', 'offen', 1, '2026-10-19T20:49:57.385Z'),
  ('egzu5uflyfdtkstpxim5', 'idee', 'Torben kommt, schleppt Stahlträger, Dennis hilft ihm nicht beim tragen, fällt auf torbens fuß, torben muss dringend verarztet werden.', 'offen', 6, '2026-10-19T20:52:10.305Z'),
  ('i01', 'idee', 'grillen draußen?', 'offen', 1, '2026-10-19'),
  ('i02', 'idee', 'Werkzeugwagen einsortieren, den jemand vorher umwirft, oder geliehen hat und kaputt zurückbringt', 'offen', 2, '2026-10-19'),
  ('i03', 'idee', 'MAG-Schweißen als zweites Verfahren', 'offen', 3, '2026-10-19'),
  ('i04', 'idee', 'Weitere Fehler, die Dennis auf die Palme bringen', 'offen', 4, '2026-10-19'),
  ('i05', 'idee', 'Hintergrundmusik (vorerst geparkt)', 'offen', 5, '2026-10-19'),
  ('isot8au65v3z1j6sewj7', 'todo', 'KI Stimme organisieren', 'offen', 11, '2026-10-19T20:50:37.078Z'),
  ('laa4d0m3snkacwt5i4gu', 'idee', 'gasflasche vorher von draussen holen, weidemann steht im weg, muss erstmal bei seite gefahren werden', 'offen', 9, '2026-10-19T21:20:52.940Z'),
  ('t02', 'todo', 'Foto von Dennis für das Plakat am Werkstatttor raussuchen', 'offen', 2, '2026-10-19'),
  ('t04', 'todo', 'Claude: Startbildschirm „Werkstatt von außen“ mit Plakat und Zahlenschloss (Code 1312) freischalten, sobald das Plakat-Foto da ist', 'offen', 3, '2026-10-19'),
  ('t07', 'todo', 'Im Projektchat Ja oder Nein sagen: Soll Claude die todo-Regel per Pull Request ins Spiel-Projekt schreiben?', 'offen', 9, '2026-10-19'),
  ('t09', 'todo', 'Claude: Spiel auf dem iPhone spielbar machen (Steuerung per Touch, Anzeige passend zum Bildschirm)', 'offen', 10, '2026-10-19'),
  ('t11', 'todo', 'Claude: Aus den 50 Sätzen die 10 wichtigsten zum Einsprechen auswählen und dir als Liste geben', 'offen', 5, '2026-10-19'),
  ('tfqzx16q96av7ft561lj', 'idee', 'kalender mit 12 fotos zum durchblättern an der wand', 'offen', 11, '2026-10-19T21:24:28.239Z'),
  ('tqv1nb1mhgmq2gos0he6', 'todo', 'fotos für charaktere suchen, johnny, torben, uwe? wir?', 'offen', 14, '2026-10-19T21:23:32.936Z'),
  ('w3nkmea5pejxn30y13r7', 'todo', 'Driveordner oder so für videos sammeln und alle fragen', 'offen', 13, '2026-10-19T20:55:34.143Z')
on conflict (id) do nothing;

notify pgrst, 'reload schema';
