import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCatalogPayload,
  catalogDue,
  catalogUrl,
  chunk,
  describeList,
  finishedLookupUrl,
  parseCatalog,
  parseFinished,
  parseMarket,
  parseMidpoints,
  priceTargets,
  type CatalogRow,
  type Category,
} from "./logic.ts";

// Real responses saved on 2026-11-03 at 01:50:36Z (docs/source-notes.md).
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const NOW = new Date("2026-11-03T01:50:36Z");

const gamma = {
  politics: fixture("gamma-politics.json") as Record<string, unknown>[],
  sports: fixture("gamma-sports.json") as Record<string, unknown>[],
  crypto: fixture("gamma-crypto.json") as Record<string, unknown>[],
};
const raw = (category: Category, id: string) => {
  const m = gamma[category].find((m) => m.id === id);
  if (!m) throw new Error(`fixture ${category} has no Market ${id}`);
  return structuredClone(m);
};
const row = (category: Category, id: string) => {
  const r = parseCatalog(gamma[category], category, NOW).rows.find((r) => r.id === id);
  if (!r) throw new Error(`Market ${id} was not kept`);
  return r;
};

describe("parseCatalog on real gamma lists", () => {
  it("keeps every two-Outcome Market with an order book, minus those ending within the hour", () => {
    const politics = parseCatalog(gamma.politics, "politics", NOW);
    const sports = parseCatalog(gamma.sports, "sports", NOW);
    const crypto = parseCatalog(gamma.crypto, "crypto", NOW);

    expect(politics.rows).toHaveLength(28);
    expect(politics.skipped).toEqual({ "ending-soon": 2 });
    expect(sports.rows).toHaveLength(7);
    expect(sports.skipped).toEqual({ "ending-soon": 23 });
    expect(crypto.rows).toHaveLength(29);
    expect(crypto.skipped).toEqual({ "ending-soon": 1 });
  });

  it("reads a grouped Yes/No Market with its Event", () => {
    expect(row("politics", "562802")).toEqual({
      id: "562802",
      question: expect.stringContaining("House"),
      slug: expect.any(String),
      image: expect.stringMatching(/^https:/),
      category: "politics",
      event_id: "32225",
      event_title: "Which party will win the House in 2026?",
      group_item_title: "Democratic Party",
      outcomes: ["Yes", "No"],
      token_id: expect.stringMatching(/^\d+$/),
      price: 0.945,
      volume_24h: expect.any(Number),
      end_date: "2026-11-04T04:59:00.000Z",
      closed: false,
      in_catalog: true,
    } satisfies CatalogRow);
  });

  it("keeps team names as the Outcomes, first team first", () => {
    const r = row("sports", "6293071");
    expect(r.outcomes).toEqual(["Raptors", "Clippers"]);
    expect(r.price).toBe(0.625);
    expect(r.group_item_title).toBeNull();
    expect(r.event_title).toBe("Raptors vs. Clippers");
  });

  it("keeps Up/Down and Over/Under Markets", () => {
    expect(row("crypto", "6537245").outcomes).toEqual(["Up", "Down"]);
    // The Over/Under game had kicked off by NOW, so read it as of that morning.
    const morning = new Date("2026-11-02T12:00:00Z");
    const ou = parseCatalog(gamma.sports, "sports", morning).rows.find((r) => r.id === "5658520");
    expect(ou?.outcomes).toEqual(["Over", "Under"]);
    expect(ou?.group_item_title).toBe("O/U 46.5");
  });

  it("uses the first Outcome's token, matching clobTokenIds[0]", () => {
    const m = raw("politics", "562802");
    expect(row("politics", "562802").token_id).toBe(JSON.parse(m.clobTokenIds as string)[0]);
  });

  it("drops a Market ending within the hour, including one already past its end date", () => {
    expect(parseMarket(raw("sports", "5647429"), "sports", { now: NOW, inCatalog: true })).toBe("ending-soon");
    expect(parseMarket(raw("politics", "682705"), "politics", { now: NOW, inCatalog: true })).toBe("ending-soon");
  });

  it("throws if gamma doesn't return a list", () => {
    expect(() => parseCatalog({ error: "rate limited" }, "politics", NOW)).toThrow(/not a list/);
  });
});

describe("parseMarket skips malformed fields whole", () => {
  const base = () => raw("politics", "562802");
  const parse = (m: unknown) => parseMarket(m, "politics", { now: NOW, inCatalog: true });

  it.each([
    ["outcomes isn't JSON", { outcomes: "[Yes, No" }],
    ["outcomes is a real array, not a JSON string", { outcomes: ["Yes", "No"] }],
    ["clobTokenIds is missing", { clobTokenIds: undefined }],
    ["clobTokenIds holds numbers", { clobTokenIds: "[1, 2]" }],
    ["an Outcome name is empty", { outcomes: '["", "No"]' }],
    ["outcomePrices isn't JSON", { outcomePrices: "0.5,0.5" }],
    ["outcomePrices[0] is outside 0–1", { outcomePrices: '["1.5", "-0.5"]' }],
    ["outcomePrices[0] isn't a number", { outcomePrices: '["abc", "0.5"]' }],
    ["question is missing", { question: undefined }],
    ["slug is empty", { slug: "" }],
  ])("%s → malformed", (_, patch) => {
    expect(parse({ ...base(), ...patch })).toBe("malformed");
  });

  it("not an object → malformed", () => {
    expect(parse(null)).toBe("malformed");
    expect(parse("562802")).toBe("malformed");
  });

  it("three Outcomes → not-two-outcomes", () => {
    expect(parse({
      ...base(),
      outcomes: '["A", "B", "C"]',
      clobTokenIds: '["1", "2", "3"]',
      outcomePrices: '["0.3", "0.3", "0.4"]',
    })).toBe("not-two-outcomes");
  });

  it("no order book → no-order-book", () => {
    expect(parse({ ...base(), enableOrderBook: false })).toBe("no-order-book");
  });

  it("missing outcomePrices is fine: the CLOB fills the Price", () => {
    const r = parse({ ...base(), outcomePrices: undefined });
    expect(typeof r === "object" && r.price).toBeNull();
  });

  it("a malformed Market in a list is counted, and the rest are kept", () => {
    const list = [{ ...base(), outcomes: "oops" }, raw("politics", "562803")];
    const result = parseCatalog(list, "politics", NOW);
    expect(result.rows.map((r) => r.id)).toEqual(["562803"]);
    expect(result.skipped).toEqual({ malformed: 1 });
    expect(describeList("politics", result)).toBe("politics 1 (skipped malformed 1)");
  });
});

