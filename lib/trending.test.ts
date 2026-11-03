import { describe, expect, it } from "vitest";
import type { Market } from "./markets";
import { trendingTopics } from "./trending";

function market(over: Partial<Market> & { id: string }): Market {
  return {
    question: `Question ${over.id}?`,
    slug: `q-${over.id}`,
    image: null,
    category: "politics",
    event_id: null,
    event_title: null,
    group_item_title: null,
    outcomes: ["Yes", "No"],
    price: 0.5,
    price_changed_at: null,
    volume_24h: 0,
    end_date: null,
    closed: false,
    closed_at: null,
    ...over,
  };
}

describe("trendingTopics", () => {
  it("sums each Event's 24-hour volume and leads with its busiest Market", () => {
    const topics = trendingTopics([
      market({ id: "1", event_id: "e1", event_title: "Senate control", group_item_title: "Democrats", volume_24h: 300 }),
      market({ id: "2", event_id: "e1", event_title: "Senate control", group_item_title: "Republicans", volume_24h: 500, image: "https://x/r.png" }),
      market({ id: "3", question: "Will BTC hit $200k?", category: "crypto", volume_24h: 700 }),
    ]);
    expect(topics.map((t) => [t.key, t.title, t.volume24h, t.lead.id, t.marketCount])).toEqual([
      ["e1", "Senate control", 800, "2", 2],
      ["market-3", "Will BTC hit $200k?", 700, "3", 1],
    ]);
    expect(topics[0].image).toBe("https://x/r.png");
    expect(topics[0].href).toBe("/browse?category=politics");
    expect(topics[1].href).toBe("/browse?category=crypto");
    expect(topics[1].category).toBe("crypto");
    expect(topics[1].image).toBeNull();
  });

  it("takes the image from the busiest Market that has one", () => {
    const [t] = trendingTopics([
      market({ id: "1", event_id: "e", volume_24h: 900 }),
      market({ id: "2", event_id: "e", volume_24h: 50, image: "https://x/b.png" }),
      market({ id: "3", event_id: "e", volume_24h: 100, image: "https://x/a.png" }),
    ]);
    expect(t.image).toBe("https://x/a.png");
  });

  it("returns the top 5, ties broken by id", () => {
    const topics = trendingTopics([
      market({ id: "a", volume_24h: 10 }),
      market({ id: "c", volume_24h: 60 }),
      market({ id: "b", volume_24h: 60 }),
      market({ id: "d", volume_24h: 40 }),
      market({ id: "e", volume_24h: 30 }),
      market({ id: "f", volume_24h: 20 }),
      market({ id: "g", volume_24h: null }),
    ]);
    expect(topics.map((t) => t.key)).toEqual(["market-b", "market-c", "market-d", "market-e", "market-f"]);
  });

  it("leaves out Finished Markets and Markets outside the Catalog", () => {
    const topics = trendingTopics([
      market({ id: "1", volume_24h: 900, closed: true }),
      { ...market({ id: "2", volume_24h: 800 }), in_catalog: false },
      market({ id: "3", volume_24h: 10 }),
    ]);
    expect(topics.map((t) => t.key)).toEqual(["market-3"]);
  });

  it("names a lone Market by its group item when it has no Event title", () => {
    const [t] = trendingTopics([market({ id: "1", question: "Will X?", group_item_title: "X" })]);
    expect(t.title).toBe("X");
  });

  it("is empty when there are no Markets", () => {
    expect(trendingTopics([])).toEqual([]);
  });
});
