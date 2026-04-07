import {
  buildSuggestedLineup,
  lineupSlotLabels,
  starterLineupSlots,
} from "@/lib/fantasy-draft";
import type {
  FantasyLeagueMatchupState,
  FantasyLeagueMembershipRecord,
  FantasyLeagueRecord,
  FantasyLineupSlot,
  FantasyMatchupContribution,
  FantasyMatchupEvent,
  FantasyRosterPlayer,
  FantasyStandingRecord,
} from "@/types/fantasy";

const completedWeeks = 8;
const activeWeekNumber = completedWeeks + 1;
const displayContributionCount = 6;

interface RotationEntry {
  home: FantasyLeagueMembershipRecord;
  away: FantasyLeagueMembershipRecord | null;
}

interface MatchupWindow {
  status: FantasyLeagueMatchupState["status"];
  statusLabel: string;
  lockLabel: string;
  weekNumber: number;
}

function hashString(input: string) {
  return input.split("").reduce((accumulator, character, index) => {
    return accumulator + character.charCodeAt(0) * (index + 1);
  }, 0);
}

function buildRosterBaseline(roster: FantasyRosterPlayer[]) {
  if (roster.length === 0) {
    return 77;
  }

  const suggested = buildSuggestedLineup(roster);
  const starters = roster.filter((player) => {
    const slot = player.lineup_slot ?? suggested.get(player.id);
    return slot != null && starterLineupSlots.includes(slot);
  });
  const source = starters.length > 0 ? starters : roster.slice(0, 9);
  const totalAverage = source.reduce((sum, player) => sum + player.player.average_points, 0);

  return Number((totalAverage * 0.82).toFixed(1));
}

function buildRotation(
  memberships: FantasyLeagueMembershipRecord[]
): RotationEntry[][] {
  if (memberships.length === 0) {
    return [];
  }

  const ordered: Array<FantasyLeagueMembershipRecord | null> =
    memberships.length % 2 === 0 ? [...memberships] : [...memberships, null];
  const working = [...ordered];
  const rounds: RotationEntry[][] = [];

  for (let round = 0; round < working.length - 1; round += 1) {
    const pairings: RotationEntry[] = [];

    for (let index = 0; index < working.length / 2; index += 1) {
      const left = working[index];
      const right = working[working.length - 1 - index];

      if (!left && !right) {
        continue;
      }

      if (!left || !right) {
        pairings.push({
          home: (left ?? right)!,
          away: null,
        });
        continue;
      }

      const shouldSwap = round % 2 === 1 && index !== 0;

      pairings.push(
        shouldSwap
          ? {
              home: right,
              away: left,
            }
          : {
              home: left,
              away: right,
            }
      );
    }

    rounds.push(pairings);

    const fixed = working[0];
    const rotated = [fixed, working[working.length - 1], ...working.slice(1, -1)];
    working.splice(0, working.length, ...rotated);
  }

  return rounds;
}

function buildWeeklyScore(
  membershipId: string,
  weekIndex: number,
  matchupOffset: number,
  baseline: number
) {
  const hash = hashString(`${membershipId}-${weekIndex}-${matchupOffset}`);
  const swing = ((hash % 17) - 8) * 0.8;

  return Number((baseline + swing + weekIndex * 0.35).toFixed(1));
}

function buildProjectedScore(finalScore: number, seed: string) {
  const offset = ((hashString(seed) % 7) - 3) * 0.45;

  return Number((finalScore + offset).toFixed(1));
}

function buildLiveScore(finalScore: number, seed: string) {
  const progress = 0.62 + (hashString(seed) % 15) / 100;

  return Number((finalScore * progress).toFixed(1));
}

