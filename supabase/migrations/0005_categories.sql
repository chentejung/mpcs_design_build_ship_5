-- 0005_categories: the Catalog grows from three Categories to seven (docs/redesign-plan.md, issue #3).
-- Finance, Tech, World (gamma's Geopolitics) and Culture (gamma's pop-culture) join Politics, Sports, Crypto.
-- Only the check changes: upsert_catalog already takes the Category from each row and already keeps a
-- Market's Category from when it was first seen, and the Browse index is on (category, volume_24h).

alter table public.markets drop constraint markets_category_check;

alter table public.markets add constraint markets_category_check
  check (category in ('politics', 'sports', 'crypto', 'finance', 'tech', 'world', 'culture'));
