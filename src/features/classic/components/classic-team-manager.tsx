import { LineupPitch } from "@/components/lineup/lineup-pitch";
import { SurfaceCard } from "@/components/common/surface-card";
import { StatusBanner } from "@/components/common/status-banner";
import { Button } from "@/components/ui/button";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import {
  getEligibleLineupSlots,
  lineupSlotLabels,
  starterLineupSlots,
} from "@/lib/fantasy-draft";
import { launchScoringRules } from "@/lib/scoring/scoring-rules";
import type {
  FantasyLineupSlot,
  FantasyRosterPlayer,
} from "@/types/fantasy";

const starterLineupCount = 9;

export interface ClassicTeamManagerProps {
  assignments: Record<string, FantasyLineupSlot | "">;
  error: string;
  isSaving: boolean;
  missingStarterSlots: FantasyLineupSlot[];
  onAssignmentChange: (rosterId: string, slot: FantasyLineupSlot | "") => void;
  onAutofill: () => Promise<void>;
  onSave: () => Promise<void>;
  roster: FantasyRosterPlayer[];
}

export function ClassicTeamManager({
  assignments,
  error,
  isSaving,
  missingStarterSlots,
  onAssignmentChange,
  onAutofill,
  onSave,
  roster,
}: ClassicTeamManagerProps) {
  const rosterWithAssignments = roster.map((player) => ({
    ...player,
    lineup_slot: (assignments[player.id] || null) as FantasyLineupSlot | null,
  }));
  const starterCount = starterLineupCount - missingStarterSlots.length;
  const starters = rosterWithAssignments.filter(
    (player) => player.lineup_slot && starterLineupSlots.includes(player.lineup_slot)
  );
  const benchPlayers = rosterWithAssignments.filter(
    (player) => !player.lineup_slot || !starterLineupSlots.includes(player.lineup_slot)
  );
  const starterProjection = starters.reduce(
    (total, player) => total + player.player.average_points,
    0
  );
  const benchProjection = benchPlayers.reduce(
    (total, player) => total + player.player.average_points,
    0
  );
  const projectionDriver = [...starters].sort(
    (left, right) => right.player.average_points - left.player.average_points
  )[0] ?? null;
  const roleLeader = starters.reduce<Record<"GK" | "DEF" | "MID" | "FWD", number>>(
    (accumulator, player) => {
      accumulator[player.player_position] += player.player.average_points;
      return accumulator;
    },
    { GK: 0, DEF: 0, MID: 0, FWD: 0 }
  );
  const strongestRole =
    Object.entries(roleLeader).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "MID";
  const roleMix = (Object.entries(roleLeader) as Array<["GK" | "DEF" | "MID" | "FWD", number]>)
    .map(([role, points]) => ({
      points,
      role,
      share: starterProjection > 0 ? Math.max((points / starterProjection) * 100, 8) : 0,
    }))
    .filter((entry) => entry.points > 0);
  const readinessLabel =
    missingStarterSlots.length === 0
      ? "Lineup is balanced and ready to save."
      : `Open starter slots: ${missingStarterSlots.map((slot) => lineupSlotLabels[slot]).join(", ")}`;

  return (
    <section className="space-y-5">
      {error ? (
        <StatusBanner message={error} title="Lineup action" tone="warning" />
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <LineupPitch roster={rosterWithAssignments} />

        <div className="space-y-5">
          <SurfaceCard
            description="Set legal starters, review lineup projection, and save changes from one team view."
            eyebrow="Classic team"
            title={missingStarterSlots.length === 0 ? "Lineup is legal" : "Finish the starters"}
            tone="accent"
          >
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricTile
                  detail="Starter compliance matters more than total roster count."
                  label="Starters filled"
                  tone={missingStarterSlots.length === 0 ? "brand" : "default"}
                  value={`${starterCount}/${starterLineupCount}`}
                />
                <MetricTile
                  detail={
                    missingStarterSlots.length === 0
                      ? "The lineup can be saved immediately."
                      : `Open slots: ${missingStarterSlots.map((slot) => lineupSlotLabels[slot]).join(", ")}`
                  }
                  label="Readiness"
                  tone={missingStarterSlots.length === 0 ? "accent" : "default"}
                  value={missingStarterSlots.length === 0 ? "Ready" : "Incomplete"}
                />
                <MetricTile
                  detail="Sum of current starter average fantasy points."
                  label="Lineup projection"
                  tone="brand"
                  value={starterProjection.toFixed(1)}
                />
                <MetricTile
                  detail="Projected points currently waiting on the bench."
                  label="Bench pressure"
                  tone="accent"
                  value={benchProjection.toFixed(1)}
                />
              </div>

              <div className="rounded-[1.3rem] border border-line bg-black/18 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                  Starter mood
                </p>
                <p className="mt-3 text-sm leading-7 text-white/84">{readinessLabel}</p>
              </div>

              <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-[1.3rem] border border-line bg-black/18 p-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                    Role balance
                  </p>
                  <div className="mt-4 space-y-3">
                    {roleMix.map((entry) => (
                      <div key={entry.role}>
                        <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-white/62">
                          <span>{entry.role}</span>
                          <span>{entry.points.toFixed(1)} pts</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,#ff7eb6_0%,#00e1ff_100%)]"
                            style={{ width: `${entry.share}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[1.3rem] border border-line bg-black/18 p-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                    Quick scoring cues
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Pill tone="brand">Appearance +{launchScoringRules.appearance}</Pill>
                    <Pill tone="accent">60+ mins +{launchScoringRules.minutes60Plus}</Pill>
                    <Pill tone="success">Role leader {strongestRole}</Pill>
                  </div>
                  <div className="mt-4 rounded-[1.2rem] border border-white/10 bg-white/6 p-4">
                    <p className="text-sm font-semibold text-white">
                      {projectionDriver
                        ? `${projectionDriver.player_name} sets the ceiling`
                        : "Add starters to unlock your ceiling"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/74">
                      {projectionDriver
                        ? `${projectionDriver.player.average_points.toFixed(1)} projected points. Strongest lane right now: ${strongestRole}.`
                        : `Strongest lane right now: ${strongestRole}.`}
                    </p>
                  </div>
                </div>
              </div>

              <StatusBanner
                message={
                  missingStarterSlots.length === 0
                    ? "Every starter slot is filled. Save to persist the current arrangement."
                    : `Open starter slots: ${missingStarterSlots.map((slot) => lineupSlotLabels[slot]).join(", ")}`
                }
                title={missingStarterSlots.length === 0 ? "Ready" : "Missing starters"}
                tone={missingStarterSlots.length === 0 ? "success" : "warning"}
              />

              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={isSaving}
                  onClick={() => {
                    void onAutofill();
                  }}
                  type="button"
                  variant="secondary"
                >
                  {isSaving ? "Working..." : "Autofill best lineup"}
                </Button>
                <Button
                  disabled={isSaving}
                  onClick={() => {
                    void onSave();
                  }}
                  type="button"
                >
                  {isSaving ? "Saving..." : "Save lineup"}
                </Button>
              </div>
            </div>
          </SurfaceCard>
        </div>
      </section>

      <SurfaceCard
        description="Place each player into a position before kickoff."
        eyebrow="Lineup"
        title="Set your starting lineup"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {roster.map((player) => (
            <label
              key={player.id}
              className="rounded-[1.3rem] border border-line bg-panel-soft px-4 py-4 transition hover:border-brand-strong/24 hover:bg-white/7"
            >
              <span className="block text-sm font-medium text-foreground">
                {player.player_name}
              </span>
              <span className="mt-1 block text-xs uppercase tracking-[0.18em] text-muted">
                {player.player_position} • {player.club_name}
              </span>
              <span className="mt-3 inline-flex rounded-full border border-line bg-white/6 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-brand-strong">
                {assignments[player.id] ? lineupSlotLabels[assignments[player.id] as FantasyLineupSlot] : "Unassigned"}
              </span>
              <select
                className="field-control mt-3"
                onChange={(event) => {
                  onAssignmentChange(player.id, event.target.value as FantasyLineupSlot | "");
                }}
                value={assignments[player.id] ?? ""}
              >
                <option value="">Unassigned</option>
                {getEligibleLineupSlots(player.player_position).map((slot) => (
                  <option key={slot} value={slot}>
                    {lineupSlotLabels[slot]}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </SurfaceCard>
    </section>
  );
}
