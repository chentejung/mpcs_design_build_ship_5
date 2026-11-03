import { describe, expect, it } from "vitest";
import { heatIntensity, heatSize, heatTone } from "./heatmap";

describe("heatTone", () => {
  it("is up or down on a Yes/No Market", () => {
    expect(heatTone(["Yes", "No"], 2.4)).toBe("up");
    expect(heatTone(["Yes", "No"], -0.1)).toBe("down");
  });

  it("is neutral on any other Market, whichever way it moved", () => {
    expect(heatTone(["Hawks", "Pacers"], 2.4)).toBe("neutral");
    expect(heatTone(["Over", "Under"], -3)).toBe("neutral");
  });

  it("is flat without a move or without enough history", () => {
    expect(heatTone(["Yes", "No"], 0)).toBe("flat");
    expect(heatTone(["Yes", "No"], null)).toBe("flat");
    expect(heatTone(["Hawks", "Pacers"], 0)).toBe("flat");
  });
});

describe("heatIntensity", () => {
  it("grows with |Δ| up to full at 5 points, and any move shows", () => {
    expect(heatIntensity(null)).toBe(0);
    expect(heatIntensity(0)).toBe(0);
    expect(heatIntensity(0.1)).toBe(0.2);
    expect(heatIntensity(-2.5)).toBe(0.5);
    expect(heatIntensity(5)).toBe(1);
    expect(heatIntensity(-12)).toBe(1);
  });
});

describe("heatSize", () => {
  it("sizes by share of the largest 24-hour volume", () => {
    expect(heatSize(1_000_000, 1_000_000)).toBe("lg");
    expect(heatSize(500_000, 1_000_000)).toBe("lg");
    expect(heatSize(150_000, 1_000_000)).toBe("md");
    expect(heatSize(149_999, 1_000_000)).toBe("sm");
  });

  it("is small without volume", () => {
    expect(heatSize(null, 1_000_000)).toBe("sm");
    expect(heatSize(0, 0)).toBe("sm");
  });
});
