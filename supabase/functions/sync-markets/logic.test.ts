import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCatalogPayload,
  CATALOG_LISTS,
  catalogDue,
  catalogUrl,
  chunk,
  describeList,
  describePlaces,
  finishedLookupUrl,
  parseCatalog,
  parseFinished,
  parseMarket,
  parseMidpoints,
  parseTags,
  placesOf,
  priceTargets,
  REGIONS,
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
  it("keeps every two-Outcome Market with an order book, including games in play", () => {
    // At NOW, 23 Sports games had kicked off (endDate = kickoff) and were still trading.
    expect(parseCatalog(gamma.politics, "politics", NOW)).toMatchObject({ skipped: {} });
    expect(parseCatalog(gamma.politics, "politics", NOW).rows).toHaveLength(30);
    expect(parseCatalog(gamma.sports, "sports", NOW).rows).toHaveLength(30);
    expect(parseCatalog(gamma.crypto, "crypto", NOW).rows).toHaveLength(30);
  });

  it("drops Markets ending within the next hour", () => {
    // 45 min before the Bears vs. Seahawks kickoff (01:15Z), its game Markets end within the hour.
    const before = new Date("2026-11-03T00:30:00Z");
    const sports = parseCatalog(gamma.sports, "sports", before);
    expect(sports.rows.map((r) => r.id)).not.toContain("5647429");
    expect(sports.skipped["ending-soon"]).toBeGreaterThan(0);
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
      // The 01:50Z fixtures were saved without include_tag, and the text names no country.
      places: [],
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
    const ou = parseCatalog(gamma.sports, "sports", NOW).rows.find((r) => r.id === "5658520");
    expect(ou?.outcomes).toEqual(["Over", "Under"]);
    expect(ou?.group_item_title).toBe("O/U 46.5");
  });

  it("uses the first Outcome's token, matching clobTokenIds[0]", () => {
    const m = raw("politics", "562802");
    expect(row("politics", "562802").token_id).toBe(JSON.parse(m.clobTokenIds as string)[0]);
  });

  it("drops a Market 45 min from its end, but keeps one past its end date that's still trading", () => {
    const before = new Date("2026-11-03T00:30:00Z");
    expect(parseMarket(raw("sports", "5647429"), "sports", { now: before, inCatalog: true })).toBe("ending-soon");
    const inPlay = parseMarket(raw("sports", "5647429"), "sports", { now: NOW, inCatalog: true });
    expect(typeof inPlay === "object" && inPlay.outcomes).toEqual(["Bears", "Seahawks"]);
    const pastEnd = parseMarket(raw("politics", "682705"), "politics", { now: NOW, inCatalog: true });
    expect(typeof pastEnd === "object" && pastEnd.id).toBe("682705");
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

// The four newer Category lists, saved on 2026-11-03 at 16:16:54Z.
const NOW_V2 = new Date("2026-11-03T16:16:54Z");
const fixtureFor = (category: string) => fixture(`gamma-${category}.json`);

describe("the Catalog's seven Category lists, from real gamma responses", () => {
  const parsed = CATALOG_LISTS.map((l) => ({
    category: l.category,
    rows: parseCatalog(fixtureFor(l.category), l.category, ["politics", "sports", "crypto"].includes(l.category) ? NOW : NOW_V2).rows,
  }));

  it("fetches Politics, Sports, Crypto, Finance, Tech, World and Culture, in that order", () => {
    expect(CATALOG_LISTS.map((l) => [l.category, l.tagId])).toEqual([
      ["politics", 2], ["sports", 1], ["crypto", 21], ["finance", 120], ["tech", 1401], ["world", 100265], ["culture", 596],
    ]);
  });

  it("keeps two-Outcome Markets with an order book from each new list", () => {
    for (const c of ["finance", "tech", "world", "culture"]) {
      const rows = parsed.find((p) => p.category === c)!.rows;
      expect(rows.length, c).toBeGreaterThan(20);
      expect(rows.every((r) => r.category === c && r.outcomes.length === 2 && r.token_id), c).toBe(true);
    }
  });

  it("lists a Market in two Categories once, under the earlier Category", () => {
    const payload = buildCatalogPayload(parsed, []);
    expect(payload.categories).toEqual(["politics", "sports", "crypto", "finance", "tech", "world", "culture"]);
    const categoryOf = (id: string) => payload.markets.filter((m) => m.id === id).map((m) => m.category);
    // "Will the U.S. invade Iran before 2027?" is in both the Politics and World lists.
    expect(categoryOf("665374")).toEqual(["politics"]);
    // "Will Crude Oil reach a new all-time high by December 31?" is in both Finance and World.
    expect(categoryOf("2126461")).toEqual(["finance"]);
    expect(new Set(payload.markets.map((m) => m.id)).size).toBe(payload.markets.length);
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
      "https://gamma-api.polymarket.com/markets?tag_id=1&active=true&closed=false&order=volume24hr&ascending=false&limit=100&include_tag=true",
    );
    expect(finishedLookupUrl(["1", "2"])).toBe("https://gamma-api.polymarket.com/markets?closed=true&include_tag=true&limit=2&id=1&id=2");
  });

  it("chunks", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 100)).toEqual([]);
  });
});

