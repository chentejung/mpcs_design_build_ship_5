# Plan: "Odds Desk": a live Polymarket monitor (Assignment 5)

## Context

Assignment 5 (due **Tue Nov 3, 5:30 PM**) asks for a live data system. A worker on Supabase polls a source every few seconds and saves only what changed. A page updates by itself through Supabase Realtime and shows how fresh the data is, with designed loading, fresh, stale and down states. Signed-in users choose what they follow, protected by RLS. The page is deployed on Vercel. The app is a **read-only watchlist of Polymarket prediction-market chances**. Users sign in with Clerk, follow markets (Politics, Sports, Crypto), and watch the chances move live. Election Day is Nov 3, so the midterm markets will move a lot while it's being graded.

### Decided with the user (planning plus two grilling rounds)

- **Accounts and source:** a new Supabase project and a new Clerk app (A4's Bijou is untouched). Prices come live from the CLOB on every run, and the catalog refreshes from gamma about every 5 minutes.
- **What a user follows:** a single **Market**. Grouped markets show their **Event** title as a label.
- **Card layout:** every card shows **both outcomes as a split bar**, for example "Hawks 62 | 38 Pacers" or "Yes 95.5 | 4.5 No". Code stores only the **first outcome's price**; the second is 1 minus the first.
- **Colors:** green and red are used only for Yes/No markets. Other markets get neutral ▲▼.
- **Terms:** the UI says **chance** (a %), and code and the database say **price** (0–1).
- **Finished markets:** markets whose trading has ended move to a collapsed **"Finished (n)"** section with a **Clear finished** button. Resolution isn't tracked.
- **Follow limit:** **25 per user**, including finished markets, enforced by a database trigger.
- **Browse:**
  - Grouped under each Event heading.
  - Static: prices as of page load, plus a freshness line.
  - Hides markets ending within 1 hour, and shows "Ends in …" on the rest.
  - **Visible to signed-out visitors.** Their Follow click opens sign-in, and afterward the market is followed automatically.
- **Watchlist:** live, and sorted by when each market was followed.
- **Run health:** a **Run** is ok if the price step succeeded. Catalog errors are warnings that show on `/status` but don't make the page show "down".
- **Tests:** unit tests on saved responses, a SQL check that a second identical write saves nothing, and a two-user RLS isolation check. No Playwright.
- **Cut order if time runs out:**
  1. The sparkline
  2. `/status` (folded into a collapsible run-log panel)
  3. Sports and Crypto (leaving Politics only)

  The core is never cut. Sparkline backfill is dropped. Search, the "biggest move" sort and backfill are stretch goals.
- **Look and name:** a clean "trading desk" look, not A4's Pulp, and the name stays "Odds Desk".

### Facts verified against the live API (Nov 2)

- **Gamma catalog:** `GET https://gamma-api.polymarket.com/markets?tag_id={2|1|21}&active=true&closed=false&order=volume24hr&ascending=false&limit=30`. The tag ids are Politics 2, Sports 1, Crypto 21.
  - Never use `/events`, which returned 32 MB.
  - Its `updatedAt` is one batch time shared by every market, and prices lag by about a minute.
  - `outcomes`, `outcomePrices` and `clobTokenIds` are JSON strings.
  - Grouped markets have `negRisk`, `groupItemTitle` and `events[0].{id,title}`.
- **Outcomes aren't always Yes/No:**
  - Politics: 30 of 30 top markets are Yes/No.
  - Sports: only 9 of 30. Others look like `["Hawks","Pacers"]` or `["Over","Under"]`.
  - Crypto: 29 of 30, plus `["Up","Down"]`.
- **Many markets end soon:** 22 of the top 30 Sports markets and 13 of the top 30 Crypto markets end within 24 hours.
- **CLOB live prices:** `POST https://clob.polymarket.com/midpoints` with body `[{"token_id": …}]` returns `{token_id: "0.955"}`. This equals Polymarket's displayed midpoint. No key is needed.
- **CLOB history:** `GET https://clob.polymarket.com/prices-history?market=<token>&interval=1d&fidelity=60` gives hourly history. Only needed for the stretch goal.
- **Machine:** Node 22 and `gh` are installed. The `supabase`, `clerk`, `vercel` and `deno` CLIs are missing. The Supabase MCP shows **"Needs authentication"**.
- **Reusable from `../week4`:**
  - `lib/supabase.ts`, the server client with the Clerk token
  - `proxy.ts`, which runs `clerkMiddleware`
  - `lib/required-env.ts`
  - The `next.config.ts` and `vitest.config.ts` setup
  - The sign-in-then-save pattern
  - The migration, RLS and "never set or filter `user_id`" conventions in `../week4/AGENTS.md`

## Data flow (this becomes `docs/data-flow.md` as a Mermaid chart **before any code**)

```
pg_cron (every 10 s) ──pg_net POST + x-cron-secret──> Edge Function sync-markets
   ├─ pg_try_advisory_lock; if a previous run still holds it → log "skipped", exit
   ├─ every ~5 min: gamma /markets per tag (top 30 by 24h volume)
   │     + gamma /markets?id=… for followed markets outside the catalog (detect closed)
   │     → rpc upsert_catalog(jsonb)  (only rows whose metadata changed; closed → freeze final price)
   ├─ every run: CLOB POST /midpoints for first-outcome tokens of (in_catalog ∪ followed) and not closed
   │     → rpc apply_prices(jsonb)    (update only rows whose price changed, insert those into price_history,
   │                                   return count)
   └─ insert worker_runs (ok, rows_changed, catalog_refreshed, warnings, error, duration_ms)
Postgres ──Realtime (postgres_changes)──> browser on the Watchlist (Clerk session token → RLS)
   markets UPDATE filtered id=in.(followed ids, ≤25) → split bar, flash, sparkline point
   worker_runs INSERT                               → freshness badge, /status log
   on (re)subscribe → refetch the Watchlist snapshot (Realtime does not replay missed changes)
Next.js on Vercel (server): Browse (static, anon allowed), follow/unfollow/clear finished (Server Actions)
```

## Database (migrations in `supabase/migrations/`, applied through the MCP `apply_migration`)

**`0001_core.sql`**
- **`markets`**
  - Identity and display: `id text pk` (the gamma id), `question`, `slug`, `image`, `category text check in ('politics','sports','crypto')`.
  - Event grouping: `event_id text`, `event_title text`, `group_item_title text`.
  - Outcomes and price: `outcomes text[] check (cardinality = 2)`, `token_id text not null` (the first outcome's token), `price numeric(6,4) check (0..1)`, `price_changed_at timestamptz`.
  - Catalog data: `volume_24h numeric`, `end_date timestamptz`, `closed bool default false`, `closed_at timestamptz`, `in_catalog bool`, `catalog_seen_at timestamptz`.
- **`price_history`**: `id bigint identity`, `market_id fk`, `price`, `recorded_at`. Index on `(market_id, recorded_at desc)`.
- **`follows`**
  - Columns: `user_id text default (auth.jwt()->>'sub')`, `market_id fk`, `created_at`, with primary key `(user_id, market_id)`.
  - A **`before insert` trigger** rejects a user's 26th follow with a clear message: "Watchlist full (25)".
- **`worker_runs`**: `id bigint identity`, `started_at`, `finished_at`, `ok bool`, `skipped bool`, `rows_changed int`, `catalog_refreshed bool`, `warnings text[]`, `error text`, `duration_ms int`.
- **RLS on every table:**
  - `markets`, `worker_runs`: `select to anon, authenticated using (true)`.
  - `price_history`: `select to authenticated`.
  - `follows`: select, insert and delete only where `user_id = auth.jwt()->>'sub'`, for `authenticated` only.
  - No write policies on the other tables; the worker's secret key bypasses RLS.
  - **Grants match the policies** exactly.
- **Realtime:** `alter publication supabase_realtime add table markets, worker_runs;`.

**`0002_worker_rpcs.sql`**: `security definer` functions. Execute is revoked from `public`, `anon` and `authenticated`, and granted only to `service_role`.
- **`upsert_catalog(rows jsonb)`**
  - Uses `on conflict (id) do update … where (old metadata) is distinct from (new)`.
  - Sets `price` only on first insert, or when a market closes (the final price from gamma `outcomePrices[0]`, plus `closed_at`).
  - Sets `in_catalog = false` for markets that drop out of the top lists.
- **`apply_prices(prices jsonb)`**: updates only where `price is distinct from new`, inserts the changed rows into `price_history`, and returns the count. **This is "save only what changed."**
- **`try_run_lock()` and `release_run_lock()`**: wrappers around a session advisory lock, so overlapping runs skip. If an RPC can't hold a session lock, use a fallback: skip when the latest `worker_runs` row has no `finished_at` and started less than 30 s ago.

**`0003_cron.sql`** (secrets via Vault, never in git)
- **Main job:** `cron.schedule('sync-markets', '10 seconds', …net.http_post…)`.
- **Cleanup job, hourly:** delete `price_history` older than 7 days and `worker_runs` older than 2 days.

After each migration:
- Run the MCP security advisors.
- Regenerate `lib/database.types.ts`.
- Commit the migration and the types together.

## Worker: `supabase/functions/sync-markets/`

- **`logic.ts`**: pure TypeScript with no Deno or npm-specifier imports, so vitest can test it.
  - `parseCatalog(gammaJson, category, now)` → rows. It parses the JSON-string fields and keeps only markets with exactly 2 outcomes, an order book, and a valid token. It also drops markets with `end_date < now + 1 h`, carries the Event fields, and keeps `outcomePrices[0]` for the first-insert or closed price.
  - `parseMidpoints(clobJson, tokenToMarket)` → `{id, price}[]`. Values that aren't numbers or are outside 0 to 1 are dropped.
  - `catalogDue(lastRefresh, now)` returns true when the last refresh was 5 or more minutes ago.
- **`index.ts`** (Deno):
  1. Check the `x-cron-secret` header. The function is deployed with `verify_jwt: false`.
  2. Take the run lock.
  3. If due, refresh the catalog. Catalog errors go into `warnings`, and the run keeps going.
  4. Fetch midpoints in chunks of 100, with an 8 s timeout.
  5. Call `apply_prices`. If this step fails, set `ok=false` and record the `error`.
  6. Insert the `worker_runs` row in a `finally` block.
  7. Write one `console.log` line per step.
- **Deploy** with the MCP `deploy_edge_function`. Invoke it once, check `markets` and `worker_runs`, and only then schedule the cron.
- **Tests:**
  - `logic.test.ts` (vitest) runs on real fixtures captured in step 2, saved in `fixtures/`. It covers:
    - Yes/No, team-name and Over/Under markets
    - Grouped markets
    - Markets ending soon being dropped
    - Bad JSON-string fields being skipped
    - Bad midpoints being rejected
  - A SQL check through the MCP `execute_sql`, in a transaction that rolls back: `apply_prices(X)` returns n, and a second identical call returns **0**, with no new `price_history` rows.
  - A two-user RLS isolation check through `execute_sql`, in a transaction that rolls back:
    - Set `request.jwt.claims` to user A, insert a follow, then switch to user B.
    - Expect user B to see 0 rows and be unable to delete A's follow.
    - Expect the 26th follow to be rejected.

## Web app (Next.js 16 + Tailwind v4 + Clerk, using A4's setup)

- **Copy from `../week4` and adapt:** `proxy.ts`, `lib/supabase.ts`, `lib/required-env.ts`, `next.config.ts`, `vitest.config.ts`.
  - **`tsconfig.json` excludes `supabase`.**
  - Signed out, the server client runs as `anon`, which can read `markets` and `worker_runs` only.
- **New `lib/supabase-browser.ts`:** used on the Watchlist only, for Realtime. It uses `NEXT_PUBLIC_SUPABASE_URL` and the publishable key, with `accessToken: () => session.getToken()` from Clerk's `useSession`. Record this change from A4 in AGENTS.md.
- **Routes:**
  - **`/`**
    - Signed out: a short landing page plus a link to Browse.
    - Signed in: the **Watchlist**. Live markets come first, in the order they were followed, then the collapsed "Finished (n)" section with **Clear finished**.
    - Empty state: "Follow a market to start" with a link to Browse.
  - **`/browse?category=politics|sports|crypto`** (default `politics`)
    - Event headings with one row per market, showing the split bar, "Ends in …", and Follow or Unfollow.
    - Static data with a freshness line ("Prices as of 12 s ago · Refresh"). The stale and down banners come from the latest `worker_runs`, loaded once.
    - **Signed-out Follow:** opens Clerk sign-in with a redirect to `/browse?follow=<id>`. On return, the server follows that market once, using the A4 pattern.
    - When the watchlist is full, show the "Watchlist full (25)" message.
  - **`/status`**: the last 20 `worker_runs` (time, ok or skipped, rows changed, duration, warnings, error), updating live.
- **Freshness (`lib/freshness.ts` is pure and unit-tested; `components/freshness.tsx` displays it):**
  - **loading**: no run seen yet. Show a skeleton.
  - **fresh**: the last ok run is under 30 s old. Show "Live · updated 4 s ago", ticking every second.
  - **stale**: the last ok run is 30 s old or more, or the Realtime channel isn't subscribed. Show an amber banner and grey out the chances.
  - **down**: the latest non-skipped run has `ok=false`. Show a red banner ("Feed failing since 5:41 PM"), the error, and a link to `/status`.
  - **Separate from the above:** each card shows "moved 3 m ago" (from `price_changed_at`), so a quiet market isn't confused with a stale system.
  - **Finished cards** show the frozen final split and "Trading ended …".
- **Card:**
  - Event label › market name.
  - The split bar with both outcome names and chances, shown to one decimal.
  - A flash and arrow **only when the displayed chance changes by at least 0.1 pt**. Green and red only for Yes/No markets. The flash respects `prefers-reduced-motion`.
  - A "View on Polymarket" link built from the `slug`.
- **Style:** neutral dark surface, tabular monospace numbers, accessible contrast, clear status badges, and a single column on mobile.

## Extra (only after the core works): sparkline + Δ 1h

- The server loads the last 24 h of `price_history` for followed markets, and live updates append points.
- **Δ 1h** is the current price minus the last price at or before now − 1 h.
- **No backfill.** A newly followed market starts with a short line.

## Build order (commit after each step)

1. **The user sets up accounts and tools:**
   - Create a Supabase project and a Clerk app.
   - Authenticate the Supabase MCP, scoped to the project with writes on.
   - Install the Clerk CLI.
   - Connect Clerk third-party auth in both dashboards.
   - Create `.env.local`.

   The agent then:
   - Checks each tool.
   - Writes `AGENTS.md`, recording the decisions above.
   - Writes **`CONTEXT.md`**, the glossary below.
2. **Explore the source:** call gamma and CLOB twice a few minutes apart, and show which fields changed. Save the fixtures and write `docs/source-notes.md`.
3. **Data-flow chart:** `docs/data-flow.md` (Mermaid), reviewed with the user **before any code**.
4. **Migrations** 0001 and 0002, the advisors, and the types. Then the SQL idempotency and RLS isolation checks.
5. **Worker:** logic and tests, deploy, invoke once, and check the rows. Then migration 0003 (cron at 10 s), and check the logs from three runs.
6. **Next.js app:** Clerk, Browse plus follow (with sign-in-then-follow), the live Watchlist, freshness states, and `/status`.
7. **Sparkline + Δ 1h.**
8. **Vercel deploy:** set the env vars:
   - Clerk keys
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

   Then a classmate tests it, and finally write `README.md`.

## Glossary for `CONTEXT.md` (written in step 1, terms only)

- **Market**: one Polymarket question with exactly two outcomes, the thing a user follows.
- **Event**: a group of Markets around one question, shown as a heading. Not followable.
- **Outcome**: one of a Market's two sides, such as Yes/No or Hawks/Pacers. The **first outcome** is the one tracked.
- **Price**: the first outcome's 0–1 midpoint. **Chance**: the Price shown as a %.
- **Follow** and **Watchlist**: a user's followed Markets, at most 25, finished ones included.
- **Finished** (or **Closed**): trading has ended, and the final Price is frozen. *Avoid* "resolved"; it isn't tracked.
- **Catalog**: the top Markets per category that the worker tracks, plus every followed Market.
- **Run**: one worker run. It's **ok** if the price step succeeded, and **skipped** if a previous run held the lock.
- **Fresh**, **Stale** and **Down**: whether the system's data is current. This is different from **moved**, how long ago a Market's Price last changed.
- *Branding note:* the name "Odds Desk" is branding, not a term; the UI says "chance".

## Free-tier guardrails

- **Edge Function calls:** a 10 s cron uses about 260k of the 500k free calls a month.
- **Realtime:** messages are sent only on real price changes, to Watchlist subscribers only, each limited to 25 or fewer markets. Browse is static.
- **Storage:** history and runs are pruned hourly.
- **Billing:** no payment methods.
- **Reminder:** open the app weekly so Supabase doesn't pause it.

## Verification

- `npm run test:unit` (logic, fixtures, freshness) passes, and `npm run build` passes with `supabase` excluded.
- **Worker run:** after the manual invoke, `worker_runs` shows `ok=true`, and `markets` has about 60–90 rows. Team-name markets have the right `outcomes`, and grouped markets have `event_title`.
- **SQL checks:** the second identical `apply_prices` call saves 0 rows. The RLS isolation check passes, and the 26th follow is rejected.
- **Cron:** runs are about 10 s apart in `worker_runs`, and the MCP logs show three clean runs, which you should be able to explain.
- **Realtime:** with two signed-in users:
  - Each sees only their own Watchlist.
  - Cards update without a refresh.
  - Updates keep arriving after the page has been open more than 2 minutes, which confirms Clerk token refresh.
  - Going offline and back online refetches the snapshot.
- **States:**
  - **Stale:** run `cron.unschedule` briefly. The banner should turn amber after about 30 s.
  - **Down:** make the function fail temporarily. The banner should turn red.
  - **Finished:** a followed market that closes moves to "Finished", and **Clear finished** removes it.
  - **Sign-in-then-follow:** a signed-out Follow, then sign-in, ends with the market followed.
  - Restore everything afterward.
- **Deployed:** the Vercel URL works signed out (Browse) and signed in (Watchlist), and a classmate can follow a market and watch it update.
