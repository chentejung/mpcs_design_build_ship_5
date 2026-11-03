import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Market } from "./markets";
import { COUNTRIES, groupByPlace, placeInfo, REGIONS, sharedArcs, type PlacedMarket } from "./places";

function market(over: Partial<PlacedMarket> & { id: string }): PlacedMarket {
  const base: Market = {
    id: over.id,
    question: `Question ${over.id}?`,
    slug: `q-${over.id}`,
    image: null,
    category: "world",
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
  };
  return { ...base, places: [], ...over };
}

describe("placeInfo", () => {
  it("names and positions countries and regions", () => {
    expect(placeInfo("IR")).toEqual({ code: "IR", name: "Iran", kind: "country", lat: 32.2, lng: 54.9 });
    expect(placeInfo("US")).toEqual({ code: "US", name: "United States", kind: "country", lat: 39.5, lng: -97.5 });
    expect(placeInfo("region:middle-east")).toEqual({ code: "region:middle-east", name: "Middle East", kind: "region", lat: 29, lng: 45 });
    expect(placeInfo("SG")?.name).toBe("Singapore");
    expect(placeInfo("ZZ")).toBeNull();
  });

  it("has every region code the worker uses", () => {
    expect(Object.keys(REGIONS).sort()).toEqual([
      "region:africa",
      "region:asia",
      "region:europe",
      "region:latin-america",
      "region:middle-east",
      "region:north-america",
      "region:oceania",
    ]);
  });

  it("has a position for every country shape in the static GeoJSON", () => {
    const geo = JSON.parse(readFileSync(new URL("../public/geo/countries-110m.json", import.meta.url), "utf8")) as {
      features: { properties: { ISO_A2: string | null; NAME: string } }[];
    };
    const codes = geo.features.map((f) => f.properties.ISO_A2).filter((c): c is string => c !== null);
    expect(codes.length).toBeGreaterThan(170);
    expect(codes.filter((c) => !COUNTRIES[c])).toEqual([]);
    for (const [, lat, lng] of Object.values(COUNTRIES)) {
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(lng)).toBeLessThanOrEqual(180);
    }
  });
});

describe("groupByPlace", () => {
  it("groups Markets by country and region, busiest place first, with counts and volume", () => {
    const { places, global } = groupByPlace([
      market({ id: "1", places: ["IR"], volume_24h: 100 }),
      market({ id: "2", places: ["IR", "IL", "region:middle-east"], volume_24h: 300 }),
      market({ id: "3", places: ["US"], volume_24h: 250 }),
      market({ id: "4", places: [], volume_24h: 900 }),
    ]);
    expect(places.map((p) => [p.code, p.name, p.kind, p.count, p.volume24h, p.markets.map((m) => m.id)])).toEqual([
      ["IR", "Iran", "country", 2, 400, ["2", "1"]],
      ["IL", "Israel", "country", 1, 300, ["2"]],
      ["region:middle-east", "Middle East", "region", 1, 300, ["2"]],
      ["US", "United States", "country", 1, 250, ["3"]],
    ]);
    expect(places[0]).toMatchObject({ lat: 32.2, lng: 54.9 });
    expect(global).toMatchObject({ code: "global", name: "Global", kind: "global", lat: null, lng: null, count: 1, volume24h: 900 });
    expect(global.markets.map((m) => m.id)).toEqual(["4"]);
  });

  it("treats a Market without places, or with only unknown codes, as Global", () => {
    const { places, global } = groupByPlace([
      market({ id: "1", places: null }),
      { ...market({ id: "2" }), places: undefined },
      market({ id: "3", places: ["ZZ"] }),
      market({ id: "4", places: ["ZZ", "FR"] }),
    ]);
    expect(global.markets.map((m) => m.id)).toEqual(["1", "2", "3"]);
    expect(places.map((p) => [p.code, p.markets.map((m) => m.id)])).toEqual([["FR", ["4"]]]);
  });

  it("counts a Market once per place even if its list repeats a code", () => {
    const { places } = groupByPlace([market({ id: "1", places: ["GB", "GB"], volume_24h: 5 })]);
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({ count: 1, volume24h: 5 });
  });

  it("breaks ties by code", () => {
    const { places } = groupByPlace([
      market({ id: "1", places: ["JP"], volume_24h: 10 }),
      market({ id: "2", places: ["CN"], volume_24h: 10 }),
    ]);
    expect(places.map((p) => p.code)).toEqual(["CN", "JP"]);
  });

  it("is empty for no Markets", () => {
    const { places, global } = groupByPlace([]);
    expect(places).toEqual([]);
    expect(global.count).toBe(0);
  });
});

describe("sharedArcs", () => {
  it("links the places each Market shares, busiest first", () => {
    expect(
      sharedArcs([
        market({ id: "1", places: ["US", "IR"], volume_24h: 500 }),
        market({ id: "2", places: ["IL", "IR"], volume_24h: 900 }),
      ]),
    ).toEqual([
      { from: "IL", to: "IR", volume: 900, count: 1 },
      { from: "IR", to: "US", volume: 500, count: 1 },
    ]);
  });

  it("merges the same pair whatever order the places come in", () => {
    expect(
      sharedArcs([
        market({ id: "1", places: ["US", "IR"], volume_24h: 500 }),
        market({ id: "2", places: ["IR", "US", "IR"], volume_24h: 250 }),
      ]),
    ).toEqual([{ from: "IR", to: "US", volume: 750, count: 2 }]);
  });

  it("links every pair of a Market's places, regions included, and skips unknown codes", () => {
    expect(sharedArcs([market({ id: "1", places: ["IR", "region:middle-east", "ZZ", "IL"], volume_24h: 100 })])).toEqual([
      { from: "IL", to: "IR", volume: 100, count: 1 },
      { from: "IL", to: "region:middle-east", volume: 100, count: 1 },
      { from: "IR", to: "region:middle-east", volume: 100, count: 1 },
    ]);
  });

  it("gives none for Global and single-place Markets", () => {
    expect(
      sharedArcs([
        market({ id: "1", places: [], volume_24h: 900 }),
        market({ id: "2", places: ["US"], volume_24h: 900 }),
        market({ id: "3", places: ["US", "ZZ"], volume_24h: 900 }),
        market({ id: "4", places: null, volume_24h: 900 }),
      ]),
    ).toEqual([]);
  });

  it("keeps only the busiest arcs, at most 15 by default", () => {
    const others = Object.keys(COUNTRIES).filter((c) => c !== "US");
    const many = Array.from({ length: 20 }, (_, i) => market({ id: String(i), places: ["US", others[i]], volume_24h: 1000 - i }));
    const arcs = sharedArcs(many);
    expect(arcs).toHaveLength(15);
    expect(arcs[0].volume).toBe(1000);
    expect(arcs[14].volume).toBe(986);
    expect(sharedArcs(many, 2).map((a) => a.volume)).toEqual([1000, 999]);
  });
});
