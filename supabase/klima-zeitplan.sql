-- ==========================================================================
-- Zeitplan für die Klimaanlagen: jede volle Stunde Zustand lesen und Automatik prüfen
--
-- Erst ausführen, wenn die Funktion "klima" eingerichtet ist und die Secrets
-- TUYA_CLIENT_ID / TUYA_CLIENT_SECRET eingetragen sind (siehe SETUP.md).
-- Einmalig im Supabase "SQL Editor" ausführen. Kann gefahrlos mehrfach laufen.
-- Ausschalten:  select cron.unschedule('klima');
-- ==========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('klima') where exists (select 1 from cron.job where jobname = 'klima');

select cron.schedule('klima', '1 * * * *', $$
  select net.http_post(
    url := 'https://erobbkjhfauwvzfegeiw.supabase.co/functions/v1/klima',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"action": "check"}'::jsonb,
    timeout_milliseconds := 25000
  );
$$);
