/**
 * Privacy-safe product analytics.
 *
 * Product events are typed, enriched in one place, and delivered to PostHog
 * only when a public project key is configured. The SDK is dynamically
 * imported after an event or identity call, which keeps it out of the initial
 * client bundle and makes local/test environments a silent no-op.
 */

export interface ProductEventProperties {
  page_view: { path: string; referrer_origin?: string };
  sign_up: { method: "email" | "guest" };
  sign_in: { method: "email" | "guest" };
  onboarding_completed: { next_step: "create" | "join" | "dashboard" };
  league_created: { variant: string; build_mode: string };
  league_joined: { league_id: string };
  draft_pick: { league_id: string; player_id: string; pick_number: number };
  draft_autopick: { league_id: string; player_id: string; pick_number: number };
  draft_completed: { league_id: string; total_picks: number };
  roster_saved: { league_id: string };
  lineup_lock_viewed: { league_id: string; is_locked: boolean };
  lineup_submitted: { league_id: string };
  entry_submitted: { league_id: string; slate_key: string };
  contest_viewed: { contest_id: string };
  contest_entry_created: { contest_id: string; slate_key: string };
  match_center_opened: { match_id: string };
  fantasy_score_event_viewed: { match_id: string; player_id: string };
  waiver_claim: { league_id: string; player_id: string };
  player_watchlisted: { player_id: string };
  player_compared: { left_id: string; right_id: string };
  notification_clicked: { notification_id: string };
  notification_opt_in: {
    channel: "email" | "push";
    preference_id: string;
  };
  share_card_created: { card_type: string };
  data_freshness_warning_seen: { surface: string };
}

export type ProductEventName = keyof ProductEventProperties;

export interface FantasyUserAnalyticsTraits {
  favoriteClub?: string;
  experienceLevel?: string;
}

interface BaseEventProperties {
  app_version: string;
  route: string;
  session_id: string;
}

type PostHogClient = typeof import("posthog-js")["default"];

const SESSION_STORAGE_KEY = "nwsl_fantasy_analytics_session_id";
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "development";
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

let posthogClientPromise: Promise<PostHogClient | null> | null = null;
let inMemorySessionId: string | null = null;

function createSessionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `sid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function getAnonymousSessionId(): string {
  if (typeof window === "undefined") {
    return "server";
  }

  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) {
      return existing;
    }

    const generated = createSessionId();

    window.sessionStorage.setItem(SESSION_STORAGE_KEY, generated);
    return generated;
  } catch {
    inMemorySessionId ??= createSessionId();
    return inMemorySessionId;
  }
}

function buildBaseProperties(): BaseEventProperties {
  return {
    app_version: APP_VERSION,
    route:
      typeof window === "undefined" ? "server" : window.location.pathname,
    session_id: getAnonymousSessionId(),
  };
}

function getPostHogClient(): Promise<PostHogClient | null> {
  if (!POSTHOG_KEY || typeof window === "undefined") {
    return Promise.resolve(null);
  }

  posthogClientPromise ??= import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        autocapture: false,
        capture_pageleave: false,
        capture_pageview: false,
        disable_session_recording: true,
        person_profiles: "identified_only",
        persistence: "localStorage",
      });

      return posthog;
    })
    .catch(() => null);

  return posthogClientPromise;
}

export function trackProductEvent<T extends ProductEventName>(
  name: T,
  properties: ProductEventProperties[T]
): void {
  if (!POSTHOG_KEY || typeof window === "undefined") {
    return;
  }

  const payload: Record<string, unknown> = {
    ...buildBaseProperties(),
    ...properties,
  };

  void getPostHogClient().then((posthog) => {
    posthog?.capture(name, payload);
  }).catch(() => undefined);
}

export function identifyFantasyUser(
  userId: string,
  traits: FantasyUserAnalyticsTraits
): void {
  if (!userId || !POSTHOG_KEY || typeof window === "undefined") {
    return;
  }

  void getPostHogClient().then((posthog) => {
    posthog?.identify(userId, {
      experience_level: traits.experienceLevel,
      favorite_club: traits.favoriteClub,
    });
  }).catch(() => undefined);
}

export function resetFantasyIdentity(): void {
  if (!POSTHOG_KEY || typeof window === "undefined") {
    return;
  }

  void getPostHogClient().then((posthog) => {
    posthog?.reset();
  }).catch(() => undefined);
}

/**
 * Backward-compatible event shape for existing call sites.
 */
export function trackEvent<T extends ProductEventName>(event: {
  name: T;
  properties: ProductEventProperties[T];
}): void {
  trackProductEvent(event.name, event.properties);
}

export function trackPageView(path: string): void {
  let referrerOrigin: string | undefined;

  if (typeof document !== "undefined" && document.referrer) {
    try {
      referrerOrigin = new URL(document.referrer).origin;
    } catch {
      referrerOrigin = undefined;
    }
  }

  trackProductEvent("page_view", {
    path,
    referrer_origin: referrerOrigin,
  });
}
