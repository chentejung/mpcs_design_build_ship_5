# Odds Desk

A read-only watchlist of Polymarket prediction markets. Follow up to 25 Markets across Politics, Sports, Crypto,
Finance, Tech, World and Culture and watch the crowd's Chance on each one move live, with a clear sign of whether the
data is fresh, stale or down. Nobody trades here.

Where Polymarket is built for betting, Odds Desk is built for **watching**:

- **A world view, first:** the **Explore** tab, first in the nav and open to everyone, opens on a banner of the 5
  busiest topics right now, then a 3D globe of Markets by place (from gamma's own tags) on NASA's Blue Marble, with
  pulsing rings, labels and arcs between places that share a Market: pick a country or region to see its Markets;
  placeless ones sit on a **Global** shelf. The signed-out landing page shows the same.
- **Live movement you can see:** Chances roll to their new values, every card has a 24-hour sparkline with
  **Δ 1h / Δ 24h**, and a **Heatmap** view shows your whole Watchlist's movement at once.
- **A reason to come back:** a **"Since your last visit"** Recap lists what moved (and what Finished) while you were
  away, with a **Replay** of the moves.
- **Price alerts:** "tell me when Yes is above 60%". Each alert is a dashed line on its card's bar and sparkline and
  fires once, in the app: the moment a live Price crosses it you get a toast and an "Alert hit" badge.
- **Always honest about freshness:** a heartbeat beats once per Run and goes flat amber when Stale, red when Down.
- **Neutral by design:** green/red only for direction on Yes/No Markets; team-vs-team Markets stay neutral.

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
3. **Database.** Postgres with row-level security on every table. Each Market carries its `places` (country codes and
   regions, from gamma's tags through a tested lookup table in the worker; empty means Global). Anyone can read Markets and Runs; only you can see
   and change your own Follows, Alerts and last visit (`user_id` comes from your Clerk sign-in token, never from app
   code). Triggers stop a 26th Follow and a 4th Alert on one Market (or a 51st overall). An Alert can exist only on a
   Market you Follow, and Unfollowing deletes it. When `apply_prices` saves a changed Price, it also marks any Alert
   that Price crossed, once.
4. **Live page.** The Watchlist subscribes through Supabase Realtime to changes on just the Markets you follow, plus new
   Runs; nothing else is published. On load (and every time it reconnects, because Realtime doesn't replay what was
   missed) it reads your Follows with their last 24 h of `price_history`, your Alerts and the latest Runs; live Price
   updates then extend each sparkline in place. It keeps the Clerk token fresh so updates keep flowing.
5. **Recap.** Opening the Watchlist reads when you were last here (`visits`) and the Prices at that moment, shows what
   moved by 2+ points since, then records this visit. History is kept 7 days, so a longer absence is recapped from 7
   days back, and says so.
6. **Freshness.** One rule set (`lib/freshness.ts`) everywhere:
   - **Live**: the last ok Run was under 30 s ago.
   - **Stale** (amber; Chances greyed): no ok Run for 30 s, or the live connection dropped.
   - **Down** (red): the latest Run failed, with the error and a link to `/status`.
   - The same state drives a small **heartbeat** next to it on the Watchlist, Browse and `/status`.
   - Each card also shows when it last **Moved**, so a quiet Market isn't mistaken for a stale system.

## Pages

The nav reads **Explore · Watchlist · Browse · Status**. Watchlist appears only once you're signed in (signed out, `/`
is the landing page), so a visitor sees **Explore · Browse · Status**.

| URL | What |
|---|---|
| `/explore` | **For everyone, first in the nav:** a carousel of the 5 trending topics (Events by 24-hour volume), then a 3D globe of Markets by country and region (Blue Marble Earth, atmosphere, tinted countries, pulsing rings, labels, and arcs between places that share a Market), with a place list and a panel of that place's Markets with Follow, and a **Global** shelf. Small screens or no WebGL get the list and panel only; reduced motion stops the rotation, rings and arc animation. Prices as of page load, with Refresh. A signed-out Follow signs you in and comes back to Explore. |
| `/` | Signed out: the landing page, with Explore's content (above) and a short intro; no Watchlist. Signed in: your live **Watchlist**: the Recap, then live Markets in the order you followed them (as **Cards** or a **Heatmap**), triggered Alerts, and a collapsed **Finished (n)** with **Clear finished**. |
| `/browse?category=politics\|sports\|crypto\|finance\|tech\|world\|culture` | A grid of image cards grouped by Event, by 24-hour volume, with Follow. Open to everyone; a signed-out Follow signs you in and then follows. Prices as of page load, with Refresh. |
| `/status` | The worker's last 20 Runs, live. |

Every Market shows its image and both Outcomes as a split bar ("Yes 94.5 | 5.5 No", "Liquid 19.5 | 80.5 PARIVISION").
Green and red are used only for Yes/No Markets, so the app never looks like it's rooting for a team; the brand accent
is indigo. When the displayed Chance moves by at least 0.1 point, both Chances roll to their new values and the bar
glides. With reduced motion set, values change instantly and nothing animates.

The app is light by default with a dark theme (☀ / ☾ in the header); the choice is remembered and applied before the
page paints, and Clerk's sign-in follows it.

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

- `npm run test:unit` runs two vitest projects:
  - **logic** (Node): the worker's parsing against **real saved Polymarket responses** in
    `supabase/functions/sync-markets/fixtures/` (Yes/No, team-name, Over/Under and Up/Down Markets, grouped Markets,
    Markets ending within the hour dropped, games in play kept, malformed fields skipped, bad midpoints rejected, and
    all seven Category lists, including real Markets listed in two Categories); plus Freshness, the split-bar
    numbers, the roll rule, grouping, the Watchlist order, price history and Δ, Alerts, the Recap and the Heatmap.
  - **ui** (jsdom + React Testing Library): the live Watchlist rendered whole, with Supabase and Realtime replaced by a
    fake feed (`test/fake-feed.tsx`) that pushes Price updates and Runs and drops or restores the connection. It
    checks what a user sees: the split, rolling Chances, direction colours, Fresh / Stale / Down and the heartbeat,
    refetch on reconnect, sparklines and Δ, Alerts and the live alert toast, the Recap and Replay, the Heatmap, and
    reduced motion. Also Browse
    cards and Category tabs, the theme toggle, the nav (Explore first; no Watchlist signed out), the trending
    banner, and Explore: places, arcs, the place list and panel, the Global shelf and Follow (the WebGL globe itself
    is mocked).
- `supabase/tests/checks.sql`, run through the Supabase MCP in a rolled-back transaction: the same Prices sent twice
  change 0 rows the second time; user B can't see, delete or update user A's Follow; the 26th Follow is rejected;
  signed-out visitors can read only Markets and Runs; all seven Categories are accepted; an Alert fires exactly once
  and only on a real change, can't exist on an unfollowed Market, is capped at 3 per Market and 50 per user, is
  deleted on Unfollow, and is private (another user's limit is never revealed); `visits` is private and its upsert
  works without app code setting `user_id`; neither `alerts` nor `visits` is on Realtime.
- v1 was checked in a real browser with two Clerk test users: sign-in-then-follow, each user sees only their own Watchlist,
  "Watchlist full (25)", live updates without a reload for over 3 minutes, and Stale → Live again after going offline.

## Repository

| Path | What |
|---|---|
| `app/`, `components/`, `lib/` | The Next.js app |
| `supabase/migrations/` | The schema, only ever changed by a new migration (0001 tables + RLS, 0002 worker functions, 0003 cron secret, 0004 schedules, 0005 seven Categories, 0006 Alerts, 0007 visits, 0008 places) |
| `supabase/functions/sync-markets/` | The worker: `index.ts` (Deno) and `logic.ts` (pure, tested) |
| `supabase/tests/checks.sql` | The SQL checks |
| `test/` | UI test setup and the fake live feed |
| `public/geo/`, `public/globe/` | Country shapes (Natural Earth, public domain) and the globe's Earth, terrain and starfield images (NASA Blue Marble, public domain; three-globe examples, MIT) |
| `docs/` | Plan, v2 redesign plan, data-flow chart, source notes |
