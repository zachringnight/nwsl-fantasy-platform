import { NextResponse } from "next/server";
import { getMaterializedFantasyProjectionSlate } from "@/lib/projections/materialize";
import {
  fantasyProjectionSchemas,
  type FantasyProjectionSchemaKey,
} from "@/lib/projections/scoring";
import type { FantasyGameVariant } from "@/types/fantasy";

function buildCsv(rows: Array<Record<string, string | number | boolean | null>>) {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]!);
  const escape = (value: string | number | boolean | null) => {
    const raw = value == null ? "" : String(value);
    if (!/[",\n]/.test(raw)) {
      return raw;
    }

    return `"${raw.replace(/"/g, "\"\"")}"`;
  };

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escape(row[header] ?? "")).join(",")),
  ].join("\n");
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedSchemaKey = searchParams.get("schemaKey");
    const schemaKey: FantasyProjectionSchemaKey =
      requestedSchemaKey &&
      Object.prototype.hasOwnProperty.call(fantasyProjectionSchemas, requestedSchemaKey)
        ? (requestedSchemaKey as FantasyProjectionSchemaKey)
        : "site_launch_v1";
    const variant = (searchParams.get("variant") as FantasyGameVariant | null) ?? "salary_cap_daily";
    const slateKey = searchParams.get("slateKey") ?? undefined;
    const playerId = searchParams.get("playerId");
    const fixtureId = searchParams.get("fixtureId");
    const format = searchParams.get("format") ?? "json";

    const projections = await getMaterializedFantasyProjectionSlate(
      schemaKey,
      variant,
      slateKey
    );

    const filteredPlayers = projections.players.filter((player) => {
      if (playerId && player.id !== playerId) {
        return false;
      }

      if (fixtureId && player.fixture_id !== fixtureId) {
        return false;
      }

      return true;
    });

    if (format === "csv") {
      const csv = buildCsv(
        filteredPlayers.map((player) => ({
          player_id: player.id,
          player: player.display_name,
          club: player.club_name,
          position: player.position,
          slate_key: player.slate_key ?? null,
          opponent: player.opponent ?? null,
          venue: player.venue ?? null,
          projected_points: player.projected_points ?? player.average_points,
          baseline_points: player.baseline_points ?? null,
          floor_points: player.floor_points ?? null,
          ceiling_points: player.ceiling_points ?? null,
          salary_cost: player.salary_cost,
          expected_minutes: player.expected_minutes ?? null,
          starter_probability: player.starter_probability ?? null,
          lineup_status: player.lineup_status ?? null,
          projection_confidence: player.projection_confidence ?? null,
          projection_quality: player.projection_quality ?? null,
          schema_key: projections.schemaKey,
          schema_label: projections.schemaLabel,
          model_version: projections.model.modelVersion,
          model_family: projections.model.modelFamily,
          gating_status: projections.model.gatingStatus,
          calibration_applied: projections.model.calibrationApplied,
        }))
      );

      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `inline; filename="fantasy-projections-${projections.slate.key}-${projections.schemaKey}.csv"`,
        },
      });
    }

    return NextResponse.json({
      ...projections,
      players: filteredPlayers,
    });
  } catch (error) {
    console.error("[fantasy-projections:GET]", error);
    return NextResponse.json(
      { error: "Failed to build fantasy projections." },
      { status: 500 }
    );
  }
}
