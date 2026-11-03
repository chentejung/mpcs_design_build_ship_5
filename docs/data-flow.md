# Data flow — Odds Desk

How a Price gets from Polymarket to a user's screen. Drawn before any code (Assignment 5, step 3).

```mermaid
flowchart TB
  cron["⏱ Supabase Cron<br/>every 10 s, x-cron-secret"]

  subgraph Polymarket["Polymarket (public, no key)"]
    direction LR
    gamma["gamma /markets<br/>Catalog, every ~5 min"]
    clob["CLOB /midpoints<br/>Prices, every Run"]
  end

  worker["⚙️ Edge Function sync-markets<br/>secret key, saves only what changed"]

  subgraph DB["Postgres (RLS on every table)"]
    direction LR
    markets[("markets")]
    history[("price_history")]
    runs[("worker_runs")]
    follows[("follows")]
  end

  rt["📡 Realtime<br/>markets UPDATE, worker_runs INSERT"]

  subgraph Vercel["Next.js on Vercel"]
    direction LR
    server["Server<br/>Browse, follow / unfollow"]
    browser["Browser<br/>live Watchlist, /status"]
  end

  clerk["🔑 Clerk<br/>session JWT (sub = user id)"]

  cron -->|POST| worker
  worker -->|fetch| gamma
  worker -->|fetch| clob
  worker -->|"upsert_catalog, apply_prices"| markets
  worker -->|changed Prices| history
  worker -->|one row per Run| runs
  follows -.->|followed ids join the Catalog| worker

  markets --> rt
  runs --> rt
  rt -->|"followed ids only (≤ 25)"| browser

  server -->|own Follows| follows
  server -->|read| markets
  browser -.->|refetch on resubscribe| markets
  clerk --> server
  clerk --> browser
```

## What each hop sends

| From → To | Payload | Breaks if it changes |
|---|---|---|
| Cron → worker | Empty POST with `x-cron-secret` | Wrong/missing secret → every call rejected, no Runs → page goes **Stale** |
| gamma → worker | Array of Market objects; `outcomes`, `outcomePrices`, `clobTokenIds` are JSON **strings** | Field renamed or turned into a real array → `logic.ts` skips the Market (never half-writes); Catalog warning on `/status` |
| CLOB → worker | `{ token_id: "0.955" }` (string numbers) | Missing tokens → those Markets just don't move; values outside 0–1 are dropped; whole call fails → Run **failed** → page **Down** |
| worker → `markets` | `upsert_catalog`, `apply_prices` write only rows that are `is distinct from` the new values | Rewriting unchanged rows → Realtime flood, free quota burned |
| worker → `worker_runs` | started/finished, ok, skipped, rows_changed, warnings, error, duration | No row → Freshness can't tell Fresh from Stale |
| Realtime → browser | Changed `markets` row (new Price, `price_changed_at`), new `worker_runs` row | Table not published, no grant or no RLS policy → **silently nothing**; channel drop → **Stale**, refetch on resubscribe |
| Clerk → server/browser | JWT whose `sub` is the user id; `follows.user_id` defaults to it | Third-party auth not set up → requests run as `anon`, Follows fail; expired token not refreshed → Realtime stops after ~1 min |

## Freshness, from `worker_runs`

```mermaid
stateDiagram-v2
  [*] --> loading: no Run seen yet
  loading --> Fresh: ok Run < 30 s ago
  Fresh --> Stale: no ok Run for ≥ 30 s,<br/>or channel not subscribed
  Stale --> Fresh: ok Run arrives
  Fresh --> Down: latest non-skipped Run failed
  Stale --> Down: latest non-skipped Run failed
  Down --> Fresh: ok Run arrives
```
