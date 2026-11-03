// The "Since your last visit" Recap (CONTEXT.md → Recap): which followed Markets moved at least 2 displayed
// Chance points since the user's previous visit, and which became Finished. Pure, so it is unit-tested.
// The Prices at the last visit come from price_history, which is pruned after 7 days, so a longer absence is
// compared with 7 days ago and flagged `capped`.
import { chanceTenths } from "./format";
import { DAY_MS, type HistoryRow } from "./history";
import { marketLabel } from "./markets";
import type { Followed } from "./watchlist";

/** A move must reach this many displayed Chance points to be in the Recap. */
export const RECAP_THRESHOLD_POINTS = 2;

/** How far back price_history reaches (it is pruned after 7 days). */
export const RECAP_MAX_MS = 7 * DAY_MS;

export type RecapEntry = {
  id: string;
  label: string;
  outcomes: string[];
  /** The first Outcome's Price at the last visit; null if unknown (a Finished Market without history that old). */
  from: number | null;
  /** The Price now (the frozen final Price for a Finished Market). */
  to: number;
  /** to − from in displayed Chance points, one decimal; null when `from` is unknown. */
  points: number | null;
  dir: "up" | "down" | null;
};

export type Recap =
  | { kind: "none" }
  | { kind: "quiet"; since: string; capped: boolean }
  | { kind: "moved"; since: string; capped: boolean; entries: RecapEntry[]; finished: RecapEntry[] };

/** A follows row with its Market's last price_history row at or before the start (lib/watchlist-query.ts). */
export type PriceAtVisitRow = { market_id: string; markets: { at_visit?: HistoryRow[] | null } | null };

/** The Prices at the last visit by Market id; Markets without a row that old are left out. */
export function toPricesAtVisit(rows: readonly PriceAtVisitRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const price = Number(r.markets?.at_visit?.[0]?.price ?? Number.NaN);
    if (Number.isFinite(price)) out[r.market_id] = price;
  }
  return out;
}

/** Where the comparison starts: the last visit, or 7 days ago if that's longer ago. */
export function recapStart(lastSeenAt: string, now: Date): string {
  const earliest = now.getTime() - RECAP_MAX_MS;
  return new Date(lastSeenAt).getTime() < earliest ? new Date(earliest).toISOString() : lastSeenAt;
}

/**
 * Builds the Recap. `pricesAtVisit` holds, per Market, the last price_history Price at or before recapStart().
 * A Market with no row that old but whose Price hasn't changed since then had its current Price; any other
 * Market without one is left out rather than shown a made-up starting point. Markets followed after the last
 * visit weren't on the Watchlist then and are left out too.
 */
export function recap({
  items,
  lastSeenAt,
  pricesAtVisit,
  now,
}: {
  items: readonly Followed[];
  lastSeenAt: string | null;
  pricesAtVisit: Readonly<Record<string, number>>;
  now: Date;
}): Recap {
  if (!lastSeenAt) return { kind: "none" };
  const since = new Date(lastSeenAt).getTime();
  const start = recapStart(lastSeenAt, now);
  const startMs = new Date(start).getTime();
  const capped = start !== lastSeenAt;

  const entries: RecapEntry[] = [];
  const finished: RecapEntry[] = [];
  for (const m of items) {
    if (m.price === null || new Date(m.followed_at).getTime() > since) continue;
    const unchangedSince = m.price_changed_at === null || new Date(m.price_changed_at).getTime() <= startMs;
    const from = m.id in pricesAtVisit ? pricesAtVisit[m.id] : unchangedSince ? m.price : null;
    const tenths = from === null ? null : chanceTenths(m.price) - chanceTenths(from);
    const entry: RecapEntry = {
      id: m.id,
      label: marketLabel(m),
      outcomes: m.outcomes,
      from,
      to: m.price,
      points: tenths === null ? null : tenths / 10,
      dir: tenths === null || tenths === 0 ? null : tenths > 0 ? "up" : "down",
    };
    if (m.closed) {
      if (m.closed_at && new Date(m.closed_at).getTime() > since) finished.push(entry);
    } else if (tenths !== null && Math.abs(tenths) >= RECAP_THRESHOLD_POINTS * 10) {
      entries.push(entry);
    }
  }

  if (entries.length === 0 && finished.length === 0) return { kind: "quiet", since: lastSeenAt, capped };
  const bySize = (a: RecapEntry, b: RecapEntry) => Math.abs(b.points ?? 0) - Math.abs(a.points ?? 0);
  return { kind: "moved", since: lastSeenAt, capped, entries: entries.sort(bySize), finished };
}
