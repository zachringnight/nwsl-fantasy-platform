import { starterLineupSlots } from "@/lib/fantasy-draft";
import type {
  FantasyLeagueMatchupState,
  FantasyLeagueMembershipRecord,
  FantasyLeagueRecord,
  FantasyMatchupContribution,
  FantasyRosterSlotRecord,
  FantasySlateWindow,
  FantasyStandingRecord,
} from "@/types/fantasy";

export interface FantasyPointSnapshot {
  player_id: string;
  match_id: string;
  match_date_utc: string;
  points: number;
  breakdown: Record<string, number>;
  is_approximated: boolean;
}

interface WeeklyTeamScore {
  membership: FantasyLeagueMembershipRecord;
  points: number;
  isApproximated: boolean;
  contributions: FantasyMatchupContribution[];
}

interface Pairing {
  home: FantasyLeagueMembershipRecord;
  away: FantasyLeagueMembershipRecord | null;
}

export function isSnapshotInWindow(
  snapshot: Pick<FantasyPointSnapshot, "match_date_utc">,
  window: Pick<FantasySlateWindow, "starts_at" | "ends_at">
) {
  const date = new Date(snapshot.match_date_utc).getTime();
  return (
    date >= new Date(window.starts_at).getTime() &&
    date <= new Date(window.ends_at).getTime()
  );
}

function buildRotation(
  memberships: FantasyLeagueMembershipRecord[]
): Pairing[][] {
  if (memberships.length === 0) return [];

  const ordered: Array<FantasyLeagueMembershipRecord | null> =
    memberships.length % 2 === 0 ? [...memberships] : [...memberships, null];
  const working = [...ordered];
  const rounds: Pairing[][] = [];

  for (let round = 0; round < working.length - 1; round += 1) {
    const pairings: Pairing[] = [];

    for (let index = 0; index < working.length / 2; index += 1) {
      const left = working[index];
      const right = working[working.length - 1 - index];
      if (!left && !right) continue;
      if (!left || !right) {
        pairings.push({ home: (left ?? right)!, away: null });
      } else {
        pairings.push(
          round % 2 === 1 && index !== 0
            ? { home: right, away: left }
            : { home: left, away: right }
        );
      }
    }

    rounds.push(pairings);
    const fixed = working[0];
    working.splice(
      0,
      working.length,
      fixed,
      working[working.length - 1],
      ...working.slice(1, -1)
    );
  }

  return rounds;
}

export interface FantasyWeekResult {
  membership_id: string;
  user_id: string;
  opponent_membership_id: string | null;
  points: number;
  opponent_points: number;
  won: boolean;
  tied: boolean;
  is_approximated: boolean;
}

export function buildWeekResults(
  memberships: FantasyLeagueMembershipRecord[],
  rosterSlots: FantasyRosterSlotRecord[],
  snapshots: FantasyPointSnapshot[],
  window: FantasySlateWindow,
  weekIndex: number
): FantasyWeekResult[] {
  const rotation = buildRotation(memberships);
  const pairings = rotation[weekIndex % Math.max(rotation.length, 1)] ?? [];
  const scores = new Map(
    memberships.map((membership) => [
      membership.id,
      scoreMembership(membership, rosterSlots, snapshots, window),
    ])
  );
  const results: FantasyWeekResult[] = [];

  for (const pairing of pairings) {
    const home = scores.get(pairing.home.id)!;
    if (!pairing.away) {
      results.push({
        membership_id: pairing.home.id,
        user_id: pairing.home.user_id,
        opponent_membership_id: null,
        points: home.points,
        opponent_points: 0,
        won: false,
        tied: false,
        is_approximated: home.isApproximated,
      });
      continue;
    }

    const away = scores.get(pairing.away.id)!;
    results.push(
      {
        membership_id: pairing.home.id,
        user_id: pairing.home.user_id,
        opponent_membership_id: pairing.away.id,
        points: home.points,
        opponent_points: away.points,
        won: home.points > away.points,
        tied: home.points === away.points,
        is_approximated: home.isApproximated,
      },
      {
        membership_id: pairing.away.id,
        user_id: pairing.away.user_id,
        opponent_membership_id: pairing.home.id,
        points: away.points,
        opponent_points: home.points,
        won: away.points > home.points,
        tied: home.points === away.points,
        is_approximated: away.isApproximated,
      }
    );
  }

  return results;
}

