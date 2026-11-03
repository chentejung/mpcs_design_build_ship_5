import { describe, expect, it } from "vitest";
import type { Market } from "./markets";
import { applyMarketUpdate, marketsFilter, splitWatchlist, toFollowed, type Followed } from "./watchlist";

const market = (over: Partial<Market>): Market => ({
  id: "1", question: "Q?", slug: "q", image: null, category: "politics", event_id: null, event_title: null,
  group_item_title: null, outcomes: ["Yes", "No"], price: 0.5, price_changed_at: null, volume_24h: 0,
  end_date: null, closed: false, closed_at: null, ...over,
});
const followed = (id: string, at: string, over: Partial<Market> = {}): Followed => ({ ...market({ id, ...over }), followed_at: at });

describe("splitWatchlist", () => {
  it("lists live Markets in Follow order and Finished ones after, latest ended first", () => {
    const { live, finished } = splitWatchlist([
      followed("c", "2026-11-03T10:00:00Z"),
      followed("a", "2026-11-03T08:00:00Z"),
      followed("x", "2026-11-03T07:00:00Z", { closed: true, closed_at: "2026-11-03T12:00:00Z" }),
      followed("y", "2026-11-03T09:00:00Z", { closed: true, closed_at: "2026-11-03T13:00:00Z" }),
      followed("b", "2026-11-03T09:00:00Z"),
    ]);
    expect(live.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(finished.map((m) => m.id)).toEqual(["y", "x"]);
  });
});

describe("applyMarketUpdate", () => {
  const items = [followed("1", "t1", { price: 0.5 }), followed("2", "t2", { price: 0.3 })];

  it("updates the followed Market's Price (numeric strings included) and keeps its Follow time", () => {
    const next = applyMarketUpdate(items, { id: "2", price: "0.3150" as unknown as number, price_changed_at: "now" });
    expect(next[1]).toMatchObject({ id: "2", price: 0.315, price_changed_at: "now", followed_at: "t2" });
    expect(next[0]).toBe(items[0]);
  });

  it("records a move of the displayed Chance, and replays it on the next move", () => {
    const up = applyMarketUpdate(items, { id: "1", price: 0.51 });
    expect(up[0].move).toEqual({ dir: "up", seq: 1 });
    const down = applyMarketUpdate(up, { id: "1", price: 0.49 });
    expect(down[0].move).toEqual({ dir: "down", seq: 2 });
  });

  it("doesn't flash for a change under 0.1 point", () => {
    expect(applyMarketUpdate(items, { id: "1", price: 0.5004 })[0].move).toBeUndefined();
  });

  it("moves a Market to Finished when it closes", () => {
    const next = applyMarketUpdate(items, { id: "1", closed: true, closed_at: "2026-11-03T12:00:00Z" });
    expect(splitWatchlist(next).finished.map((m) => m.id)).toEqual(["1"]);
  });

  it("ignores Markets that aren't followed", () => {
    expect(applyMarketUpdate(items, { id: "9", price: 0.9 })).toEqual(items);
  });
});

describe("marketsFilter and toFollowed", () => {
  it("builds the Realtime filter", () => {
    expect(marketsFilter(["562802", "6537245"])).toBe("id=in.(562802,6537245)");
    expect(marketsFilter([])).toBeNull();
  });

  it("flattens follows joined to markets", () => {
    expect(toFollowed([{ created_at: "t", markets: market({ id: "5" }) }])[0]).toMatchObject({ id: "5", followed_at: "t" });
  });
});
