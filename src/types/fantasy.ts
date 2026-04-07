export type PlayerPosition = "GK" | "DEF" | "MID" | "FWD";
export type FantasyExperienceLevel = "new" | "casual" | "experienced";
export type FantasyLeagueRole = "commissioner" | "manager";
export type FantasyDraftStatus = "scheduled" | "lobby" | "live" | "paused" | "complete";
export type FantasyDraftPickSource = "manual" | "queue" | "autopick" | "commissioner";
export type FantasyWaiverClaimStatus = "pending" | "won" | "lost" | "canceled";
export type FantasyTransactionType = "waiver_add" | "free_agent_add" | "drop" | "commissioner";
export type FantasyTransactionStatus = "pending" | "processed" | "rejected";
export type FantasySalaryCapEntryStatus = "draft" | "saved" | "submitted";
export type FantasySalaryCapEntryWindowStatus =
  | "open"
  | "submitted"
  | "locked"
  | "missed";
export type AvailabilityStatus = "available" | "questionable" | "out";
export type FantasyGameVariant =
  | "classic_season_long"
  | "salary_cap_season_long"
  | "salary_cap_weekly"
  | "salary_cap_daily";
export type FantasyRosterBuildMode = "snake_draft" | "salary_cap";
export type FantasyPlayerOwnershipMode = "exclusive" | "shared";
export type FantasyContestHorizon = "season" | "weekly" | "daily";
export type FantasyLeaguePlayerOwnershipStatus = "available" | "drafted" | "shared_pool";
export type FantasyLineupSlot =
  | "GK"
  | "DEF_1"
  | "DEF_2"
  | "MID_1"
  | "MID_2"
  | "MID_3"
  | "FWD_1"
  | "FWD_2"
  | "FLEX"
  | "BENCH_1"
  | "BENCH_2"
  | "BENCH_3";
export type FantasySalaryCapLineupSlot = Exclude<
  FantasyLineupSlot,
  "BENCH_1" | "BENCH_2" | "BENCH_3"
>;

export interface FantasyProfile {
  user_id: string;
  email: string | null;
  display_name: string;
  favorite_club: string | null;
  experience_level: FantasyExperienceLevel | null;
  onboarding_complete: boolean;
  created_at: string;
  updated_at: string;
}

export interface FantasyLeagueRecord {
  id: string;
  name: string;
  code: string;
  privacy: "private" | "public";
  status: "setup" | "ready" | "live" | "complete";
  game_variant: FantasyGameVariant;
  roster_build_mode: FantasyRosterBuildMode;
  player_ownership_mode: FantasyPlayerOwnershipMode;
  contest_horizon: FantasyContestHorizon;
  salary_cap_amount: number | null;
  manager_count_target: number;
  draft_at: string;
  commissioner_user_id: string;
}

export interface FantasyLeagueMembershipRecord {
  id: string;
  league_id: string;
  user_id: string;
  role: FantasyLeagueRole;
  display_name: string;
  team_name: string;
  joined_at: string;
  draft_slot?: number | null;
  waiver_priority?: number | null;
}

export interface FantasyLeagueSummary {
  league: FantasyLeagueRecord;
  memberCount: number;
  membershipRole: FantasyLeagueRole;
}

export interface FantasySlateWindow {
  key: string;
  label: string;
  cadence: FantasyContestHorizon;
  starts_at: string;
  lock_at: string;
  ends_at: string;
  match_count: number;
  slate_keys: string[];
}

export interface FantasyLeagueDetails {
  league: FantasyLeagueRecord;
  memberships: FantasyLeagueMembershipRecord[];
  currentMembership: FantasyLeagueMembershipRecord | null;
}

