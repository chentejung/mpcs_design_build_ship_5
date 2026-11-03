// How Prices and times are shown. The UI says Chance (a %); code and data say Price (0–1).
// Pure, so it is unit-tested (AGENTS.md → Product rules 2–3).

/** A Price as tenths of a Chance point: 0.6234 → 623 (62.3). The flash compares these. */
export function chanceTenths(price: number): number {
  return Math.round(price * 1000);
}

function showTenths(tenths: number): string {
  if (tenths <= 0) return "0";
  if (tenths >= 1000) return "100";
  return tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1);
}

/**
 * Both sides of the split bar, as displayed: one decimal, trailing ".0" dropped,
 * and the second side is 100 − the first as shown, so the two always add to 100.
 * Under 0.1 point (e.g. Polymarket's 0.0005) shows "<0.1" and the other side ">99.9",
 * instead of a misleading "0.1" or "0".
 */
export function splitChances(price: number): [string, string] {
  const exactTenths = price * 1000;
  const EPS = 1e-9; // float noise: 0.999 * 1000 is 998.9999…
  if (exactTenths > EPS && exactTenths < 1 - EPS) return ["<0.1", ">99.9"];
  if (exactTenths < 1000 - EPS && exactTenths > 999 + EPS) return [">99.9", "<0.1"];
  const first = chanceTenths(price);
  return [showTenths(first), showTenths(1000 - first)];
}

/** Green/red direction is used only for Yes/No Markets (product rule 3). */
export function isYesNo(outcomes: readonly string[]): boolean {
  return outcomes.length === 2 && outcomes[0] === "Yes" && outcomes[1] === "No";
}

/** The flash rule: did the displayed Chance move by at least 0.1 point, and which way? */
export function moveDirection(previous: number | null, next: number | null): "up" | "down" | null {
  if (previous === null || next === null) return null;
  const a = chanceTenths(previous);
  const b = chanceTenths(next);
  return b > a ? "up" : b < a ? "down" : null;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "4 s ago", "3 min ago", "2 h ago", "5 d ago". Future or now reads "just now". */
export function ago(date: Date, now: Date): string {
  const ms = now.getTime() - date.getTime();
  if (ms < 1000) return "just now";
  if (ms < MINUTE) return `${Math.floor(ms / 1000)} s ago`;
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h ago`;
  return `${Math.floor(ms / DAY)} d ago`;
}

/**
 * "Ends in 42 min", "Ends in 5 h", "Ends in 3 d", "Ends in 4 mo". Past its end date but still trading: a Sports
 * Market is a game in play ("In play"; gamma's end date for a game is its kickoff), anything else "Still trading".
 */
export function endsIn(end: Date, now: Date, category?: string): string {
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return category === "sports" ? "In play" : "Still trading";
  if (ms < HOUR) return `Ends in ${Math.max(1, Math.floor(ms / MINUTE))} min`;
  if (ms < DAY) return `Ends in ${Math.floor(ms / HOUR)} h`;
  if (ms < 60 * DAY) return `Ends in ${Math.floor(ms / DAY)} d`;
  return `Ends in ${Math.floor(ms / (30 * DAY))} mo`;
}

/** "$1.2M", "$840K", "$950" — 24-hour volume on Browse. */
export function volume(usd: number | null): string {
  if (usd === null) return "—";
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1)}M`;
  if (usd >= 1e3) return `$${Math.round(usd / 1e3)}K`;
  return `$${Math.round(usd)}`;
}

/** The Market's page on Polymarket. */
export function polymarketUrl(slug: string): string {
  return `https://polymarket.com/market/${encodeURIComponent(slug)}`;
}
