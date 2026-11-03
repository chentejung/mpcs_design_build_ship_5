import { describe, expect, it } from "vitest";
import type { Alert } from "./alerts";
import type { Market } from "./markets";
import { applyMarketUpdate, crossedAlerts, marketsFilter, splitWatchlist, toFollowed, type Followed } from "./watchlist";

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

describe("history on the Watchlist", () => {
  const t = (iso: string) => new Date(iso).getTime();
  const withHistory = followed("1", "t1", { price: 0.6, price_changed_at: "2026-11-03T11:00:00Z" });
  const items = [{ ...withHistory, history: [{ at: t("2026-11-03T11:00:00Z"), price: 0.6 }] }];

  it("appends a point when the Price changes, at the time it changed", () => {
    const next = applyMarketUpdate(items, { id: "1", price: 0.62, price_changed_at: "2026-11-03T12:00:00Z" });
    expect(next[0].history).toEqual([
      { at: t("2026-11-03T11:00:00Z"), price: 0.6 },
      { at: t("2026-11-03T12:00:00Z"), price: 0.62 },
    ]);
  });

  it("appends nothing when the Price doesn't change", () => {
    expect(applyMarketUpdate(items, { id: "1", price: "0.6000" as unknown as number })[0].history).toEqual(items[0].history);
    expect(applyMarketUpdate(items, { id: "1", closed: true })[0].history).toEqual(items[0].history);
  });

  it("starts a history for a Market that had none", () => {
    const bare = [followed("1", "t1", { price: 0.6 })];
    const next = applyMarketUpdate(bare, { id: "1", price: 0.61, price_changed_at: "2026-11-03T12:00:00Z" });
    expect(next[0].history).toEqual([{ at: t("2026-11-03T12:00:00Z"), price: 0.61 }]);
  });

  it("reads a follow's history from the joined price_history rows", () => {
    const row = {
      created_at: "t",
      markets: {
        ...market({ id: "5" }),
        recent: [{ price: 0.62, recorded_at: "2026-11-03T11:30:00Z" }],
        before: [{ price: 0.7, recorded_at: "2026-11-02T09:00:00Z" }],
      },
    };
    const [m] = toFollowed([row]);
    expect(m.history).toEqual([
      { at: t("2026-11-02T09:00:00Z"), price: 0.7 },
      { at: t("2026-11-03T11:30:00Z"), price: 0.62 },
    ]);
    expect(m).not.toHaveProperty("recent");
    expect(m).not.toHaveProperty("before");
  });
});

describe("crossedAlerts", () => {
  const alert = (over: Partial<Alert> & { id: number }): Alert => ({
    market_id: "1", direction: "above", threshold: 0.6, created_at: "t", triggered_at: null, triggered_price: null, ...over,
  });
  const items = [followed("1", "t1", { price: 0.55 }), followed("2", "t2", { price: 0.3 })];

  it("reports the above alerts the new Price reached or passed", () => {
    const alerts = [alert({ id: 1, threshold: 0.6 }), alert({ id: 2, threshold: 0.65 }), alert({ id: 3, threshold: 0.7 })];
    expect(crossedAlerts(items, alerts, { id: "1", price: 0.65 }).map((a) => a.id)).toEqual([1, 2]);
  });

  it("reports the below alerts the new Price reached or passed", () => {
    const alerts = [
      alert({ id: 1, market_id: "2", direction: "below", threshold: 0.25 }),
      alert({ id: 2, market_id: "2", direction: "below", threshold: 0.2 }),
    ];
    expect(crossedAlerts(items, alerts, { id: "2", price: "0.2500" as unknown as number }).map((a) => a.id)).toEqual([1]);
  });

  it("reports only the updated Market's alerts", () => {
    const alerts = [alert({ id: 1, market_id: "2", direction: "below", threshold: 0.4 })];
    expect(crossedAlerts(items, alerts, { id: "1", price: 0.35 })).toEqual([]);
  });

  it("doesn't report an alert that has already triggered", () => {
    const alerts = [alert({ id: 1, triggered_at: "2026-11-03T11:58:00Z", triggered_price: 0.61 })];
    expect(crossedAlerts(items, alerts, { id: "1", price: 0.65 })).toEqual([]);
  });

  it("reports nothing for a Finished Market", () => {
    const finished = [followed("1", "t1", { price: 0.55, closed: true })];
    expect(crossedAlerts(finished, [alert({ id: 1 })], { id: "1", price: 0.65 })).toEqual([]);
    expect(crossedAlerts(items, [alert({ id: 1 })], { id: "1", price: 0.65, closed: true })).toEqual([]);
  });

  it("reports nothing when the Price didn't change, even past the threshold", () => {
    const past = [followed("1", "t1", { price: 0.65 })];
    expect(crossedAlerts(past, [alert({ id: 1 })], { id: "1", price: 0.65, volume_24h: 5 })).toEqual([]);
    expect(crossedAlerts(past, [alert({ id: 1 })], { id: "1", volume_24h: 5 })).toEqual([]);
  });

  it("reports nothing for a Market that isn't followed", () => {
    expect(crossedAlerts(items, [alert({ id: 1, market_id: "9" })], { id: "9", price: 0.65 })).toEqual([]);
  });
});
