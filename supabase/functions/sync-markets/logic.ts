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
  /** Where the Market is about (see placesOf): sorted, de-duplicated; empty = Global. */
  places: string[];
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
    include_tag: "true",
  });
  return `${GAMMA}/markets?${q}`;
}

/**
 * gamma leaves Finished Markets out of an id lookup unless closed=true, and with
 * closed=true it returns only Finished ones, which is exactly what we look for.
 */
export function finishedLookupUrl(ids: readonly string[]): string {
  const q = new URLSearchParams({ closed: "true", include_tag: "true", limit: String(ids.length) });
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
  const eventTitle = event ? nonEmpty(event.title) : null;
  const groupItemTitle = nonEmpty(m.groupItemTitle);

  return {
    id,
    question,
    slug,
    image: nonEmpty(m.image),
    category,
    event_id: eventId,
    event_title: eventTitle,
    group_item_title: groupItemTitle,
    outcomes: [outcomes[0], outcomes[1]],
    token_id: tokens[0],
    price,
    volume_24h: toNumber(m.volume24hr),
    end_date: endDate,
    closed: m.closed === true,
    in_catalog: opts.inCatalog,
    places: placesOf(parseTags(m.tags), [question, eventTitle, groupItemTitle]),
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

/** "places 61/97" for the Run's log line: how many rows to save got at least one place. */
export function describePlaces(rows: readonly CatalogRow[]): string {
  return `places ${rows.filter((r) => r.places.length > 0).length}/${rows.length}`;
}

// ── Places ──────────────────────────────────────────────────────────────────
// Where in the world a Market is about: ISO 3166-1 alpha-2 country codes ("IR", "US") and region codes
// ("region:middle-east"). Empty = Global. Read from gamma's tags (include_tag=true) through the tables
// below, built from the tag labels seen in fixtures/tags/. Only when no tag gives a place do we look for
// country names in the question, Event title and group item title.

export const REGIONS = [
  "region:middle-east", "region:europe", "region:asia", "region:africa",
  "region:latin-america", "region:north-america", "region:oceania",
] as const;

const US = ["US"];

/** Countries by name. The first name is the usual one; the rest are aliases and demonyms. */
const COUNTRIES: readonly [code: string, ...names: string[]][] = [
  ["US", "United States", "United States of America", "USA", "U.S.", "U.S.A.", "US"],
  ["CA", "Canada", "Canadian"], ["MX", "Mexico", "Mexican"],
  ["GB", "United Kingdom", "UK", "U.K.", "Britain", "Great Britain", "British", "England", "Scotland", "Wales"],
  ["IE", "Ireland", "Irish"], ["FR", "France", "French"], ["DE", "Germany", "German"],
  ["ES", "Spain", "Spanish"], ["PT", "Portugal", "Portuguese"], ["IT", "Italy", "Italian"],
  ["NL", "Netherlands", "Dutch"], ["BE", "Belgium"], ["CH", "Switzerland", "Swiss"], ["AT", "Austria"],
  ["SE", "Sweden", "Swedish"], ["NO", "Norway", "Norwegian"], ["DK", "Denmark", "Danish"],
  ["FI", "Finland"], ["IS", "Iceland"], ["PL", "Poland", "Polish"], ["CZ", "Czechia", "Czech Republic"],
  ["SK", "Slovakia"], ["HU", "Hungary", "Hungarian"], ["RO", "Romania", "Romanian"], ["BG", "Bulgaria"],
  ["GR", "Greece", "Greek"], ["RS", "Serbia"], ["HR", "Croatia"], ["MD", "Moldova"], ["BY", "Belarus"],
  ["UA", "Ukraine", "Ukrainian"], ["RU", "Russia", "Russian"], ["EE", "Estonia"], ["LV", "Latvia"],
  ["LT", "Lithuania"], ["AM", "Armenia"], ["AZ", "Azerbaijan"], ["CY", "Cyprus"],
  ["TR", "Türkiye"], // "Turkey" is tag-only (TAG_ONLY): in a question it may be the bird.
  ["IL", "Israel", "Israeli"], ["PS", "Palestine", "Gaza", "West Bank"], ["IR", "Iran", "Iranian"],
  ["IQ", "Iraq", "Iraqi"], ["SY", "Syria", "Syrian"], ["LB", "Lebanon", "Lebanese"],
  ["SA", "Saudi Arabia", "Saudi"], ["AE", "United Arab Emirates", "UAE"], ["QA", "Qatar"],
  ["KW", "Kuwait"], ["BH", "Bahrain"], ["OM", "Oman"], ["YE", "Yemen"], ["EG", "Egypt", "Egyptian"],
  ["CN", "China", "Chinese"], ["TW", "Taiwan", "Taiwanese"], ["HK", "Hong Kong"], ["JP", "Japan", "Japanese"],
  ["KR", "South Korea", "South Korean"], ["KP", "North Korea", "North Korean"], ["IN", "India", "Indian"],
  ["PK", "Pakistan", "Pakistani"], ["AF", "Afghanistan"], ["BD", "Bangladesh"], ["LK", "Sri Lanka"],
  ["NP", "Nepal"], ["MM", "Myanmar"], ["TH", "Thailand"], ["VN", "Vietnam"], ["PH", "Philippines"],
  ["MY", "Malaysia"], ["SG", "Singapore"], ["ID", "Indonesia"], ["KZ", "Kazakhstan"], ["MN", "Mongolia"],
  ["AU", "Australia", "Australian"], ["NZ", "New Zealand"],
  ["BR", "Brazil", "Brazilian"], ["AR", "Argentina", "Argentine"], ["CL", "Chile"], ["CO", "Colombia"],
  ["PE", "Peru"], ["VE", "Venezuela", "Venezuelan"], ["EC", "Ecuador"], ["BO", "Bolivia"],
  ["UY", "Uruguay"], ["PY", "Paraguay"], ["CU", "Cuba", "Cuban"], ["HT", "Haiti"], ["PA", "Panama"],
  ["CR", "Costa Rica"], ["SV", "El Salvador"], ["HN", "Honduras"], ["GT", "Guatemala"], ["NI", "Nicaragua"],
  ["DO", "Dominican Republic"], ["JM", "Jamaica"], ["GL", "Greenland"],
  ["ZA", "South Africa"], ["NG", "Nigeria"], ["KE", "Kenya"], ["ET", "Ethiopia"], ["SD", "Sudan"],
  ["SS", "South Sudan"], ["LY", "Libya"], ["TN", "Tunisia"], ["DZ", "Algeria"], ["MA", "Morocco"],
  ["GH", "Ghana"], ["SN", "Senegal"], ["ML", "Mali"], ["NE", "Niger"], ["BF", "Burkina Faso"],
  ["SO", "Somalia"], ["UG", "Uganda"], ["RW", "Rwanda"], ["TZ", "Tanzania"], ["ZW", "Zimbabwe"],
  ["CM", "Cameroon"], ["CI", "Ivory Coast"], ["AO", "Angola"], ["MZ", "Mozambique"],
  // Left out as ambiguous: Georgia (also a US state), Jordan and Chad (first names), Guinea and Congo
  // (several countries), Korea (two), America (a continent; "American League").
];

/** Country names matched only as tags: too ambiguous in free text. */
const TAG_ONLY: readonly [string, string][] = [["turkey", "TR"]];

/**
 * gamma tags (label or slug, lowercase) → places, beyond plain country names: regions, multi-country
 * tags, people and topics that pin a country, US politics, and Sports leagues pinned to their home.
 */
const TAG_PLACES: Readonly<Record<string, readonly string[]>> = {
  // Regions
  "middle east": ["region:middle-east"], "red sea": ["region:middle-east"],
  "strait of hormuz": ["region:middle-east"], "hormuz": ["region:middle-east"],
  "bab el-mandeb": ["region:middle-east"], "europe": ["region:europe"], "eu": ["region:europe"],
  "european union": ["region:europe"], "asia": ["region:asia"], "southeast asia": ["region:asia"],
  "africa": ["region:africa"], "latin america": ["region:latin-america"],
  "south america": ["region:latin-america"], "central america": ["region:latin-america"],
  "north america": ["region:north-america"], "oceania": ["region:oceania"],
  // Multi-country
  "israel x iran": ["IL", "IR"], "u.s. x iran": ["US", "IR"], "trump-iran": ["US", "IR"],
  "us-iran": ["US", "IR"], "trump-netanyahu": ["US", "IL"], "russia x ukraine": ["RU", "UA"],
  "ukraine peace deal": ["RU", "UA"], "china x taiwan": ["CN", "TW"], "india-pakistan": ["IN", "PK"],
  "israel x hamas": ["IL", "PS"], "israel x hezbollah": ["IL", "LB"],
  // People, groups and topics that pin a country
  "iran ceasefire": ["IR"], "iran regime": ["IR"], "iranian-leadership-regime": ["IR"], "khamenei": ["IR"],
  "khamenei out": ["IR"], "mojtaba": ["IR"], "mojtaba khamenei": ["IR"], "mojtaba out": ["IR"],
  "ayatollah": ["IR"], "reza pahlavi": ["IR"], "kharg island": ["IR"], "iran offensive strikes": ["IR"],
  "israel election": ["IL"], "netanyahu": ["IL"], "hamas": ["PS"], "hezbollah": ["LB"],
  "houthis": ["YE"], "houthi": ["YE"], "putin": ["RU"], "zelensky": ["UA"], "zelenskyy": ["UA"],
  "ukraine map": ["UA"], "xi jinping": ["CN"], "modi": ["IN"], "erdogan": ["TR"], "kim jong un": ["KP"],
  "nicolas maduro": ["VE"], "maduro": ["VE"], "milei": ["AR"], "lula": ["BR"], "banxico": ["MX"],
  "catalonia": ["ES"], "french elections": ["FR"], "french election": ["FR"], "macron": ["FR"],
  "uk election": ["GB"], "starmer": ["GB"],
  // US politics and institutions
  "united states": US, "us election": US, "us-presidential-election": US, "midterms": US,
  "midterms-control": US, "control & seats": US, "midterm combos": US, "tossups": US, "midterm-tossups": US,
  "senate": US, "senate-elections": US, "senate elections": US, "senate-midterms": US, "senate map": US,
  "senate midterm winners": US, "tossup senate races": US, "senate-tossups": US, "governor elections": US,
  "governor-midterms": US, "tossup governor races": US, "governor-tossups": US, "congress": US,
  "trump": US, "trump presidency": US, "trump cabinet": US, "vance": US, "hegseth": US,
  "white house": US, "scotus": US, "us law": US, "fed": US, "fed rates": US, "kevin warsh": US,
  // Sports leagues, pinned to their home
  "nba": US, "nba finals": US, "nba tip-off": US, "wnba": US, "nfl": US, "nfl (all)": US,
  "super bowl": US, "mlb": US, "world series": US, "cfb": US, "cfb (all)": US, "college football": US,
  "ncaa": US, "ncaab": US, "cbb": US, "march madness": US, "nascar": US,
  "nhl": ["US", "CA"], "stanley cup": ["US", "CA"], "mls": ["US", "CA"], "cfl": ["CA"],
  "premier league": ["GB"], "epl": ["GB"], "efl championship": ["GB"], "fa cup": ["GB"],
  "scottish premiership": ["GB"], "la liga": ["ES"], "la liga 2": ["ES"], "copa del rey": ["ES"],
  "serie a": ["IT"], "bundesliga": ["DE"], "ligue 1": ["FR"], "eredivisie": ["NL"],
  "primeira liga": ["PT"], "super lig": ["TR"], "saudi professional league": ["SA"],
  "saudi pro league": ["SA"], "liga mx": ["MX"], "brasileirao": ["BR"],
  "ucl": ["region:europe"], "ucl matchday": ["region:europe"], "champions league": ["region:europe"],
  "uefa champions league": ["region:europe"], "europa league": ["region:europe"], "uel": ["region:europe"],
  "conference league": ["region:europe"], "uefa nations league": ["region:europe"],
  "euroleague": ["region:europe"], "eurocup": ["region:europe"],
  "afc champions league": ["region:asia"], "afc champions league elite": ["region:asia"],
  "copa libertadores": ["region:latin-america"], "copa sudamericana": ["region:latin-america"],
  "concacaf": ["region:north-america"],
  "ipl": ["IN"], "kbo": ["KR"], "npb": ["JP"], "afl": ["AU"], "nrl": ["AU"], "a-league": ["AU"],
};

const US_STATES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware",
  "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky",
  "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri",
  "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico", "new york",
  "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island",
  "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont", "virginia", "washington",
  "west virginia", "wisconsin", "wyoming",
];

/** "Texas Midterm", "Michigan Senate", "Florida Governor", or a state on its own (but not bare Georgia). */
const US_STATE_TAG = new RegExp(
  `^(${US_STATES.join("|")})(?: (?:midterms?|senate|governor|house|primary|primaries|elections?|mayor))?$`,
);

const TAG_COUNTRY = new Map<string, string>([
  ...COUNTRIES.flatMap(([code, ...names]) => names.map((n): [string, string] => [n.toLowerCase(), code])),
  ...TAG_ONLY,
]);

function tagPlaces(key: string): readonly string[] {
  const k = key.trim().toLowerCase();
  if (k === "") return [];
  // Own keys only, so a tag named "constructor" isn't read off Object.prototype.
  if (Object.hasOwn(TAG_PLACES, k)) return TAG_PLACES[k];
  const country = TAG_COUNTRY.get(k);
  if (country) return [country];
  if (k !== "georgia" && US_STATE_TAG.test(k)) return US;
  return [];
}

/**
 * Country names as whole words, case-sensitive (proper nouns: "US" but never "us"), longest first so
 * "South Sudan" isn't read as Sudan and "New Mexico" (a US state) isn't Mexico.
 */
const TEXT_NAMES: readonly [string, string][] = [
  ...COUNTRIES.flatMap(([code, ...names]) => names.map((n): [string, string] => [n, code])),
  ["New Mexico", "US"] as [string, string],
].sort((a, b) => b[0].length - a[0].length);

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TEXT_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}.])(?:${TEXT_NAMES.map(([n]) => escapeRegExp(n)).join("|")})(?![\\p{L}\\p{N}])`,
  "gu",
);
const TEXT_CODE = new Map(TEXT_NAMES);

/** gamma's tags: an array of { label, slug, … }. Anything else counts as no tags. */
export function parseTags(value: unknown): { label: string; slug: string }[] {
  if (!Array.isArray(value)) return [];
  const tags: { label: string; slug: string }[] = [];
  for (const t of value) {
    if (typeof t !== "object" || t === null) continue;
    const { label, slug } = t as { label?: unknown; slug?: unknown };
    tags.push({ label: typeof label === "string" ? label : "", slug: typeof slug === "string" ? slug : "" });
  }
  return tags;
}

/** A Market's places: from its tags, or else from country names in its text. Sorted, de-duplicated. */
export function placesOf(
  tags: readonly { label: string; slug: string }[],
  texts: readonly (string | null)[],
): string[] {
  const places = new Set<string>();
  for (const tag of tags) {
    const byLabel = tagPlaces(tag.label);
    for (const p of byLabel.length > 0 ? byLabel : tagPlaces(tag.slug)) places.add(p);
  }
  if (places.size === 0) {
    for (const text of texts) {
      for (const match of (text ?? "").matchAll(TEXT_PATTERN)) places.add(TEXT_CODE.get(match[0])!);
    }
  }
  return [...places].sort();
}