function starterPlayerIds(
  membership: FantasyLeagueMembershipRecord,
  rosterSlots: FantasyRosterSlotRecord[]
) {
  return new Set(
    rosterSlots
      .filter(
        (slot) =>
          slot.user_id === membership.user_id &&
          slot.lineup_slot != null &&
          starterLineupSlots.includes(slot.lineup_slot)
      )
      .map((slot) => slot.player_id)
  );
}

function contributionNote(snapshot: FantasyPointSnapshot) {
  const top = Object.entries(snapshot.breakdown ?? {})
    .filter(([, points]) => Math.abs(Number(points)) > 0)
    .sort((left, right) => Math.abs(Number(right[1])) - Math.abs(Number(left[1])))[0];

  return top
    ? `${top[0].replace(/([A-Z])/g, " $1").toLowerCase()}: ${Number(
        top[1]
      ).toFixed(1)} pts${snapshot.is_approximated ? " • estimated inputs" : ""}`
    : snapshot.is_approximated
      ? "Estimated volume inputs included."
      : "Appearance points.";
}

export function scoreMembership(
  membership: FantasyLeagueMembershipRecord,
  rosterSlots: FantasyRosterSlotRecord[],
  snapshots: FantasyPointSnapshot[],
  window: FantasySlateWindow
): WeeklyTeamScore {
  const playerIds = starterPlayerIds(membership, rosterSlots);
  const relevant = snapshots.filter(
    (snapshot) =>
      playerIds.has(snapshot.player_id) && isSnapshotInWindow(snapshot, window)
  );
  const rosterByPlayerId = new Map(
    rosterSlots
      .filter((slot) => slot.user_id === membership.user_id)
      .map((slot) => [slot.player_id, slot])
  );
  const totals = new Map<
    string,
    { points: number; snapshot: FantasyPointSnapshot }
  >();

  for (const snapshot of relevant) {
    const current = totals.get(snapshot.player_id);
    totals.set(snapshot.player_id, {
      points: (current?.points ?? 0) + Number(snapshot.points),
      snapshot,
    });
  }

  const contributions = [...totals.entries()]
    .map(([playerId, value]) => {
      const roster = rosterByPlayerId.get(playerId);
      return {
        player_id: playerId,
        player_name: roster?.player_name ?? "Unknown player",
        player_position: roster?.player_position ?? "MID",
        club_name: roster?.club_name ?? "Unknown club",
        fantasy_points: Number(value.points.toFixed(2)),
        note: contributionNote(value.snapshot),
      } satisfies FantasyMatchupContribution;
    })
    .sort((left, right) => right.fantasy_points - left.fantasy_points);

  return {
    membership,
    points: Number(
      relevant
        .reduce((sum, snapshot) => sum + Number(snapshot.points), 0)
        .toFixed(2)
    ),
    isApproximated: relevant.some((snapshot) => snapshot.is_approximated),
    contributions,
  };
}

export function buildRealStandings(
  memberships: FantasyLeagueMembershipRecord[],
  rosterSlots: FantasyRosterSlotRecord[],
  snapshots: FantasyPointSnapshot[],
  weekWindows: FantasySlateWindow[],
  now = new Date()
) {
  const rotation = buildRotation(memberships);
  const table = new Map<
    string,
    Omit<FantasyStandingRecord, "rank" | "win_pct">
  >();

  for (const membership of memberships) {
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
      projected_points: 0,
      is_approximated: false,
    });
  }

  const completedWindows = weekWindows
    .map((window, weekIndex) => ({ window, weekIndex }))
    .filter(
      ({ window }) =>
      new Date(window.ends_at).getTime() < now.getTime() &&
      snapshots.some((snapshot) => isSnapshotInWindow(snapshot, window))
    );

  completedWindows.forEach(({ window, weekIndex }) => {
    const pairings = rotation[weekIndex % Math.max(rotation.length, 1)] ?? [];
    const scores = new Map(
      memberships.map((membership) => [
        membership.id,
        scoreMembership(membership, rosterSlots, snapshots, window),
      ])
    );

    for (const pairing of pairings) {
      if (!pairing.away) continue;
      const home = scores.get(pairing.home.id)!;
      const away = scores.get(pairing.away.id)!;
      const homeRow = table.get(pairing.home.id)!;
      const awayRow = table.get(pairing.away.id)!;

      homeRow.points_for += home.points;
      homeRow.points_against += away.points;
      awayRow.points_for += away.points;
      awayRow.points_against += home.points;
      homeRow.is_approximated ||= home.isApproximated;
      awayRow.is_approximated ||= away.isApproximated;

      if (home.points === away.points) {
        homeRow.ties += 1;
        awayRow.ties += 1;
      } else if (home.points > away.points) {
        homeRow.wins += 1;
        awayRow.losses += 1;
      } else {
        awayRow.wins += 1;
        homeRow.losses += 1;
      }
    }
  });

  const standings = [...table.values()]
    .map((row) => {
      const played = row.wins + row.losses + row.ties;
      return {
        ...row,
        points_for: Number(row.points_for.toFixed(2)),
        points_against: Number(row.points_against.toFixed(2)),
        projected_points: Number(row.points_for.toFixed(2)),
        win_pct:
          played === 0
            ? 0
            : Number(((row.wins + row.ties * 0.5) / played).toFixed(3)),
      };
    })
    .sort(
      (left, right) =>
        right.win_pct - left.win_pct ||
        right.points_for - left.points_for ||
        left.team_name.localeCompare(right.team_name)
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return {
    completedWeeks: completedWindows.length,
    completedWeekNumbers: completedWindows.map(
      ({ weekIndex }) => weekIndex + 1
    ),
    standings,
  };
}

