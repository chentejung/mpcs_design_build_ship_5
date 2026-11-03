// Market rows and grouping for Browse (AGENTS.md → Product rules 1, 6). Pure, so it is unit-tested.
import type { Tables } from "./database.types";

export const CATEGORIES = [
  { slug: "politics", label: "Politics" },
  { slug: "sports", label: "Sports" },
  { slug: "crypto", label: "Crypto" },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

/** ?category= → a known Category, defaulting to politics. */
export function toCategory(value: unknown): CategorySlug {
  return CATEGORIES.some((c) => c.slug === value) ? (value as CategorySlug) : "politics";
}

/** The columns a card needs. */
export const MARKET_COLUMNS =
  "id, question, slug, image, category, event_id, event_title, group_item_title, outcomes, price, price_changed_at, volume_24h, end_date, closed, closed_at" as const;

export type Market = Pick<
  Tables<"markets">,
  | "id" | "question" | "slug" | "image" | "category" | "event_id" | "event_title" | "group_item_title"
  | "outcomes" | "price" | "price_changed_at" | "volume_24h" | "end_date" | "closed" | "closed_at"
>;

/** Supabase returns numeric(6,4) as a number or a string depending on the path; normalise it. */
export function toMarket(row: Market): Market {
  return {
    ...row,
    price: row.price === null ? null : Number(row.price),
    volume_24h: row.volume_24h === null ? null : Number(row.volume_24h),
  };
}

export type EventGroup = {
  key: string;
  title: string;
  /** An Event of one Market whose title is its question needs no separate heading. */
  showHeading: boolean;
  volume24h: number;
  markets: Market[];
};

/** A Market's name under its Event heading: the group item ("Democratic Party"), else the question. */
export function marketLabel(m: Pick<Market, "group_item_title" | "question">): string {
  return m.group_item_title ?? m.question;
}

/**
 * Groups Markets under their Event (product rule 1: Events are headings, Markets are followable).
 * Events are ordered by their total 24-hour volume, and Markets within one by their own.
 */
export function groupByEvent(markets: readonly Market[]): EventGroup[] {
  const groups = new Map<string, EventGroup>();
  for (const m of markets) {
    const key = m.event_id ?? `market-${m.id}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, title: m.event_title ?? m.question, showHeading: true, volume24h: 0, markets: [] };
      groups.set(key, g);
    }
    g.markets.push(m);
    g.volume24h += m.volume_24h ?? 0;
  }
  const byVolume = (a: Market, b: Market) => (b.volume_24h ?? 0) - (a.volume_24h ?? 0);
  return [...groups.values()]
    .map((g) => ({
      ...g,
      markets: [...g.markets].sort(byVolume),
      showHeading: !(g.markets.length === 1 && g.title === g.markets[0].question),
    }))
    .sort((a, b) => b.volume24h - a.volume24h);
}
