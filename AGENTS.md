# Odds Desk — Week 5

> **Read this whole file before building, changing the schema, or touching data access.** It records decisions the
> owner has agreed to. If a task conflicts with it, stop and ask — don't work around it. Change this file only with the
> owner's agreement, in the same commit as the code that follows it.

Odds Desk is a read-only watchlist of Polymarket prediction markets (MPCS 51238 Assignment 5, Live Data System).
A worker on Supabase refreshes prices every 10 seconds, saves only what changed, and the Watchlist updates on its own
through Supabase Realtime. Nobody trades in the app. The full build plan, with verified API facts, is
[`docs/plan.md`](docs/plan.md).

## Language

Terms are defined in [`CONTEXT.md`](CONTEXT.md): **Market**, **Event**, **Outcome**, **Category**, **Catalog**,
**Finished**, **Price**, **Chance**, **Moved**, **Follow**, **Watchlist**, **Run**, and the **Freshness** states
**Fresh / Stale / Down**. Use them in code, UI and docs. The UI says **Chance** (a %); code and data say **Price**
(0–1). Never "odds" in the UI or the code — "Odds Desk" is only the name.

## Stack

- Next.js (App Router, server-rendered) + Tailwind CSS v4, on Vercel's free Hobby plan.
- Clerk for sign-in (development keys), connected to Supabase through **third-party auth**. This is a **new** Clerk app,
  not Assignment 4's.
- Supabase (a **new** project, not Assignment 4's) for the database, Realtime, Cron and the worker.
- The worker is a Supabase **Edge Function** (Deno) in `supabase/functions/sync-markets/`. **`tsconfig.json` excludes
  `supabase`**, or the Next.js build type-checks Deno code and fails.
- Source: Polymarket's public APIs, no key — **gamma** (`gamma-api.polymarket.com`) for the Catalog and **CLOB**
  (`clob.polymarket.com`) for live Prices.

## Product rules

1. **A Market is the only followable thing.** Events are headings in Browse; each of their Markets has its own Follow.
2. **Two Outcomes, always.** Only Markets with exactly two Outcomes and an order book are in the Catalog. Every card shows
   both as a split bar ("Hawks 62 | 38 Pacers", "Yes 95.5 | 4.5 No"). Only the first Outcome's Price is stored; the
   second is shown as `1 − Price`.
3. **Color has meaning only for Yes/No.** Green/red for direction only on Yes/No Markets; other Markets get neutral ▲▼,
   so the app never looks like it's rooting for a team. The brand accent (indigo) is never green or red. A card's
   Chances roll to their new values and its bar glides only when the displayed Chance (1 decimal) changes by ≥ 0.1
   point; with `prefers-reduced-motion` values change instantly, with no animation.
4. **At most 25 Follows per user, Finished included**, enforced by a database trigger ("Watchlist full (25)").
5. **Watchlist:** live Markets first, in Follow order (no reordering while you read), then a collapsed
   **Finished (n)** section with **Clear finished** (deletes those Follows). Finished cards show the frozen final split.
6. **Browse** (`/browse?category=politics|sports|crypto|finance|tech|world|culture`, default `politics`) is grouped by Event, sorted by 24-hour
   volume, hides Markets ending within the next hour and shows "Ends in …" on the rest. A Market past its end
   date that is still trading stays: on Sports that's a game in play (gamma's end date is the kickoff), marked
   **In play**; elsewhere "Still trading". It is **static** (Prices as of page
   load, with a freshness line and Refresh) and **open to signed-out visitors**.
