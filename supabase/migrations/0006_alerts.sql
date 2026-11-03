-- 0006_alerts: in-app price Alerts (issue #9, docs/redesign-plan.md step 8). An Alert is one user's
-- "tell me when <first Outcome> is above/below X%" on a Market they Follow. The worker marks it triggered
-- the moment a changed Price crosses it; nothing is emailed or pushed, and nothing new goes to Realtime.

-- ── alerts ──────────────────────────────────────────────────────────────────
-- user_id comes from the Clerk JWT; app code never sets it. threshold is a Price (0–1, exclusive), compared
-- with the first Outcome's Price. triggered_at / triggered_price are set once, by apply_prices, and never again.
create table public.alerts (
  id              bigint generated always as identity primary key,
  user_id         text not null default (auth.jwt() ->> 'sub'),
  market_id       text not null,
  direction       text not null check (direction in ('above', 'below')),
  threshold       numeric(6, 4) not null check (threshold > 0 and threshold < 1),
  created_at      timestamptz not null default now(),
  triggered_at    timestamptz,
  triggered_price numeric(6, 4) check (triggered_price between 0 and 1),
  -- Alerts exist only on a Followed Market: Unfollow (or Clear finished) deletes them.
  foreign key (user_id, market_id) references public.follows (user_id, market_id) on delete cascade
);

-- Covers the foreign key (the cascade on Unfollow) and the per-Market limit count.
create index alerts_user_market_idx on public.alerts (user_id, market_id);
-- apply_prices looks up only the untriggered Alerts of the Markets whose Price changed.
create index alerts_untriggered_market_idx on public.alerts (market_id) where triggered_at is null;

-- At most 3 Alerts per Market and 50 per user, triggered ones included until deleted.
create function public.enforce_alert_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialize one user's concurrent inserts so two can't both pass the count.
  perform pg_advisory_xact_lock(hashtext('alerts:' || new.user_id));
  if (select count(*) from public.alerts
      where user_id = new.user_id and market_id = new.market_id) >= 3 then
    raise exception 'Alert limit reached (3 per Market)' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.alerts where user_id = new.user_id) >= 50 then
    raise exception 'Alert limit reached (50)' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_alert_limit() from public, anon, authenticated;

create trigger alerts_limit
  before insert on public.alerts
  for each row execute function public.enforce_alert_limit();

-- ── Row-level security: the owner reads, adds and deletes; nobody updates ───
alter table public.alerts enable row level security;

create policy "Users read their own alerts"
  on public.alerts for select to authenticated
  using (user_id = (select auth.jwt() ->> 'sub'));

create policy "Users add their own alerts"
  on public.alerts for insert to authenticated
  with check (user_id = (select auth.jwt() ->> 'sub'));

create policy "Users remove their own alerts"
  on public.alerts for delete to authenticated
  using (user_id = (select auth.jwt() ->> 'sub'));

-- Grants match the policies exactly (Supabase grants everything on new tables by default).
revoke all on public.alerts from anon, authenticated;
grant select, insert, delete on public.alerts to authenticated;

-- Realtime: alerts is deliberately NOT added to supabase_realtime. The Watchlist picks up triggered_at
-- on its next snapshot refetch.

-- ── apply_prices, now also triggering Alerts ────────────────────────────────
-- Unchanged from 0002 except for the `triggered` step: for exactly the Markets whose Price changed in
-- this call, untriggered Alerts the new Price has crossed get triggered_at = now() and triggered_price.
-- above: new Price ≥ threshold; below: new Price ≤ threshold. An unchanged Price triggers nothing, so
-- "save only what changed" still holds, and an Alert fires once. The return value is still the number of
-- Markets whose Price changed (Alerts aren't counted).
create or replace function public.apply_prices(prices jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  with input as (
    select distinct on (r.id) r.id, round(r.price, 4) as price
    from jsonb_to_recordset(prices) as r(id text, price numeric)
    where r.price between 0 and 1
    order by r.id
  ),
  changed as (
    update public.markets m
    set price = i.price,
        price_changed_at = now()
    from input i
    where m.id = i.id
      and not m.closed
      and m.price is distinct from i.price
    returning m.id, m.price
  ),
  recorded as (
    insert into public.price_history (market_id, price)
    select id, price from changed
    returning 1
  ),
  -- A data-modifying WITH step always runs to completion, even though the final select doesn't read it.
  triggered as (
    update public.alerts a
    set triggered_at = now(),
        triggered_price = c.price
    from changed c
    where a.market_id = c.id
      and a.triggered_at is null
      and ((a.direction = 'above' and c.price >= a.threshold)
        or (a.direction = 'below' and c.price <= a.threshold))
    returning 1
  )
  select count(*) into n from recorded;

  return n;
end;
$$;

-- create or replace keeps the existing grants; restated so this file shows them.
revoke execute on function public.apply_prices(jsonb) from public, anon, authenticated;
grant execute on function public.apply_prices(jsonb) to service_role;
