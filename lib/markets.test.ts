import { describe, expect, it } from "vitest";
import { groupByEvent, marketLabel, toCategory, toMarket, type Market } from "./markets";

const market = (over: Partial<Market>): Market => ({
  id: "1", question: "Q?", slug: "q", image: null, category: "politics", event_id: null, event_title: null,
  group_item_title: null, outcomes: ["Yes", "No"], price: 0.5, price_changed_at: null, volume_24h: 0,
  end_date: null, closed: false, closed_at: null, ...over,
});

describe("toCategory", () => {
  it("accepts the seven Categories and defaults to politics", () => {
    expect(toCategory("sports")).toBe("sports");
    expect(toCategory("crypto")).toBe("crypto");
    expect(toCategory("finance")).toBe("finance");
    expect(toCategory("tech")).toBe("tech");
    expect(toCategory("world")).toBe("world");
    expect(toCategory("culture")).toBe("culture");
    expect(toCategory(undefined)).toBe("politics");
    expect(toCategory("weather")).toBe("politics");
    expect(toCategory(["sports"])).toBe("politics");
  });
});

describe("groupByEvent", () => {
  const house = (id: string, item: string, vol: number) =>
    market({ id, event_id: "32225", event_title: "Which party will win the House?", group_item_title: item, volume_24h: vol });

  it("puts an Event's Markets under one heading, ordered by volume", () => {
    const groups = groupByEvent([house("a", "Republican Party", 10), house("b", "Democratic Party", 30)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ title: "Which party will win the House?", showHeading: true, volume24h: 40 });
    expect(groups[0].markets.map(marketLabel)).toEqual(["Democratic Party", "Republican Party"]);
  });

  it("orders Events by total 24-hour volume", () => {
    const game = market({ id: "g", question: "Raptors vs. Clippers", event_id: "9", event_title: "Raptors vs. Clippers", volume_24h: 100 });
    const groups = groupByEvent([house("a", "R", 10), house("b", "D", 30), game]);
    expect(groups.map((g) => g.key)).toEqual(["9", "32225"]);
  });

  it("skips the heading for a one-Market Event titled like its question", () => {
    const game = market({ id: "g", question: "Raptors vs. Clippers", event_id: "9", event_title: "Raptors vs. Clippers" });
    expect(groupByEvent([game])[0].showHeading).toBe(false);
  });

  it("keeps a Market with no Event on its own", () => {
    const groups = groupByEvent([market({ id: "x", question: "Lonely?" })]);
    expect(groups[0]).toMatchObject({ key: "market-x", title: "Lonely?", showHeading: false });
  });
});

describe("toMarket", () => {
  it("turns numeric strings into numbers", () => {
    const m = toMarket(market({ price: "0.9450" as unknown as number, volume_24h: "12.5" as unknown as number }));
    expect(m.price).toBe(0.945);
    expect(m.volume_24h).toBe(12.5);
  });
});
