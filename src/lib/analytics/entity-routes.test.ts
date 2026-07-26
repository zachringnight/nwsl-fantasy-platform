import { describe, expect, it } from "vitest";
import {
  analyticsMatchHref,
  analyticsPlayerHref,
  analyticsPredictionHref,
  analyticsTeamHref,
  analyticsTeamId,
  fantasyPlayerHref,
} from "./entity-routes";

describe("analytics entity routes", () => {
  it("uses the same stable team slug contract as the analytics data layer", () => {
    expect(analyticsTeamId("  North Carolina Courage  ")).toBe(
      "north-carolina-courage"
    );
    expect(analyticsTeamId("NJ/NY Gotham FC")).toBe("nj-ny-gotham-fc");
  });

  it("encodes entity identifiers in detail links", () => {
    expect(analyticsTeamHref("Angel City FC")).toBe(
      "/analytics/teams/Angel%20City%20FC"
    );
    expect(analyticsPlayerHref("player/7")).toBe(
      "/analytics/players/player%2F7"
    );
    expect(fantasyPlayerHref("player/7")).toBe("/players/player%2F7");
    expect(analyticsMatchHref("match 7")).toBe(
      "/analytics/matches/match%207"
    );
    expect(analyticsPredictionHref("match 7")).toBe(
      "/analytics/predictions/match%207"
    );
  });
});
