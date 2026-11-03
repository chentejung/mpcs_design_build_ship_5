import { describe, expect, it } from "vitest";
import { recap, recapStart, RECAP_THRESHOLD_POINTS, toPricesAtVisit } from "./recap";
import type { Followed } from "./watchlist";

const NOW = new Date("2026-11-03T12:00:00.000Z");
const LAST_VISIT = "2026-11-03T08:00:00.000Z";

function market(over: Partial<Followed> & { id: string }): Followed {
  return {
    question: `Question ${over.id}?`,
    slug: `q-${over.id}`,
    image: null,
    category: "politics",
    event_id: null,
    event_title: null,
    group_item_title: null,
    outcomes: ["Yes", "No"],
    price: 0.62,
    price_changed_at: "2026-11-03T11:00:00.000Z",
    volume_24h: 1000,
    end_date: "2026-12-01T00:00:00.000Z",
    closed: false,
    closed_at: null,
    followed_at: "2026-11-01T00:00:00.000Z",
    ...over,
  } as Followed;
}

describe("recap", () => {
  it("is none on a first visit", () => {
    expect(recap({ items: [market({ id: "1" })], lastSeenAt: null, pricesAtVisit: {}, now: NOW })).toEqual({ kind: "none" });
  });

  it("is quiet when nothing moved at least 2 displayed Chance points", () => {
    const r = recap({
      items: [market({ id: "1", price: 0.62 }), market({ id: "2", price: 0.4 })],
      lastSeenAt: LAST_VISIT,
      // 60.5 → 62 is 1.5 points; 41.9 → 40 is 1.9 points.
      pricesAtVisit: { "1": 0.605, "2": 0.419 },
      now: NOW,
    });
    expect(r).toEqual({ kind: "quiet", since: LAST_VISIT, capped: false });
  });

  it("counts a move by the displayed (rounded) Chance, so exactly 2 points counts", () => {
    expect(RECAP_THRESHOLD_POINTS).toBe(2);
    // 0.60049 shows as 60, 0.62 as 62: a 2-point move on screen.
    const r = recap({ items: [market({ id: "1", price: 0.62 })], lastSeenAt: LAST_VISIT, pricesAtVisit: { "1": 0.60049 }, now: NOW });
    expect(r.kind).toBe("moved");
  });

  it("lists Markets that moved at least 2 points with literal from → to, biggest move first", () => {
    const r = recap({
      items: [
        market({ id: "1", price: 0.62, group_item_title: "Democratic Party" }),
        market({ id: "2", price: 0.3, outcomes: ["Hawks", "Pacers"] }),
        market({ id: "3", price: 0.5 }),
      ],
      lastSeenAt: LAST_VISIT,
      pricesAtVisit: { "1": 0.5, "2": 0.45, "3": 0.5 },
      now: NOW,
    });
    expect(r).toEqual({
      kind: "moved",
      since: LAST_VISIT,
      capped: false,
      entries: [
        { id: "2", label: "Question 2?", outcomes: ["Hawks", "Pacers"], from: 0.45, to: 0.3, points: -15, dir: "down" },
        { id: "1", label: "Democratic Party", outcomes: ["Yes", "No"], from: 0.5, to: 0.62, points: 12, dir: "up" },
      ],
      finished: [],
    });
  });

  it("takes an unchanged Price as the Price at the last visit when no history row is that old", () => {
    const quiet = recap({
      items: [market({ id: "1", price: 0.7, price_changed_at: "2026-11-02T00:00:00.000Z" })],
      lastSeenAt: LAST_VISIT,
      pricesAtVisit: {},
      now: NOW,
    });
    expect(quiet.kind).toBe("quiet");
  });

  it("skips a Market whose Price at the last visit is unknown, and one followed since", () => {
    const r = recap({
      items: [
        market({ id: "1", price: 0.9 }), // moved since, but no history that old
        market({ id: "2", price: 0.9, followed_at: "2026-11-03T10:00:00.000Z" }),
      ],
      lastSeenAt: LAST_VISIT,
      pricesAtVisit: { "2": 0.1 },
      now: NOW,
    });
    expect(r.kind).toBe("quiet");
  });

  it("includes Markets that became Finished since the last visit, with their final split", () => {
    const r = recap({
      items: [
        market({ id: "1", price: 0.99, closed: true, closed_at: "2026-11-03T10:00:00.000Z" }),
        market({ id: "2", price: 0.2, closed: true, closed_at: "2026-11-02T10:00:00.000Z" }), // Finished before
      ],
      lastSeenAt: LAST_VISIT,
      pricesAtVisit: { "1": 0.985, "2": 0.5 },
      now: NOW,
    });
    expect(r).toEqual({
      kind: "moved",
      since: LAST_VISIT,
      capped: false,
      entries: [],
      finished: [{ id: "1", label: "Question 1?", outcomes: ["Yes", "No"], from: 0.985, to: 0.99, points: 0.5, dir: "up" }],
    });
  });

  it("flags a last visit more than 7 days ago, and compares from 7 days back", () => {
    const longAgo = "2026-10-20T12:00:00.000Z";
    expect(recapStart(longAgo, NOW)).toBe("2026-10-27T12:00:00.000Z");
    expect(recapStart(LAST_VISIT, NOW)).toBe(LAST_VISIT);
    const old = market({ id: "1", price: 0.62, followed_at: "2026-10-01T00:00:00.000Z" });
    const r = recap({ items: [old], lastSeenAt: longAgo, pricesAtVisit: { "1": 0.4 }, now: NOW });
    expect(r).toMatchObject({ kind: "moved", since: longAgo, capped: true });
    const quiet = recap({ items: [old], lastSeenAt: longAgo, pricesAtVisit: { "1": 0.62 }, now: NOW });
    expect(quiet).toEqual({ kind: "quiet", since: longAgo, capped: true });
  });
});

describe("toPricesAtVisit", () => {
  it("keeps each Market's Price at the last visit, as a number, and skips Markets without one", () => {
    expect(toPricesAtVisit([
      { market_id: "1", markets: { at_visit: [{ price: "0.5" as unknown as number, recorded_at: LAST_VISIT }] } },
      { market_id: "2", markets: { at_visit: [] } },
      { market_id: "3", markets: { at_visit: null } },
      { market_id: "4", markets: { at_visit: [{ price: Number.NaN, recorded_at: LAST_VISIT }] } },
    ])).toEqual({ "1": 0.5 });
  });
});
