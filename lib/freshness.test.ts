import { describe, expect, it } from "vitest";
import { freshness, type RunSummary } from "./freshness";

const NOW = new Date("2026-11-03T20:00:00Z");
const at = (secondsAgo: number) => new Date(NOW.getTime() - secondsAgo * 1000).toISOString();
const ok = (s: number): RunSummary => ({ finished_at: at(s), ok: true, skipped: false, error: null });
const failed = (s: number, error = "CLOB midpoints: HTTP 503"): RunSummary => ({ finished_at: at(s), ok: false, skipped: false, error });
const skipped = (s: number): RunSummary => ({ finished_at: at(s), ok: false, skipped: true, error: null });

describe("freshness", () => {
  it("is loading before any Run is seen", () => {
    expect(freshness([], NOW, true)).toEqual({ state: "loading" });
  });

  it("is fresh when the last ok Run was under 30 s ago", () => {
    expect(freshness([ok(4), ok(14)], NOW, true)).toEqual({ state: "fresh", lastOkAt: new Date(at(4)), ageMs: 4000 });
    expect(freshness([ok(29.9)], NOW, true).state).toBe("fresh");
  });

  it("goes stale at 30 s without an ok Run (3 missed Runs)", () => {
    expect(freshness([ok(30)], NOW, true)).toMatchObject({ state: "stale", reason: "no-recent-run", ageMs: 30_000 });
  });

  it("is stale when the live channel isn't subscribed, even if the last Run was fresh", () => {
    expect(freshness([ok(2)], NOW, false)).toMatchObject({ state: "stale", reason: "disconnected" });
  });

  it("is stale when only skipped Runs were seen", () => {
    expect(freshness([skipped(3)], NOW, true)).toMatchObject({ state: "stale", lastOkAt: null, ageMs: null });
  });

  it("ignores skipped Runs: a skip after an ok Run is still fresh", () => {
    expect(freshness([skipped(1), ok(5)], NOW, true).state).toBe("fresh");
  });

  it("is down when the latest non-skipped Run failed, since the start of the failure streak", () => {
    const result = freshness([failed(1, "apply_prices: timeout"), skipped(5), failed(11), failed(21), ok(31)], NOW, true);
    expect(result).toEqual({
      state: "down",
      since: new Date(at(21)),
      error: "apply_prices: timeout",
      lastOkAt: new Date(at(31)),
    });
  });

  it("is down (not stale) even while disconnected, and when no Run ever succeeded", () => {
    expect(freshness([failed(3)], NOW, false)).toMatchObject({ state: "down", since: new Date(at(3)), lastOkAt: null });
  });

  it("recovers to fresh as soon as an ok Run follows a failure", () => {
    expect(freshness([ok(2), failed(12)], NOW, true).state).toBe("fresh");
  });

  it("doesn't depend on the order Runs arrive in", () => {
    expect(freshness([ok(31), failed(1)], NOW, true).state).toBe("down");
  });
});
