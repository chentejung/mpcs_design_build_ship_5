-- SQL checks for migrations 0001–0006. Everything runs in one transaction that is
-- rolled back, so it leaves no data behind. Run it through the Supabase MCP
-- execute_sql (or psql). Each check raises an error on failure and a
-- "PASS …" notice on success. Uses Market ids m1…m31, which never collide with
-- real gamma ids (those are numeric).
begin;

set local role service_role;

-- A Catalog: 30 politics Markets + 1 crypto Market.
select public.upsert_catalog(jsonb_build_object('categories', '["politics","crypto"]'::jsonb, 'markets',
  (select jsonb_agg(jsonb_build_object('id','m'||g,'question','Q'||g,'slug','s'||g,
    'category', case when g=31 then 'crypto' else 'politics' end,
    'outcomes','["Yes","No"]'::jsonb,'token_id','t'||g,'price',0.5,'volume_24h',g,
    'end_date','2026-12-01','closed',false,'in_catalog',true))
   from generate_series(1,31) g))) as first_catalog;

-- 1. The same Catalog again changes nothing (gamma's price is ignored unless a Market closes).
do $$ declare n int; begin
  n := public.upsert_catalog(jsonb_build_object('categories', '["politics","crypto"]'::jsonb, 'markets',
    (select jsonb_agg(jsonb_build_object('id','m'||g,'question','Q'||g,'slug','s'||g,
      'category', case when g=31 then 'crypto' else 'politics' end,
      'outcomes','["Yes","No"]'::jsonb,'token_id','t'||g,'price',0.9,'volume_24h',g,
      'end_date','2026-12-01','closed',false,'in_catalog',true))
     from generate_series(1,31) g)));
  assert n = 0, 'identical catalog should change 0 rows, got '||n;
  raise notice 'PASS identical upsert_catalog → 0 rows';
end $$;

-- 2. apply_prices twice with the same input: the second call changes 0 rows.
do $$ declare a int; b int; h int; begin
  a := public.apply_prices('[{"id":"m1","price":0.62},{"id":"m2","price":"0.5"},{"id":"m3","price":1.5},{"id":"m4","price":0.70001}]');
  b := public.apply_prices('[{"id":"m1","price":0.62},{"id":"m2","price":"0.5"},{"id":"m3","price":1.5},{"id":"m4","price":0.70001}]');
  select count(*) into h from public.price_history where market_id like 'm%';
  assert a = 2 and b = 0 and h = 2, format('apply_prices a=%s b=%s history=%s', a, b, h);
  raise notice 'PASS apply_prices: first % changed, second % changed, % history rows (unchanged and out-of-range skipped)', a, b, h;
end $$;

-- 3. The run lock: one holder at a time, released only by its holder.
do $$ declare h uuid; h2 uuid; h3 uuid; begin
  h := public.try_run_lock();
  h2 := public.try_run_lock();
  assert h is not null and h2 is null, 'second lock should fail';
  perform public.release_run_lock(gen_random_uuid());
  assert public.try_run_lock() is null, 'wrong holder released it';
  perform public.release_run_lock(h);
  h3 := public.try_run_lock();
  assert h3 is not null, 'lock not reacquired';
  perform public.release_run_lock(h3);
  raise notice 'PASS run lock: held, rejected, released only by holder';
end $$;

-- 4. Finished freezes the final Price; Markets leave the Catalog; a failed Category is untouched.
do $$ declare n int; r record; begin
  n := public.upsert_catalog(jsonb_build_object('categories','["politics"]'::jsonb,'markets',
    (select jsonb_agg(jsonb_build_object('id','m'||g,'question','Q'||g,'slug','s'||g,'category','politics',
      'outcomes','["Yes","No"]'::jsonb,'token_id','t'||g,'price', case when g=1 then 0.99 else 0.9 end,
      'volume_24h',g,'end_date','2026-12-01','closed', g=1,'in_catalog', g<>1))
     from generate_series(1,29) g)));
  select * into r from public.markets where id='m1';
  assert r.closed and r.closed_at is not null and r.price = 0.99 and not r.in_catalog, 'm1 freeze';
  assert (select not in_catalog from public.markets where id='m30'), 'm30 should drop';
  assert (select in_catalog from public.markets where id='m31'), 'crypto m31 must be untouched';
  assert public.apply_prices('[{"id":"m1","price":0.4}]') = 0, 'Finished Market must not get Prices';
  raise notice 'PASS Finished freeze, drop-out, failed Category untouched (% rows changed)', n;
end $$;

reset role;

-- 5. Two-user isolation on follows.
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_A"}';
insert into public.follows (market_id) values ('m1');
do $$ begin assert (select count(*) from public.follows) = 1, 'A should see 1'; end $$;

set local request.jwt.claims = '{"sub":"user_B"}';
do $$ declare n int; begin
  assert (select count(*) from public.follows) = 0, 'B sees A''s Follow';
  delete from public.follows where market_id = 'm1';
  get diagnostics n = row_count;
  assert n = 0, 'B deleted A''s Follow';
  begin
    insert into public.follows (user_id, market_id) values ('user_A','m2');
    raise exception 'B inserted as A';
  exception when insufficient_privilege then null; end;
  begin
    update public.follows set market_id = 'm2';
    raise exception 'update allowed';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS isolation: B sees 0, deletes 0, cannot insert as A or update';
end $$;

-- 6. The 26th Follow is rejected.
set local request.jwt.claims = '{"sub":"user_A"}';
do $$ begin
  assert (select count(*) from public.follows) = 1, 'A lost the Follow';
  insert into public.follows (market_id) select 'm'||g from generate_series(2,25) g;
  begin
    insert into public.follows (market_id) values ('m26');
    raise exception '26th Follow accepted';
  exception when check_violation then
    raise notice 'PASS 26th Follow rejected: %', sqlerrm;
  end;
end $$;

-- 7. Signed out (anon): reads markets only.
set local role anon;
do $$ begin
  assert (select count(*) from public.markets where id like 'm%') = 31, 'anon reads markets';
  begin perform 1 from public.follows;       raise exception 'anon read follows';       exception when insufficient_privilege then null; end;
  begin perform 1 from public.price_history; raise exception 'anon read price_history'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.run_lock;      raise exception 'anon read run_lock';      exception when insufficient_privilege then null; end;
  begin perform public.apply_prices('[]');   raise exception 'anon ran apply_prices';   exception when insufficient_privilege then null; end;
  raise notice 'PASS anon: reads markets only; no follows, history, run_lock or worker functions';
end $$;

-- 8. Signed in: can't write markets or call the worker's functions.
set local role authenticated;
do $$ begin
  begin perform public.try_run_lock(); raise exception 'user took the lock'; exception when insufficient_privilege then null; end;
  begin
    insert into public.markets (id, question, slug, category, outcomes, token_id)
    values ('x', 'x', 'x', 'politics', '{a,b}', 'x');
    raise exception 'user wrote markets';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS authenticated: cannot write markets or call worker functions';
end $$;

-- 9. (0005) All seven Categories are accepted; any other is rejected.
set local role service_role;
do $$ declare n int; begin
  n := public.upsert_catalog(jsonb_build_object(
    'categories', '["finance","tech","world","culture"]'::jsonb,
    'markets', (select jsonb_agg(jsonb_build_object('id','c'||c,'question','Q','slug','s'||c,'category',c,
      'outcomes','["Yes","No"]'::jsonb,'token_id','tc'||c,'price',0.5,'volume_24h',1,
      'end_date','2026-12-01','closed',false,'in_catalog',true))
     from unnest(array['finance','tech','world','culture']) c)));
  assert n = 4, 'four new-Category Markets should be inserted, got '||n;
  assert (select count(distinct category) from public.markets where id like 'm%' or id like 'c%') = 6,
    'politics, crypto and the four new Categories';
  begin
    insert into public.markets (id, question, slug, category, outcomes, token_id)
    values ('cx', 'x', 'x', 'weather', '{a,b}', 'x');
    raise exception 'category weather was accepted';
  exception when check_violation then null; end;
  raise notice 'PASS Categories: finance, tech, world, culture accepted; weather rejected';
end $$;

-- ── (0006) Alerts ───────────────────────────────────────────────────────────
-- State so far: user_A Follows m1…m25 (m1 Finished); m2, m3, m5…m29 are at 0.5, m4 at 0.7.

-- 10. apply_prices triggers a crossed Alert exactly once; an unchanged Price triggers nothing.
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_A"}';
insert into public.alerts (market_id, direction, threshold) values
  ('m5', 'above', 0.6),   -- crossed by 0.65
  ('m5', 'below', 0.3),   -- not crossed
  ('m6', 'above', 0.4);   -- already past, but m6's Price won't change
set local role service_role;
do $$ declare a int; b int; c int; t timestamptz; r record; begin
  a := public.apply_prices('[{"id":"m5","price":0.65},{"id":"m6","price":0.5}]');
  select * into r from public.alerts where market_id = 'm5' and direction = 'above';
  assert a = 1, 'one Market changed, got '||a;
  assert r.triggered_at is not null and r.triggered_price = 0.65, 'm5 above 0.6 should trigger at 0.65';
  assert (select triggered_at is null from public.alerts where market_id = 'm5' and direction = 'below'),
    'm5 below 0.3 is not crossed';
  assert (select triggered_at is null from public.alerts where market_id = 'm6'),
    'm6 Price unchanged: nothing triggers';
  t := r.triggered_at;

  b := public.apply_prices('[{"id":"m5","price":0.65},{"id":"m6","price":0.5}]');
  assert b = 0, 'same input should change 0 rows, got '||b;
  assert (select count(*) from public.alerts where triggered_at is not null and market_id like 'm%') = 1,
    'same input triggered something';

  c := public.apply_prices('[{"id":"m5","price":0.7}]');  -- changed again, still above
  select * into r from public.alerts where market_id = 'm5' and direction = 'above';
  assert c = 1 and r.triggered_at = t and r.triggered_price = 0.65, 'an Alert fires once';
  raise notice 'PASS alerts: crossed once (% changed), same input % changed and triggered nothing, uncrossed stays untriggered', a, b;
end $$;

-- 11. Only on a Followed Market, at most 3 per Market, threshold strictly between 0 and 1.
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_A"}';
do $$ begin
  begin
    insert into public.alerts (market_id, direction, threshold) values ('m26', 'above', 0.6);
    raise exception 'Alert on an unfollowed Market accepted';
  exception when foreign_key_violation then null; end;
  insert into public.alerts (market_id, direction, threshold) values
    ('m7', 'above', 0.6), ('m7', 'above', 0.7), ('m7', 'below', 0.2);
  begin
    insert into public.alerts (market_id, direction, threshold) values ('m7', 'below', 0.1);
    raise exception '4th Alert on one Market accepted';
  exception when check_violation then
    assert sqlerrm = 'Alert limit reached (3 per Market)', 'wrong message: '||sqlerrm;
  end;
  begin
    insert into public.alerts (market_id, direction, threshold) values ('m8', 'above', 1);
    raise exception 'threshold 1 accepted';
  exception when check_violation then null; end;
  begin
    insert into public.alerts (market_id, direction, threshold) values ('m8', 'sideways', 0.5);
    raise exception 'direction sideways accepted';
  exception when check_violation then null; end;
  raise notice 'PASS alerts: unfollowed Market rejected, 4th on one Market rejected, bad threshold/direction rejected';
end $$;

-- 12. Unfollow deletes that Market's Alerts.
do $$ declare n int; begin
  delete from public.follows where market_id = 'm7';
  select count(*) into n from public.alerts where market_id = 'm7';
  assert n = 0, 'Unfollow left '||n||' Alerts';
  raise notice 'PASS alerts: Unfollow deleted the Market''s Alerts';
end $$;

-- 13. Two-user isolation on alerts. (Before 14: the limit trigger runs before RLS's check, so
-- B inserting as A must not meet A's 50-Alert limit first.)
set local request.jwt.claims = '{"sub":"user_B"}';
do $$ declare n int; begin
  assert (select count(*) from public.alerts) = 0, 'B sees A''s Alerts';
  delete from public.alerts;
  get diagnostics n = row_count;
  assert n = 0, 'B deleted A''s Alerts';
  begin
    insert into public.alerts (user_id, market_id, direction, threshold) values ('user_A', 'm2', 'above', 0.6);
    raise exception 'B inserted an Alert as A';
  exception when insufficient_privilege then null; end;
  begin
    update public.alerts set threshold = 0.5;
    raise exception 'update allowed';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS alerts isolation: B sees 0, deletes 0, cannot insert as A or update';
end $$;
set local request.jwt.claims = '{"sub":"user_A"}';
do $$ begin
  assert (select count(*) from public.alerts) = 3, 'A lost Alerts to B';
  begin
    update public.alerts set triggered_at = null;
    raise exception 'owner updated an Alert';
  exception when insufficient_privilege then null; end;
end $$;

-- 14. At most 50 Alerts per user.
do $$ declare g int := 8; begin
  -- m5 has 2, m6 has 1; fill up to 50 from m8 on, 3 per Market.
  while (select count(*) from public.alerts) < 50 loop
    insert into public.alerts (market_id, direction, threshold)
    select 'm'||g, 'above', 0.9 from generate_series(1, least(3, 50 - (select count(*) from public.alerts)::int));
    g := g + 1;
  end loop;
  begin
    insert into public.alerts (market_id, direction, threshold) values ('m25', 'above', 0.9);
    raise exception '51st Alert accepted';
  exception when check_violation then
    assert sqlerrm = 'Alert limit reached (50)', 'wrong message: '||sqlerrm;
  end;
  raise notice 'PASS alerts: the 51st Alert is rejected';
end $$;

-- 15. Signed out (anon) can't read alerts, and alerts isn't published to Realtime.
set local role anon;
do $$ begin
  begin perform 1 from public.alerts; raise exception 'anon read alerts'; exception when insufficient_privilege then null; end;
  assert not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'alerts'),
    'alerts is published to Realtime';
  raise notice 'PASS alerts: anon reads nothing; not published to Realtime';
end $$;

rollback;
