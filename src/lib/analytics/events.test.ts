import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRODUCT_KPIS } from "./kpis";
import type {
  identifyFantasyUser as IdentifyFantasyUser,
  trackProductEvent as TrackProductEvent,
} from "./events";

const posthog = {
  capture: vi.fn(),
  identify: vi.fn(),
  init: vi.fn(),
  reset: vi.fn(),
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete process.env.NEXT_PUBLIC_APP_VERSION;
  delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
});

afterEach(() => {
  vi.doUnmock("posthog-js");
});

describe("product analytics adapter", () => {
  it("does not load PostHog when no public key is configured", async () => {
    const moduleFactory = vi.fn(() => ({ default: posthog }));
    vi.doMock("posthog-js", moduleFactory);
    const events = await import("./events");

    events.trackProductEvent("league_joined", { league_id: "league_1" });
    events.identifyFantasyUser("user_1", {
      favoriteClub: "Kansas City Current",
    });
    events.resetFantasyIdentity();
    await Promise.resolve();

    expect(moduleFactory).not.toHaveBeenCalled();
    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("loads and initializes PostHog once for configured events", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://analytics.example.test";
    process.env.NEXT_PUBLIC_APP_VERSION = "2026.07.28";
    vi.doMock("posthog-js", () => ({ default: posthog }));
    const events = await import("./events");

    events.trackProductEvent("league_joined", { league_id: "league_1" });
    events.trackProductEvent("player_watchlisted", { player_id: "player_1" });

    await vi.waitFor(() => {
      expect(posthog.capture).toHaveBeenCalledTimes(2);
    });
    expect(posthog.init).toHaveBeenCalledTimes(1);
    expect(posthog.init).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({
        api_host: "https://analytics.example.test",
        autocapture: false,
        capture_pageleave: false,
        capture_pageview: false,
        disable_session_recording: true,
        person_profiles: "identified_only",
        persistence: "localStorage",
      })
    );
    expect(posthog.capture).toHaveBeenNthCalledWith(
      1,
      "league_joined",
      expect.objectContaining({
        app_version: "2026.07.28",
        league_id: "league_1",
        route: "/",
        session_id: expect.any(String),
      })
    );
  });

  it("reduces referrers to their origin before capture", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    vi.doMock("posthog-js", () => ({ default: posthog }));
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value:
        "https://invite.example.test/private/path?token=secret#message-content",
    });
    const events = await import("./events");

    events.trackPageView("/dashboard");

    await vi.waitFor(() => {
      expect(posthog.capture).toHaveBeenCalledWith(
        "page_view",
        expect.objectContaining({
          path: "/dashboard",
          referrer_origin: "https://invite.example.test",
        })
      );
    });
    expect(JSON.stringify(posthog.capture.mock.calls)).not.toContain("secret");
    expect(JSON.stringify(posthog.capture.mock.calls)).not.toContain(
      "message-content"
    );
  });

  it("preserves event order while the SDK import resolves", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    let resolveModule:
      | ((module: { default: typeof posthog }) => void)
      | undefined;
    vi.doMock(
      "posthog-js",
      () =>
        new Promise<{ default: typeof posthog }>((resolve) => {
          resolveModule = resolve;
        })
    );
    const events = await import("./events");

    events.trackProductEvent("sign_up", { method: "guest" });
    events.trackProductEvent("onboarding_completed", {
      next_step: "create",
    });
    await vi.waitFor(() => {
      expect(resolveModule).toBeTypeOf("function");
    });
    resolveModule?.({ default: posthog });

    await vi.waitFor(() => {
      expect(posthog.capture).toHaveBeenCalledTimes(2);
    });
    expect(posthog.capture.mock.calls.map(([eventName]) => eventName)).toEqual([
      "sign_up",
      "onboarding_completed",
    ]);
  });

  it("swallows SDK loading failures", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    vi.doMock("posthog-js", () => {
      throw new Error("network unavailable");
    });
    const events = await import("./events");

    expect(() =>
      events.trackProductEvent("league_joined", { league_id: "league_1" })
    ).not.toThrow();
    await Promise.resolve();

    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("swallows provider errors after the SDK has loaded", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    posthog.capture.mockImplementationOnce(() => {
      throw new Error("provider unavailable");
    });
    vi.doMock("posthog-js", () => ({ default: posthog }));
    const events = await import("./events");

    expect(() =>
      events.trackProductEvent("league_joined", { league_id: "league_1" })
    ).not.toThrow();
    await vi.waitFor(() => {
      expect(posthog.capture).toHaveBeenCalledTimes(1);
    });
  });

  it("identifies allowlisted traits and resets through the same client", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    vi.doMock("posthog-js", () => ({ default: posthog }));
    const events = await import("./events");

    events.identifyFantasyUser("user_1", {
      experienceLevel: "casual",
      favoriteClub: "Kansas City Current",
    });
    events.resetFantasyIdentity();

    await vi.waitFor(() => {
      expect(posthog.reset).toHaveBeenCalledTimes(1);
    });
    expect(posthog.identify).toHaveBeenCalledWith("user_1", {
      experience_level: "casual",
      favorite_club: "Kansas City Current",
    });
  });
});

describe("typed event contract", () => {
  it("covers every owner-facing KPI category", () => {
    expect(Object.keys(PRODUCT_KPIS).sort()).toEqual([
      "activation",
      "matchday",
      "performance",
      "retention",
      "trust",
    ]);
    expect(
      Object.values(PRODUCT_KPIS).every((definitions) => definitions.length > 0)
    ).toBe(true);
  });
});

declare const typecheckTrackProductEvent: typeof TrackProductEvent;
declare const typecheckIdentifyFantasyUser: typeof IdentifyFantasyUser;

if (false) {
  // @ts-expect-error league_joined requires a league id
  typecheckTrackProductEvent("league_joined", {});

  typecheckTrackProductEvent("sign_up", {
    method: "email",
    // @ts-expect-error email is intentionally excluded from analytics payloads
    email: "private@example.test",
  });

  typecheckTrackProductEvent("league_joined", {
    league_id: "league_1",
    // @ts-expect-error free-text chat content is never an analytics property
    message: "private message",
  });

  typecheckTrackProductEvent("page_view", {
    path: "/dashboard",
    // @ts-expect-error raw referrers are disallowed; only referrer_origin is valid
    referrer: "https://example.test/private?token=secret",
  });

  typecheckIdentifyFantasyUser("user_1", {
    favoriteClub: "Bay FC",
    // @ts-expect-error email is not an allowlisted identity trait
    email: "private@example.test",
  });
}
