/**
 * Client-side analytics event tracking.
 *
 * In production, replace the internal dispatch with your analytics provider
 * (e.g. PostHog, Amplitude, Mixpanel, or a custom endpoint).
 */

type AnalyticsEvent =
  | { name: "page_view"; properties: { path: string; referrer?: string } }
  | { name: "sign_up"; properties: { method: "email" | "google" | "guest" } }
  | { name: "sign_in"; properties: { method: "email" | "google" | "guest" } }
  | { name: "league_created"; properties: { variant: string; build_mode: string } }
  | { name: "league_joined"; properties: { league_id: string } }
  | { name: "draft_pick"; properties: { league_id: string; player_id: string; pick_number: number } }
  | { name: "roster_saved"; properties: { league_id: string } }
  | { name: "entry_submitted"; properties: { league_id: string; slate_key: string } }
  | { name: "waiver_claim"; properties: { league_id: string; player_id: string } }
  | { name: "player_watchlisted"; properties: { player_id: string } }
  | { name: "player_compared"; properties: { left_id: string; right_id: string } }
  | { name: "notification_clicked"; properties: { notification_id: string } };

const eventQueue: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function dispatch(event: AnalyticsEvent): void {
  eventQueue.push(event);

  // Batch events and flush periodically
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flush();
      flushTimer = null;
    }, 2000);
  }
}

function flush(): void {
  if (eventQueue.length === 0) return;

  const events = eventQueue.splice(0, eventQueue.length);

  // In production, send events to your analytics endpoint:
  // fetch("/api/analytics", { method: "POST", body: JSON.stringify({ events }) });

  if (process.env.NODE_ENV === "development") {
    for (const event of events) {
      console.log(`[analytics] ${event.name}`, event.properties);
    }
  }
}

export function trackEvent(event: AnalyticsEvent): void {
  dispatch(event);
}

export function trackPageView(path: string): void {
  dispatch({
    name: "page_view",
    properties: {
      path,
      referrer: typeof document !== "undefined" ? document.referrer : undefined,
    },
  });
}

// Flush remaining events on page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flush);
}
