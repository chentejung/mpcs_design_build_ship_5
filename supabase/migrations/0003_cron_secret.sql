-- 0003_cron_secret: how the worker knows a call really comes from our Cron.
--
-- The secret itself is never in a migration or in git. It is generated inside
-- Postgres, straight into Vault, by a one-off call (not a migration):
--   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
--                              'cron_secret', 'x-cron-secret for sync-markets');
-- Cron (0004) reads it from Vault and sends it as the x-cron-secret header; the
-- worker asks Postgres whether the header matches. So nobody (owner, agent or
-- Vercel) ever handles the value.

-- pg_net: Postgres makes HTTP calls (Cron → worker, and the first manual Run).
create extension if not exists pg_net;

create function public.check_cron_secret(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'cron_secret'
      and decrypted_secret = candidate
  );
$$;

revoke execute on function public.check_cron_secret(text) from public, anon, authenticated;
grant execute on function public.check_cron_secret(text) to service_role;
