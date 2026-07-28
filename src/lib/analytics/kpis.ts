/**
 * Owner-facing product KPI definitions.
 *
 * These mirror the success measures in
 * `plans/2026-07-22-best-possible-nwsl-app/manifest.md` and the exact
 * formulas documented in
 * `docs/analytics/NWSL_Fantasy_Event_Taxonomy_v1.md`. Keep all three in
 * sync when a KPI changes.
 *
 * `events` lists the `ProductEventName`s each KPI is computed from -- this
 * is typed against the real event union so a typo or renamed event fails
 * `pnpm typecheck` instead of silently drifting from reality. An empty
 * `events` array means the KPI is sourced from Vercel Speed Insights (Web
 * Vitals), not from a PostHog product event.
 */

import type { ProductEventName } from "./events";

export interface ProductKpiDefinition {
  /** Stable identifier for dashboards/alerts. */
  id: string;
  label: string;
  /** Exact numerator/denominator (or source) for the metric. */
  formula: string;
  /** Target lifted from the plan's success measures. */
  target: string;
  /** Which product events feed this KPI. Empty for Web Vitals KPIs. */
  events: readonly ProductEventName[];
  /** How an owner should be able to slice this KPI on a dashboard. */
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
        "count(distinct session_id where sign_up occurred AND (league_created OR league_joined) occurred in that same session_id) / count(distinct session_id where sign_up occurred)",
      target: ">= 60% (same-session activation)",
      events: ["sign_up", "league_created", "league_joined"],
      dashboardCut:
        "By signup method (email vs guest), by day/week, by onboarding completion (joined with onboarding_completed).",
    },
  ],
  retention: [
    {
      id: "weekly_legal_lineup_submission_rate",
      label: "Weekly legal-lineup submission rate",
      formula:
        "count(distinct user_id with lineup_submitted before lock, current scoring week) / count(distinct user_id who are active-league managers, current scoring week)",
      target: ">= 70% of managers in active leagues, per scoring week",
      events: ["lineup_lock_viewed", "lineup_submitted", "roster_saved"],
      dashboardCut:
        "By league age in weeks since creation, by league size, by manager experience_level (identify trait), by lineup_lock_viewed-to-lineup_submitted conversion.",
    },
  ],
  matchday: [
    {
      id: "matchday_live_engagement_rate",
      label: "Matchday live engagement rate",
      formula:
        "count(distinct user_id with match_center_opened OR fantasy_score_event_viewed during a live scoring window) / count(distinct user_id who are active managers with a live match affecting their roster that window)",
      target: ">= 50% of active managers per scoring window",
      events: ["match_center_opened", "fantasy_score_event_viewed"],
      dashboardCut:
        "By kickoff window/day-of-week, by favoriteClub (identify trait), by route (match center vs matchup), by device class.",
    },
  ],
  trust: [
    {
      id: "data_freshness_warning_exposure_rate",
      label: "Data freshness warning exposure rate",
      formula:
        "count(session_id with data_freshness_warning_seen) / count(session_id with match_center_opened OR fantasy_score_event_viewed)",
      target: "trending toward 0%; investigate any scoring week above 5%",
      events: ["data_freshness_warning_seen", "match_center_opened", "fantasy_score_event_viewed"],
      dashboardCut:
        "By surface property on data_freshness_warning_seen (match_center, standings, player_page, matchup), by match_id where available.",
    },
    {
      id: "draft_autopick_incidence_rate",
      label: "Draft autopick incidence rate",
      formula: "count(draft_autopick) / count(draft_autopick OR draft_pick)",
      target: "trending toward 0%; investigate any draft above 10%",
      events: ["draft_pick", "draft_autopick"],
      dashboardCut: "By league_id, by draft pick round/slot, by scheduled draft time-of-day.",
    },
  ],
  performance: [
    {
      id: "mobile_p75_lcp",
      label: "Mobile p75 Largest Contentful Paint",
      formula: "p75(LCP) from Vercel Speed Insights, mobile device segment",
      target: "< 2.5s",
      events: [],
      dashboardCut: "By route template (player, team, schedule, match center, matchup).",
    },
    {
      id: "mobile_p75_inp",
      label: "Mobile p75 Interaction to Next Paint",
      formula: "p75(INP) from Vercel Speed Insights, mobile device segment",
      target: "< 200ms",
      events: [],
      dashboardCut: "By route template (player, team, schedule, match center, matchup).",
    },
    {
      id: "mobile_p75_cls",
      label: "Mobile p75 Cumulative Layout Shift",
      formula: "p75(CLS) from Vercel Speed Insights, mobile device segment",
      target: "< 0.1",
      events: [],
      dashboardCut: "By route template (player, team, schedule, match center, matchup).",
    },
  ],
};
