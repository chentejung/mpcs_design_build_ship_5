// Alerts (AGENTS.md → Data model; CONTEXT.md → Alert): "tell me when Yes is above 60%" on a followed Market.
// The worker triggers them in apply_prices; this module is how the app reads, phrases and checks them. Pure,
// so it is unit-tested.
import type { Tables } from "./database.types";

export type Direction = "above" | "below";

export type Alert = Omit<Tables<"alerts">, "user_id" | "direction"> & { direction: Direction };

/** The columns the Watchlist needs (never user_id: RLS already limits rows to the viewer). */
export const ALERT_COLUMNS = "id, market_id, direction, threshold, created_at, triggered_at, triggered_price" as const;

/** Supabase returns numeric(6,4) as a number or a string depending on the path; normalise it. */
export function toAlert(row: Alert): Alert {
  return {
    ...row,
    threshold: Number(row.threshold),
    triggered_price: row.triggered_price === null ? null : Number(row.triggered_price),
  };
}

/** A Chance typed by the user ("60", "62.5": 1–99, at most one decimal) → its Price, or null if invalid. */
export function parseChance(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,2}(\.\d)?$/.test(t)) return null;
  const chance = Number(t);
  if (chance < 1 || chance > 99) return null;
  return Math.round(chance * 10) / 1000;
}

/** The worker's crossing rule (0006 apply_prices): above when Price ≥ threshold, below when Price ≤ threshold. */
export function isPast(direction: Direction, threshold: number, price: number | null): boolean {
  if (price === null) return false;
  return direction === "above" ? price >= threshold : price <= threshold;
}

/** A threshold as a Chance: 0.6 → "60", 0.625 → "62.5". */
export function thresholdChance(threshold: number): string {
  const tenths = Math.round(threshold * 1000);
  return tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1);
}

/** "Yes above 60%", "Hawks below 40.5%": always the first Outcome, whose Price is tracked. */
export function alertPhrase(outcomes: readonly string[], alert: Pick<Alert, "direction" | "threshold">): string {
  return `${outcomes[0]} ${alert.direction} ${thresholdChance(alert.threshold)}%`;
}
