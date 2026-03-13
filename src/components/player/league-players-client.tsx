"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useEffectEvent, useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { PlayerCard } from "@/components/player/player-card";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { MotionReveal } from "@/components/ui/motion-reveal";
import { Button } from "@/components/ui/button";
import { getButtonClassName } from "@/components/ui/button";
import {
  PlayerPoolCommandBar,
  type PlayerPoolSortKey,
} from "@/features/player-pool/components/player-pool-command-bar";
import { FantasyAuthGate } from "@/features/shared/components/fantasy-auth-gate";
import { buildLeagueLinks } from "@/lib/league-links";
import { getFantasyModeConfig } from "@/lib/fantasy-modes";
import type { FantasyLeaguePlayerListing, FantasyLeagueRecord, PlayerPosition } from "@/types/fantasy";

export interface LeaguePlayersClientProps {
  leagueId: string;
}

export function LeaguePlayersClient({ leagueId }: LeaguePlayersClientProps) {
  const dataClient = useFantasyDataClient();
  const { profile, session } = useFantasyAuth();
  const links = buildLeagueLinks(leagueId);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [league, setLeague] = useState<FantasyLeagueRecord | null>(null);
  const [players, setPlayers] = useState<FantasyLeaguePlayerListing[]>([]);
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<"ALL" | PlayerPosition>("ALL");
  const [sortBy, setSortBy] = useState<PlayerPoolSortKey>("value");
  const deferredSearch = useDeferredValue(search);

  const refreshPlayers = useEffectEvent(async () => {
    if (!session || !profile?.onboarding_complete) {
      setLeague(null);
      setPlayers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const nextState = await dataClient.loadLeaguePlayerListings(leagueId);
      setLeague(nextState.league);
      setPlayers(nextState.players);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load league players."
      );
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void refreshPlayers();
  }, [dataClient, leagueId, profile?.onboarding_complete, session?.user.id]);

  return (
    <FantasyAuthGate
      loadingDescription="Checking your account before opening the player board."
      loadingTitle="Checking your account"
      onboardingAction={
        <Link className={getButtonClassName()} href="/onboarding">
          Finish onboarding
        </Link>
      }
      onboardingDescription="Set your club and fantasy experience level before opening the league player board."
      signedOutDescription="Sign in before opening the player board."
      signedOutTitle="Sign in to continue"
    >
      {() => {
        if (isLoading && !league) {
          return (
            <EmptyState
              description="Loading the player board for your league."
              title="Loading player board"
            />
          );
        }

        if (error && !league) {
          return <EmptyState description={error} title="Unable to load player board" />;
        }

        if (!league) {
          return (
            <EmptyState
              description="That league could not be found."
              title="League not found"
            />
          );
        }

        const modeConfig = getFantasyModeConfig(league);
        const query = deferredSearch.trim().toLowerCase();
        const filteredPlayers = [...players]
          .filter((listing) => {
            if (positionFilter !== "ALL" && listing.player.position !== positionFilter) {
              return false;
            }

            if (!query) {
              return true;
            }

            return (
              listing.player.display_name.toLowerCase().includes(query) ||
              listing.player.club_name.toLowerCase().includes(query)
            );
          })
          .sort((left, right) => comparePlayerListings(left, right, sortBy, modeConfig.usesSalaryCap));
        const draftedCount = players.filter(
          (player) => player.ownership_status === "drafted"
        ).length;
        const clubCoverageCount = new Set(
          filteredPlayers.map((listing) => listing.player.club_name)
        ).size;
        const topValuePlayer = filteredPlayers[0];
        const premiumBandCount = filteredPlayers.filter(
          (listing) => listing.player.average_points >= 15
        ).length;

        if (filteredPlayers.length === 0) {
          return (
            <EmptyState
              action={
                <Button
                  onClick={() => {
                    setSearch("");
                    setPositionFilter("ALL");
                    setSortBy("value");
                  }}
                  type="button"
                >
                  Reset filters
                </Button>
              }
              description="There are no players matching the current search, position, and sort combination."
              title="No players in view"
            />
          );
        }

        return (
          <section className="space-y-5">
            <MotionReveal>
              <PlayerPoolCommandBar
                availableCount={filteredPlayers.length}
                clubCoverageCount={clubCoverageCount}
                draftedCount={draftedCount}
                onPositionFilterChange={setPositionFilter}
                onSearchChange={setSearch}
                onSortChange={setSortBy}
                positionFilter={positionFilter}
                premiumBandCount={premiumBandCount}
                salaryCapAmount={league.salary_cap_amount}
                search={search}
                sortBy={sortBy}
                topValueLabel={
                  topValuePlayer
                    ? `${topValuePlayer.player.display_name} • ${topValuePlayer.player.club_name}`
                    : "No players available"
                }
                usesSalaryCap={modeConfig.usesSalaryCap}
              />
            </MotionReveal>

            <section className="grid gap-5 lg:grid-cols-3">
              {filteredPlayers.map((listing, index) => (
                <MotionReveal key={listing.player.id} delay={40 + index * 30}>
                  <PlayerCard
                    actionHref={buildPlayerActionHref(
                      links.team,
                      links.transactions,
                      listing,
                      modeConfig.usesSalaryCap
                    )}
                    actionLabel={buildPlayerActionLabel(listing, modeConfig.usesSalaryCap)}
                    detailHref={`/players/${listing.player.id}`}
                    ownershipLabel={buildOwnershipLabel(listing)}
                    player={listing.player}
                  />
                </MotionReveal>
              ))}
            </section>
          </section>
        );
      }}
    </FantasyAuthGate>
  );
}

function comparePlayerListings(
  left: FantasyLeaguePlayerListing,
  right: FantasyLeaguePlayerListing,
  sortBy: PlayerPoolSortKey,
  usesSalaryCap: boolean
) {
  if (sortBy === "name") {
    return left.player.display_name.localeCompare(right.player.display_name);
  }

  if (sortBy === "salary") {
    return left.player.salary_cost - right.player.salary_cost;
  }

  if (sortBy === "projection") {
    return right.player.average_points - left.player.average_points;
  }

  return computePlayerValueScore(right, usesSalaryCap) - computePlayerValueScore(left, usesSalaryCap);
}

function computePlayerValueScore(
  listing: FantasyLeaguePlayerListing,
  usesSalaryCap: boolean
) {
  if (!usesSalaryCap || listing.player.salary_cost <= 0) {
    return listing.player.average_points;
  }

  return (listing.player.average_points / listing.player.salary_cost) * 1000;
}

function buildOwnershipLabel(listing: FantasyLeaguePlayerListing) {
  if (listing.ownership_status === "drafted") {
    return listing.rostered_by_display_name
      ? `Drafted by ${listing.rostered_by_display_name}`
      : "Drafted";
  }

  if (listing.ownership_status === "shared_pool") {
    return "Shared pool";
  }

  return "Available";
}

function buildPlayerActionHref(
  teamHref: string,
  transactionsHref: string,
  listing: FantasyLeaguePlayerListing,
  usesSalaryCap: boolean
) {
  if (usesSalaryCap) {
    return `${teamHref}?playerId=${listing.player.id}`;
  }

  if (listing.ownership_status !== "available") {
    return undefined;
  }

  return `${transactionsHref}?playerId=${listing.player.id}`;
}

function buildPlayerActionLabel(
  listing: FantasyLeaguePlayerListing,
  usesSalaryCap: boolean
) {
  if (usesSalaryCap) {
    return "Add to lineup";
  }

  return listing.ownership_status === "available" ? "Claim on waivers" : undefined;
}