export function buildRealMatchup(
  league: FantasyLeagueRecord,
  myMembership: FantasyLeagueMembershipRecord,
  memberships: FantasyLeagueMembershipRecord[],
  rosterSlots: FantasyRosterSlotRecord[],
  snapshots: FantasyPointSnapshot[],
  weekWindows: FantasySlateWindow[],
  requestedWeek?: number,
  now = new Date()
): FantasyLeagueMatchupState {
  const rotation = buildRotation(memberships);
  const firstOpenWindowIndex = weekWindows.findIndex(
    (window) => new Date(window.ends_at).getTime() >= now.getTime()
  );
  const defaultIndex =
    firstOpenWindowIndex === -1 ? weekWindows.length - 1 : firstOpenWindowIndex;
  const weekIndex = Math.min(
    weekWindows.length - 1,
    Math.max(0, (requestedWeek ?? defaultIndex + 1) - 1)
  );
  const window = weekWindows[weekIndex]!;
  const pairings = rotation[weekIndex % Math.max(rotation.length, 1)] ?? [];
  const pairing =
    pairings.find(
      (candidate) =>
        candidate.home.id === myMembership.id ||
        candidate.away?.id === myMembership.id
    ) ?? { home: myMembership, away: null };
  const awayMembership = pairing.away ?? pairing.home;
  const home = scoreMembership(pairing.home, rosterSlots, snapshots, window);
  const away = scoreMembership(awayMembership, rosterSlots, snapshots, window);
  const startsAt = new Date(window.starts_at).getTime();
  const endsAt = new Date(window.ends_at).getTime();
  const hasScore = home.contributions.length + away.contributions.length > 0;
  const isApproximated = home.isApproximated || away.isApproximated;
  const status =
    now.getTime() < startsAt
      ? "pregame"
      : now.getTime() <= endsAt
        ? "live"
        : "final";

  return {
    league,
    myMembership,
    week_number: weekIndex + 1,
    total_weeks: weekWindows.length,
    week_label: window.label,
    status,
    status_label:
      status === "pregame"
        ? "Pregame • no scoring yet"
        : status === "live"
          ? hasScore
            ? `Live • official snapshots${isApproximated ? " • estimated inputs" : ""}`
            : "Live • awaiting snapshots"
          : hasScore
            ? `Final • official snapshots${isApproximated ? " • estimated inputs" : ""}`
            : "Final • no snapshots received",
    lock_label: `Classic lineups lock at ${new Date(
      window.lock_at
    ).toLocaleString()}.`,
    home_team_name: pairing.home.team_name,
    home_manager_name: pairing.home.display_name,
    away_team_name: awayMembership.team_name,
    away_manager_name: awayMembership.display_name,
    home_points: home.points,
    away_points: away.points,
    home_projection: home.points,
    away_projection: away.points,
    my_team_side:
      pairing.home.id === myMembership.id ? "home" : "away",
    event_feed: [],
    home_contributions: home.contributions,
    away_contributions: away.contributions,
    is_approximated: isApproximated,
  };
}