function resolveLineupEntries(roster: FantasyRosterPlayer[]) {
  const suggested = buildSuggestedLineup(roster);
  const entries = roster
    .map((player) => {
      const slot = (player.lineup_slot ??
        suggested.get(player.id) ??
        null) as FantasyLineupSlot | null;

      return {
        player,
        slot,
      };
    })
    .filter(
      (
        entry
      ): entry is {
        player: FantasyRosterPlayer;
        slot: FantasyLineupSlot;
      } => entry.slot != null && starterLineupSlots.includes(entry.slot)
    )
    .sort(
      (left, right) =>
        starterLineupSlots.indexOf(left.slot) - starterLineupSlots.indexOf(right.slot)
    );

  return entries.length > 0
    ? entries
    : roster.slice(0, 9).map((player, index) => ({
        player,
        slot: starterLineupSlots[index] ?? "FLEX",
      }));
}

function buildContributionNote(
  player: FantasyRosterPlayer,
  slot: FantasyLineupSlot,
  status: FantasyLeagueMatchupState["status"],
  seed: string
) {
  if (status === "pregame") {
    return `Projected edge from ${lineupSlotLabels[slot]}.`;
  }

  const noteSeed = hashString(seed) % 3;

  if (player.player_position === "GK") {
    return noteSeed === 0 ? "Save volume carrying the floor." : "Clean-sheet bonus still in reach.";
  }

  if (player.player_position === "DEF") {
    return noteSeed === 0 ? "Defensive bonus stack is holding." : "Cross and clean-sheet points are landing.";
  }

  if (player.player_position === "MID") {
    return noteSeed === 0 ? "Chance creation is driving the score." : "Set-piece volume is showing up.";
  }

  return noteSeed === 0 ? "Goal threat is doing the damage." : "Shot volume plus bonus points are live.";
}

function buildContributions(
  membership: FantasyLeagueMembershipRecord,
  roster: FantasyRosterPlayer[],
  targetPoints: number,
  status: FantasyLeagueMatchupState["status"]
) {
  const starters = resolveLineupEntries(roster);

  if (starters.length === 0) {
    return [] satisfies FantasyMatchupContribution[];
  }

  const weighted = starters.map((entry, index) => {
    const variance = ((hashString(`${membership.id}-${entry.player.id}-${index}`) % 9) - 4) / 30;

    return {
      ...entry,
      weight: entry.player.player.average_points * (1 + variance),
    };
  });
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0) || 1;

  return weighted
    .map((entry) => ({
      player_id: entry.player.player_id,
      player_name: entry.player.player_name,
      player_position: entry.player.player_position,
      club_name: entry.player.club_name,
      fantasy_points: Number(((entry.weight / totalWeight) * targetPoints).toFixed(1)),
      note: buildContributionNote(
        entry.player,
        entry.slot,
        status,
        `${membership.id}-${entry.player.id}-${status}`
      ),
    }))
    .sort((left, right) => right.fantasy_points - left.fantasy_points)
    .slice(0, displayContributionCount);
}

function buildEventFeed(
  homeContributions: FantasyMatchupContribution[],
  awayContributions: FantasyMatchupContribution[],
  status: FantasyLeagueMatchupState["status"]
) {
  if (status === "pregame") {
    return [] satisfies FantasyMatchupEvent[];
  }

  const events = [
    ...homeContributions.slice(0, 3).map((contribution) => ({
      contribution,
      minuteSeed: hashString(`${contribution.player_id}-home-${status}`),
      team_side: "home" as const,
    })),
    ...awayContributions.slice(0, 3).map((contribution) => ({
      contribution,
      minuteSeed: hashString(`${contribution.player_id}-away-${status}`),
      team_side: "away" as const,
    })),
  ]
    .sort((left, right) => left.minuteSeed - right.minuteSeed)
    .slice(0, status === "live" ? 4 : 6);

  return events.map((event, index) => {
    const baseMinute = status === "live" ? 11 : 8;
    const minuteStep = status === "live" ? 14 : 13;

    return {
      minute: baseMinute + index * minuteStep + (event.minuteSeed % 5),
      summary: `${event.contribution.player_name}: ${event.contribution.note}`,
      fantasy_delta: Number(
        Math.max(0.8, event.contribution.fantasy_points * (status === "live" ? 0.34 : 0.42)).toFixed(1)
      ),
      team_side: event.team_side,
    };
  });
}

