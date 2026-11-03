# Be Ready to Explain: Odds Desk

Talking points for the four "Be Ready to Explain" questions of Assignment 5 (Live Data System). Numbers and log lines
are real, from the live project on 2026-11-03. Terms (Market, Price, Chance, Run, Follow, Fresh / Stale / Down) are
defined in [`CONTEXT.md`](../CONTEXT.md); the full rules are in [`AGENTS.md`](../AGENTS.md).

```
Polymarket (gamma + CLOB) ──► Supabase Cron, every 10 s ──► Edge Function sync-markets ──► Postgres ──► Realtime ──► Watchlist
   the source                    with x-cron-secret            (the worker)                  (only changed rows)     in the browser
```

---

## 1. Tracing a data change

**Example:** traders move "Will the Democratic Party control the Senate?" so its midpoint goes from 0.5800 to 0.6200.

1. **Source.** Polymarket's CLOB now reports a new midpoint (the halfway point between the best bid and ask) for that
   Market's first-Outcome token. No key is needed.
2. **Cron.** Every 10 seconds `pg_cron` + `pg_net` call the Edge Function with an `x-cron-secret` header read from
   Vault. The function rejects calls without it (`verify_jwt` is off, so the secret is the guard).
3. **Worker, one Run** (`supabase/functions/sync-markets/index.ts`, pure logic in `logic.ts`):
   - Takes the run lock (`try_run_lock()`, a 30 s lease), so two Runs never overlap. If it's held, the Run is
     recorded as **skipped**.
   - About every 5 minutes, refreshes the Catalog from gamma (top Markets per Category, plus followed Markets that
     may have Finished).
   - Every Run, `POST /midpoints` for the first-Outcome tokens of Catalog + followed Markets, in chunks of 100.
     Values outside 0–1 are rejected.
   - Calls `apply_prices(...)` with the Prices.
4. **Database** (`apply_prices`, a `security definer` function only the worker's secret key can run):
   - Updates `markets.price` and `price_changed_at` **only if the Price is actually different** (`is distinct from`).
   - Inserts one `price_history` row for each Market that changed.
   - Marks any untriggered **Alert** that the new Price crossed (once).
   - The Run is recorded in `worker_runs` (ok, rows changed, duration, warnings, error).
5. **Realtime.** Because `markets` is in the `supabase_realtime` publication, the changed row is pushed to open
   Watchlists whose channel filter is `id=in.(their followed ids)`, and only if RLS lets that viewer read it.
   The new `worker_runs` row is pushed too.
6. **Screen** (`components/watchlist-live.tsx`, state in `lib/watchlist.ts`):
   - The card's Chance changes from 58 to 62: both numbers roll and the bar glides (only when the displayed Chance
     moves by ≥ 0.1 point; nothing animates with reduced motion).
   - ▲ in green, because it's a Yes/No Market (team-vs-team Markets stay neutral).
   - The sparkline gains a point, Δ 1h / Δ 24h update, "Moved just now".
   - If the user had "Yes above 60%", the Alert toast and "Alert hit" badge appear immediately.
   - A screen reader hears "… up".

**What the logs say for one Run** (real, 20:48:07 UTC):

```
lock: acquired · 699 markets, 29 followed · last catalog 191 s ago
prices: 279 tokens in 3 chunk(s) → 279 midpoints (0 rejected) → apply_prices changed 22
run: ok · 22 rows changed · 649 ms
```

So of 279 Prices fetched, only 22 had changed, and only those 22 rows were written and pushed.

---

## 2. The data flow, and what would break

The chart is in [`docs/data-flow.md`](data-flow.md) (drawn before any code). Each part hands the next one thing:

| From → To | What is passed |
|---|---|
| gamma → worker | the Catalog: Markets with two Outcomes and an order book, their tags, volume, end date (JSON strings parsed in `logic.ts`) |
| CLOB → worker | midpoints by token id |
| worker → Postgres | `upsert_catalog(jsonb)` and `apply_prices(jsonb)`: only changed rows are written |
| Postgres → Realtime | `markets` UPDATEs and `worker_runs` INSERTs (the only two published tables) |
| Realtime → browser | changes for ≤ 25 followed Markets per viewer, filtered by id and by RLS |
| Postgres → server pages | Browse, Explore and the first Watchlist load, read with the user's Clerk token (RLS applies) |

**What would break if one part changed:**

| If … | What happens | What we built against it |
|---|---|---|
| gamma changes a field's format (e.g. `outcomes` stops being a JSON string) | that Market can't be parsed | `parseMarket` skips anything malformed whole, never half-written; the Run log counts skips |
| gamma or CLOB is slow or down | no new Prices | every fetch has an 8 s timeout. A Catalog failure is only a **warning**; a price failure makes the Run **failed**, so the page shows **Down** |
| the worker rewrote every row every Run | Realtime would flood and burn the free quota in hours | "save only what changed" in both SQL functions; checked in SQL (same input twice → 0 rows) |
| a table is missing from Realtime, or its grant, or its RLS policy | the page silently gets nothing | all three are set by migrations; the page refetches its snapshot on every (re)subscribe |
| Clerk's token expires while the page is open | Realtime closes the channel ("Token has expired") | a fresh token every 30 s, and automatic rejoin with backoff (commit `0d21470`) |
| Runs overlap (a slow Run + the next Cron tick) | double writes | the run lock; an overlapping Run is recorded as **skipped** |
| Cron stops | no Runs at all | the page turns **Stale** after 30 s; `/status` shows the last Run time |

