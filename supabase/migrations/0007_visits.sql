-- 0007_visits: when each user last opened their Watchlist, for the "Since your last visit" Recap
-- (docs/redesign-plan.md, issue #11). The Watchlist reads the previous last_seen_at on the server, then records
-- the current visit through a Server Action (an upsert on user_id that never sets user_id itself).

-- ── visits ──────────────────────────────────────────────────────────────────
-- One row per user. user_id comes from the Clerk JWT; app code never sets it.
create table public.visits (
  user_id      text primary key default (auth.jwt() ->> 'sub'),
  last_seen_at timestamptz not null default now()
);

-- ── Row-level security: each user reads and writes only their own row ──────
alter table public.visits enable row level security;

create policy "Users read their own visit"
  on public.visits for select to authenticated
  using (user_id = (select auth.jwt() ->> 'sub'));

create policy "Users record their own visit"
  on public.visits for insert to authenticated
  with check (user_id = (select auth.jwt() ->> 'sub'));

-- The upsert's "on conflict do update" needs this; with check stops a row being moved to another user.
create policy "Users update their own visit"
  on public.visits for update to authenticated
  using (user_id = (select auth.jwt() ->> 'sub'))
  with check (user_id = (select auth.jwt() ->> 'sub'));

-- No delete policy: nobody deletes a visit.

-- ── Grants match the policies exactly ───────────────────────────────────────
revoke all on public.visits from anon, authenticated;
grant select, insert, update on public.visits to authenticated;

-- Not added to supabase_realtime: the Recap is computed once per page load.