export interface FantasyDraftRecord {
  league_id: string;
  status: FantasyDraftStatus;
  total_rounds: number;
  order_revealed_at: string | null;
  current_pick_started_at: string | null;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FantasyDraftPickRecord {
  id: string;
  league_id: string;
  round_number: number;
  pick_number: number;
  overall_pick: number;
  membership_id: string;
  manager_user_id: string;
  player_id: string;
  player_name: string;
  player_position: PlayerPosition;
  club_name: string;
  source: FantasyDraftPickSource;
  picked_at: string;
}

export interface FantasyDraftQueueItemRecord {
  id: string;
  league_id: string;
  user_id: string;
  player_id: string;
  player_name: string;
  player_position: PlayerPosition;
  club_name: string;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface FantasyRosterSlotRecord {
  id: string;
  league_id: string;
  user_id: string;
  player_id: string;
  player_name: string;
  player_position: PlayerPosition;
  club_name: string;
  acquisition_source: "draft" | "waiver" | "free_agent" | "commissioner";
  lineup_slot: FantasyLineupSlot | null;
  acquired_at: string;
  updated_at: string;
}

export interface FantasyPoolPlayer {
  id: string;
  display_name: string;
  club_name: string;
  position: PlayerPosition;
  average_points: number;
  salary_cost: number;
  availability: AvailabilityStatus;
  rank: number;
  /** Player headshot URL (optional — falls back to initials) */
  photo_url?: string;
}

export interface FantasyRosterPlayer extends FantasyRosterSlotRecord {
  player: FantasyPoolPlayer;
}

export interface FantasyLeaguePlayerListing {
  player: FantasyPoolPlayer;
  ownership_status: FantasyLeaguePlayerOwnershipStatus;
  rostered_by_display_name: string | null;
  rostered_by_user_id: string | null;
}

export interface FantasyDraftTurnContext {
  overallPick: number;
  roundNumber: number;
  pickNumber: number;
  membership: FantasyLeagueMembershipRecord | null;
  isFinalPick: boolean;
  totalPicks: number;
}

export interface FantasyDraftState {
  league: FantasyLeagueRecord;
  draft: FantasyDraftRecord;
  memberships: FantasyLeagueMembershipRecord[];
  picks: FantasyDraftPickRecord[];
  queue: FantasyDraftQueueItemRecord[];
  myRoster: FantasyRosterPlayer[];
  availablePlayers: FantasyPoolPlayer[];
  myMembership: FantasyLeagueMembershipRecord | null;
  currentTurn: FantasyDraftTurnContext | null;
  isMyTurn: boolean;
  canCommissionerControl: boolean;
}

export interface FantasyStandingRecord {
  rank: number;
  membership_id: string;
  user_id: string;
  display_name: string;
  team_name: string;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  win_pct: number;
  projected_points: number;
}

export interface FantasyStandingsState {
  league: FantasyLeagueRecord;
  completed_weeks: number;
  playoff_cutoff: number;
  standings: FantasyStandingRecord[];
}

export interface FantasyWaiverClaimRecord {
  id: string;
  league_id: string;
  user_id: string;
  requested_player_id: string;
  requested_player_name: string;
  requested_player_position: PlayerPosition;
  requested_club_name: string;
  drop_roster_slot_id: string | null;
  dropped_player_id: string | null;
  dropped_player_name: string | null;
  dropped_player_position: PlayerPosition | null;
  dropped_club_name: string | null;
  priority_at_submission: number;
  status: FantasyWaiverClaimStatus;
  resolution_note: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FantasyTransactionRecord {
  id: string;
  league_id: string;
  user_id: string;
  type: FantasyTransactionType;
  status: FantasyTransactionStatus;
  player_id: string;
  player_name: string;
  player_position: PlayerPosition;
  club_name: string;
  related_waiver_claim_id: string | null;
  dropped_player_id: string | null;
  dropped_player_name: string | null;
  dropped_player_position: PlayerPosition | null;
  dropped_club_name: string | null;
  note: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FantasyTransactionHubState {
  league: FantasyLeagueRecord;
  myMembership: FantasyLeagueMembershipRecord;
  roster: FantasyRosterPlayer[];
  claimable_players: FantasyPoolPlayer[];
  pending_claims: FantasyWaiverClaimRecord[];
  transaction_history: FantasyTransactionRecord[];
  waiver_priority: number | null;
  canCommissionerControl: boolean;
}

export interface FantasySalaryCapEntryRecord {
  id: string;
  league_id: string;
  user_id: string;
  slate_key: string;
  entry_name: string;
  status: FantasySalaryCapEntryStatus;
  salary_spent: number;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FantasySalaryCapEntrySlotRecord {
  id: string;
  entry_id: string;
  league_id: string;
  user_id: string;
  lineup_slot: FantasySalaryCapLineupSlot;
  player_id: string;
  player_name: string;
  player_position: PlayerPosition;
  club_name: string;
  salary_cost: number;
  created_at: string;
  updated_at: string;
}

export interface FantasySalaryCapEntrySlot {
  lineup_slot: FantasySalaryCapLineupSlot;
  player: FantasyPoolPlayer | null;
  record: FantasySalaryCapEntrySlotRecord | null;
}

export interface FantasySalaryCapEntryWindowState {
  status: FantasySalaryCapEntryWindowStatus;
  tone: "info" | "success" | "warning";
  title: string;
  message: string;
  slate_key: string;
  slate_label: string;
  starts_at: string;
  lock_at: string;
  ends_at: string;
  is_locked: boolean;
  requires_submission: boolean;
}

export interface FantasySalaryCapEntryState {
  league: FantasyLeagueRecord;
  myMembership: FantasyLeagueMembershipRecord;
  entry: FantasySalaryCapEntryRecord;
  slate: FantasySlateWindow;
  available_slates: FantasySlateWindow[];
  entry_window: FantasySalaryCapEntryWindowState;
  slots: FantasySalaryCapEntrySlot[];
  available_players: FantasyPoolPlayer[];
  salary_spent: number;
  remaining_budget: number;
  projected_points: number;
  selected_count: number;
  is_complete: boolean;
}

export interface FantasyMatchupContribution {
  player_id: string;
  player_name: string;
  player_position: PlayerPosition;
  club_name: string;
  fantasy_points: number;
  note: string;
}

export interface FantasyMatchupEvent {
  minute: number;
  summary: string;
  fantasy_delta: number;
  team_side: "home" | "away";
}

export interface FantasyLeagueMatchupState {
  league: FantasyLeagueRecord;
  myMembership: FantasyLeagueMembershipRecord;
  week_number: number;
  total_weeks: number;
  week_label: string;
  status: "pregame" | "live" | "final";
  status_label: string;
  lock_label: string;
  home_team_name: string;
  home_manager_name: string;
  away_team_name: string;
  away_manager_name: string;
  home_points: number;
  away_points: number;
  home_projection: number;
  away_projection: number;
  my_team_side: "home" | "away";
  event_feed: FantasyMatchupEvent[];
  home_contributions: FantasyMatchupContribution[];
  away_contributions: FantasyMatchupContribution[];
}

export interface DemoLeague {
  id: string;
  name: string;
  status: string;
  record: string;
  nextAction: string;
  draftStatus: string;
}

// ───────────────────────────────────────────────────────────
// Gamification
// ───────────────────────────────────────────────────────────

export type AchievementKey =
  | "FIRST_DRAFT_PICK"
  | "WIN_STREAK_3"
  | "WIN_STREAK_5"
  | "WIN_STREAK_7"
  | "POINTS_100_WEEK"
  | "POINTS_150_WEEK"
  | "PERFECT_LINEUP"
  | "WAIVER_WIRE_HERO"
  | "COMEBACK_WIN"
  | "SEASON_CHAMPION"
  | "CLEAN_SWEEP"
  | "TOP_SCORER_WEEK"
  | "TRADE_PARTNER"
  | "CHAT_STARTER";

export interface AchievementRecord {
  id: string;
  user_id: string;
  league_id: string | null;
  key: AchievementKey;
  label: string;
  description: string;
  earned_at: string;
  metadata: Record<string, unknown> | null;
}

export interface StreakRecord {
  id: string;
  user_id: string;
  league_id: string;
  fantasy_team_id: string;
  streak_type: string;
  current_count: number;
  best_count: number;
  last_updated_at: string;
}

// ───────────────────────────────────────────────────────────
// In-League Chat
// ───────────────────────────────────────────────────────────

export interface ChatMessageRecord {
  id: string;
  league_id: string;
  user_id: string;
  display_name: string;
  body: string;
  created_at: string;
}

// ───────────────────────────────────────────────────────────
// Trade Proposals
// ───────────────────────────────────────────────────────────

export type TradeProposalStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "vetoed"
  | "canceled"
  | "expired";

export interface TradeAssetRecord {
  id: string;
  trade_proposal_id: string;
  from_team_id: string;
  player_id: string;
  player_name: string;
  player_position: PlayerPosition;
  club_name: string;
}

export interface TradeVoteRecord {
  id: string;
  trade_proposal_id: string;
  fantasy_team_id: string;
  user_id: string;
  decision: "approve" | "veto";
  created_at: string;
}

export interface TradeProposalRecord {
  id: string;
  league_id: string;
  proposer_team_id: string;
  proposer_team_name: string;
  receiver_team_id: string;
  receiver_team_name: string;
  status: TradeProposalStatus;
  message: string | null;
  review_period_ends_at: string;
  veto_count: number;
  veto_threshold: number;
  assets: TradeAssetRecord[];
  votes: TradeVoteRecord[];
  created_at: string;
}

export interface DemoPlayer {
  id: string;
  name: string;
  club: string;
  position: PlayerPosition;
  averagePoints: number;
  availability: AvailabilityStatus;
}

export interface DemoMatchup {
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  homePoints: number;
  awayPoints: number;
  status: string;
}
