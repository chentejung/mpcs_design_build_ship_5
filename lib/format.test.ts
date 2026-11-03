import { describe, expect, it } from "vitest";
import { ago, chanceTenths, endsIn, isYesNo, moveDirection, polymarketUrl, splitChances, volume } from "./format";

describe("splitChances: the split bar's two sides", () => {
  it.each([
    [0.62, ["62", "38"]],
    [0.955, ["95.5", "4.5"]],
    [0.6234, ["62.3", "37.7"]],
    [0.5, ["50", "50"]],
    [0, ["0", "100"]],
    [1, ["100", "0"]],
    [0.0005, ["<0.1", ">99.9"]],
    [0.9995, [">99.9", "<0.1"]],
    [0.0015, ["0.2", "99.8"]],
    [0.001, ["0.1", "99.9"]],
    [0.999, ["99.9", "0.1"]],
  ] as const)("%s → %j", (price, expected) => {
    expect(splitChances(price)).toEqual(expected);
  });

  it("always adds up to 100 as shown", () => {
    for (let p = 0.001; p < 1; p += 0.0137) {
      const [a, b] = splitChances(p).map((s) => Number(s.replace(/[<>]/, "")));
      expect(Math.round((a + b) * 10)).toBe(1000);
    }
  });
});

describe("moveDirection: the flash rule", () => {
  it("flashes only when the displayed Chance changes by ≥ 0.1 point", () => {
    expect(moveDirection(0.62, 0.6204)).toBeNull(); // 62.0 → 62.0
    expect(moveDirection(0.62, 0.621)).toBe("up"); // 62.0 → 62.1
    expect(moveDirection(0.62, 0.6149)).toBe("down"); // 62.0 → 61.5
    expect(moveDirection(null, 0.5)).toBeNull();
  });

  it("works in tenths of a point", () => {
    expect(chanceTenths(0.6234)).toBe(623);
  });
});

describe("isYesNo: when green/red is allowed", () => {
  it("only for Yes/No, in that order", () => {
    expect(isYesNo(["Yes", "No"])).toBe(true);
    expect(isYesNo(["Hawks", "Pacers"])).toBe(false);
    expect(isYesNo(["Over", "Under"])).toBe(false);
    expect(isYesNo(["Up", "Down"])).toBe(false);
  });
});

describe("times", () => {
  const now = new Date("2026-11-03T20:00:00Z");
  const minus = (ms: number) => new Date(now.getTime() - ms);
  const plus = (ms: number) => new Date(now.getTime() + ms);

  it("ago", () => {
    expect(ago(minus(400), now)).toBe("just now");
    expect(ago(minus(4_200), now)).toBe("4 s ago");
    expect(ago(minus(3 * 60_000 + 5), now)).toBe("3 min ago");
    expect(ago(minus(2 * 3_600_000), now)).toBe("2 h ago");
    expect(ago(minus(5 * 86_400_000), now)).toBe("5 d ago");
    expect(ago(plus(5_000), now)).toBe("just now");
  });

  it("endsIn", () => {
    expect(endsIn(plus(42 * 60_000), now)).toBe("Ends in 42 min");
    expect(endsIn(plus(5 * 3_600_000 + 1), now)).toBe("Ends in 5 h");
    expect(endsIn(plus(3 * 86_400_000), now)).toBe("Ends in 3 d");
    expect(endsIn(plus(400 * 86_400_000), now)).toBe("Ends in 13 mo");
    expect(endsIn(minus(1), now)).toBe("Still trading");
    expect(endsIn(minus(20 * 60_000), now, "sports")).toBe("In play");
    expect(endsIn(minus(1), now, "politics")).toBe("Still trading");
  });
});

describe("volume and links", () => {
  it("volume", () => {
    expect(volume(1_234_567)).toBe("$1.2M");
    expect(volume(840_300)).toBe("$840K");
    expect(volume(950)).toBe("$950");
    expect(volume(null)).toBe("—");
  });

  it("polymarketUrl", () => {
    expect(polymarketUrl("nfl-chi-sea-2026-11-03")).toBe("https://polymarket.com/market/nfl-chi-sea-2026-11-03");
  });
});
