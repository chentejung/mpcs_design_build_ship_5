// Pure logic for the sync-markets worker. No Deno APIs and no npm: imports, so
// vitest can test it against saved real responses (fixtures/). Terms are in CONTEXT.md.

export type Category = "politics" | "sports" | "crypto" | "finance" | "tech" | "world" | "culture";

export const GAMMA = "https://gamma-api.polymarket.com";
export const CLOB = "https://clob.polymarket.com";

/** The Catalog: top Markets by 24-hour volume per Category (gamma tag ids). */
export const CATALOG_LISTS: readonly { category: Category; tagId: number; limit: number }[] = [
  { category: "politics", tagId: 2, limit: 30 },
  // One night's games fill the top of the Sports list, so fetch more for a useful Browse.
  { category: "sports", tagId: 1, limit: 100 },
  { category: "crypto", tagId: 21, limit: 30 },
  // Added in v2 (tags checked 2026-11-03). Later lists lose overlaps to earlier ones: a Market in both Politics
  // and World (gamma's Geopolitics) stays Politics. Culture is gamma's "pop-culture" tag.
  { category: "finance", tagId: 120, limit: 30 },
  { category: "tech", tagId: 1401, limit: 30 },
  { category: "world", tagId: 100265, limit: 30 },
  { category: "culture", tagId: 596, limit: 30 },
];

export const CATALOG_EVERY_MS = 5 * 60_000;
export const ENDING_SOON_MS = 60 * 60_000;
export const MIDPOINT_CHUNK = 100; // CLOB rejects > 500 tokens per request
export const FINISHED_LOOKUP_CHUNK = 50; // ids per gamma URL
export const FETCH_TIMEOUT_MS = 8_000;

/** A row for upsert_catalog (see supabase/migrations/0002_worker_rpcs.sql). */
export interface CatalogRow {
  id: string;
  question: string;
  slug: string;
  image: string | null;
  category: Category;
  event_id: string | null;
  event_title: string | null;
  group_item_title: string | null;
  outcomes: [string, string];
  token_id: string;
  /** gamma's outcomePrices[0]: used only on first insert or when the Market becomes Finished. */
  price: number | null;
  volume_24h: number | null;
  end_date: string | null;
  closed: boolean;
  in_catalog: boolean;
}

export type SkipReason = "malformed" | "not-two-outcomes" | "no-order-book" | "ending-soon";

export interface ParsedList {
  rows: CatalogRow[];
  skipped: Partial<Record<SkipReason, number>>;
}

export function catalogUrl(list: { tagId: number; limit: number }): string {
  const q = new URLSearchParams({
    tag_id: String(list.tagId),
    active: "true",
    closed: "false",
    order: "volume24hr",
    ascending: "false",
    limit: String(list.limit),
  });
  return `${GAMMA}/markets?${q}`;
}

/**
 * gamma leaves Finished Markets out of an id lookup unless closed=true, and with
 * closed=true it returns only Finished ones, which is exactly what we look for.
 */
export function finishedLookupUrl(ids: readonly string[]): string {
  const q = new URLSearchParams({ closed: "true", limit: String(ids.length) });
  for (const id of ids) q.append("id", id);
  return `${GAMMA}/markets?${q}`;
}

/** gamma encodes some arrays as JSON strings: "[\"Yes\", \"No\"]". */
function parseStringArray(value: unknown): string[] | null {
  if (typeof value !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "string")) return null;
  return parsed;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** A Price is a number in 0–1; anything else is rejected. */
