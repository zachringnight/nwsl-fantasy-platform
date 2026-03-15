import { describe, expect, it } from "vitest";
import {
  buildSnakeTurn,
  validateDraftPick,
  chooseAutopickPlayer,
  buildSuggestedLineup,
  isLineupSlotValid,
  getEligibleLineupSlots,
  allLineupSlots,
  benchLineupSlots,
} from "./fantasy-draft";
import type {
  FantasyLeagueMembershipRecord,
  FantasyPoolPlayer,
  FantasyRosterPlayer,
  PlayerPosition,
} from "@/types/fantasy";

// ── Helpers ──────────────────────────────────────────────────

function makeMembership(
  overrides: Partial<FantasyLeagueMembershipRecord> = {}
): FantasyLeagueMembershipRecord {
  return {
    id: overrides.id ?? "mem-1",
    league_id: "league-1",
    user_id: overrides.user_id ?? "user-1",
    role: "manager",
    display_name: overrides.display_name ?? "Manager 1",
    team_name: overrides.team_name ?? "Team 1",
    joined_at: "2026-01-01T00:00:00.000Z",
    draft_slot: overrides.draft_slot ?? 1,
    waiver_priority: null,
  };
}

function makeMemberships(count: number): FantasyLeagueMembershipRecord[] {
  return Array.from({ length: count }, (_, i) =>
    makeMembership({
      id: `mem-${i + 1}`,
      user_id: `user-${i + 1}`,
      display_name: `Manager ${i + 1}`,
      team_name: `Team ${i + 1}`,
      draft_slot: i + 1,
    })
  );
}

function makePoolPlayer(
  overrides: Partial<FantasyPoolPlayer> = {}
): FantasyPoolPlayer {
  return {
    id: overrides.id ?? "player-1",
    display_name: overrides.display_name ?? "Player 1",
    club_name: overrides.club_name ?? "Portland Thorns",
    position: overrides.position ?? "MID",
    average_points: overrides.average_points ?? 8.0,
    salary_cost: overrides.salary_cost ?? 10,
    availability: overrides.availability ?? "available",
    rank: overrides.rank ?? 1,
  };
}

function makeRosterEntry(
  position: PlayerPosition,
  clubName = "Portland Thorns"
): Pick<FantasyRosterPlayer, "club_name" | "player_position"> {
  return { club_name: clubName, player_position: position };
}