function buildBasePointsByMembershipId(
  memberships: FantasyLeagueMembershipRecord[],
  rostersByUserId: Map<string, FantasyRosterPlayer[]>
) {
  const basePointsByMembershipId = new Map<string, number>();

  memberships.forEach((membership, index) => {
    const roster = rostersByUserId.get(membership.user_id) ?? [];
    basePointsByMembershipId.set(
      membership.id,
      buildRosterBaseline(roster) + index * 0.15
    );
  });

  return basePointsByMembershipId;
}

function resolveMatchupWindow(league: FantasyLeagueRecord): MatchupWindow {
  if (league.status === "complete") {
    return {
      status: "final",
      statusLabel: `Final • Week ${completedWeeks} closed`,
      lockLabel: "This seeded result is already reflected in the standings table.",
      weekNumber: completedWeeks,
    };
  }

  const seed = hashString(`${league.id}-${league.code}`) % 3;

  if (seed === 0) {
    return {
      status: "pregame",
      statusLabel: `Pregame • Week ${activeWeekNumber} preview`,
      lockLabel: `Lineups lock on the first kickoff of seeded Week ${activeWeekNumber}.`,
      weekNumber: activeWeekNumber,
    };
  }

  if (seed === 1) {
    const minute = 58 + (hashString(league.id) % 18);

    return {
      status: "live",
      statusLabel: `Live • ${minute}'`,
      lockLabel: "Live score movement is seeded until provider-backed stat ingest is connected.",
      weekNumber: activeWeekNumber,
    };
  }

  return {
    status: "final",
    statusLabel: `Final • Week ${completedWeeks} result`,
    lockLabel: "This seeded result is already reflected in the standings table.",
    weekNumber: completedWeeks,
  };
}

