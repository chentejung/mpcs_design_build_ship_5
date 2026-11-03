// Freshness: is the system's data current? (AGENTS.md → Freshness, CONTEXT.md → Freshness)
// Pure, so it is unit-tested and the same rules drive the Watchlist, Browse and /status.
// Freshness is about the system, not one Market; a quiet Market's "Moved" is separate.

/** The worker_runs columns Freshness needs. */
export type RunSummary = {
  finished_at: string;
  ok: boolean;
  skipped: boolean;
  error: string | null;
};

export type Freshness =
  | { state: "loading" }
  | { state: "fresh"; lastOkAt: Date; ageMs: number }
  | { state: "stale"; lastOkAt: Date | null; ageMs: number | null; reason: "no-recent-run" | "disconnected" }
  | { state: "down"; since: Date; error: string; lastOkAt: Date | null };

/** 3 missed Runs at one every 10 s. */
export const STALE_AFTER_MS = 30_000;

/**
 * runs: the latest Runs, in any order. connected: whether the live channel is
 * subscribed (always true for a static page like Browse).
 * - loading: no Run seen yet.
 * - down: the latest non-skipped Run failed. since = the first failure of the
 *   current streak. Down wins over Stale: it says more about what's wrong.
 * - stale: the live channel isn't subscribed, or no ok Run for ≥ 30 s.
 * - fresh: otherwise.
 */
export function freshness(runs: readonly RunSummary[], now: Date, connected: boolean): Freshness {
  if (runs.length === 0) return { state: "loading" };

  const sorted = [...runs].sort((a, b) => Date.parse(b.finished_at) - Date.parse(a.finished_at));
  const lastOk = sorted.find((r) => r.ok && !r.skipped);
  const lastOkAt = lastOk ? new Date(lastOk.finished_at) : null;

  const real = sorted.filter((r) => !r.skipped);
  if (real.length > 0 && !real[0].ok) {
    const streakEnd = real.findIndex((r) => r.ok);
    const failures = streakEnd === -1 ? real : real.slice(0, streakEnd);
    return {
      state: "down",
      since: new Date(failures[failures.length - 1].finished_at),
      error: real[0].error ?? "The worker's last Run failed",
      lastOkAt,
    };
  }

  const ageMs = lastOkAt ? Math.max(0, now.getTime() - lastOkAt.getTime()) : null;
  if (!connected) return { state: "stale", lastOkAt, ageMs, reason: "disconnected" };
  if (lastOkAt === null || ageMs === null || ageMs >= STALE_AFTER_MS) {
    return { state: "stale", lastOkAt, ageMs, reason: "no-recent-run" };
  }
  return { state: "fresh", lastOkAt, ageMs };
}
