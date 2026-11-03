import { describe, expect, it } from "vitest";
import {
  appendPoint,
  delta,
  downsample,
  formatDelta,
  HOUR_MS,
  DAY_MS,
  MAX_POINTS,
  toHistory,
  type PricePoint,
} from "./history";

const at = (iso: string) => new Date(iso).getTime();
const p = (iso: string, price: number): PricePoint => ({ at: at(iso), price });
const NOW = new Date("2026-11-03T12:00:00Z");

describe("delta", () => {
  const history = [p("2026-11-03T10:30:00Z", 0.55), p("2026-11-03T11:00:00Z", 0.58), p("2026-11-03T11:30:00Z", 0.6)];

  it("is the current Price minus the Price at the start of the window, in Chance points", () => {
    // 1 h ago is 11:00, and the point at 11:00 is 0.58: 0.624 − 0.58 = 4.4 points.
    expect(delta(history, 0.624, NOW, HOUR_MS)).toBe(4.4);
  });

  it("uses the last point at or before the start of the window", () => {
    // 11:15 → the 11:00 point (0.58); 0.62 − 0.58 = 4.0, not the later 11:30 point.
    expect(delta(history, 0.62, new Date("2026-11-03T12:15:00Z"), HOUR_MS)).toBe(4);
  });

  it("is negative when the Price fell", () => {
    const withBaseline = [p("2026-11-02T09:00:00Z", 0.7), ...history];
    // 24 h ago the Price was 0.70 (set at 09:00 the day before): 0.62 − 0.70 = −8.0.
    expect(delta(withBaseline, 0.62, NOW, DAY_MS)).toBe(-8);
  });

  it("is null (not enough history) when no point is that old", () => {
    expect(delta(history, 0.62, NOW, DAY_MS)).toBeNull();
    expect(delta([], 0.62, NOW, HOUR_MS)).toBeNull();
  });

  it("is null when the Market has no Price", () => {
    expect(delta(history, null, NOW, HOUR_MS)).toBeNull();
  });
});

describe("formatDelta", () => {
  it("shows Chance points with a sign and one decimal", () => {
    expect(formatDelta(2.4)).toBe("+2.4");
    expect(formatDelta(-0.7)).toBe("−0.7");
    expect(formatDelta(4)).toBe("+4.0");
    expect(formatDelta(0)).toBe("0.0");
  });

  it("shows a dash when there isn't enough history", () => {
    expect(formatDelta(null)).toBe("—");
  });
});

describe("downsample", () => {
  const series = (n: number) => Array.from({ length: n }, (_, i) => ({ at: i * 1000, price: i / 100 }));

  it("leaves a short history alone", () => {
    const short = series(5);
    expect(downsample(short, 10)).toBe(short);
  });

  it("keeps at most the maximum, evenly spread, with the first and last points", () => {
    const out = downsample(series(10), 4);
    expect(out.map((x) => x.at)).toEqual([0, 3000, 6000, 9000]);
  });

  it("respects the maximum on a long history", () => {
    const long = series(2259);
    const out = downsample(long, MAX_POINTS);
    expect(out).toHaveLength(MAX_POINTS);
    expect(out[0]).toBe(long[0]);
    expect(out.at(-1)).toBe(long.at(-1));
  });
});

describe("toHistory", () => {
  it("joins the last point before the window to the window's points, oldest first, as numbers", () => {
    const out = toHistory(
      [
        { price: "0.6200" as unknown as number, recorded_at: "2026-11-03T11:30:00Z" },
        { price: 0.58, recorded_at: "2026-11-03T11:00:00Z" },
      ],
      [{ price: 0.7, recorded_at: "2026-11-02T09:00:00Z" }],
    );
    expect(out).toEqual([p("2026-11-02T09:00:00Z", 0.7), p("2026-11-03T11:00:00Z", 0.58), p("2026-11-03T11:30:00Z", 0.62)]);
  });

  it("drops the point before the window when the window's read was cut at its limit (there'd be a gap)", () => {
    const full = Array.from({ length: 3 }, (_, i) => ({ price: 0.5, recorded_at: `2026-11-03T1${i}:00:00Z` }));
    const out = toHistory(full, [{ price: 0.7, recorded_at: "2026-11-02T09:00:00Z" }], 3);
    expect(out.map((x) => x.price)).toEqual([0.5, 0.5, 0.5]);
  });

  it("is empty when there are no rows", () => {
    expect(toHistory(undefined, undefined)).toEqual([]);
  });
});

describe("appendPoint", () => {
  it("adds the new point at the end", () => {
    const out = appendPoint([p("2026-11-03T11:00:00Z", 0.58)], p("2026-11-03T12:00:00Z", 0.6));
    expect(out).toEqual([p("2026-11-03T11:00:00Z", 0.58), p("2026-11-03T12:00:00Z", 0.6)]);
  });

  it("drops points older than 24 h, but keeps the last one before then for Δ 24h", () => {
    const out = appendPoint(
      [p("2026-11-02T08:00:00Z", 0.5), p("2026-11-02T10:00:00Z", 0.55), p("2026-11-03T11:00:00Z", 0.58)],
      p("2026-11-03T12:00:00Z", 0.6),
    );
    expect(out.map((x) => x.price)).toEqual([0.55, 0.58, 0.6]);
  });

  it("stays within the maximum, keeping the first point and the new one", () => {
    const start = at("2026-11-03T00:00:00Z");
    const full = Array.from({ length: MAX_POINTS }, (_, i) => ({ at: start + i * 60_000, price: 0.5 }));
    const latest = { at: at("2026-11-03T12:00:00Z"), price: 0.6 };
    const out = appendPoint(full, latest);
    expect(out).toHaveLength(MAX_POINTS);
    expect(out[0]).toBe(full[0]);
    expect(out.at(-1)).toEqual(latest);
  });
});
