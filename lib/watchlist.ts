// The Watchlist's order and sections (AGENTS.md → Product rule 5). Pure, so it is unit-tested.
import { moveDirection } from "./format";
import { appendPoint, toHistory, type HistoryRow, type PricePoint } from "./history";
import { type Market, toMarket } from "./markets";

export const FOLLOW_LIMIT = 25;

export type Followed = Market & {
  followed_at: string;
  /** The last live move of the displayed Chance (≥ 0.1 point); seq changes on every move, to replay the roll. */
  move?: { dir: "up" | "down"; seq: number };
  /** The first Outcome's Price over the last 24 h, oldest first (lib/history.ts); missing means none yet. */
  history?: PricePoint[];
};

/**
 * A follows row joined to its Market and, optionally, its price_history: `recent` is the last 24 h (newest
 * first), `before` the last row before then (lib/watchlist-query.ts).
 */
export type FollowRow = {
  created_at: string;
  markets: Market & { recent?: HistoryRow[] | null; before?: HistoryRow[] | null };
};

export function toFollowed(rows: readonly FollowRow[]): Followed[] {
  return rows.map((r) => {
    const { recent, before, ...market } = r.markets;
    return { ...toMarket(market), followed_at: r.created_at, history: toHistory(recent, before) };
  });
}

/**
 * Live Markets first, in Follow order (oldest Follow first, so nothing reorders while you read), then the
 * Finished ones, most recently ended first.
 */
export function splitWatchlist(items: readonly Followed[]): { live: Followed[]; finished: Followed[] } {
  const byFollow = (a: Followed, b: Followed) => a.followed_at.localeCompare(b.followed_at) || a.id.localeCompare(b.id);
  const byEnded = (a: Followed, b: Followed) => (b.closed_at ?? "").localeCompare(a.closed_at ?? "");
  return {
    live: items.filter((m) => !m.closed).sort(byFollow),
    finished: items.filter((m) => m.closed).sort(byEnded),
  };
}

/** The Realtime filter for the followed Markets: id=in.(…). Ids are gamma's, digits only. */
export function marketsFilter(ids: readonly string[]): string | null {
  return ids.length === 0 ? null : `id=in.(${ids.join(",")})`;
}

/**
 * Applies a Realtime UPDATE to the Watchlist; Markets we don't follow are ignored. A move of the displayed
 * Chance by ≥ 0.1 point is recorded, so the card's Chances roll (product rule 3); smaller changes don't.
 * Any actual change of the Price adds a point to the Market's history, at the time it changed.
 */
export function applyMarketUpdate(
  items: readonly Followed[],
  update: Partial<Market> & { id: string },
  now: Date = new Date(),
): Followed[] {
  return items.map((m) => {
    if (m.id !== update.id) return m;
    const next = toMarket({ ...m, ...update } as Market) as Followed;
    const dir = moveDirection(m.price, next.price);
    const move = dir ? { dir, seq: (m.move?.seq ?? 0) + 1 } : m.move;
    const changed = next.price !== null && next.price !== m.price;
    const at = next.price_changed_at ? new Date(next.price_changed_at).getTime() : now.getTime();
    const history = changed
      ? appendPoint(m.history ?? [], { at: Number.isFinite(at) ? at : now.getTime(), price: next.price! })
      : m.history;
    return { ...next, followed_at: m.followed_at, move, history };
  });
}
