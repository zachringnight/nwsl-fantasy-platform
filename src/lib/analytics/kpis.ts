import type { ProductEventName } from "./events";

export interface ProductKpiDefinition {
  id: string;
  label: string;
  formula: string;
  target: string;
  events: readonly ProductEventName[];
  dashboardCut: string;
}

export interface ProductKpis {
  activation: readonly ProductKpiDefinition[];
  retention: readonly ProductKpiDefinition[];
  matchday: readonly ProductKpiDefinition[];
  trust: readonly ProductKpiDefinition[];
  performance: readonly ProductKpiDefinition[];
}

export const PRODUCT_KPIS: ProductKpis = {
  activation: [
    {
      id: "signup_to_league_activation_rate",
      label: "Signup-to-league activation rate",
      formula:
        "count(distinct session_id where sign_up and either league_created or league_joined occur in the same session) / count(distinct session_id where sign_up occurs)",
      target: ">= 60% same-session activation",
      events: ["sign_up", "league_created", "league_joined"],
      dashboardCut:
        "Signup method, day/week, and onboarding_completed conversion.",
    },
  ],
  retention: [
    {
      id: "weekly_legal_lineup_submission_rate",
      label: "Weekly legal-lineup submission rate",
      formula:
        "count(distinct distinct_id with lineup_submitted before lock in the scoring week) / count(distinct distinct_id who are active-league managers in that scoring week)",
      target: ">= 70% of managers in active leagues per scoring week",
      events: ["lineup_lock_viewed", "lineup_submitted"],
      dashboardCut:
        "League age, league size, experience_level, and lock-view-to-submit conversion.",
    },
  ],
  matchday: [
    {
      id: "matchday_live_engagement_rate",
      label: "Matchday live engagement rate",
      formula:
        "count(distinct distinct_id with match_center_opened or fantasy_score_event_viewed during a live window) / count(distinct distinct_id who are active managers with a roster player in that window)",
      target: ">= 50% of active managers per live scoring window",
      events: ["match_center_opened", "fantasy_score_event_viewed"],
      dashboardCut:
        "Kickoff window, favorite_club, route, and device class.",
    },
  ],
  trust: [
    {
      id: "data_freshness_warning_exposure_rate",
      label: "Data freshness warning exposure rate",
      formula:
        "count(distinct session_id with data_freshness_warning_seen) / count(distinct session_id with match_center_opened or fantasy_score_event_viewed)",
      target: "Trend toward 0%; investigate any scoring week above 5%",
      events: [
        "data_freshness_warning_seen",
        "match_center_opened",
        "fantasy_score_event_viewed",
      ],
      dashboardCut:
        "Warning surface, match identifier when available, and scoring week.",
    },
    {
      id: "draft_autopick_incidence_rate",
      label: "Draft autopick incidence rate",
      formula: "count(draft_autopick) / count(draft_autopick or draft_pick)",
      target: "Trend toward 0%; investigate any draft above 10%",
      events: ["draft_pick", "draft_autopick"],
      dashboardCut: "League, draft round/slot, and scheduled time of day.",
    },
  ],
  performance: [
    {
      id: "mobile_p75_lcp",
      label: "Mobile p75 Largest Contentful Paint",
      formula: "p75(LCP) from Vercel Speed Insights for mobile devices",
      target: "< 2.5s",
      events: [],
      dashboardCut: "Route template.",
    },
    {
      id: "mobile_p75_inp",
      label: "Mobile p75 Interaction to Next Paint",
      formula: "p75(INP) from Vercel Speed Insights for mobile devices",
      target: "< 200ms",
      events: [],
      dashboardCut: "Route template.",
    },
    {
      id: "mobile_p75_cls",
      label: "Mobile p75 Cumulative Layout Shift",
      formula: "p75(CLS) from Vercel Speed Insights for mobile devices",
      target: "< 0.1",
      events: [],
      dashboardCut: "Route template.",
    },
  ],
};