// Real responses with include_tag=true, saved on 2026-11-03 at 19:26:44Z (fixtures/captured-at.txt).
const NOW_TAGS = new Date("2026-11-03T19:26:44Z");
const tagged = (category: Category) => fixture(`tags/gamma-${category}.json`) as Record<string, unknown>[];
const taggedRow = (category: Category, id: string) => {
  const r = parseCatalog(tagged(category), category, NOW_TAGS).rows.find((r) => r.id === id);
  if (!r) throw new Error(`Market ${id} was not kept`);
  return r;
};
const tags = (...labels: string[]) => labels.map((label) => ({ label, slug: label.toLowerCase().replace(/ /g, "-") }));

describe("places, from gamma's tags", () => {
  it("World Markets get their countries and regions", () => {
    // "Will the U.S. invade Iran before 2027?": U.S. x Iran, Iran, Trump, Israel, Middle East, …
    expect(taggedRow("world", "665374").places).toEqual(["IL", "IR", "US", "region:middle-east"]);
    // "Will Benjamin Netanyahu be the next Prime Minister of Israel?": Israel Election, Israel, Trump-Netanyahu, …
    expect(taggedRow("world", "682705").places).toEqual(["IL", "US", "region:middle-east"]);
  });

  it("a Politics Market with US election tags is US", () => {
    expect(taggedRow("politics", "562802").places).toEqual(["US"]);
    // "Texas Senate", "Texas Midterm", "United States", …
    expect(taggedRow("politics", "630964").places).toEqual(["US"]);
  });

  it("a Sports Market is placed by its league's home", () => {
    expect(taggedRow("sports", "2772194").places).toEqual(["region:europe"]); // UCL: will Shakhtar Donetsk win it?
    expect(taggedRow("sports", "6490417").places).toEqual(["SA"]); // Saudi Professional League
    expect(taggedRow("sports", "5406742").places).toEqual(["CA", "US"]); // NHL: Avalanche vs. Blue Jackets
    expect(taggedRow("sports", "6539722").places).toEqual([]); // Tennis at the Paris Masters: Paris isn't a country
  });

  it("a Crypto Market stays Global", () => {
    expect(taggedRow("crypto", "6346616").places).toEqual([]); // Bitcoin above $78,000 on November 4?
  });

  it("a multi-country tag gives both countries", () => {
    expect(placesOf(tags("Israel x Iran"), [])).toEqual(["IL", "IR"]);
    expect(placesOf(tags("U.S. x Iran"), [])).toEqual(["IR", "US"]);
  });

  it("matches labels case-insensitively, falls back to the slug, and pins US states", () => {
    expect(placesOf([{ label: "MIDDLE EAST", slug: "" }], [])).toEqual(["region:middle-east"]);
    expect(placesOf([{ label: "Diplomacy", slug: "diplomacy" }, { label: "?", slug: "trump-iran" }], []))
      .toEqual(["IR", "US"]);
    expect(placesOf(tags("Texas Midterm", "Michigan Senate", "Massachusetts"), [])).toEqual(["US"]);
    expect(placesOf(tags("Georgia Senate"), [])).toEqual(["US"]);
    expect(placesOf(tags("Georgia"), [])).toEqual([]); // the country or the state? Neither.
    expect(placesOf(tags("Premier League", "La Liga", "Champions League", "IPL"), []))
      .toEqual(["ES", "GB", "IN", "region:europe"]);
    expect(placesOf(tags("constructor", "toString"), [])).toEqual([]);
  });

  it("uses only codes from the vocabulary: ISO alpha-2 or a known region, sorted and de-duplicated", () => {
    for (const c of CATALOG_LISTS.map((l) => l.category)) {
      for (const r of parseCatalog(tagged(c), c, NOW_TAGS).rows) {
        for (const p of r.places) {
          expect(/^[A-Z]{2}$/.test(p) || (REGIONS as readonly string[]).includes(p), `${r.id} ${p}`).toBe(true);
        }
        expect(r.places, r.id).toEqual([...new Set(r.places)].sort());
      }
    }
  });

  it("places every World and Politics Market in the fixtures", () => {
    for (const c of ["world", "politics"] as const) {
      const unplaced = parseCatalog(tagged(c), c, NOW_TAGS).rows.filter((r) => r.places.length === 0);
      expect(unplaced.map((r) => r.question), c).toEqual([]);
    }
  });
});

