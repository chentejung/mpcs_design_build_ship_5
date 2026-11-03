// The landing page's trending banner (issue #14): the Events with the most 24-hour volume across the Catalog.
// A Market without an Event is its own topic. Pure, so it is unit-tested.
import { marketLabel, type Market } from "./markets";

export const TRENDING_SIZE = 5;

export type TrendingTopic = {
  /** The Event's id, or `market-<id>` for a Market on its own. */
  key: string;
  title: string;
  /** The first of its Markets (by volume) that has an image. */
  image: string | null;
  category: string;
  /** Summed 24-hour volume of its Markets. */
  volume24h: number;
  /** Its busiest Market, whose first Outcome's Chance the banner shows. */
  lead: Market;
  marketCount: number;
  href: string;
};

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Groups live Catalog Markets (in the Catalog, not Finished) by Event, sums their 24-hour volume and returns the
 * top `size`, ties broken by key so the order is stable.
 */
export function trendingTopics(
  markets: readonly (Market & { in_catalog?: boolean })[],
  size: number = TRENDING_SIZE,
): TrendingTopic[] {
  const groups = new Map<string, Market[]>();
  for (const m of markets) {
    if (m.closed || m.in_catalog === false) continue;
    const key = m.event_id ?? `market-${m.id}`;
    const list = groups.get(key);
    if (list) list.push(m);
    else groups.set(key, [m]);
  }
  const vol = (m: Market) => m.volume_24h ?? 0;
  const topics: TrendingTopic[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => vol(b) - vol(a) || byId(a.id, b.id));
    const lead = sorted[0];
    topics.push({
      key,
      title: lead.event_title ?? marketLabel(lead),
      image: sorted.find((m) => m.image)?.image ?? null,
      category: lead.category,
      volume24h: sorted.reduce((sum, m) => sum + vol(m), 0),
      lead,
      marketCount: sorted.length,
      href: `/browse?category=${lead.category}`,
    });
  }
  return topics.sort((a, b) => b.volume24h - a.volume24h || byId(a.key, b.key)).slice(0, size);
}
