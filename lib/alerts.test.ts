import { describe, expect, it } from "vitest";
import { alertPhrase, isPast, parseChance, toAlert, type Alert } from "./alerts";

const alert = (over: Partial<Alert> = {}): Alert => ({
  id: 1, market_id: "1", direction: "above", threshold: 0.6, created_at: "2026-11-03T12:00:00Z",
  triggered_at: null, triggered_price: null, ...over,
});

describe("parseChance", () => {
  it("turns a Chance in % (1–99, at most one decimal) into a Price", () => {
    expect(parseChance("60")).toBe(0.6);
    expect(parseChance(" 62.5 ")).toBe(0.625);
    expect(parseChance("1")).toBe(0.01);
    expect(parseChance("99")).toBe(0.99);
  });

  it("rejects anything else", () => {
    for (const bad of ["", "0", "0.5", "99.5", "100", "-5", "60.25", "abc", "6e1"]) {
      expect(parseChance(bad)).toBeNull();
    }
  });
});

describe("isPast", () => {
  it("uses the worker's comparison: above when Price ≥ threshold, below when Price ≤ threshold", () => {
    expect(isPast("above", 0.6, 0.6)).toBe(true);
    expect(isPast("above", 0.6, 0.59)).toBe(false);
    expect(isPast("below", 0.4, 0.4)).toBe(true);
    expect(isPast("below", 0.4, 0.41)).toBe(false);
  });

  it("is never past without a Price", () => {
    expect(isPast("above", 0.6, null)).toBe(false);
  });
});

describe("alertPhrase", () => {
  it("names the first Outcome", () => {
    expect(alertPhrase(["Yes", "No"], alert())).toBe("Yes above 60%");
    expect(alertPhrase(["Hawks", "Pacers"], alert({ direction: "below", threshold: 0.405 }))).toBe("Hawks below 40.5%");
  });
});

describe("toAlert", () => {
  it("normalises numeric strings from Supabase", () => {
    const a = toAlert({ ...alert(), threshold: "0.6000" as unknown as number, triggered_price: "0.6500" as unknown as number });
    expect(a.threshold).toBe(0.6);
    expect(a.triggered_price).toBe(0.65);
  });
});