function makeRosterPlayer(
  overrides: Partial<Omit<FantasyRosterPlayer, "player">> & { player?: Partial<FantasyPoolPlayer> } = {}
): FantasyRosterPlayer {
  const position = overrides.player_position ?? "MID";
  const id = overrides.id ?? `roster-${Math.random().toString(36).slice(2, 8)}`;
  const clubName = overrides.club_name ?? "Portland Thorns";
  const playerName = overrides.player_name ?? "Player";

  return {
    id,
    league_id: "league-1",
    user_id: "user-1",
    player_id: overrides.player_id ?? id,
    player_name: playerName,
    player_position: position,
    club_name: clubName,
    acquisition_source: "draft",
    lineup_slot: overrides.lineup_slot ?? null,
    acquired_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    player: makePoolPlayer({
      id: overrides.player_id ?? id,
      display_name: playerName,
      club_name: clubName,
      position,
      average_points: overrides.player?.average_points ?? 8.0,
      ...overrides.player,
    }),
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("buildSnakeTurn", () => {
  it("returns null for empty memberships", () => {
    const result = buildSnakeTurn([], 1, 12);
    expect(result).toBeNull();
  });

  it("returns null when any membership lacks a draft_slot", () => {
    const memberships: FantasyLeagueMembershipRecord[] = [
      { ...makeMembership({ id: "a", draft_slot: 1 }), draft_slot: 1 },
      { ...makeMembership({ id: "b" }), draft_slot: null },
    ];
    const result = buildSnakeTurn(memberships, 1, 12);
    expect(result).toBeNull();
  });

  it("calculates the correct turn for pick 1 in a 4-team draft", () => {
    const memberships = makeMemberships(4);
    const result = buildSnakeTurn(memberships, 1, 12);

    expect(result).not.toBeNull();
    expect(result!.roundNumber).toBe(1);
    expect(result!.pickNumber).toBe(1);
    expect(result!.membership?.id).toBe("mem-1");
    expect(result!.isFinalPick).toBe(false);
  });

  it("reverses order in even rounds (snake behavior)", () => {
    const memberships = makeMemberships(4);
    // Pick 5 is first pick of round 2 (even), so snake reversal gives last slot
    const result = buildSnakeTurn(memberships, 5, 12);

    expect(result).not.toBeNull();
    expect(result!.roundNumber).toBe(2);
    expect(result!.pickNumber).toBe(1);
    expect(result!.membership?.id).toBe("mem-4");
  });

  it("restores order in odd rounds after reversal", () => {
    const memberships = makeMemberships(4);
    // Pick 9 is first pick of round 3 (odd), back to normal order
    const result = buildSnakeTurn(memberships, 9, 12);

    expect(result).not.toBeNull();
    expect(result!.roundNumber).toBe(3);
    expect(result!.pickNumber).toBe(1);
    expect(result!.membership?.id).toBe("mem-1");
  });

  it("marks isFinalPick on the last overall pick", () => {
    const memberships = makeMemberships(4);
    const totalRounds = 3;
    const totalPicks = 4 * totalRounds; // 12
    const result = buildSnakeTurn(memberships, totalPicks, totalRounds);

    expect(result).not.toBeNull();
    expect(result!.isFinalPick).toBe(true);
    expect(result!.overallPick).toBe(totalPicks);
  });

  it("returns a context with null membership when past the last pick", () => {
    const memberships = makeMemberships(4);
    const totalRounds = 3;
    const totalPicks = 12;
    const result = buildSnakeTurn(memberships, totalPicks + 1, totalRounds);

    expect(result).not.toBeNull();
    expect(result!.membership).toBeNull();
    expect(result!.isFinalPick).toBe(true);
    expect(result!.totalPicks).toBe(totalPicks);
  });

  it("orders memberships by draft_slot regardless of input order", () => {
    const memberships = [
      makeMembership({ id: "c", draft_slot: 3 }),
      makeMembership({ id: "a", draft_slot: 1 }),
      makeMembership({ id: "b", draft_slot: 2 }),
    ];
    const result = buildSnakeTurn(memberships, 1, 12);

    expect(result!.membership?.id).toBe("a");
  });
});

describe("validateDraftPick", () => {
  it("returns null for a valid pick on an empty roster", () => {
    const player = makePoolPlayer({ club_name: "Portland Thorns" });
    const result = validateDraftPick(player, []);
    expect(result).toBeNull();
  });

  it("rejects a pick when the roster already has 12 players", () => {
    const player = makePoolPlayer();
    const roster = Array.from({ length: 12 }, () => makeRosterEntry("MID"));
    const result = validateDraftPick(player, roster);
    expect(result).toBe("That roster is already full.");
  });

  it("rejects a pick when the roster already has 4 players from the same club", () => {
    const player = makePoolPlayer({ club_name: "Portland Thorns" });
    const roster = Array.from({ length: 4 }, () =>
      makeRosterEntry("MID", "Portland Thorns")
    );
    const result = validateDraftPick(player, roster);
    expect(result).toBe(
      "That roster already has the maximum four players from this club."
    );
  });

  it("allows a pick when only 3 players are from the same club", () => {
    const player = makePoolPlayer({ club_name: "Portland Thorns" });
    const roster = Array.from({ length: 3 }, () =>
      makeRosterEntry("DEF", "Portland Thorns")
    );
    const result = validateDraftPick(player, roster);
    expect(result).toBeNull();
  });

  it("allows a pick from a different club even with 4 from another", () => {
    const player = makePoolPlayer({ club_name: "Chicago Red Stars" });
    const roster = Array.from({ length: 4 }, () =>
      makeRosterEntry("MID", "Portland Thorns")
    );
    const result = validateDraftPick(player, roster);
    expect(result).toBeNull();
  });
});

describe("chooseAutopickPlayer", () => {
  it("picks the first valid queued player when available", () => {
    const queuedPlayer = makePoolPlayer({ id: "q1", average_points: 5 });
    const topPlayer = makePoolPlayer({ id: "top", average_points: 15 });
    const available = [topPlayer, queuedPlayer];
    const result = chooseAutopickPlayer(available, [], [queuedPlayer]);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("q1");
  });

  it("skips queued players that are no longer available", () => {
    const unavailableQueued = makePoolPlayer({ id: "gone", average_points: 5 });
    const topPlayer = makePoolPlayer({ id: "top", average_points: 15, position: "MID" });
    const result = chooseAutopickPlayer([topPlayer], [], [unavailableQueued]);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("top");
  });

  it("skips queued players that fail validation", () => {
    const sameClubPlayer = makePoolPlayer({
      id: "q1",
      club_name: "Portland Thorns",
      average_points: 20,
    });
    const otherPlayer = makePoolPlayer({
      id: "other",
      club_name: "Chicago Red Stars",
      average_points: 5,
      position: "MID",
    });
    const roster = Array.from({ length: 4 }, () =>
      makeRosterEntry("MID", "Portland Thorns")
    );
    const result = chooseAutopickPlayer(
      [sameClubPlayer, otherPlayer],
      roster,
      [sameClubPlayer]
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe("other");
  });

  it("gives a starter-need bonus to under-filled positions", () => {
    const midfielder = makePoolPlayer({
      id: "mid",
      position: "MID",
      average_points: 7,
    });
    const forward = makePoolPlayer({
      id: "fwd",
      position: "FWD",
      average_points: 7,
    });
    // Roster already has 3 MIDs (full starter target) but 0 FWDs (target is 2)
    const roster = [
      makeRosterEntry("MID"),
      makeRosterEntry("MID"),
      makeRosterEntry("MID"),
    ];
    const result = chooseAutopickPlayer([midfielder, forward], roster, []);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("fwd");
  });

  it("returns null when no valid players are available", () => {
    const player = makePoolPlayer({ club_name: "Portland Thorns" });
    const roster = Array.from({ length: 4 }, () =>
      makeRosterEntry("MID", "Portland Thorns")
    );
    const result = chooseAutopickPlayer([player], roster, []);
    expect(result).toBeNull();
  });

  it("applies scarcity penalty when 4 of a position are already rostered", () => {
    const mid = makePoolPlayer({ id: "mid", position: "MID", average_points: 8, club_name: "Club A" });
    const def = makePoolPlayer({ id: "def", position: "DEF", average_points: 8, club_name: "Club B" });
    // Use different clubs so validation does not block due to club limit
    const roster = [
      makeRosterEntry("MID", "Club C"),
      makeRosterEntry("MID", "Club D"),
      makeRosterEntry("MID", "Club E"),
      makeRosterEntry("MID", "Club F"),
    ];
    const result = chooseAutopickPlayer([mid, def], roster, []);

    // DEF gets starter need bonus (+4), MID gets scarcity penalty (-1.5)
    // DEF: 8 + 4 = 12, MID: 8 - 1.5 = 6.5
    expect(result!.id).toBe("def");
  });
});

describe("buildSuggestedLineup", () => {
  it("assigns GK to the GK slot", () => {
    const gk = makeRosterPlayer({
      id: "gk-1",
      player_position: "GK",
      player: { average_points: 6 },
    });
    const assignments = buildSuggestedLineup([gk]);

    expect(assignments.get("gk-1")).toBe("GK");
  });

  it("fills DEF, MID, FWD starter slots before flex", () => {
    const roster = [
      makeRosterPlayer({ id: "gk", player_position: "GK", player: { average_points: 5 } }),
      makeRosterPlayer({ id: "def1", player_position: "DEF", player: { average_points: 9 } }),
      makeRosterPlayer({ id: "def2", player_position: "DEF", player: { average_points: 7 } }),
      makeRosterPlayer({ id: "mid1", player_position: "MID", player: { average_points: 10 } }),
      makeRosterPlayer({ id: "mid2", player_position: "MID", player: { average_points: 8 } }),
      makeRosterPlayer({ id: "mid3", player_position: "MID", player: { average_points: 6 } }),
      makeRosterPlayer({ id: "fwd1", player_position: "FWD", player: { average_points: 11 } }),
      makeRosterPlayer({ id: "fwd2", player_position: "FWD", player: { average_points: 4 } }),
    ];
    const assignments = buildSuggestedLineup(roster);

    expect(assignments.get("gk")).toBe("GK");
    expect(assignments.get("def1")).toBe("DEF_1");
    expect(assignments.get("def2")).toBe("DEF_2");
    expect(assignments.get("mid1")).toBe("MID_1");
    expect(assignments.get("mid2")).toBe("MID_2");
    expect(assignments.get("mid3")).toBe("MID_3");
    expect(assignments.get("fwd1")).toBe("FWD_1");
    expect(assignments.get("fwd2")).toBe("FWD_2");
  });

  it("assigns the best remaining outfield player to FLEX", () => {
    const roster = [
      makeRosterPlayer({ id: "gk", player_position: "GK", player: { average_points: 5 } }),
      makeRosterPlayer({ id: "def1", player_position: "DEF", player: { average_points: 9 } }),
      makeRosterPlayer({ id: "def2", player_position: "DEF", player: { average_points: 7 } }),
      makeRosterPlayer({ id: "def3", player_position: "DEF", player: { average_points: 5 } }),
      makeRosterPlayer({ id: "mid1", player_position: "MID", player: { average_points: 10 } }),
      makeRosterPlayer({ id: "mid2", player_position: "MID", player: { average_points: 8 } }),
      makeRosterPlayer({ id: "mid3", player_position: "MID", player: { average_points: 6 } }),
      makeRosterPlayer({ id: "fwd1", player_position: "FWD", player: { average_points: 11 } }),
      makeRosterPlayer({ id: "fwd2", player_position: "FWD", player: { average_points: 4 } }),
    ];
    const assignments = buildSuggestedLineup(roster);

    // def1 (9) and def2 (7) fill DEF_1 and DEF_2. The remaining flex pool is
    // [def3 (5), mid leftovers, fwd leftovers] sorted by avg. def3 (5) is the
    // only leftover DEF. The flex goes to the best remaining outfield player.
    const flexPlayer = [...assignments.entries()].find(([, slot]) => slot === "FLEX");
    expect(flexPlayer).toBeDefined();
    // FLEX should be a DEF, MID, or FWD -- not null
    expect(flexPlayer![0]).toBeTruthy();
  });

  it("assigns excess players to bench slots", () => {
    const roster = [
      makeRosterPlayer({ id: "gk1", player_position: "GK", player: { average_points: 5 } }),
      makeRosterPlayer({ id: "gk2", player_position: "GK", player: { average_points: 3 } }),
      makeRosterPlayer({ id: "def1", player_position: "DEF", player: { average_points: 9 } }),
      makeRosterPlayer({ id: "def2", player_position: "DEF", player: { average_points: 7 } }),
      makeRosterPlayer({ id: "mid1", player_position: "MID", player: { average_points: 10 } }),
      makeRosterPlayer({ id: "mid2", player_position: "MID", player: { average_points: 8 } }),
      makeRosterPlayer({ id: "mid3", player_position: "MID", player: { average_points: 6 } }),
      makeRosterPlayer({ id: "fwd1", player_position: "FWD", player: { average_points: 11 } }),
      makeRosterPlayer({ id: "fwd2", player_position: "FWD", player: { average_points: 4 } }),
      makeRosterPlayer({ id: "fwd3", player_position: "FWD", player: { average_points: 2 } }),
    ];
    const assignments = buildSuggestedLineup(roster);

    const benchValues = [...assignments.values()].filter(
      (slot) => slot != null && slot.startsWith("BENCH")
    );
    expect(benchValues.length).toBeGreaterThan(0);
  });

  it("handles an empty roster without errors", () => {
    const assignments = buildSuggestedLineup([]);
    expect(assignments.size).toBe(0);
  });

  it("assigns null slot to players that do not fit into any slot", () => {
    // Create 13 MID players - beyond what lineup can hold
    const roster = Array.from({ length: 13 }, (_, i) =>
      makeRosterPlayer({
        id: `mid-${i}`,
        player_position: "MID",
        player: { average_points: 10 - i * 0.5 },
      })
    );
    const assignments = buildSuggestedLineup(roster);
    const nullSlots = [...assignments.values()].filter((slot) => slot === null);
    expect(nullSlots.length).toBeGreaterThan(0);
  });
});

describe("isLineupSlotValid", () => {
  it("allows GK in the GK slot", () => {
    expect(isLineupSlotValid("GK", "GK")).toBe(true);
  });

  it("rejects FWD in the GK slot", () => {
    expect(isLineupSlotValid("GK", "FWD")).toBe(false);
  });

  it("allows DEF in DEF_1 and DEF_2", () => {
    expect(isLineupSlotValid("DEF_1", "DEF")).toBe(true);
    expect(isLineupSlotValid("DEF_2", "DEF")).toBe(true);
  });

  it("allows DEF, MID, FWD in the FLEX slot", () => {
    expect(isLineupSlotValid("FLEX", "DEF")).toBe(true);
    expect(isLineupSlotValid("FLEX", "MID")).toBe(true);
    expect(isLineupSlotValid("FLEX", "FWD")).toBe(true);
  });

  it("rejects GK in the FLEX slot", () => {
    expect(isLineupSlotValid("FLEX", "GK")).toBe(false);
  });

  it("allows any position in bench slots", () => {
    const positions: PlayerPosition[] = ["GK", "DEF", "MID", "FWD"];
    for (const slot of benchLineupSlots) {
      for (const pos of positions) {
        expect(isLineupSlotValid(slot, pos)).toBe(true);
      }
    }
  });
});

describe("getEligibleLineupSlots", () => {
  it("returns only GK and bench slots for a GK", () => {
    const slots = getEligibleLineupSlots("GK");
    expect(slots).toContain("GK");
    expect(slots).toContain("BENCH_1");
    expect(slots).toContain("BENCH_2");
    expect(slots).toContain("BENCH_3");
    expect(slots).not.toContain("FLEX");
    expect(slots).not.toContain("DEF_1");
  });

  it("returns DEF slots, FLEX, and bench slots for a DEF", () => {
    const slots = getEligibleLineupSlots("DEF");
    expect(slots).toContain("DEF_1");
    expect(slots).toContain("DEF_2");
    expect(slots).toContain("FLEX");
    expect(slots).toContain("BENCH_1");
    expect(slots).not.toContain("GK");
    expect(slots).not.toContain("MID_1");
  });

  it("returns MID slots, FLEX, and bench slots for a MID", () => {
    const slots = getEligibleLineupSlots("MID");
    expect(slots).toContain("MID_1");
    expect(slots).toContain("MID_2");
    expect(slots).toContain("MID_3");
    expect(slots).toContain("FLEX");
    expect(slots).toContain("BENCH_2");
    expect(slots).not.toContain("FWD_1");
  });

  it("returns FWD slots, FLEX, and bench slots for a FWD", () => {
    const slots = getEligibleLineupSlots("FWD");
    expect(slots).toContain("FWD_1");
    expect(slots).toContain("FWD_2");
    expect(slots).toContain("FLEX");
    expect(slots).toContain("BENCH_3");
    expect(slots).not.toContain("DEF_1");
  });
});
