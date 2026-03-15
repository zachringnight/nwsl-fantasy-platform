import { describe, expect, it, vi, beforeEach } from "vitest";
// ── Supabase mock infrastructure ─────────────────────────────

function createChainableQuery(finalResult: { data?: unknown; error?: unknown; count?: number }) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "insert", "update", "upsert", "eq", "in", "single", "order"];

  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }

  // Terminal methods resolve to finalResult
  chain.single = vi.fn().mockReturnValue(finalResult);
  chain.then = undefined;

  // Make the chain itself act as a thenable result for await
  Object.assign(chain, finalResult);

  return chain;
}

let mockFromResults: Record<string, ReturnType<typeof createChainableQuery>>;
let mockAuthUser: { id: string } | null;

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    from: (table: string) => mockFromResults[table] ?? createChainableQuery({ data: null, error: null }),
    auth: {
      getUser: () => Promise.resolve({ data: { user: mockAuthUser } }),
    },
  }),
}));

// Dynamic import so the mock is in place before the module loads
const {
  loadTradeProposals,
  createTradeProposal,
  respondToTrade,
  cancelTrade,
} = await import("./fantasy-trades");

// ── Tests ────────────────────────────────────────────────────

describe("loadTradeProposals", () => {
  beforeEach(() => {
    mockAuthUser = { id: "user-1" };
    mockFromResults = {};
  });

  it("returns an empty array when the query errors", async () => {
    mockFromResults["fantasy_trade_proposals"] = createChainableQuery({
      data: null,
      error: { message: "db error" },
    });

    const result = await loadTradeProposals("league-1");
    expect(result).toEqual([]);
  });

  it("returns an empty array when data is null", async () => {
    mockFromResults["fantasy_trade_proposals"] = createChainableQuery({
      data: null,
      error: null,
    });

    const result = await loadTradeProposals("league-1");
    expect(result).toEqual([]);
  });

  it("maps raw rows into TradeProposalRecord shape", async () => {
    const rawRow = {
      id: "trade-1",
      league_id: "league-1",
      proposer_team_id: "team-a",
      receiver_team_id: "team-b",
      status: "pending",
      message: "Fair trade",
      review_period_ends_at: "2026-01-10T00:00:00.000Z",
      veto_count: 0,
      veto_threshold: 2,
      created_at: "2026-01-01T00:00:00.000Z",
      proposer_team: { name: "Alpha FC" },
      receiver_team: { name: "Beta United" },
      assets: [],
      votes: [],
    };

    mockFromResults["fantasy_trade_proposals"] = createChainableQuery({
      data: [rawRow],
      error: null,
    });

    const result = await loadTradeProposals("league-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("trade-1");
    expect(result[0].proposer_team_name).toBe("Alpha FC");
    expect(result[0].receiver_team_name).toBe("Beta United");
    expect(result[0].status).toBe("pending");
  });

  it("defaults team name to 'Unknown' when team relation is missing", async () => {
    const rawRow = {
      id: "trade-2",
      league_id: "league-1",
      proposer_team_id: "team-a",
      receiver_team_id: "team-b",
      status: "pending",
      message: null,
      review_period_ends_at: "2026-01-10T00:00:00.000Z",
      veto_count: 0,
      veto_threshold: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      proposer_team: null,
      receiver_team: null,
      assets: [],
      votes: [],
    };

    mockFromResults["fantasy_trade_proposals"] = createChainableQuery({
      data: [rawRow],
      error: null,
    });

    const result = await loadTradeProposals("league-1");
    expect(result[0].proposer_team_name).toBe("Unknown");
    expect(result[0].receiver_team_name).toBe("Unknown");
  });
});

describe("createTradeProposal", () => {
  beforeEach(() => {
    mockAuthUser = { id: "user-1" };
    mockFromResults = {};
  });

  it("throws when user is not signed in", async () => {
    mockAuthUser = null;

    await expect(
      createTradeProposal({
        leagueId: "league-1",
        proposerTeamId: "team-a",
        receiverTeamId: "team-b",
        sendingPlayerIds: ["p1"],
        receivingPlayerIds: ["p2"],
      })
    ).rejects.toThrow("You must be signed in to propose a trade.");
  });

  it("throws when sending players list is empty", async () => {
    await expect(
      createTradeProposal({
        leagueId: "league-1",
        proposerTeamId: "team-a",
        receiverTeamId: "team-b",
        sendingPlayerIds: [],
        receivingPlayerIds: ["p2"],
      })
    ).rejects.toThrow("Both sides of the trade must include at least one player.");
  });

  it("throws when receiving players list is empty", async () => {
    await expect(
      createTradeProposal({
        leagueId: "league-1",
        proposerTeamId: "team-a",
        receiverTeamId: "team-b",
        sendingPlayerIds: ["p1"],
        receivingPlayerIds: [],
      })
    ).rejects.toThrow("Both sides of the trade must include at least one player.");
  });
});

describe("respondToTrade", () => {
  beforeEach(() => {
    mockFromResults = {};
  });

  it("throws when the update query errors", async () => {
    mockFromResults["fantasy_trade_proposals"] = createChainableQuery({
      data: null,
      error: { message: "not found" },
    });

    await expect(respondToTrade("proposal-1", "accepted")).rejects.toThrow(
      "Unable to respond to trade."
    );
  });

  it("does not throw when the update succeeds", async () => {
    mockFromResults["fantasy_trade_proposals"] = createChainableQuery({
      data: null,
      error: null,
    });

    await expect(respondToTrade("proposal-1", "rejected")).resolves.toBeUndefined();
  });
});

describe("cancelTrade", () => {
  beforeEach(() => {
    mockFromResults = {};
  });

  it("throws when the cancel query errors", async () => {
    mockFromResults["fantasy_trade_proposals"] = createChainableQuery({
      data: null,
      error: { message: "not found" },
    });

    await expect(cancelTrade("proposal-1")).rejects.toThrow("Unable to cancel trade.");
  });

  it("does not throw on successful cancellation", async () => {
    mockFromResults["fantasy_trade_proposals"] = createChainableQuery({
      data: null,
      error: null,
    });

    await expect(cancelTrade("proposal-1")).resolves.toBeUndefined();
  });
});
