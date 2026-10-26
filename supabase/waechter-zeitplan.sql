-- ==========================================================================
-- Zeitplan für die Stromausfall- und Frostwarnung: alle 5 Minuten prüfen
--
-- Erst ausführen, wenn die Funktion "hue-waechter" eingerichtet ist (siehe SETUP.md).
-- Einmalig im Supabase "SQL Editor" ausführen. Kann gefahrlos mehrfach laufen.
-- Ausschalten:  select cron.unschedule('stromwaechter');
-- ==========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('stromwaechter') where exists (select 1 from cron.job where jobname = 'stromwaechter');

select cron.schedule('stromwaechter', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://erobbkjhfauwvzfegeiw.supabase.co/functions/v1/hue-waechter',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"action": "check"}'::jsonb,
    timeout_milliseconds := 25000
  );
$$);