export function buildSimulatedStandings(
  memberships: FantasyLeagueMembershipRecord[],
  rostersByUserId: Map<string, FantasyRosterPlayer[]>
) {
  const rotation = buildRotation(memberships);
  const basePointsByMembershipId = buildBasePointsByMembershipId(
    memberships,
    rostersByUserId
  );
  const headToHead = new Map<string, number>();
  const gamesPlayed = new Map<string, number>();
  const table = new Map<
    string,
    Omit<FantasyStandingRecord, "rank" | "win_pct">
  >();

  memberships.forEach((membership) => {
    table.set(membership.id, {
      membership_id: membership.id,
      user_id: membership.user_id,
      display_name: membership.display_name,
      team_name: membership.team_name,
      wins: 0,
      losses: 0,
      ties: 0,
      points_for: 0,
      points_against: 0,
      projected_points: Number(
        ((basePointsByMembershipId.get(membership.id) ?? 77) * 10).toFixed(1)
      ),
    });
    gamesPlayed.set(membership.id, 0);
  });

  if (rotation.length === 0) {
    return {
      completedWeeks,
      standings: memberships.map((membership, index) => ({
        rank: index + 1,
        membership_id: membership.id,
        user_id: membership.user_id,
        display_name: membership.display_name,
        team_name: membership.team_name,
        wins: 0,
        losses: 0,
        ties: 0,
        points_for: 0,
        points_against: 0,
        win_pct: 0,
        projected_points: Number(
          ((basePointsByMembershipId.get(membership.id) ?? 77) * 10).toFixed(1)
        ),
      })),
    };
  }

  for (let weekIndex = 0; weekIndex < completedWeeks; weekIndex += 1) {
    const pairings = rotation[weekIndex % rotation.length];

    pairings.forEach((pairing, matchupIndex) => {
      if (!pairing.away) {
        return;
      }

      const homeBase = basePointsByMembershipId.get(pairing.home.id) ?? 77;
      const awayBase = basePointsByMembershipId.get(pairing.away.id) ?? 77;
      const homeScore = buildWeeklyScore(pairing.home.id, weekIndex, matchupIndex, homeBase);
      const awayScore = buildWeeklyScore(
        pairing.away.id,
        weekIndex,
        matchupIndex + 7,
        awayBase
      );
      const homeRow = table.get(pairing.home.id)!;
      const awayRow = table.get(pairing.away.id)!;

      homeRow.points_for = Number((homeRow.points_for + homeScore).toFixed(1));
      homeRow.points_against = Number((homeRow.points_against + awayScore).toFixed(1));
      awayRow.points_for = Number((awayRow.points_for + awayScore).toFixed(1));
      awayRow.points_against = Number((awayRow.points_against + homeScore).toFixed(1));
      gamesPlayed.set(pairing.home.id, (gamesPlayed.get(pairing.home.id) ?? 0) + 1);
      gamesPlayed.set(pairing.away.id, (gamesPlayed.get(pairing.away.id) ?? 0) + 1);

      if (Math.abs(homeScore - awayScore) < 0.2) {
        homeRow.ties += 1;
        awayRow.ties += 1;
        return;
      }

      const winner = homeScore > awayScore ? homeRow : awayRow;
      const loser = homeScore > awayScore ? awayRow : homeRow;
      const headToHeadKey = [winner.membership_id, loser.membership_id]
        .sort()
        .join(":");

      winner.wins += 1;
      loser.losses += 1;
      headToHead.set(
        headToHeadKey,
        (headToHead.get(headToHeadKey) ?? 0) +
          (winner.membership_id < loser.membership_id ? 1 : -1)
      );
    });
  }

  const standings = [...table.values()]
    .map((row) => {
      const played = gamesPlayed.get(row.membership_id) ?? 0;

      return {
        ...row,
        win_pct:
          played === 0
            ? 0
            : Number(((row.wins + row.ties * 0.5) / played).toFixed(3)),
      };
    })
    .sort((left, right) => {
      if (right.win_pct !== left.win_pct) {
        return right.win_pct - left.win_pct;
      }

      if (right.points_for !== left.points_for) {
        return right.points_for - left.points_for;
      }

      const headToHeadKey = [left.membership_id, right.membership_id]
        .sort()
        .join(":");
      const headToHeadScore = headToHead.get(headToHeadKey) ?? 0;

      if (headToHeadScore !== 0) {
        const leftWasFirst = left.membership_id < right.membership_id;
        return leftWasFirst ? -headToHeadScore : headToHeadScore;
      }

      return left.display_name.localeCompare(right.display_name);
    })
    .map((row, index) => ({
      ...row,
      rank: index + 1,
    }));

  return {
    completedWeeks,
    standings,
  };
}

