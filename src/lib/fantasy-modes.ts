import type {
  FantasyContestHorizon,
  FantasyGameVariant,
  FantasyLeagueRecord,
  FantasyPlayerOwnershipMode,
  FantasyRosterBuildMode,
} from "@/types/fantasy";

export interface FantasyModeConfig {
  description: string;
  label: string;
  contestHorizon: FantasyContestHorizon;
  defaultSalaryCapAmount: number | null;
  playerOwnershipMode: FantasyPlayerOwnershipMode;
  rosterBuildMode: FantasyRosterBuildMode;
  scheduleLabel: string;
  teamHubTitle: string;
  usesExclusivePlayerOwnership: boolean;
  usesLiveDraftRoom: boolean;
  usesSalaryCap: boolean;
  cadenceLabel: string;
}

const modeConfigs: Record<FantasyGameVariant, FantasyModeConfig> = {
  classic_season_long: {
    description: "Exclusive rosters, a live snake draft, and weekly lineup management for a season-long league.",
    label: "Classic season-long",
    contestHorizon: "season",
    defaultSalaryCapAmount: null,
    playerOwnershipMode: "exclusive",
    rosterBuildMode: "snake_draft",
    scheduleLabel: "Draft date and time",
    teamHubTitle: "Weekly lineup editor",
    usesExclusivePlayerOwnership: true,
    usesLiveDraftRoom: true,
    usesSalaryCap: false,
    cadenceLabel: "Season",
  },
  salary_cap_season_long: {
    description: "Shared player pool with a season budget and no live draft, built for a roster-builder experience.",
    label: "Season-long salary cap",
    contestHorizon: "season",
    defaultSalaryCapAmount: 120,
    playerOwnershipMode: "shared",
    rosterBuildMode: "salary_cap",
    scheduleLabel: "Season roster lock",
    teamHubTitle: "Season salary-cap hub",
    usesExclusivePlayerOwnership: false,
    usesLiveDraftRoom: false,
    usesSalaryCap: true,
    cadenceLabel: "Season",
  },
  salary_cap_weekly: {
    description: "Shared player pool with a fresh salary-cap roster each scoring round and no exclusive ownership.",
    label: "Weekly salary cap",
    contestHorizon: "weekly",
    defaultSalaryCapAmount: 100,
    playerOwnershipMode: "shared",
    rosterBuildMode: "salary_cap",
    scheduleLabel: "First weekly lock",
    teamHubTitle: "Weekly salary-cap hub",
    usesExclusivePlayerOwnership: false,
    usesLiveDraftRoom: false,
    usesSalaryCap: true,
    cadenceLabel: "Weekly",
  },
  salary_cap_daily: {
    description: "Daily-slate salary-cap entries with shared ownership and lock-based contest windows.",
    label: "Daily salary cap",
    contestHorizon: "daily",
    defaultSalaryCapAmount: 100,
    playerOwnershipMode: "shared",
    rosterBuildMode: "salary_cap",
    scheduleLabel: "First daily slate lock",
    teamHubTitle: "Daily salary-cap hub",
    usesExclusivePlayerOwnership: false,
    usesLiveDraftRoom: false,
    usesSalaryCap: true,
    cadenceLabel: "Daily",
  },
};

export function getFantasyModeConfig(leagueOrVariant: FantasyLeagueRecord | FantasyGameVariant) {
  return modeConfigs[
    typeof leagueOrVariant === "string"
      ? leagueOrVariant
      : leagueOrVariant.game_variant
  ];
}

export function getFantasyModeOptions() {
  return (
    Object.entries(modeConfigs) as Array<[FantasyGameVariant, FantasyModeConfig]>
  ).map(([variant, config]) => ({
    variant,
    ...config,
  }));
}

export function getFantasyLeagueModeFields(variant: FantasyGameVariant) {
  const config = getFantasyModeConfig(variant);

  return {
    contest_horizon: config.contestHorizon,
    player_ownership_mode: config.playerOwnershipMode,
    roster_build_mode: config.rosterBuildMode,
    salary_cap_amount: config.defaultSalaryCapAmount,
  } satisfies Pick<
    FantasyLeagueRecord,
    "contest_horizon" | "player_ownership_mode" | "roster_build_mode" | "salary_cap_amount"
  >;
}
