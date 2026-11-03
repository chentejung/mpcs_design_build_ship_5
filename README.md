# Odds Desk

A read-only watchlist of Polymarket prediction markets. Follow up to 25 Politics, Sports and Crypto Markets and watch
the crowd's Chance on each one move live, with a clear sign of whether the data is fresh, stale or down. Nobody trades
here.

MPCS 51238 Design, Build, Ship, Assignment 5: Live Data System.

- **Live app:** https://mpcs-design-build-ship-5.vercel.app/
- **Data flow chart:** [`docs/data-flow.md`](docs/data-flow.md), drawn before any code
- **What the source sends and how often it changes:** [`docs/source-notes.md`](docs/source-notes.md)
- **Decisions and rules:** [`AGENTS.md`](AGENTS.md) · **Terms:** [`CONTEXT.md`](CONTEXT.md)

## How it works

```
Supabase Cron (every 10 s) ──► Edge Function sync-markets ──► Postgres ──► Realtime ──► the Watchlist in your browser
                                 │  every ~5 min: gamma Catalog            (only changed rows)
                                 └  every Run:    CLOB midpoints
```

1. **Source.** Polymarket's public APIs, no key: **gamma** for the Catalog (the top Markets by 24-hour volume in each
   Category) and the **CLOB** for live Prices (the midpoint between the best bid and ask).
2. **Worker.** A Supabase Edge Function (`supabase/functions/sync-markets/`), called by Supabase Cron every 10 seconds
   with a secret header that lives in Vault. Each **Run** takes a lock, refreshes the Catalog about every 5 minutes,
   fetches every Price, and **saves only what changed**: `upsert_catalog` and `apply_prices` update a row only when its
   values are actually different. Each Run records itself in `worker_runs` (ok / failed / skipped, rows changed,
   duration, warnings, error). The worker writes with the Supabase secret key, which exists only in the function's
   environment.
3. **Database.** Postgres with row-level security on every table. Anyone can read Markets and Runs; only you can see,
   add or remove your own Follows (`user_id` comes from your Clerk sign-in token, never from app code). A trigger stops
   a 26th Follow.
4. **Live page.** The Watchlist subscribes through Supabase Realtime to changes on just the Markets you follow, plus new
   Runs. It refetches its data every time it (re)connects, because Realtime doesn't replay what was missed, and it keeps
   the Clerk token fresh so updates keep flowing.
5. **Freshness.** One rule set (`lib/freshness.ts`) everywhere:
   - **Live**: the last ok Run was under 30 s ago.
   - **Stale** (amber; Chances greyed): no ok Run for 30 s, or the live connection dropped.
   - **Down** (red): the latest Run failed, with the error and a link to `/status`.
   - Each card also shows when it last **Moved**, so a quiet Market isn't mistaken for a stale system.

## Pages

| URL | What |
|---|---|
| `/` | Signed out: a short intro. Signed in: your live **Watchlist**: live Markets in the order you followed them, then a collapsed **Finished (n)** with **Clear finished**. |
| `/browse?category=politics\|sports\|crypto` | Markets grouped by Event, by 24-hour volume, with Follow. Open to everyone; a signed-out Follow signs you in and then follows. Prices as of page load, with Refresh. |
| `/status` | The worker's last 20 Runs, live. |

Every Market shows both Outcomes as a split bar ("Yes 94.5 | 5.5 No", "Liquid 19.5 | 80.5 PARIVISION"). Green and red
are used only for Yes/No Markets, so the app never looks like it's rooting for a team. A card flashes only when its
displayed Chance moves by at least 0.1 point, and the flash respects reduced-motion settings.

## Stack

Next.js 16 (App Router) + Tailwind CSS v4 on Vercel · Clerk (sign-in, connected to Supabase as third-party auth) ·
Supabase (Postgres, Realtime, Cron, Vault, Edge Functions) · Polymarket gamma + CLOB.

## Run it locally

```bash
npm install
cp .env.example .env.local   # fill in the Clerk keys and the Supabase publishable key
npm run dev                  # http://localhost:3000
```

The worker runs on Supabase, not locally; the local app reads the same live database.

## Tests

- `npm run test:unit`: vitest on pure logic. The worker's parsing runs against **real saved Polymarket responses** in
  `supabase/functions/sync-markets/fixtures/` (Yes/No, team-name, Over/Under and Up/Down Markets, grouped Markets,
  Markets ending within the hour dropped, games in play kept, malformed fields skipped, bad midpoints rejected); plus
  Freshness, the split-bar numbers, the flash rule, grouping and the Watchlist order.
- `supabase/tests/checks.sql`, run through the Supabase MCP in a rolled-back transaction: the same Prices sent twice
  change 0 rows the second time; user B can't see, delete or update user A's Follow; the 26th Follow is rejected;
  signed-out visitors can read only Markets and Runs.
- Checked in a real browser with two Clerk test users: sign-in-then-follow, each user sees only their own Watchlist,
  "Watchlist full (25)", live updates without a reload for over 3 minutes, and Stale → Live again after going offline.

## Repository

| Path | What |
|---|---|
| `app/`, `components/`, `lib/` | The Next.js app |
| `supabase/migrations/` | The schema, only ever changed by a new migration (0001 tables + RLS, 0002 worker functions, 0003 cron secret, 0004 schedules) |
| `supabase/functions/sync-markets/` | The worker: `index.ts` (Deno) and `logic.ts` (pure, tested) |
| `supabase/tests/checks.sql` | The SQL checks |
| `docs/` | Plan, data-flow chart, source notes |
