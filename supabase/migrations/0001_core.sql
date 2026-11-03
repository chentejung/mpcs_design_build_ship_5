-- 0001_core: the tables, row-level security, grants and Realtime for Odds Desk.
-- Terms (Market, Follow, Run, Price…) are defined in CONTEXT.md.

-- ── markets ─────────────────────────────────────────────────────────────────
-- One row per Market. Written only by the worker (secret key, bypasses RLS).
create table public.markets (
  id               text primary key,                 -- gamma Market id
  question         text not null,
  slug             text not null,
  image            text,
  category         text not null check (category in ('politics', 'sports', 'crypto')),
  event_id         text,
  event_title      text,
  group_item_title text,
  outcomes         text[] not null check (cardinality(outcomes) = 2),
  token_id         text not null,                    -- CLOB token of the first Outcome
  price            numeric(6, 4) check (price between 0 and 1),  -- first Outcome's Price
  price_changed_at timestamptz,                      -- "Moved"
  volume_24h       numeric,
  end_date         timestamptz,
  closed           boolean not null default false,   -- Finished
  closed_at        timestamptz,
  in_catalog       boolean not null default true,
  catalog_seen_at  timestamptz not null default now()
);

-- Browse: one Category, live Catalog Markets, by 24-hour volume.
create index markets_browse_idx on public.markets (category, volume_24h desc)
  where in_catalog and not closed;

-- ── price_history ───────────────────────────────────────────────────────────
-- One row per actual Price change. Pruned after 7 days (0003).
create table public.price_history (
  id          bigint generated always as identity primary key,
  market_id   text not null references public.markets (id) on delete cascade,
  price       numeric(6, 4) not null check (price between 0 and 1),
  recorded_at timestamptz not null default now()
);

create index price_history_market_time_idx on public.price_history (market_id, recorded_at desc);
create index price_history_recorded_at_idx on public.price_history (recorded_at);

-- ── follows ─────────────────────────────────────────────────────────────────
-- A user's Follows. user_id comes from the Clerk JWT; app code never sets it.
create table public.follows (
  user_id    text not null default (auth.jwt() ->> 'sub'),
  market_id  text not null references public.markets (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, market_id)
);

create index follows_market_id_idx on public.follows (market_id);

-- At most 25 Follows per user, Finished included.
create function public.enforce_follow_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialize one user's concurrent inserts so two can't both pass the count.
  perform pg_advisory_xact_lock(hashtext('follows:' || new.user_id));
  if (select count(*) from public.follows where user_id = new.user_id) >= 25 then
    raise exception 'Watchlist full (25)' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_follow_limit() from public, anon, authenticated;

create trigger follows_limit
  before insert on public.follows
  for each row execute function public.enforce_follow_limit();

-- ── worker_runs ─────────────────────────────────────────────────────────────
-- One row per Run, inserted when the Run ends. Pruned after 2 days (0003).
create table public.worker_runs (
  id                bigint generated always as identity primary key,
  started_at        timestamptz not null,
  finished_at       timestamptz not null default now(),
  ok                boolean not null,
  skipped           boolean not null default false,
  rows_changed      integer not null default 0,
  catalog_refreshed boolean not null default false,
  warnings          text[] not null default '{}',
  error             text,
  duration_ms       integer
);

create index worker_runs_started_at_idx on public.worker_runs (started_at desc);

-- ── run_lock ────────────────────────────────────────────────────────────────
-- A single-row lease so overlapping Runs skip. (A session advisory lock can't
-- be used: the worker reaches Postgres through a connection pool.) Used only by
-- try_run_lock / release_run_lock in 0002.
create table public.run_lock (
  id           boolean primary key default true check (id),  -- only one row
  holder       uuid,
  locked_until timestamptz not null default '-infinity'
);

insert into public.run_lock default values;

-- ── Row-level security: on for every table ──────────────────────────────────
alter table public.markets       enable row level security;
alter table public.price_history enable row level security;
alter table public.follows       enable row level security;
alter table public.worker_runs   enable row level security;
alter table public.run_lock      enable row level security;

create policy "Anyone can read markets"
  on public.markets for select to anon, authenticated using (true);

create policy "Anyone can read worker runs"
  on public.worker_runs for select to anon, authenticated using (true);

create policy "Signed-in users can read price history"
  on public.price_history for select to authenticated using (true);

create policy "Users read their own follows"
  on public.follows for select to authenticated
  using (user_id = (select auth.jwt() ->> 'sub'));

create policy "Users add their own follows"
  on public.follows for insert to authenticated
  with check (user_id = (select auth.jwt() ->> 'sub'));

create policy "Users remove their own follows"
  on public.follows for delete to authenticated
  using (user_id = (select auth.jwt() ->> 'sub'));

-- run_lock: no policies. Only the worker's functions touch it.

-- ── Grants match the policies exactly ───────────────────────────────────────
-- Supabase grants everything on new tables to anon/authenticated by default;
-- take that back and grant only what each policy allows.
revoke all on public.markets, public.price_history, public.follows,
              public.worker_runs, public.run_lock
  from anon, authenticated;

grant select on public.markets, public.worker_runs to anon, authenticated;
grant select on public.price_history to authenticated;
grant select, insert, delete on public.follows to authenticated;

-- ── Realtime: only markets and worker_runs ──────────────────────────────────
alter publication supabase_realtime add table public.markets, public.worker_runs;