export function buildSimulatedMatchup(
  league: FantasyLeagueRecord,
  myMembership: FantasyLeagueMembershipRecord,
  memberships: FantasyLeagueMembershipRecord[],
  rostersByUserId: Map<string, FantasyRosterPlayer[]>,
  requestedWeek?: number
) {
  const rotation = buildRotation(memberships);
  const basePointsByMembershipId = buildBasePointsByMembershipId(
    memberships,
    rostersByUserId
  );
  const defaultWindow = resolveMatchupWindow(league);
  const totalWeeks = activeWeekNumber;
  const targetWeek = requestedWeek
    ? Math.max(1, Math.min(requestedWeek, totalWeeks))
    : defaultWindow.weekNumber;
  const isHistorical = targetWeek < defaultWindow.weekNumber;
  const window = isHistorical
    ? {
        status: "final" as const,
        statusLabel: `Final • Week ${targetWeek} result`,
        lockLabel: "This seeded result is already reflected in the standings table.",
        weekNumber: targetWeek,
      }
    : { ...defaultWindow, weekNumber: targetWeek };

  if (rotation.length === 0) {
    const myTeamName = myMembership.team_name || myMembership.display_name;

    return {
      league,
      myMembership,
      week_number: window.weekNumber,
      total_weeks: totalWeeks,
      week_label: `Week ${window.weekNumber}`,
      status: window.status,
      status_label: window.statusLabel,
      lock_label: window.lockLabel,
      home_team_name: myTeamName,
      home_manager_name: myMembership.display_name,
      away_team_name: "Open week",
      away_manager_name: "No opponent assigned",
      home_points: 0,
      away_points: 0,
      home_projection: 0,
      away_projection: 0,
      my_team_side: "home",
      event_feed: [],
      home_contributions: [],
      away_contributions: [],
    } satisfies FantasyLeagueMatchupState;
  }

  const weekIndex = window.weekNumber - 1;
  const pairings = rotation[weekIndex % rotation.length];
  const pairingIndex = pairings.findIndex(
    (pairing) =>
      pairing.home.id === myMembership.id || pairing.away?.id === myMembership.id
  );
  const pairing = pairings[pairingIndex >= 0 ? pairingIndex : 0];
  const homeMembership = pairing.home;
  const awayMembership = pairing.away;
  const homeRoster = rostersByUserId.get(homeMembership.user_id) ?? [];
  const awayRoster =
    awayMembership == null ? [] : rostersByUserId.get(awayMembership.user_id) ?? [];
  const homeFinalScore = buildWeeklyScore(
    homeMembership.id,
    weekIndex,
    pairingIndex >= 0 ? pairingIndex : 0,
    basePointsByMembershipId.get(homeMembership.id) ?? 77
  );
  const awayFinalScore =
    awayMembership == null
      ? 0
      : buildWeeklyScore(
          awayMembership.id,
          weekIndex,
          (pairingIndex >= 0 ? pairingIndex : 0) + 7,
          basePointsByMembershipId.get(awayMembership.id) ?? 77
        );
  const homeProjection = buildProjectedScore(
    homeFinalScore,
    `${league.id}-${homeMembership.id}-${weekIndex}`
  );
  const awayProjection =
    awayMembership == null
      ? 0
      : buildProjectedScore(
          awayFinalScore,
          `${league.id}-${awayMembership.id}-${weekIndex}`
        );
  const homePoints =
    window.status === "pregame"
      ? 0
      : window.status === "live"
        ? buildLiveScore(homeFinalScore, `${homeMembership.id}-${league.id}`)
        : homeFinalScore;
  const awayPoints =
    awayMembership == null
      ? 0
      : window.status === "pregame"
        ? 0
        : window.status === "live"
          ? buildLiveScore(awayFinalScore, `${awayMembership.id}-${league.id}`)
          : awayFinalScore;
  const homeContributions = buildContributions(
    homeMembership,
    homeRoster,
    window.status === "pregame" ? homeProjection : homePoints,
    window.status
  );
  const awayContributions =
    awayMembership == null
      ? []
      : buildContributions(
          awayMembership,
          awayRoster,
          window.status === "pregame" ? awayProjection : awayPoints,
          window.status
        );

  return {
    league,
    myMembership,
    week_number: window.weekNumber,
    total_weeks: totalWeeks,
    week_label: `Week ${window.weekNumber}`,
    status: window.status,
    status_label:
      awayMembership == null ? `Open week • ${window.statusLabel}` : window.statusLabel,
    lock_label: window.lockLabel,
    home_team_name: homeMembership.team_name || homeMembership.display_name,
    home_manager_name: homeMembership.display_name,
    away_team_name:
      awayMembership?.team_name || awayMembership?.display_name || "Open week",
    away_manager_name: awayMembership?.display_name ?? "No opponent assigned",
    home_points: homePoints,
    away_points: awayPoints,
    home_projection: homeProjection,
    away_projection: awayProjection,
    my_team_side: homeMembership.id === myMembership.id ? "home" : "away",
    event_feed:
      awayMembership == null
        ? []
        : buildEventFeed(homeContributions, awayContributions, window.status),
    home_contributions: homeContributions,
    away_contributions: awayContributions,
  } satisfies FantasyLeagueMatchupState;
}
