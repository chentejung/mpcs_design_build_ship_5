-- 0002_worker_rpcs: the functions the worker calls. Each is security definer and
-- executable only by service_role. Each one writes a row only when its values
-- actually changed, so Realtime carries real changes and nothing else.

-- ── upsert_catalog ──────────────────────────────────────────────────────────
-- payload: {
--   "categories": ["politics", …],  -- the Category lists fetched successfully
--   "markets": [{ id, question, slug, image, category, event_id, event_title,
--                 group_item_title, outcomes: [a, b], token_id, price,
--                 volume_24h, end_date, closed, in_catalog }, …]
-- }
-- price is gamma's outcomePrices[0]: used only on first insert and when a
-- Market becomes Finished (its frozen final Price). Live Prices come from
-- apply_prices.
-- Catalog Markets of a fetched Category that aren't in the payload drop out
-- (in_catalog = false). A Category whose fetch failed is left untouched.
-- Returns the number of rows inserted or changed.
create function public.upsert_catalog(payload jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
  dropped integer;
begin
  with input as (
    select distinct on (r.id) r.*
    from jsonb_to_recordset(payload -> 'markets') as r(
      id text, question text, slug text, image text, category text,
      event_id text, event_title text, group_item_title text,
      outcomes text[], token_id text, price numeric, volume_24h numeric,
      end_date timestamptz, closed boolean, in_catalog boolean
    )
    order by r.id
  )
  insert into public.markets as m (
    id, question, slug, image, category, event_id, event_title, group_item_title,
    outcomes, token_id, price, price_changed_at, volume_24h, end_date,
    closed, closed_at, in_catalog, catalog_seen_at
  )
  select
    i.id, i.question, i.slug, i.image, i.category, i.event_id, i.event_title, i.group_item_title,
    i.outcomes, i.token_id, round(i.price, 4),
    case when i.price is not null then now() end,
    i.volume_24h, i.end_date,
    coalesce(i.closed, false),
    case when i.closed then now() end,
    coalesce(i.in_catalog, true),
    now()
  from input i
  on conflict (id) do update set
    question         = excluded.question,
    slug             = excluded.slug,
    image            = excluded.image,
    event_id         = excluded.event_id,
    event_title      = excluded.event_title,
    group_item_title = excluded.group_item_title,
    outcomes         = excluded.outcomes,
    token_id         = excluded.token_id,
    volume_24h       = excluded.volume_24h,
    end_date         = excluded.end_date,
    in_catalog       = excluded.in_catalog,
    catalog_seen_at  = now(),
    -- A Market never reopens. When it becomes Finished, freeze its final Price.
    closed           = m.closed or excluded.closed,
    closed_at        = case when excluded.closed and not m.closed then now() else m.closed_at end,
    price            = case when excluded.closed and not m.closed
                            then coalesce(excluded.price, m.price) else m.price end,
    price_changed_at = case when excluded.closed and not m.closed
                             and excluded.price is distinct from m.price
                            then now() else m.price_changed_at end
  -- Save only what changed. category is kept from the first time the Market was seen.
  where (m.question, m.slug, m.image, m.event_id, m.event_title, m.group_item_title,
         m.outcomes, m.token_id, m.volume_24h, m.end_date, m.in_catalog)
        is distinct from
        (excluded.question, excluded.slug, excluded.image, excluded.event_id,
         excluded.event_title, excluded.group_item_title, excluded.outcomes,
         excluded.token_id, excluded.volume_24h, excluded.end_date, excluded.in_catalog)
     or (excluded.closed and not m.closed);

  get diagnostics changed = row_count;

  update public.markets m
  set in_catalog = false
  where m.in_catalog
    and m.category in (select jsonb_array_elements_text(payload -> 'categories'))
    and m.id not in (
      select r ->> 'id'
      from jsonb_array_elements(payload -> 'markets') as r
      where coalesce((r ->> 'in_catalog')::boolean, true)
    );

  get diagnostics dropped = row_count;

  return changed + dropped;
end;
$$;

-- ── apply_prices ────────────────────────────────────────────────────────────
-- prices: [{ "id": "<market id>", "price": 0.955 }, …]
-- Updates only Markets whose Price is distinct from the new one (and not
-- Finished), and records exactly those rows in price_history.
-- Returns the number of Markets whose Price changed.
create function public.apply_prices(prices jsonb)
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
  )
  select count(*) into n from recorded;

  return n;
end;
$$;

-- ── Run lock ────────────────────────────────────────────────────────────────
-- try_run_lock: takes a 30 s lease if no Run holds one, and returns its holder
-- id; returns null if a previous Run is still in progress. The lease expires
-- by itself, so a crashed Run can't block the worker for long.
create function public.try_run_lock()
returns uuid
language sql
security definer
set search_path = ''
as $$
  update public.run_lock
  set holder = gen_random_uuid(),
      locked_until = now() + interval '30 seconds'
  where locked_until < now()
  returning holder;
$$;

-- release_run_lock: ends the lease, but only if this Run still holds it.
create function public.release_run_lock(lock_holder uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.run_lock
  set locked_until = '-infinity', holder = null
  where holder = lock_holder;
$$;

-- ── Only the worker may call these ──────────────────────────────────────────
revoke execute on function public.upsert_catalog(jsonb)   from public, anon, authenticated;
revoke execute on function public.apply_prices(jsonb)     from public, anon, authenticated;
revoke execute on function public.try_run_lock()          from public, anon, authenticated;
revoke execute on function public.release_run_lock(uuid)  from public, anon, authenticated;

grant execute on function public.upsert_catalog(jsonb)   to service_role;
grant execute on function public.apply_prices(jsonb)     to service_role;
grant execute on function public.try_run_lock()          to service_role;
grant execute on function public.release_run_lock(uuid)  to service_role;