export function toPrice(value: unknown): number | null {
  const n = toNumber(value);
  return n !== null && n >= 0 && n <= 1 ? n : null;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function toIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * One gamma Market → a CatalogRow, or the reason it's skipped. Anything malformed
 * is skipped whole, never half-written.
 * For a Catalog list (inCatalog), the Market must have an order book and must not
 * end within the next hour (past its end date but still trading is fine). For the
 * Finished lookup of followed Markets, neither applies.
 */
export function parseMarket(
  raw: unknown,
  category: Category,
  opts: { now: Date; inCatalog: boolean },
): CatalogRow | SkipReason {
  if (typeof raw !== "object" || raw === null) return "malformed";
  const m = raw as Record<string, unknown>;

  const id = typeof m.id === "number" ? String(m.id) : nonEmpty(m.id);
  const question = nonEmpty(m.question);
  const slug = nonEmpty(m.slug);
  const outcomes = parseStringArray(m.outcomes);
  const tokens = parseStringArray(m.clobTokenIds);
  if (!id || !question || !slug || !outcomes || !tokens) return "malformed";

  if (outcomes.length !== 2 || tokens.length !== 2) return "not-two-outcomes";
  if (!outcomes.every((o) => o.trim() !== "") || !tokens.every((t) => t.trim() !== "")) {
    return "malformed";
  }

  // outcomePrices may be missing; if present it must be well-formed.
  let price: number | null = null;
  if (m.outcomePrices !== undefined && m.outcomePrices !== null) {
    const prices = parseStringArray(m.outcomePrices);
    if (!prices || prices.length !== 2) return "malformed";
    price = toPrice(prices[0]);
    if (price === null) return "malformed";
  }

  const endDate = toIsoDate(m.endDate);

  if (opts.inCatalog) {
    if (m.enableOrderBook !== true) return "no-order-book";
    // Hide only Markets ending within the next hour. One already past its end date but still trading
    // (a game in play, or one awaiting resolution) stays in the Catalog.
    const untilEnd = endDate ? Date.parse(endDate) - opts.now.getTime() : null;
    if (untilEnd !== null && untilEnd >= 0 && untilEnd < ENDING_SOON_MS) return "ending-soon";
  }

  const event = Array.isArray(m.events) && typeof m.events[0] === "object" && m.events[0] !== null
    ? (m.events[0] as Record<string, unknown>)
    : null;
  const eventId = event ? (typeof event.id === "number" ? String(event.id) : nonEmpty(event.id)) : null;

  return {
    id,
    question,
    slug,
    image: nonEmpty(m.image),
    category,
    event_id: eventId,
    event_title: event ? nonEmpty(event.title) : null,
    group_item_title: nonEmpty(m.groupItemTitle),
    outcomes: [outcomes[0], outcomes[1]],
    token_id: tokens[0],
    price,
    volume_24h: toNumber(m.volume24hr),
    end_date: endDate,
    closed: m.closed === true,
    in_catalog: opts.inCatalog,
  };
}

function parseList(
  json: unknown,
  categoryOf: (raw: unknown) => Category | null,
  opts: { now: Date; inCatalog: boolean },
): ParsedList {
  if (!Array.isArray(json)) throw new Error("gamma response is not a list");
  const rows: CatalogRow[] = [];
  const skipped: ParsedList["skipped"] = {};
  for (const raw of json) {
    const category = categoryOf(raw);
    const result = category ? parseMarket(raw, category, opts) : "malformed";
    if (typeof result === "string") skipped[result] = (skipped[result] ?? 0) + 1;
    else rows.push(result);
  }
  return { rows, skipped };
}

/** A gamma Catalog list for one Category. Throws if the response isn't a list. */
export function parseCatalog(json: unknown, category: Category, now: Date): ParsedList {
  return parseList(json, () => category, { now, inCatalog: true });
}

/**
 * The Finished lookup for followed Markets outside the fresh Catalog. Keeps only
 * Markets gamma reports as closed; their category is the one already stored.
 */
export function parseFinished(
  json: unknown,
  categoryById: ReadonlyMap<string, Category>,
  now: Date,
): ParsedList {
  const idOf = (raw: unknown) => {
    const id = (raw as { id?: unknown } | null)?.id;
    return typeof id === "number" ? String(id) : typeof id === "string" ? id : null;
  };
  const result = parseList(json, (raw) => {
    const id = idOf(raw);
    return id ? categoryById.get(id) ?? null : null;
  }, { now, inCatalog: false });
  return { rows: result.rows.filter((r) => r.closed), skipped: result.skipped };
}

/**
 * The upsert_catalog payload. Only Categories fetched successfully are listed, so
 * a failed fetch never empties a Category. A Market in two lists keeps the first.
 */
export function buildCatalogPayload(
  lists: readonly { category: Category; rows: readonly CatalogRow[] }[],
  finished: readonly CatalogRow[],
): { categories: Category[]; markets: CatalogRow[] } {
  const seen = new Set<string>();
  const markets: CatalogRow[] = [];
  for (const row of [...lists.flatMap((l) => l.rows), ...finished]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    markets.push(row);
  }
  return { categories: lists.map((l) => l.category), markets };
}

/**
 * CLOB /midpoints: { "<token_id>": "0.955" } → Prices by Market id. Tokens we
 * didn't ask for and values outside 0–1 are dropped. Throws if the response
 * isn't an object.
 */
export function parseMidpoints(
  json: unknown,
  marketByToken: ReadonlyMap<string, string>,
): { prices: { id: string; price: number }[]; rejected: number } {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new Error("CLOB midpoints response is not an object");
  }
  const prices: { id: string; price: number }[] = [];
  let rejected = 0;
  for (const [token, value] of Object.entries(json)) {
    const id = marketByToken.get(token);
    const price = toPrice(value);
    if (!id || price === null) rejected++;
    else prices.push({ id, price });
  }
  return { prices, rejected };
}

/** Which Markets get Prices this Run: not Finished, and in the Catalog or followed. */
export function priceTargets(
  markets: readonly { id: string; token_id: string; closed: boolean; in_catalog: boolean }[],
  followed: ReadonlySet<string>,
): Map<string, string> {
  const marketByToken = new Map<string, string>();
  for (const m of markets) {
    if (!m.closed && (m.in_catalog || followed.has(m.id))) marketByToken.set(m.token_id, m.id);
  }
  return marketByToken;
}

/** The Catalog is refreshed when it never was, or ≥ 5 minutes ago. */
export function catalogDue(lastRefresh: Date | null, now: Date): boolean {
  return lastRefresh === null || now.getTime() - lastRefresh.getTime() >= CATALOG_EVERY_MS;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** "politics 27 (skipped ending-soon 2, not-two-outcomes 1)" for the Run's log line. */
export function describeList(category: string, list: ParsedList): string {
  const skips = Object.entries(list.skipped).map(([k, n]) => `${k} ${n}`).join(", ");
  return `${category} ${list.rows.length}${skips ? ` (skipped ${skips})` : ""}`;
}
