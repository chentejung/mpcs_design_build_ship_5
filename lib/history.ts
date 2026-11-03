// A followed Market's recent Price history: the Watchlist's sparkline and Δ 1h / Δ 24h. Pure, so it is
// unit-tested. The history is read from price_history (the last 24 h, plus the last point before then) and
// extended live from the `markets` UPDATEs the Watchlist already receives; nothing new is published to Realtime.

export const HOUR_MS = 60 * 60_000;
export const DAY_MS = 24 * HOUR_MS;

/** The sparkline's window. */
export const WINDOW_MS = DAY_MS;

/** The most points a Market's history keeps; longer histories are thinned, keeping the first and last. */
export const MAX_POINTS = 120;

/** The most price_history rows read per Market for the window (newest first). */
export const HISTORY_FETCH_LIMIT = 1000;

/** One recorded Price, `at` in epoch milliseconds. A history is oldest first. */
export type PricePoint = { at: number; price: number };

/** A price_history row as read (numeric(6,4) may arrive as a string). */
export type HistoryRow = { price: number; recorded_at: string };

/**
 * Builds a history from the window's rows (any order) and the last row before the window. If the window's read
 * hit its limit, the oldest rows are missing, so the point before the window would leave a gap and is dropped.
 */
export function toHistory(
  recent: readonly HistoryRow[] | null | undefined,
  before: readonly HistoryRow[] | null | undefined,
  limit = HISTORY_FETCH_LIMIT,
): PricePoint[] {
  const rows = recent ?? [];
  const all = rows.length >= limit ? rows : [...(before ?? []).slice(0, 1), ...rows];
  const points = all
    .map((r) => ({ at: new Date(r.recorded_at).getTime(), price: Number(r.price) }))
    .filter((x) => Number.isFinite(x.at) && Number.isFinite(x.price))
    .sort((a, b) => a.at - b.at);
  return downsample(points, MAX_POINTS);
}

/** At most `max` points, evenly spread by position, always keeping the first and the last. */
export function downsample(points: readonly PricePoint[], max = MAX_POINTS): PricePoint[] {
  const n = points.length;
  if (n <= max) return points as PricePoint[];
  if (max < 2) return [points[n - 1]];
  return Array.from({ length: max }, (_, k) => points[Math.round((k * (n - 1)) / (max - 1))]);
}

/**
 * Adds a live point, then drops points older than the window (keeping the last one before it, for Δ 24h)
 * and thins the history to MAX_POINTS.
 */
export function appendPoint(history: readonly PricePoint[], point: PricePoint): PricePoint[] {
  const all = [...history, point];
  const cutoff = point.at - WINDOW_MS;
  let firstKept = 0;
  for (let i = 0; i < all.length; i++) if (all[i].at <= cutoff) firstKept = i;
  return downsample(all.slice(firstKept), MAX_POINTS);
}

/** The last point at or before `t`, or null. */
export function priceAt(history: readonly PricePoint[], t: number): PricePoint | null {
  let found: PricePoint | null = null;
  for (const x of history) {
    if (x.at <= t) found = x;
    else break;
  }
  return found;
}

/**
 * Δ over a window, in Chance points rounded to one decimal: the current Price minus the Price at (now − window),
 * from the last point at or before then. Null when no point is that old ("not enough history") or there's no Price.
 */
export function delta(history: readonly PricePoint[], price: number | null, now: Date, windowMs: number): number | null {
  if (price === null) return null;
  const base = priceAt(history, now.getTime() - windowMs);
  if (!base) return null;
  return Math.round((price - base.price) * 1000) / 10;
}

/** "+2.4", "−0.7", "0.0"; "—" when there isn't enough history. */
export function formatDelta(points: number | null): string {
  if (points === null) return "—";
  const tenths = Math.round(points * 10);
  if (tenths === 0) return "0.0";
  return `${tenths > 0 ? "+" : "−"}${(Math.abs(tenths) / 10).toFixed(1)}`;
}
