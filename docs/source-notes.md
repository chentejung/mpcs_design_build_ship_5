# Source notes — Polymarket

The source was called twice, 3 minutes apart: **2026-11-03 01:50:36Z** and **01:53:46Z** (Mon Nov 2, 8:50 PM CT, the
night before Election Day). The first set of responses is saved in `supabase/functions/sync-markets/fixtures/` for the
worker's tests.

## Calls

| Call | Used for | Size |
|---|---|---|
| `GET gamma-api.polymarket.com/markets?tag_id={2,1,21}&active=true&closed=false&order=volume24hr&ascending=false&limit=30` | Catalog: Politics, Sports, Crypto | ~170–260 KB each |
| `POST clob.polymarket.com/midpoints` with body `[{"token_id": "…"}, …]` (90 tokens) | live Prices | ~8 KB |

No key was needed for either call.

## What changed between the two calls

| | Changed in 3 minutes |
|---|---|
| gamma: the 90 Markets in the top 30 lists | **0 of 90.** No field on any Market changed, and no Market entered or left a top-30 list. |
| CLOB midpoints | **23 of 90** Prices changed. 20 of them changed by ≥ 0.1 point, e.g. `0.535 → 0.445` and `0.325 → 0.225` (Sports Markets on live games), `0.955 → 0.94`. |

**What this means for the worker:** gamma is a slow, cached view, so refreshing the Catalog about every 5 minutes loses
nothing. The CLOB is where things move, so it's called on every Run. About a quarter of the Markets moved in 3 minutes,
so most Runs should change a few rows, and saving every row on every Run would rewrite about 75% of them for nothing.

## The fields we use (gamma Market)

| Field | Meaning | How often it changes | Goes to |
|---|---|---|---|
| `id` | gamma Market id (string) | never | `markets.id` |
| `question` | The Market's question, e.g. "Bears vs. Seahawks" | rarely | `question` |
| `slug` | URL part for `polymarket.com/market/<slug>` | never | `slug` |
| `image` | Image URL | rarely | `image` |
| `outcomes` | **JSON string**, e.g. `"[\"Bears\", \"Seahawks\"]"` | never | `outcomes text[2]` |
| `clobTokenIds` | **JSON string**, one token per Outcome, same order as `outcomes` | never | first token → `token_id` |
| `outcomePrices` | **JSON string**, e.g. `"[\"0.495\", \"0.505\"]"`. Lags the CLOB. | about every minute | only the first-insert or Finished Price |
| `enableOrderBook` | Whether the Market trades on the CLOB | rarely | filter: must be `true` |
| `volume24hr` | 24-hour volume in USDC (number) | slowly | `volume_24h`, Browse order |
| `endDate` | When trading is scheduled to end (ISO). For games, this is kickoff. | rarely | `end_date`, "Ends in …", the 1-hour filter |
| `closed` | Trading has ended | once | `closed`, `closed_at` → Finished |
| `groupItemTitle` | The Market's label inside an Event, e.g. a candidate's name | never | `group_item_title` |
| `events[0].id`, `events[0].title` | The Event the Market belongs to | never | `event_id`, `event_title` |

Fields we ignore: `description`, `liquidity*`, `volume1wk/1mo/1yr`, fees, UMA fields, `updatedAt` (one shared batch time,
not per Market), `positionIds`, etc.

## CLOB `/midpoints`

The response is `{ "<token_id>": "0.955", … }`: a **string** number per requested token, the midpoint between the best
bid and the best ask. This matches the Chance Polymarket displays. In this snapshot all 90 tokens came back, with values
from `0.0005` to `0.9995`. The worker drops anything that isn't a number in 0–1.

## The Markets in the snapshot

| Category | Markets | Yes/No | Other Outcomes | Grouped (`groupItemTitle`) | End within 1 h |
|---|---|---|---|---|---|
| Politics | 30 | 30 | — | 29 | 2 |
| Sports | 30 | 2 | 28: team names (e.g. Bears/Seahawks, incl. spreads and esports), Over/Under | 14 | **23** |
| Crypto | 30 | 28 | 2 Up/Down | 27 | 1 |

All 90 have an order book and well-formed JSON-string fields. The malformed-field test cases will be built from these
real responses by corrupting one field.

**Open question:** after the 1-hour filter only about 7 Sports Markets are left tonight, because Monday-night games have
`endDate` = kickoff. **Decided:** Sports is fetched with `limit=100` (Politics and Crypto stay at 30).
