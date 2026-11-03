# Redesign plan — Odds Desk v2

Agreed with the owner on 2026-11-03. Nothing here is built yet. `AGENTS.md` changes ship in the same commit as the
code that needs them.

## Why

Compared with polymarket.com, Odds Desk is dark and plain (one grey palette, no images even though 400+ Markets
have an `image`), covers 3 topics against Polymarket's 15+, and gives people little reason to come back. We don't
trade, so we compete on **watching**: live movement made visible, a personal recap and alerts.

## Decisions

| Area | Decision |
|---|---|
| Theme | Light by default with a dark toggle. One brand accent (indigo), never green/red. Rule 3 stays: green/red only for direction on Yes/No. |
| Topics | Add **Finance** (gamma tag 120), **Tech** (1401), **World** (Geopolitics, 100265), **Culture** (596), 30 each. Each verified on 2026-11-03: 30 of 30 results are two-Outcome with an order book. |
| Animation | (1) rolling digits + bar glide, (3) live sparkline, (4) alert line on bar and sparkline, (5) Freshness heartbeat in the header, (6) Watchlist heatmap view, (7) "Since your last visit" replay. All off under `prefers-reduced-motion`. |
| Features | Sparkline + Δ 1h / Δ 24h, "Since your last visit" recap, price alerts. |
| Alerts | **In-app only**: badge, toast and a "Triggered" list. No email or push, no new service. |
| UI tests | vitest + React Testing Library (jsdom): render the live Watchlist with a fake Realtime source; Browse cards, Category tabs and the theme toggle as components. Still no Playwright. Spec: issue #1. |

## Build steps (one commit each)

1. **Theme foundation.** Light and dark tokens in `globals.css` (`@theme` + a `.dark` class), a toggle saved in
   `localStorage` with a no-flash inline script, Clerk appearance for both themes, and `next/image` remote patterns
   for Polymarket images. Restyle the nav, layout and footer.
2. **Cards.** A new `SplitBar` (thicker, rolling digits, glide), Market images, Browse as a grid of cards grouped by
   Event, and Category tabs with icons. The landing page shows real top Markets.
3. **Heartbeat.** The Freshness component gets a pulse line in the header that beats once per Run, goes flat and
   amber when Stale, and red when Down. `lib/freshness.ts` is unchanged.
4. **New topics.** Migration `0005_categories.sql` widens the `category` check. `CATALOG_LISTS` gets the four new
   lists. `logic.ts` **dedupes Markets that appear in several lists** (first list wins, matching "category is kept
   from first seen"), otherwise `upsert_catalog` would hit the same row twice in one statement. Fixture and test for
   the dedupe. `CATEGORIES` in `lib/markets.ts`. Load: +4 gamma calls per 5 min, +~120 tokens = +2 midpoint chunks
   per Run. Realtime is unchanged (Watchlist only).
5. **Sparkline + Δ.** The Watchlist's initial load reads 24 h of `price_history` for followed Markets (already
   `authenticated`-readable). Live points are appended from the existing `markets` UPDATEs, so nothing new is
   published. Pure `lib/history.ts` (downsample, Δ 1h / 24h) with unit tests.
6. **Recap.** Migration `0006_visits.sql`: `visits(user_id text pk default (auth.jwt()->>'sub'), last_seen_at)`,
   RLS select/insert/update own row. The Watchlist reads `last_seen_at`, then records the current visit. The recap
   lists Markets that moved ≥ 2 points since then (from `price_history`, ≤ 7 days), with a **Replay** that animates
   bars from then to now.
7. **Heatmap view.** A toggle on the Watchlist between Cards and Heatmap: tiles sized by 24 h volume, shaded by
   Δ 1h. Green/red only for Yes/No, neutral intensity otherwise.
8. **Alerts.** Migration `0007_alerts.sql`: `alerts(id, user_id default sub, market_id, direction 'above'|'below',
   threshold numeric(6,4), created_at, triggered_at, triggered_price)`. The foreign key is to
   `follows(user_id, market_id) on delete cascade`, so you can only alert on a Followed Market and unfollowing
   removes its alerts. At most 3 per Market and 50 per user, by trigger. RLS select/insert/delete own. `apply_prices`
   sets `triggered_at` when a changed Price crosses a threshold, in the same statement batch, so it still writes
   only on change. **Not published to Realtime**: the client spots the crossing from the `markets` UPDATE it already
   receives and shows the toast, and the snapshot refetch picks up `triggered_at`. UI: set an alert from a card,
   dashed line on the bar and sparkline, "Alert hit" badge, Triggered list. SQL checks: a crossing triggers once, the
   same Price twice doesn't re-trigger, user B can't see A's alerts, the 4th alert on a Market is rejected.

## `AGENTS.md` changes (with the steps above)

- Stack/Product: the Category list grows to 7; the `/browse?category=` values change.
- Rule 3: the flash becomes rolling digits + glide, same ≥ 0.1-point threshold, same reduced-motion rule.
- Data model + RLS: `visits`, `alerts`. Realtime: unchanged (still only `markets`, `worker_runs`).
- Worker: the four new lists, the dedupe, and the alert step in `apply_prices`.
- Testing: tests for `lib/history.ts` and the dedupe; the alert SQL checks.
- If time runs out, the new cut order: heatmap → recap replay animation → new topics → `/status`. Never the core.

## Not doing

Search, trading, comments, email or push alerts, the movers ticker, the dial hero, the ghost marker.
