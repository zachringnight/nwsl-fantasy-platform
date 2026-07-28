/**
 * Product analytics event tracking.
 *
 * Every tracking call funnels through `trackProductEvent`, which dispatches
 * to PostHog (`posthog-js`) when `NEXT_PUBLIC_POSTHOG_KEY` is configured for
 * the current deployment. Without a public key (e.g. local development, a
 * preview environment that hasn't been given credentials, or any test run),
 * every exported function in this module is a deliberate, silent no-op: it
 * never throws and never logs a warning. See `ensurePostHogReady` below.
 *
 * PII rule (see docs/analytics/NWSL_Fantasy_Event_Taxonomy_v1.md): never
 * pass an email address, message content, or free-text league chat as an
 * event or identify property. `ProductEventProperties` is a closed set of
 * typed shapes so TypeScript rejects unexpected properties on any event
 * call that uses an object literal -- see events.test.ts for compile-time
 * proof.
 */

import posthog from "posthog-js";

// ---------------------------------------------------------------------------
// Typed event contract
// ---------------------------------------------------------------------------

/**
 * One property shape per event name. Keep this list in sync with
 * docs/analytics/NWSL_Fantasy_Event_Taxonomy_v1.md.
 *
 * `app_version`, `route`, and the anonymous session id are NOT part of
 * these per-event shapes -- `trackProductEvent` injects them automatically
 * on every call (see `buildBaseProperties`) so call sites can't forget them
 * or get them wrong.
 */
export interface ProductEventProperties {
  // --- Existing events (unchanged names/shapes) -----------------------------
  page_view: { path: string; referrer?: string };
  sign_up: { method: "email" | "guest" };
  sign_in: { method: "email" | "guest" };
  league_created: { variant: string; build_mode: string };
  league_joined: { league_id: string };
  draft_pick: { league_id: string; player_id: string; pick_number: number };
  roster_saved: { league_id: string };
  entry_submitted: { league_id: string; slate_key: string };
  waiver_claim: { league_id: string; player_id: string };
  player_watchlisted: { player_id: string };
  player_compared: { left_id: string; right_id: string };
  notification_clicked: { notification_id: string };

  // --- New events (packet 02 event contract) --------------------------------
  onboarding_completed: { user_id: string };
  lineup_lock_viewed: { league_id: string };
  lineup_submitted: { league_id: string };
  match_center_opened: { match_id: string };
  fantasy_score_event_viewed: { match_id: string; player_id: string };
  contest_viewed: { contest_id: string };
  contest_entry_created: { contest_id: string; slate_key: string };
  draft_autopick: { league_id: string; player_id: string; pick_number: number };
  notification_opt_in: { channel: "email" | "push" };
  share_card_created: { card_type: string };
  data_freshness_warning_seen: { surface: string };
}

export type ProductEventName = keyof ProductEventProperties;

/** Present on every event PostHog receives, injected by `trackProductEvent`. */
interface BaseEventProperties {
  app_version: string;
  route: string;
  session_id: string;
}

// ---------------------------------------------------------------------------
// Base property enrichment
// ---------------------------------------------------------------------------

const SESSION_STORAGE_KEY = "nwsl_fantasy_analytics_session_id";

/**
 * A per-tab anonymous session id, independent of PostHog's own internal
 * session concept so enrichment behaves identically whether or not a
 * PostHog key is configured. Generated once per browser tab and cached in
 * `sessionStorage`; never throws (privacy modes can make storage
 * inaccessible, in which case we fall back to a constant rather than
 * crashing analytics).
 */
function getAnonymousSessionId(): string {
  if (typeof window === "undefined") return "server";

  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;

    const generated =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

    window.sessionStorage.setItem(SESSION_STORAGE_KEY, generated);
    return generated;
  } catch {
    return "unavailable";
  }
}

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

function buildBaseProperties(): BaseEventProperties {
  return {
    app_version: APP_VERSION,
    route: typeof window !== "undefined" ? window.location.pathname : "server",
    session_id: getAnonymousSessionId(),
  };
}

// ---------------------------------------------------------------------------
// PostHog adapter
// ---------------------------------------------------------------------------

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let posthogReady = false;

/**
 * Lazily initializes the PostHog client on first use and reports whether
 * dispatch should proceed. Returns `false` (no-op) when there is no public
 * key configured or we're not in a browser -- this is the single gate every
 * exported tracking function checks, so "no key configured" always means
 * "silently do nothing," never "throw" or "warn."
 */
function ensurePostHogReady(): boolean {
  if (!POSTHOG_KEY) return false;
  if (typeof window === "undefined") return false;

  if (!posthogReady) {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      // We dispatch an explicit `page_view` event ourselves (see
      // trackPageView) -- disable PostHog's automatic pageview/pageleave
      // capture so events aren't duplicated under two different names.
      capture_pageview: false,
      capture_pageleave: false,
      // Autocapture records raw DOM interactions (clicks, form field
      // values in some configurations). Given the strict PII rule for
      // this product (never email, message content, or free-text league
      // chat), autocapture stays off -- every event this app sends is one
      // of the explicit, typed events below.
      autocapture: false,
      // Defense in depth against the same PII risk: never start session
      // replay from this client, regardless of project-level dashboard
      // settings.
      disable_session_recording: true,
      // Only create a full PostHog "person" profile once we actually
      // identify a fantasy user; anonymous browsing stays lightweight.
      person_profiles: "identified_only",
    });
    posthogReady = true;
  }

  return true;
}

/**
 * Tracks a typed product event. Dispatches to PostHog when configured;
 * otherwise a silent no-op. `app_version`, `route`, and the anonymous
 * session id are attached automatically.
 */
export function trackProductEvent<T extends ProductEventName>(
  name: T,
  properties: ProductEventProperties[T]
): void {
  const payload: Record<string, unknown> = { ...buildBaseProperties(), ...properties };

  if (process.env.NODE_ENV === "development") {
    console.debug(`[analytics] ${name}`, payload);
  }

  if (!ensurePostHogReady()) {
    return;
  }

  posthog.capture(name, payload);
}

/**
 * Associates subsequent events with a known fantasy manager. Call this once
 * an authenticated session resolves. Traits are limited to non-sensitive
 * profile facts -- never pass email or any free-text field.
 */
export function identifyFantasyUser(
  userId: string,
  traits: { favoriteClub?: string; experienceLevel?: string }
): void {
  if (!ensurePostHogReady()) return;

  posthog.identify(userId, {
    favorite_club: traits.favoriteClub,
    experience_level: traits.experienceLevel,
  });
}

/**
 * Clears the current PostHog identity. Call this on sign-out so the next
 * anonymous session doesn't inherit the previous manager's identity.
 */
export function resetFantasyIdentity(): void {
  if (!ensurePostHogReady()) return;

  posthog.reset();
}

// ---------------------------------------------------------------------------
// Backward-compatible helpers (existing public API, kept intact)
// ---------------------------------------------------------------------------

/**
 * Generic event dispatcher, kept for backward compatibility with the
 * pre-existing `trackEvent({ name, properties })` call shape. New call
 * sites should prefer `trackProductEvent(name, properties)` directly.
 */
export function trackEvent<T extends ProductEventName>(event: {
  name: T;
  properties: ProductEventProperties[T];
}): void {
  trackProductEvent(event.name, event.properties);
}

export function trackPageView(path: string): void {
  trackProductEvent("page_view", {
    path,
    referrer: typeof document !== "undefined" ? document.referrer : undefined,
  });
}
