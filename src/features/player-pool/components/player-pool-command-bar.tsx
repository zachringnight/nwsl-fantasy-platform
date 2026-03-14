import { Sparkles, Target, TrendingUp } from "lucide-react";
import { SurfaceCard } from "@/components/common/surface-card";
import { Button } from "@/components/ui/button";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import type { PlayerPosition } from "@/types/fantasy";

const filters: Array<"ALL" | PlayerPosition> = ["ALL", "GK", "DEF", "MID", "FWD"];
const sortOptions = [
  { label: "Best value", value: "value" },
  { label: "Top projection", value: "projection" },
  { label: "Lowest salary", value: "salary" },
  { label: "Name", value: "name" },
] as const;

export type PlayerPoolSortKey = (typeof sortOptions)[number]["value"];

export interface PlayerPoolCommandBarProps {
  availableCount: number;
  clubCoverageCount: number;
  draftedCount: number;
  onPositionFilterChange: (value: "ALL" | PlayerPosition) => void;
  onSearchChange: (value: string) => void;
  onSortChange: (value: PlayerPoolSortKey) => void;
  positionFilter: "ALL" | PlayerPosition;
  premiumBandCount: number;
  search: string;
  salaryCapAmount: number | null;
  sortBy: PlayerPoolSortKey;
  topValueLabel: string;
  usesSalaryCap: boolean;
}

export function PlayerPoolCommandBar({
  availableCount,
  clubCoverageCount,
  draftedCount,
  onPositionFilterChange,
  onSearchChange,
  onSortChange,
  positionFilter,
  premiumBandCount,
  salaryCapAmount,
  search,
  sortBy,
  topValueLabel,
  usesSalaryCap,
}: PlayerPoolCommandBarProps) {
  return (
    <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <SurfaceCard
        description="Use one board to search the pool, check ownership, and decide who to add next."
        eyebrow="Player pool"
        title={usesSalaryCap ? "Shared-pool salary scouting" : "Exclusive ownership scouting board"}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Pill tone="brand">{availableCount} visible players</Pill>
            <Pill tone="default">{clubCoverageCount} clubs in view</Pill>
            <Pill tone="success">
              {usesSalaryCap ? `${premiumBandCount} elite salary targets` : `${premiumBandCount} premium form players`}
            </Pill>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <MetricTile
              detail="Players matching your current search and filters."
              label="Visible players"
              value={availableCount}
            />
            <MetricTile
              detail="Already rostered or reserved elsewhere in the league."
              label="Drafted or reserved"
              tone="accent"
              value={draftedCount}
            />
            <MetricTile
              detail={
                usesSalaryCap
                  ? "The same cap applies in the lineup."
                  : "Classic leagues use exclusive rosters and waivers."
              }
              label={usesSalaryCap ? "Salary cap" : "Mode"}
              tone="brand"
              value={usesSalaryCap ? `$${salaryCapAmount ?? 0}` : "Classic"}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-[1.4rem] border border-line bg-white/5 p-4">
              <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-brand-strong">
                <Sparkles className="size-3.5" />
                Top value
              </p>
              <p className="mt-3 text-xl font-semibold leading-tight text-foreground">
                {topValueLabel}
              </p>
            </div>
            <div className="rounded-[1.4rem] border border-line bg-white/5 p-4">
              <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-brand-strong">
                <Target className="size-3.5" />
                Club coverage
              </p>
              <p className="mt-3 text-xl font-semibold leading-tight text-foreground">
                {clubCoverageCount} clubs
              </p>
            </div>
            <div className="rounded-[1.4rem] border border-line bg-white/5 p-4">
              <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-brand-strong">
                <TrendingUp className="size-3.5" />
                Premium band
              </p>
              <p className="mt-3 text-xl font-semibold leading-tight text-foreground">
                {premiumBandCount} in form
              </p>
            </div>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard
        description="Search, sort, and position filters keep the board focused on the right player fast."
        eyebrow="Filters"
        title="Search, sort, and narrow the board"
        tone="accent"
      >
        <div className="space-y-4">
          <div className="grid gap-3">
            <input
              className="field-control"
              onChange={(event) => {
                onSearchChange(event.target.value);
              }}
              placeholder="Search player or club"
              type="search"
              value={search}
            />
            <select
              className="field-control"
              onChange={(event) => {
                onSortChange(event.target.value as PlayerPoolSortKey);
              }}
              value={sortBy}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <Button
                key={filter}
                onClick={() => {
                  onPositionFilterChange(filter);
                }}
                type="button"
                variant={positionFilter === filter ? "primary" : "secondary"}
              >
                {filter}
              </Button>
            ))}
          </div>
        </div>
      </SurfaceCard>
    </section>
  );
}
