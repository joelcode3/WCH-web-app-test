-- ==========================================================================
-- Zeitplan für Microsoft To Do: alle 15 Minuten Camping-Aufgaben abgleichen
--
-- Erst ausführen, wenn die Funktion "ms-todo" eingerichtet ist (siehe SETUP.md).
-- Einmalig im Supabase "SQL Editor" ausführen. Kann gefahrlos mehrfach laufen.
-- Ausschalten:  select cron.unschedule('ms-todo');
-- ==========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('ms-todo') where exists (select 1 from cron.job where jobname = 'ms-todo');

select cron.schedule('ms-todo', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://erobbkjhfauwvzfegeiw.supabase.co/functions/v1/ms-todo',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"action": "check"}'::jsonb,
    timeout_milliseconds := 25000
  );
$$);
