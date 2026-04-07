import { describe, expect, it } from "vitest";
import { cn, formatTitleFromSlug } from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    const result = cn("px-4", "py-2");
    expect(result).toContain("px-4");
    expect(result).toContain("py-2");
  });

  it("handles conditional classes", () => {
    const result = cn("base", false && "hidden", "visible");
    expect(result).toContain("base");
    expect(result).toContain("visible");
    expect(result).not.toContain("hidden");
  });

  it("resolves tailwind conflicts", () => {
    const result = cn("px-4", "px-6");
    expect(result).toBe("px-6");
  });
});

describe("formatTitleFromSlug", () => {
  it("converts a slug to title case", () => {
    expect(formatTitleFromSlug("hello-world")).toBe("Hello World");
  });

  it("handles single word", () => {
    expect(formatTitleFromSlug("dashboard")).toBe("Dashboard");
  });

  it("filters empty segments", () => {
    expect(formatTitleFromSlug("-leading-")).toBe("Leading");
  });
});
