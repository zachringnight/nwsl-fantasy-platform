import { describe, expect, it } from "vitest";
import {
  buildFantasyProfileSeed,
  normalizeFantasyDisplayName,
  normalizeFantasyEmail,
  validateFantasyPassword,
} from "./fantasy-profile";

describe("fantasy-profile helpers", () => {
  it("normalizes display names by trimming and collapsing whitespace", () => {
    expect(normalizeFantasyDisplayName("  Rose   City   Press  ")).toBe("Rose City Press");
  });

  it("rejects display names that are too short", () => {
    expect(() => normalizeFantasyDisplayName("A")).toThrowError(
      "Add a display name with at least 2 characters."
    );
  });

  it("normalizes email addresses to lowercase", () => {
    expect(normalizeFantasyEmail("  FAN@Example.COM ")).toBe("fan@example.com");
  });

  it("rejects invalid email addresses", () => {
    expect(() => normalizeFantasyEmail("not-an-email")).toThrowError(
      "Enter a valid email address."
    );
  });

  it("rejects passwords shorter than six characters", () => {
    expect(() => validateFantasyPassword("12345")).toThrowError(
      "Use a password with at least 6 characters."
    );
  });

  it("builds a profile seed from user metadata when available", () => {
    const profileSeed = buildFantasyProfileSeed({
      email: "manager@example.com",
      is_anonymous: false,
      user_metadata: {
        display_name: "  Gotham FC HQ  ",
      },
    });

    expect(profileSeed).toEqual({
      displayName: "Gotham FC HQ",
      email: "manager@example.com",
      onboardingComplete: false,
    });
  });

  it("falls back to a title-cased email local part when metadata is missing", () => {
    const profileSeed = buildFantasyProfileSeed({
      email: "rose.city-press@example.com",
      is_anonymous: false,
      user_metadata: {},
    });

    expect(profileSeed).toEqual({
      displayName: "Rose City Press",
      email: "rose.city-press@example.com",
      onboardingComplete: false,
    });
  });

  it("returns null for anonymous users", () => {
    expect(
      buildFantasyProfileSeed({
        email: "guest@example.com",
        is_anonymous: true,
        user_metadata: {},
      })
    ).toBeNull();
  });
});
