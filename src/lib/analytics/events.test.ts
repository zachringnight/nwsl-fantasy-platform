import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { trackProductEvent, trackEvent, type ProductEventName } from "./events";
import { PRODUCT_KPIS } from "./kpis";

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
});

afterEach(() => {
  // `posthog-js` is a singleton module that Vitest's module registry does
  // not necessarily re-instantiate per test the way it does local source
  // files (see `vi.resetModules()` calls below) -- restore every spy after
  // each test so call counts never accumulate across tests that happen to
  // share the same underlying PostHog instance.
  vi.restoreAllMocks();
});

describe("PostHog adapter runtime behavior", () => {
  it("no-ops without throwing or touching PostHog when no public key is configured", async () => {
    vi.resetModules();
    const posthogModule = await import("posthog-js");
    const initSpy = vi.spyOn(posthogModule.default, "init");
    const captureSpy = vi.spyOn(posthogModule.default, "capture");
    const identifySpy = vi.spyOn(posthogModule.default, "identify");
    const resetSpy = vi.spyOn(posthogModule.default, "reset");

    const events = await import("./events");

    expect(() => events.trackProductEvent("league_joined", { league_id: "league_1" })).not.toThrow();
    expect(() =>
      events.identifyFantasyUser("user_1", { favoriteClub: "Kansas City Current" })
    ).not.toThrow();
    expect(() => events.resetFantasyIdentity()).not.toThrow();
    expect(() => events.trackPageView("/schedule")).not.toThrow();

    expect(initSpy).not.toHaveBeenCalled();
    expect(captureSpy).not.toHaveBeenCalled();
    expect(identifySpy).not.toHaveBeenCalled();
    expect(resetSpy).not.toHaveBeenCalled();
  });

  it("dispatches to posthog.capture with enriched base properties once a public key is configured", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_00000000000000000000000000000000";
    vi.resetModules();

    const posthogModule = await import("posthog-js");
    const initSpy = vi.spyOn(posthogModule.default, "init").mockImplementation(() => posthogModule.default);
    const captureSpy = vi.spyOn(posthogModule.default, "capture").mockImplementation(() => undefined);

    const { trackProductEvent: freshTrackProductEvent } = await import("./events");

    freshTrackProductEvent("league_joined", { league_id: "league_1" });

    expect(initSpy).toHaveBeenCalledTimes(1);
    const [token, config] = initSpy.mock.calls[0];
    expect(token).toBe("phc_test_00000000000000000000000000000000");
    expect(config).toMatchObject({
      capture_pageview: false,
      capture_pageleave: false,
      autocapture: false,
      disable_session_recording: true,
      person_profiles: "identified_only",
    });

    expect(captureSpy).toHaveBeenCalledTimes(1);
    const [eventName, payload] = captureSpy.mock.calls[0];
    expect(eventName).toBe("league_joined");
    expect(payload).toMatchObject({
      league_id: "league_1",
      app_version: "0.0.0",
      route: expect.any(String),
      session_id: expect.any(String),
    });
  });

  it("only initializes PostHog once across multiple track calls", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_00000000000000000000000000000000";
    vi.resetModules();

    const posthogModule = await import("posthog-js");
    const initSpy = vi.spyOn(posthogModule.default, "init").mockImplementation(() => posthogModule.default);
    vi.spyOn(posthogModule.default, "capture").mockImplementation(() => undefined);

    const { trackProductEvent: freshTrackProductEvent } = await import("./events");

    freshTrackProductEvent("league_joined", { league_id: "league_1" });
    freshTrackProductEvent("player_watchlisted", { player_id: "player_1" });

    expect(initSpy).toHaveBeenCalledTimes(1);
  });

  it("identifies a fantasy user with snake_case traits and resets identity through PostHog", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_00000000000000000000000000000000";
    vi.resetModules();

    const posthogModule = await import("posthog-js");
    vi.spyOn(posthogModule.default, "init").mockImplementation(() => posthogModule.default);
    const identifySpy = vi.spyOn(posthogModule.default, "identify").mockImplementation(() => undefined);
    const resetSpy = vi.spyOn(posthogModule.default, "reset").mockImplementation(() => undefined);

    const { identifyFantasyUser: freshIdentify, resetFantasyIdentity: freshReset } = await import(
      "./events"
    );

    freshIdentify("user_1", { favoriteClub: "Kansas City Current", experienceLevel: "casual" });
    expect(identifySpy).toHaveBeenCalledWith("user_1", {
      favorite_club: "Kansas City Current",
      experience_level: "casual",
    });

    freshReset();
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps trackPageView and trackEvent dispatching through the same PostHog adapter", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_00000000000000000000000000000000";
    vi.resetModules();

    const posthogModule = await import("posthog-js");
    vi.spyOn(posthogModule.default, "init").mockImplementation(() => posthogModule.default);
    const captureSpy = vi.spyOn(posthogModule.default, "capture").mockImplementation(() => undefined);

    const { trackPageView: freshTrackPageView, trackEvent: freshTrackEvent } = await import("./events");

    freshTrackPageView("/players/some-slug");
    expect(captureSpy).toHaveBeenLastCalledWith(
      "page_view",
      expect.objectContaining({ path: "/players/some-slug" })
    );

    freshTrackEvent({ name: "sign_up", properties: { method: "guest" } });
    expect(captureSpy).toHaveBeenLastCalledWith("sign_up", expect.objectContaining({ method: "guest" }));
  });
});