describe("parseFinished on a real closed=true id lookup", () => {
  const finished = fixture("gamma-finished-by-id.json") as { id: string }[];
  const categories = new Map<string, Category>(finished.map((m) => [m.id, "crypto"]));

  it("returns the Finished Markets with their frozen final Price, outside the Catalog", () => {
    const result = parseFinished(finished, categories, NOW);
    expect(result.rows).toHaveLength(2);
    for (const r of result.rows) {
      expect(r.closed).toBe(true);
      expect(r.in_catalog).toBe(false);
      expect(r.category).toBe("crypto");
      expect(r.price).toBe(0);
    }
  });

  it("ignores Markets we don't follow and any that aren't closed", () => {
    const open = raw("politics", "562802");
    const result = parseFinished([...finished, open], new Map([[finished[0].id, "crypto"], ["562802", "politics"]]), NOW);
    expect(result.rows.map((r) => r.id)).toEqual([finished[0].id]);
    expect(result.skipped).toEqual({ malformed: 1 });
  });
});

describe("buildCatalogPayload", () => {
  it("lists only the Categories fetched, and keeps the first copy of a Market in two lists", () => {
    const a = row("politics", "562802");
    const b = { ...a, category: "crypto" as const };
    const payload = buildCatalogPayload([{ category: "politics", rows: [a] }, { category: "crypto", rows: [b] }], []);
    expect(payload.categories).toEqual(["politics", "crypto"]);
    expect(payload.markets).toEqual([a]);
  });
});

describe("parseMidpoints on real CLOB responses", () => {
  const request = fixture("clob-midpoints-request.json") as { token_id: string }[];
  const tokens = new Map(request.map((t, i) => [t.token_id, `market-${i}`]));

  it("maps every token to its Market's Price", () => {
    const { prices, rejected } = parseMidpoints(fixture("clob-midpoints-a.json"), tokens);
    expect(prices).toHaveLength(90);
    expect(rejected).toBe(0);
    for (const p of prices) expect(p.price).toBeGreaterThanOrEqual(0);
    for (const p of prices) expect(p.price).toBeLessThanOrEqual(1);
  });

  it("finds the 23 Prices that changed between the two snapshots", () => {
    const a = new Map(parseMidpoints(fixture("clob-midpoints-a.json"), tokens).prices.map((p) => [p.id, p.price]));
    const b = parseMidpoints(fixture("clob-midpoints-b.json"), tokens).prices;
    expect(b.filter((p) => a.get(p.id) !== p.price)).toHaveLength(23);
  });

  it("rejects values outside 0–1, non-numbers and tokens we didn't ask for", () => {
    const [t1, t2, t3, t4, t5] = request.map((t) => t.token_id);
    const { prices, rejected } = parseMidpoints(
      { [t1]: "0.62", [t2]: "1.5", [t3]: "-0.01", [t4]: "abc", [t5]: "", unknown: "0.5" },
      tokens,
    );
    expect(prices).toEqual([{ id: "market-0", price: 0.62 }]);
    expect(rejected).toBe(5);
  });

  it("throws if CLOB doesn't return an object", () => {
    expect(() => parseMidpoints([], tokens)).toThrow(/not an object/);
    expect(() => parseMidpoints(null, tokens)).toThrow(/not an object/);
  });
});

describe("priceTargets", () => {
  it("prices Catalog and followed Markets, never Finished ones", () => {
    const targets = priceTargets([
      { id: "catalog", token_id: "t1", closed: false, in_catalog: true },
      { id: "followed", token_id: "t2", closed: false, in_catalog: false },
      { id: "dropped", token_id: "t3", closed: false, in_catalog: false },
      { id: "finished", token_id: "t4", closed: true, in_catalog: false },
    ], new Set(["followed", "finished"]));
    expect([...targets]).toEqual([["t1", "catalog"], ["t2", "followed"]]);
  });
});

describe("schedule and URLs", () => {
  it("refreshes the Catalog when it never was, or ≥ 5 minutes ago", () => {
    expect(catalogDue(null, NOW)).toBe(true);
    expect(catalogDue(new Date(NOW.getTime() - 299_000), NOW)).toBe(false);
    expect(catalogDue(new Date(NOW.getTime() - 300_000), NOW)).toBe(true);
  });

  it("builds the gamma URLs", () => {
    expect(catalogUrl({ tagId: 1, limit: 100 })).toBe(
      "https://gamma-api.polymarket.com/markets?tag_id=1&active=true&closed=false&order=volume24hr&ascending=false&limit=100",
    );
    expect(finishedLookupUrl(["1", "2"])).toBe("https://gamma-api.polymarket.com/markets?closed=true&limit=2&id=1&id=2");
  });

  it("chunks", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 100)).toEqual([]);
  });
});
