-- 0004_cron: run the worker every 10 seconds, and prune old rows every hour.
-- The function URL and the x-cron-secret are read from Vault at call time
-- (sync_markets_url, cron_secret; see 0003), so neither is in this file.

-- 0003 installed pg_net into public (advisor: extension_in_public). Reinstall it
-- into the extensions schema; its functions stay in net, so callers don't change.
-- This also clears net._http_response, which only held the two manual Runs.
drop extension if exists pg_net;
create extension pg_net with schema extensions;

create extension if not exists pg_cron with schema pg_catalog;

-- Every 10 s: one Run. ~260k calls a month of the 500k free (AGENTS.md → Free-tier limits).
select cron.schedule(
  'sync-markets',
  '10 seconds',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sync_markets_url'),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Every hour: price_history older than 7 days, worker_runs older than 2 days,
-- and pg_cron's own run log older than 1 day (360 entries an hour otherwise pile up).
select cron.schedule(
  'prune-history',
  '7 * * * *',
  $$
  delete from public.price_history where recorded_at < now() - interval '7 days';
  delete from public.worker_runs where started_at < now() - interval '2 days';
  delete from cron.job_run_details where end_time < now() - interval '1 day';
  $$
);