describe("places, falling back to the Market's text", () => {
  it("reads country names when no tag gives a place", () => {
    // "Will the US confirm that aliens exist before 2027?" is tagged only Politics, Aliens, Science, Culture.
    expect(taggedRow("culture", "703257").places).toEqual(["US"]);
    expect(placesOf(tags("Politics"), ["Will Russia and Ukraine sign a ceasefire?", null])).toEqual(["RU", "UA"]);
    expect(placesOf([], [null, "Next Iranian Supreme Leader?", "South Korea"])).toEqual(["IR", "KR"]);
  });

  it("is conservative: whole words, proper nouns, longest name first, ambiguous names skipped", () => {
    expect(placesOf([], ["Will South Sudan hold elections?"])).toEqual(["SS"]);
    expect(placesOf([], ["New Mexico Governor Election Winner"])).toEqual(["US"]);
    expect(placesOf([], ["Will the U.S. invade Iran before 2027?"])).toEqual(["IR", "US"]);
    expect(placesOf([], ["Will Elon Musk tell us more?", "Indiana Pacers vs. Chadwick", "Omaha"])).toEqual([]);
    expect(placesOf([], ["Will Georgia win?", "Jordan to the Lakers?", "Turkey prices at Thanksgiving"])).toEqual([]);
  });

  it("ignores the text when a tag already gives a place", () => {
    expect(placesOf(tags("Israel"), ["Will France recognise Israel?"])).toEqual(["IL"]);
  });
});

describe("places on malformed tags and the Finished lookup", () => {
  it("malformed tags count as no tags, and the Market is kept", () => {
    const base = raw("politics", "562802");
    for (const bad of ["Iran", 42, { label: "Iran" }, [null, 5, "Iran", { label: 3, slug: ["iran"] }]]) {
      const r = parseMarket({ ...base, tags: bad }, "politics", { now: NOW, inCatalog: true });
      expect(typeof r === "object" && r.places, JSON.stringify(bad)).toEqual([]);
    }
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags([{ label: "Iran" }, null])).toEqual([{ label: "Iran", slug: "" }]);
  });

  it("a row from the Finished lookup keeps its places", () => {
    const finished = fixture("tags/gamma-finished-by-id.json") as { id: string }[];
    const rows = parseFinished(finished, new Map(finished.map((m) => [m.id, "politics" as const])), NOW_TAGS).rows;
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.places).toEqual(["US"]); // Trump, Trump Cabinet: the next Attorney General
  });

  it("buildCatalogPayload passes places through unchanged", () => {
    const a = taggedRow("world", "665374");
    expect(buildCatalogPayload([{ category: "world", rows: [a] }], []).markets[0].places).toEqual(a.places);
  });

  it("the catalog log line counts the rows with a place", () => {
    const rows = parseCatalog(tagged("crypto"), "crypto", NOW_TAGS).rows;
    expect(describePlaces(rows)).toBe("places 1/30"); // only the Clarity Act (a US law)
    expect(describePlaces([])).toBe("places 0/0");
  });
});
