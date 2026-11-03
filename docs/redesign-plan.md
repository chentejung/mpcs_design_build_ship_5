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

---

# v2.1: trending banner and a globe of Markets by place

Agreed with the owner on 2026-11-03. Tickets: #13 (places), #14 (banner), #15 (globe; blocked by #13 and #14).

## Decisions

| Area | Decision |
|---|---|
| Trending banner | The top 5 **Events by summed 24-hour volume** across the Catalog (a single-Market Event is its own topic), as a slow carousel at the top of the signed-out landing. Static like Browse; no auto-rotate under reduced motion. |
| Globe placement | The **centrepiece of the signed-out landing page**, under the banner. Browse keeps its grid. |
| Granularity | **Countries and regions**: ISO 3166-1 alpha-2 codes (`IR`, `US`) plus `region:middle-east`, `region:europe`, `region:asia`, `region:africa`, `region:latin-america`, `region:north-america`, `region:oceania`. |
| Placeless Markets | An empty `places` means **Global**: shown on a shelf beside the globe, not forced onto it. |
| Sports | Leagues pinned to their home country (NHL → US/CA, Premier League → GB, Champions League → Europe). |
| Where places come from | gamma's own tags (`include_tag=true` on the Catalog lists and the Finished lookup) through a tested lookup table in the worker, with a conservative fallback on country names in the question. No AI classification: it would need a paid API key ("no payment method"). Measured on 2026-11-03: World 29/30 and Politics 15/30 Markets carry a place tag; Crypto, Tech and Culture 0/30. |
| Rendering | `react-globe.gl` (three.js), loaded client-only; country shapes from a static Natural Earth 110m file (public domain); no map tiles, no keys. A plain list of places is always available (screen readers, keyboard, small screens, no WebGL). Markers in the neutral accent colour (product rule 3). |
| Schema | Migration `0008_places`: `markets.places text[] not null default '{}'`, written only by the worker through `upsert_catalog` ("save only what changed" includes places). Readable by everyone like the rest of `markets`; nothing new on Realtime. |

## Notes on the source (not legal advice)

- **Images** are each Market's `image` URL from gamma, hosted in Polymarket's upload bucket; Next's image optimiser on Vercel fetches and caches resized copies. They are not licensed to us explicitly, and many are third-party marks (team logos, people, crypto logos). Fine for a non-commercial class project that links back; to be stricter, serve them `unoptimized` (hotlink, no cached copy) or show only Category placeholders.
- **API terms**: gamma and CLOB reads are public and keyless, with rate limits. There are no separate API terms; Polymarket's Terms of Use cover data used "directly or through an API" and bar commercial exploitation or resale without written agreement. Odds Desk is read-only, non-commercial, links every Market back to Polymarket, and keeps its request rate modest.

## Order

1. #13 places (migration approved 2026-11-03) and #14 banner, in parallel.
2. Apply `0008`, advisors, SQL checks, regenerate types, redeploy the worker, confirm places fill in.
3. #15 globe (it falls back to "all Global" until the column exists).