describe("PRODUCT_KPIS", () => {
  it("defines all five owner-facing KPI categories with at least one definition each", () => {
    const categories = Object.keys(PRODUCT_KPIS).sort();
    expect(categories).toEqual(["activation", "matchday", "performance", "retention", "trust"]);

    for (const category of categories as (keyof typeof PRODUCT_KPIS)[]) {
      expect(PRODUCT_KPIS[category].length).toBeGreaterThan(0);
      for (const kpi of PRODUCT_KPIS[category]) {
        expect(kpi.id).toBeTruthy();
        expect(kpi.formula).toBeTruthy();
        expect(kpi.target).toBeTruthy();
        expect(kpi.dashboardCut).toBeTruthy();
      }
    }
  });
});

describe("compile-time event contract", () => {
  it("keeps ProductEventName exactly in sync with the documented event list, no typos in either direction", () => {
    // If this test compiles, every entry below is a real ProductEventName
    // (the `satisfies` clause fails otherwise) AND every real
    // ProductEventName appears below (the `AssertNoMissingNames` check
    // fails otherwise, naming the missing literal(s) in its type error).
    const ALL_EVENT_NAMES = [
      // Existing events (kept, unchanged)
      "page_view",
      "sign_up",
      "sign_in",
      "league_created",
      "league_joined",
      "draft_pick",
      "roster_saved",
      "entry_submitted",
      "waiver_claim",
      "player_watchlisted",
      "player_compared",
      "notification_clicked",
      // New events added by this packet's event contract
      "onboarding_completed",
      "lineup_lock_viewed",
      "lineup_submitted",
      "match_center_opened",
      "fantasy_score_event_viewed",
      "contest_viewed",
      "contest_entry_created",
      "draft_autopick",
      "notification_opt_in",
      "share_card_created",
      "data_freshness_warning_seen",
    ] as const satisfies readonly ProductEventName[];

    type MissingFromList = Exclude<ProductEventName, (typeof ALL_EVENT_NAMES)[number]>;
    const assertNoMissingNames: MissingFromList extends never
      ? true
      : ["ProductEventName has event(s) missing from ALL_EVENT_NAMES:", MissingFromList] = true;

    expect(ALL_EVENT_NAMES.length).toBe(23);
    expect(assertNoMissingNames).toBe(true);
  });

  it("rejects event calls that omit a required property (compile-time check)", () => {
    // @ts-expect-error -- league_joined requires league_id.
    trackProductEvent("league_joined", {});

    // @ts-expect-error -- draft_pick also requires player_id and pick_number.
    trackProductEvent("draft_pick", { league_id: "league_1" });

    // @ts-expect-error -- contest_entry_created also requires slate_key.
    trackProductEvent("contest_entry_created", { contest_id: "contest_1" });

    // @ts-expect-error -- fantasy_score_event_viewed also requires player_id.
    trackProductEvent("fantasy_score_event_viewed", { match_id: "match_1" });

    expect(true).toBe(true);
  });

  it("rejects event calls carrying extra/sensitive fields not in the typed contract (compile-time check)", () => {
    // @ts-expect-error -- email is never part of any event's typed properties.
    trackProductEvent("sign_up", { method: "email", email: "zach@example.com" });

    // @ts-expect-error -- free-text message content is never a valid event property.
    trackProductEvent("contest_entry_created", { contest_id: "contest_1", slate_key: "slate_1", message: "gg" });

    // @ts-expect-error -- free-text league chat is never a valid event property.
    trackProductEvent("league_created", { variant: "classic_season_long", build_mode: "snake_draft", chat_message: "welcome to the league" });

    expect(true).toBe(true);
  });

  it("enforces the same required/extra-field rules through the trackEvent back-compat wrapper", () => {
    // Valid: compiles fine, matches league_created's real shape.
    trackEvent({ name: "league_created", properties: { variant: "classic_season_long", build_mode: "snake_draft" } });

    // @ts-expect-error -- waiver_claim requires player_id in addition to league_id.
    trackEvent({ name: "waiver_claim", properties: { league_id: "league_1" } });

    // @ts-expect-error -- email is never a valid property on any event.
    trackEvent({ name: "sign_in", properties: { method: "email", email: "zach@example.com" } });

    expect(true).toBe(true);
  });
});
