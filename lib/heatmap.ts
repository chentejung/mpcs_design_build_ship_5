// The Watchlist Heatmap's tiles (#12): sized by 24-hour volume, shaded by Δ 1h. Pure, so it is unit-tested.
// Green/red direction only on Yes/No Markets (product rule 3); any other Market gets a neutral shade.
import { isYesNo } from "./format";

/** How a tile is shaded: green/red on Yes/No, neutral on anything else, flat without a move (or history). */
export type HeatTone = "up" | "down" | "neutral" | "flat";

/** A tile's size: sm 1×1, md 2×1, lg 2×2 grid cells. */
export type HeatSize = "sm" | "md" | "lg";

/** Δ 1h (Chance points, one decimal, as lib/history.ts `delta`) → the tile's tone. */
export function heatTone(outcomes: readonly string[], deltaPoints: number | null): HeatTone {
  if (deltaPoints === null || Math.round(deltaPoints * 10) === 0) return "flat";
  if (!isYesNo(outcomes)) return "neutral";
  return deltaPoints > 0 ? "up" : "down";
}

/** A Δ of this many points or more gets the strongest shade. */
export const FULL_SHADE_POINTS = 5;

/** How strongly a tile is shaded, 0–1, by |Δ 1h|: any move shows (at least 0.2), 5 points or more is full. */
export function heatIntensity(deltaPoints: number | null): number {
  if (deltaPoints === null || Math.round(deltaPoints * 10) === 0) return 0;
  return Math.min(1, Math.max(0.2, Math.abs(deltaPoints) / FULL_SHADE_POINTS));
}

/**
 * A tile's size by its 24-hour volume relative to the largest on the Watchlist: at least half of it is lg,
 * at least 15 % md, anything less (or no volume) sm.
 */
export function heatSize(volume: number | null, maxVolume: number): HeatSize {
  if (volume === null || !(maxVolume > 0) || !(volume > 0)) return "sm";
  const share = volume / maxVolume;
  return share >= 0.5 ? "lg" : share >= 0.15 ? "md" : "sm";
}