---

## 3. Freshness: how someone knows the data is current

One pure function, `lib/freshness.ts` (unit-tested), drives one display everywhere: the Watchlist, Browse, Explore
and `/status`.

| State | When | What you see |
|---|---|---|
| **Loading** | no Run seen yet | skeletons |
| **Fresh** | the last ok Run finished < 30 s ago (three missed 10 s Runs) | "Live · updated 4 s ago" (ticking) and a green heartbeat that beats once per Run |
| **Stale** | no ok Run for ≥ 30 s, **or** the live connection dropped | amber banner ("Chances may be out of date" / "Reconnecting…"), Chances greyed, heartbeat flat and amber |
| **Down** | the latest non-skipped Run failed | red banner with since-when, the error, a link to `/status`; heartbeat red |

Two separate signals, so a quiet Market isn't mistaken for a broken system:

- **Freshness** is about the system (the last Run).
- **Moved** is about one Market ("Moved 16 h ago"): a Market can be quiet while the data is Fresh.

Browse and Explore are static (Prices as of page load), so they say "Prices as of 20 s ago · Refresh" instead of
"Live". `/status` shows the last 20 Runs live: time, ok / failed / skipped, rows changed, duration, warnings, error.

**In the last 24 hours:** 6,381 ok Runs, 0 failed, 0 skipped, about 576 ms each, about 13 rows changed per Run.

---

## 4. Agentic workflow: what the tests check, and what we found in the logs

**How the agent works on the system:** the Supabase MCP server (scoped to this one project, writes allowed) applies
migrations, deploys the worker, runs SQL checks and reads logs. Every migration is shown to the owner before it's
applied, then the security advisors are run and the types regenerated. Vercel deploys from GitHub; Clerk via its CLI.

**What the tests check** (`npm run test:unit`: 275 tests in 20 files; plus SQL checks):

- **Worker logic** (vitest, against **real saved Polymarket responses** in `supabase/functions/sync-markets/fixtures/`):
  - Yes/No, team-name, Over/Under and Up/Down Markets; grouped Markets; games in play kept; Markets ending within
    the hour dropped.
  - Malformed fields skipped, bad midpoints rejected.
  - All seven Category lists, including real Markets listed in two Categories (kept once, under the first).
  - Places from gamma's tags (e.g. a US + Iran Market → `IR, US, region:middle-east`; Bitcoin → Global).
- **App logic:** Freshness, the split numbers and the ≥ 0.1-point roll rule, the Watchlist order, price history and
  Δ, Alerts crossing, the Recap, the Heatmap, trending topics, places and globe arcs.
- **UI** (React Testing Library): the live Watchlist rendered whole with a **fake Realtime feed** that pushes Price
  updates and Runs and drops or restores the connection. It checks what a user sees: the split, rolling Chances,
  green/red only on Yes/No, Fresh → Stale after 30 s → Fresh, Down with a `/status` link, refetch on reconnect,
  sparklines, the Alert toast, the Recap, the Heatmap, reduced motion; plus Browse, Explore, the nav and the theme.
- **Database** (`supabase/tests/checks.sql`, run through MCP in a transaction that is rolled back):
  - The same Prices twice → 0 rows the second time.
  - User B can't see, delete or change user A's Follows, Alerts or visit.
  - The 26th Follow is rejected; Alerts: 3 per Market, 50 per user, fire once, deleted on Unfollow.
  - Signed-out visitors can read only Markets and Runs; the run lock works.

**What we found in the logs and checks:**

- **Only what changed is saved.** A typical Run fetches ~279 Prices and writes ~13–22 (see the log above).
- **A Catalog refresh shows its work in one line** (real, 20:44:57 UTC):
  ```
  catalog: politics 30 · sports 99 (skipped ending-soon 1) · crypto 30 · finance 28 (skipped ending-soon 2) · tech 30 · world 30 · culture 30 · finished 0/6 followed outside · places 145/273 → upsert_catalog changed 2
  ```
  It reads: 30 Politics Markets kept, 1 Sports Market dropped because it ends within the hour, 6 followed Markets
  checked for being Finished (none were), 145 of 273 Markets have a place, and only 2 rows changed.
- **Some refreshes change many rows** (217 at 20:39:52, then 2 five minutes later): gamma updates its 24-hour volume
  figures in batches, and volume is part of a Market's saved data, so those rows really did change.
- **Realtime drops when the Clerk token expires.** The browser logged "Token has expired"; fixed by refreshing the
  token every 30 s and rejoining automatically.
- **gamma hides Finished Markets** in an id lookup unless `closed=true` is added; found by comparing real responses,
  fixed in the Finished lookup (commit `b585ab4`).
- **The new places worked on the first refresh:** 238 rows changed once as places filled in, then back to a few.
  Politics 31/31 and World 25/25 Markets placed.
- **A test that was right yesterday failed today:** SQL check 9 expected 4 rows because the new Categories were empty
  when it was written; now they hold real Markets. The check was fixed to look at its own test rows.