7. **Sign-in then follow:** a signed-out Follow opens Clerk sign-in with a redirect to `/browse?follow=<id>`; on return
   the server follows that Market once (Assignment 4's save-after-sign-in pattern).
8. **No search, no trading, no resolution tracking** in this iteration. Search is the first stretch goal.

## Data model

The schema is defined **only** by migrations in `supabase/migrations/`. Tables:

| Table | Holds | Written by |
|---|---|---|
| `markets` | One row per Market: question, slug, image, category, Event fields (`event_id`, `event_title`, `group_item_title`), `outcomes text[2]`, `token_id` (first Outcome), `price numeric(6,4)` 0–1, `price_changed_at`, `volume_24h`, `end_date`, `closed`, `closed_at`, `in_catalog`, `catalog_seen_at` | the worker only |
| `price_history` | `market_id`, `price`, `recorded_at` — one row per actual change; pruned after 7 days | the worker only |
| `follows` | `user_id text default (auth.jwt()->>'sub')`, `market_id`, `created_at`; primary key `(user_id, market_id)` | the signed-in user |
| `worker_runs` | One row per Run: `started_at`, `finished_at`, `ok`, `skipped`, `rows_changed`, `catalog_refreshed`, `warnings text[]`, `error`, `duration_ms`; pruned after 2 days | the worker only |
| `run_lock` | A single-row lease (`holder uuid`, `locked_until`) so overlapping Runs skip. A session advisory lock can't be used: the worker reaches Postgres through a connection pool | the worker only, via `try_run_lock()` / `release_run_lock(uuid)` |

### Row-level security

RLS is enabled on **every** table, and grants match the policies exactly:

- `markets`, `worker_runs`: select to `anon` and `authenticated` (`using (true)`).
- `price_history`: select to `authenticated`.
- `follows`: select, insert, delete to `authenticated` only, where `user_id = (auth.jwt() ->> 'sub')`. No update.
- `run_lock`: RLS on, no policies and no grants to `anon`/`authenticated`; not published to Realtime.
- No write policies anywhere else. The worker writes with the Supabase **secret key**, which bypasses RLS; it exists
  **only** inside the Edge Function's environment, never in this repo, `.env*` files or Vercel.

### Realtime

Realtime needs all three, or the page silently gets nothing: the table in the `supabase_realtime` publication, the
select grant, and an RLS policy that lets the viewer read it. Published tables: **`markets`, `worker_runs`** — nothing
else. The Watchlist subscribes to `markets` UPDATEs filtered `id=in.(followed ids)` and to `worker_runs` INSERTs. On
every (re)subscribe it **refetches its snapshot**, because Realtime doesn't replay missed changes.

## The worker

`supabase/functions/sync-markets/` — `index.ts` (Deno entry) plus `logic.ts` (pure TypeScript, **no Deno APIs or
`npm:` imports**, so vitest can test it).

- **Schedule:** Supabase Cron (`pg_cron` + `pg_net`) every **10 seconds**, sending an `x-cron-secret` header read from
  Vault. The function is deployed with `verify_jwt: false` and rejects calls without the secret.
- **Each Run:**
  1. Take the run lock (`try_run_lock()`, a 30 s lease that expires on its own if a Run crashes); if a previous Run
     holds it, record a **skipped** Run and exit. Release it with `release_run_lock(holder)` in `finally`.
  2. Every ~5 minutes, refresh the Catalog from gamma: `/markets?tag_id=…&active=true&closed=false&order=volume24hr&ascending=false&limit=…`
     for Politics (2, limit 30), Sports (1, **limit 100**, because one night's games fill the top of the list), Crypto (21, limit 30), Finance (120, limit 30), Tech (1401, limit 30), World (gamma's Geopolitics, 100265, limit 30), Culture (gamma's pop-culture, 596, limit 30), in that order; a Market in two lists keeps the first (so Politics wins over World). Plus `/markets?closed=true&id=…` for followed Markets outside it
     (to notice Finished ones; without `closed=true` gamma silently leaves Finished Markets out). Never call `/events` (tens of MB). → `upsert_catalog(jsonb)` with
     `{categories, markets}`: only the Categories fetched successfully lose Markets that dropped out of their list.
  3. Every Run, `POST https://clob.polymarket.com/midpoints` for the first-Outcome tokens of Catalog ∪ followed,
     not Finished, in chunks of 100. → `apply_prices(jsonb)`.
  4. Insert the `worker_runs` row in `finally`. Catalog errors go to `warnings`; only a failed price step makes the Run
     **failed** (`ok = false`).
- **Save only what changed.** `upsert_catalog` and `apply_prices` are `security definer` functions executable only by
  `service_role`. They update a row only when its values are `is distinct from` the new ones, and `apply_prices` writes
  `price_history` only for changed rows. Rewriting unchanged rows would flood Realtime and burn the free quota.
- gamma's JSON-string fields (`outcomes`, `outcomePrices`, `clobTokenIds`) are parsed in `logic.ts`; anything malformed
  is skipped, never half-written. CLOB values outside 0–1 are dropped. Every fetch has a timeout (8 s).
- One concise `console.log` line per step, so a Run's logs can be read and explained.

## Freshness

Computed by a pure function in `lib/freshness.ts` (unit-tested) and shown by one component everywhere:

| State | When | Shows |
|---|---|---|
| loading | no Run seen yet | skeletons |
| Fresh | last ok Run < 30 s ago (3 missed Runs) | "Live · updated 4 s ago", ticking |
| Stale | no ok Run for ≥ 30 s, or the Realtime channel isn't subscribed | amber banner, Chances greyed |
| Down | the latest non-skipped Run failed | red banner with since-when, the error, link to `/status` |

Each card separately shows when it **Moved** (`price_changed_at`), so a quiet Market isn't mistaken for a Stale system.

## Data access

- **Server:** `lib/supabase.ts` (from Assignment 4) — every call carries the signed-in user's Clerk session token, so RLS
  applies; signed out it runs as `anon`. Browse, follow/unfollow/clear finished (Server Actions) and initial page data.
- **Browser:** `lib/supabase-browser.ts`, **for Realtime on the Watchlist and `/status` only**, using
  `NEXT_PUBLIC_SUPABASE_URL` + the publishable key and Clerk's `session.getToken()`. This is the one change from
  Assignment 4's "the browser never talks to Supabase" rule; it only ever reads, through RLS.
- **App code never filters or sets `user_id`** — the column default fills it and RLS separates users, so the isolation
  test measures exactly that guard.
- **No service-role or secret key in the app**, its env or Vercel.

## Routes

| URL | Who | What |
|---|---|---|
| `/` | signed out | Short landing page, link to Browse, sign in |
| `/` | signed in | Watchlist (live); empty state links to Browse |
| `/browse` | everyone | `?category=`, `?follow=<id>` (after sign-in); static, grouped by Event |
| `/status` | everyone | Last 20 Runs, live: time, ok/failed/skipped, rows changed, duration, warnings, error |

## Schema workflow (Supabase MCP)

- The owner creates the Supabase project and connects its MCP server, scoped to that one project, **with writes
  allowed** (the agent deploys the worker and schedules Cron through it).
- Every schema change is a **new migration**: write `supabase/migrations/NNNN_<name>.sql`, show the owner the SQL and
  explain it, then apply that same SQL with the MCP `apply_migration` tool. Never edit the schema in the dashboard or
  with ad-hoc SQL. Secrets (cron secret, function URL) go in **Vault**, never in a migration.
- After each migration: run the MCP security advisors (every table must have RLS), regenerate `lib/database.types.ts`,
  and commit the migration and types together.
- No seed data; the worker fills the tables.

## Testing

- **vitest** (`npm run test:unit`), two projects:
  - **logic** (Node): `supabase/functions/sync-markets/logic.test.ts` against saved real responses in
    `supabase/functions/sync-markets/fixtures/` (Yes/No, team-name and Over/Under Markets, grouped Markets, ending-soon
    dropped, malformed fields skipped, bad midpoints rejected), `lib/freshness.test.ts` and the other `lib/` helpers.
  - **ui** (jsdom, React Testing Library): `components/**/*.test.tsx`. The live Watchlist is rendered whole, with its
    feed seam (`components/watchlist-feed.tsx`: snapshot + Realtime) replaced by the fake in `test/fake-feed.tsx`;
    `next/navigation` and the Server Actions are mocked in `test/setup-ui.ts`. Assert what a user sees or hears
    (roles, labels, text, `data-tone` for direction colour), never class names.
- **SQL checks through the MCP `execute_sql`, each in a rolled-back transaction:** calling `apply_prices` twice with the
  same input changes 0 rows the second time; the two-user isolation check on `follows` (user B can't see or delete A's
  Follow); the 26th Follow is rejected.
- No Playwright in this iteration.

## Repo, env and deploy

- `AGENTS.md` is the project's context file; there is no `CLAUDE.md`.
- `.env.local` (not committed) and Vercel need: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `SUPABASE_URL`,
  `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `.env.example` lists
  them. A build-time check (`lib/required-env.ts`, from Assignment 4) fails a Vercel build that's missing any.
- Commit after each build step so the history shows progress. Push to `main`; Vercel deploys from GitHub.

## Free-tier limits

- Edge Function calls: a 10 s Cron is ~260k of the 500k/month free — don't go faster.
- Images: Market images go through Next's optimiser at a fixed card size (1x/2x), only from Polymarket's upload
  bucket (`next.config.ts`), so ~540 images stay well inside Vercel Hobby's monthly allowance.
- Realtime messages: only real Price changes, only to Watchlist subscribers, each filtered to ≤ 25 Markets; Browse is
  static.
- `price_history` and `worker_runs` are pruned hourly by a Cron job.
- No payment method on any service. Open the app at least weekly so Supabase doesn't pause the project.

## If time runs out

Cut in this order, never the core (worker, Realtime, Freshness states, RLS on Follows, the Vercel deploy):
1. Sparkline + Δ 1h
2. `/status` page (fold the run log into a collapsible panel)
3. Finance, Tech, World and Culture (keep Politics, Sports, Crypto)
4. Sports and Crypto (Politics only)

## Agent skills

### Issue tracker

Issues and specs are GitHub Issues on `chentejung/mpcs_design_build_ship_5`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root, ADRs in `docs/adr/` (created when the first decision is recorded). See `docs/agents/domain.md`.
