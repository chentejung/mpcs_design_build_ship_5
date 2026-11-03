-- 0008_places: where in the world each Market is about, for the landing page's globe.
-- places holds ISO 3166-1 alpha-2 country codes ("IR", "US") and region codes ("region:middle-east"). The
-- worker derives them from gamma's tags (requested with include_tag=true) through a tested lookup table in
-- supabase/functions/sync-markets/logic.ts. An empty array means Global: a Market with no place (most Crypto,
-- Tech and Culture). Written only by the worker; readable by everyone through the existing markets policy.

alter table public.markets add column places text[] not null default '{}';

-- ── upsert_catalog, now also saving places ──────────────────────────────────
-- Unchanged from 0002 except: places is read from each row (missing → '{}'), set on update, and part of the
-- "save only what changed" comparison, so a Market is rewritten only when its places actually change.
-- category is still kept from the first time the Market was seen.
create or replace function public.upsert_catalog(payload jsonb)
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
      end_date timestamptz, closed boolean, in_catalog boolean, places text[]
    )
    order by r.id
  )
  insert into public.markets as m (
    id, question, slug, image, category, event_id, event_title, group_item_title,
    outcomes, token_id, price, price_changed_at, volume_24h, end_date,
    closed, closed_at, in_catalog, catalog_seen_at, places
  )
  select
    i.id, i.question, i.slug, i.image, i.category, i.event_id, i.event_title, i.group_item_title,
    i.outcomes, i.token_id, round(i.price, 4),
    case when i.price is not null then now() end,
    i.volume_24h, i.end_date,
    coalesce(i.closed, false),
    case when i.closed then now() end,
    coalesce(i.in_catalog, true),
    now(),
    coalesce(i.places, '{}')
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
    places           = excluded.places,
    catalog_seen_at  = now(),
    -- A Market never reopens. When it becomes Finished, freeze its final Price.
    closed           = m.closed or excluded.closed,
    closed_at        = case when excluded.closed and not m.closed then now() else m.closed_at end,
    price            = case when excluded.closed and not m.closed
                            then coalesce(excluded.price, m.price) else m.price end,
    price_changed_at = case when excluded.closed and not m.closed
                             and excluded.price is distinct from m.price
                            then now() else m.price_changed_at end
  -- Save only what changed.
  where (m.question, m.slug, m.image, m.event_id, m.event_title, m.group_item_title,
         m.outcomes, m.token_id, m.volume_24h, m.end_date, m.in_catalog, m.places)
        is distinct from
        (excluded.question, excluded.slug, excluded.image, excluded.event_id,
         excluded.event_title, excluded.group_item_title, excluded.outcomes,
         excluded.token_id, excluded.volume_24h, excluded.end_date, excluded.in_catalog, excluded.places)
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

-- create or replace keeps the existing grants; restated so this file shows them.
revoke execute on function public.upsert_catalog(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_catalog(jsonb) to service_role;
