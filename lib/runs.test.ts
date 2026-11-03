import { describe, expect, it } from "vitest";
import { mergeRuns, type Run } from "./runs";

const run = (id: number): Run => ({
  id, started_at: "", finished_at: "", ok: true, skipped: false, rows_changed: 0,
  catalog_refreshed: false, warnings: [], error: null, duration_ms: 0,
});

describe("mergeRuns", () => {
  it("puts new Runs first and keeps the newest 20", () => {
    const current = Array.from({ length: 20 }, (_, i) => run(20 - i));
    const merged = mergeRuns(current, [run(21)]);
    expect(merged.map((r) => r.id).slice(0, 3)).toEqual([21, 20, 19]);
    expect(merged).toHaveLength(20);
  });

  it("drops duplicates when a refetch overlaps live inserts", () => {
    expect(mergeRuns([run(3), run(2)], [run(3), run(2), run(1)]).map((r) => r.id)).toEqual([3, 2, 1]);
  });
});
