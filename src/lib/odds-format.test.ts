import { describe, expect, it } from "vitest";
import {
  decimalToAmericanOdds,
  formatAmericanOdds,
} from "./odds-format";

describe("decimalToAmericanOdds", () => {
  it("converts favorites to negative American prices", () => {
    expect(decimalToAmericanOdds(1.91)).toBe(-110);
    expect(decimalToAmericanOdds(1.5)).toBe(-200);
  });

  it("converts underdogs and even money to signed positive prices", () => {
    expect(decimalToAmericanOdds(2)).toBe(100);
    expect(decimalToAmericanOdds(2.5)).toBe(150);
  });

  it("rejects missing or invalid decimal prices", () => {
    expect(decimalToAmericanOdds(null)).toBeNull();
    expect(decimalToAmericanOdds(Number.NaN)).toBeNull();
    expect(decimalToAmericanOdds(1)).toBeNull();
  });
});

describe("formatAmericanOdds", () => {
  it("adds the plus sign expected in American odds", () => {
    expect(formatAmericanOdds(2)).toBe("+100");
    expect(formatAmericanOdds(2.5)).toBe("+150");
  });

  it("preserves the minus sign for favorites", () => {
    expect(formatAmericanOdds(1.91)).toBe("-110");
  });

  it("uses the supplied fallback for an unavailable price", () => {
    expect(formatAmericanOdds(null)).toBe("—");
    expect(formatAmericanOdds(null, "N/A")).toBe("N/A");
  });
});
