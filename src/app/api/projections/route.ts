/**
 * GET /api/projections
 *
 * Returns match and player projections from the betting model.
 *
 * Query parameters (all optional, used as filters):
 * - fixtureId: Return projections for a specific fixture.
 * - clubId:    Return projections involving a specific club.
 * - playerId:  Return player projections for a specific player.
 *
 * When no filters are provided, all available projections are returned.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  loadProjections,
  createFallbackMatchProjection,
} from "@/lib/projections/model-bridge";
import type {
  ProjectionSummary,
} from "@/lib/projections/types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fixtureId = searchParams.get("fixtureId");
  const clubId = searchParams.get("clubId");
  const playerId = searchParams.get("playerId");

  try {
    let matchProjections = await loadProjections();

    // Apply fixture filter.
    if (fixtureId) {
      matchProjections = matchProjections.filter(
        (p) => p.fixtureId === fixtureId
      );

      // If a specific fixture was requested but no model data exists,
      // return a fallback projection so the UI always has something to show.
      if (matchProjections.length === 0) {
        matchProjections = [
          createFallbackMatchProjection(fixtureId, "unknown", "unknown"),
        ];
      }
    }

    // Apply club filter.
    if (clubId) {
      matchProjections = matchProjections.filter(
        (p) => p.homeClubId === clubId || p.awayClubId === clubId
      );
    }

    // Player projections are generated on demand by the projection engine
    // and are not stored in the model output files. For now, this endpoint
    // returns match-level projections only. A future enhancement will
    // accept a roster of players and return player-level projections.
    //
    // When a playerId filter is supplied, we return an empty player
    // projections array to signal that the caller should use the
    // projection engine client-side or via a dedicated endpoint.

    const summary: ProjectionSummary = {
      matchProjections,
      playerProjections: [],
      modelVersion: "1.0.0",
      generatedAt: new Date().toISOString(),
    };

    // If a playerId was requested, include it as metadata for the caller.
    if (playerId) {
      return NextResponse.json({
        ...summary,
        filters: { fixtureId, clubId, playerId },
      });
    }

    return NextResponse.json(summary);
  } catch (err) {
    console.error("[api/projections] Error loading projections:", err);
    return NextResponse.json(
      { error: "Failed to load projections" },
      { status: 500 }
    );
  }
}
