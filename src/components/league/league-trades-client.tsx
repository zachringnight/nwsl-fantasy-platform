"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";
import { toast } from "sonner";
import { ArrowRightLeft, Ban, Check, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { SurfaceCard } from "@/components/common/surface-card";
import { useFantasyDataClient } from "@/components/providers/fantasy-data-provider";
import { useFantasyAuth } from "@/components/providers/fantasy-auth-provider";
import { Button, getButtonClassName } from "@/components/ui/button";
import { MetricTile } from "@/components/ui/metric-tile";
import { MotionReveal } from "@/components/ui/motion-reveal";
import { Pill } from "@/components/ui/pill";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { FantasyAuthGate } from "@/features/shared/components/fantasy-auth-gate";
import {
  cancelTrade,
  createTradeProposal,
  loadTradeProposals,
  respondToTrade,
  voteOnTrade,
} from "@/lib/fantasy-trades";
import type {
  FantasyLeagueDetails,
  FantasyRosterPlayer,
  TradeProposalRecord,
} from "@/types/fantasy";

export interface LeagueTradesClientProps {
  leagueId: string;
}

export function LeagueTradesClient({ leagueId }: LeagueTradesClientProps) {
  const dataClient = useFantasyDataClient();
  const { profile, session } = useFantasyAuth();
  const [proposals, setProposals] = useState<TradeProposalRecord[]>([]);
  const [leagueDetails, setLeagueDetails] = useState<FantasyLeagueDetails | null>(null);
  const [roster, setRoster] = useState<FantasyRosterPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Proposal form state
  const [showForm, setShowForm] = useState(false);
  const [selectedReceiverTeamId, setSelectedReceiverTeamId] = useState("");
  const [selectedSendPlayers, setSelectedSendPlayers] = useState<string[]>([]);
  const [selectedReceivePlayers, setSelectedReceivePlayers] = useState<string[]>([]);
  const [tradeMessage, setTradeMessage] = useState("");

  const refreshTrades = useEffectEvent(async () => {
    if (!session || !profile?.onboarding_complete) return;

    setIsLoading(true);
    try {
      const [details, tradeList] = await Promise.all([
        dataClient.loadLeagueById(leagueId),
        loadTradeProposals(leagueId),
      ]);
      setLeagueDetails(details);
      setProposals(tradeList);

      if (details) {
        const rosterState = await dataClient.loadRosterState(leagueId);
        setRoster(rosterState.roster);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load trades.");
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void refreshTrades();
  }, [dataClient, leagueId, profile?.onboarding_complete, session?.user.id]);

  const myTeamId = leagueDetails?.memberships.find(
    (m) => m.user_id === session?.user.id
  )?.team_name;
  const myMembership = leagueDetails?.currentMembership;

  async function handleSubmitProposal() {
    if (!myMembership || !selectedReceiverTeamId) return;
    setBusyId("new");
    setError("");

    try {
      // We need the actual team IDs from the membership data
      const myTeam = leagueDetails?.memberships.find(m => m.user_id === session?.user.id);
      const receiverMembership = leagueDetails?.memberships.find(m => m.id === selectedReceiverTeamId);

      if (!myTeam || !receiverMembership) throw new Error("Invalid team selection.");

      await createTradeProposal({
        leagueId,
        proposerTeamId: myTeam.id,
        receiverTeamId: receiverMembership.id,
        message: tradeMessage || undefined,
        sendingPlayerIds: selectedSendPlayers,
        receivingPlayerIds: selectedReceivePlayers,
      });

      setShowForm(false);
      setSelectedSendPlayers([]);
      setSelectedReceivePlayers([]);
      setSelectedReceiverTeamId("");
      setTradeMessage("");
      toast.success("Trade proposal sent.");
      void refreshTrades();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create trade.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRespond(proposalId: string, decision: "accepted" | "rejected") {
    setBusyId(proposalId);
    try {
      await respondToTrade(proposalId, decision);
      toast.success(decision === "accepted" ? "Trade accepted." : "Trade rejected.");
      void refreshTrades();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to respond.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleVote(proposalId: string, fantasyTeamId: string, decision: "approve" | "veto") {
    setBusyId(proposalId);
    try {
      await voteOnTrade(proposalId, fantasyTeamId, decision);
      toast.success(decision === "approve" ? "Vote cast: approve." : "Vote cast: veto.");
      void refreshTrades();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to vote.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(proposalId: string) {
    setBusyId(proposalId);
    try {
      await cancelTrade(proposalId);
      toast.success("Trade cancelled.");
      void refreshTrades();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to cancel.");
    } finally {
      setBusyId(null);
    }
  }

  const pendingProposals = proposals.filter((p) => p.status === "pending");
  const completedProposals = proposals.filter((p) => p.status !== "pending");
  const otherMembers = leagueDetails?.memberships.filter(
    (m) => m.user_id !== session?.user.id
  ) ?? [];

  const statusTone = (status: string) => {
    if (status === "accepted") return "success";
    if (status === "vetoed" || status === "rejected") return "danger";
    if (status === "pending") return "brand";
    return "default";
  };

  return (
    <FantasyAuthGate
      loadingDescription="Loading."
      loadingTitle="Checking your account"
      signedOutDescription="Sign in to manage trades."
      signedOutTitle="Sign in"
    >
      {() => {
        if (isLoading && !leagueDetails) {
          return <EmptyState title="Loading trades" description="Checking active trade proposals." />;
        }

        return (
          <section className="space-y-5">
            {error ? (
              <MotionReveal>
                <div className="rounded-[1.2rem] border border-danger/30 bg-danger/8 px-4 py-3 text-sm text-danger">
                  {error}
                </div>
              </MotionReveal>
            ) : null}

            <MotionReveal>
              <SurfaceCard
                eyebrow="Trade center"
                title="Propose and review trades"
                description="Send player swaps to other managers. Trades go through a league-wide review period."
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <MetricTile
                    label="Active proposals"
                    value={pendingProposals.length}
                    tone="brand"
                  />
                  <MetricTile
                    label="Completed"
                    value={completedProposals.filter((p) => p.status === "accepted").length}
                    tone="accent"
                  />
                  <MetricTile
                    label="Vetoed"
                    value={completedProposals.filter((p) => p.status === "vetoed").length}
                  />
                </div>
                <div className="mt-4">
                  <Button
                    variant="primary"
                    onClick={() => setShowForm(!showForm)}
                  >
                    <ArrowRightLeft className="size-4" />
                    {showForm ? "Cancel" : "Propose a trade"}
                  </Button>
                </div>
              </SurfaceCard>
            </MotionReveal>

            {showForm ? (
              <MotionReveal>
                <SurfaceCard
                  eyebrow="New proposal"
                  title="Build your trade"
                  description="Select a trade partner and the players to swap."
                  tone="brand"
                >
                  <div className="space-y-4">
                    <div>
                      <label className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                        Trade partner
                      </label>
                      <select
                        value={selectedReceiverTeamId}
                        onChange={(e) => setSelectedReceiverTeamId(e.target.value)}
                        className="mt-2 w-full rounded-[1rem] border border-line bg-white/6 px-4 py-3 text-sm text-foreground"
                      >
                        <option value="">Select a manager...</option>
                        {otherMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.team_name} ({m.display_name})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                        Players you send
                      </label>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {roster.map((player) => (
                          <label
                            key={player.id}
                            className={[
                              "flex cursor-pointer items-center gap-3 rounded-[1rem] border px-3 py-2 text-sm transition",
                              selectedSendPlayers.includes(player.player_id)
                                ? "border-brand/40 bg-brand/10 text-foreground"
                                : "border-line bg-white/4 text-muted hover:border-brand-strong/30",
                            ].join(" ")}
                          >
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={selectedSendPlayers.includes(player.player_id)}
                              onChange={(e) => {
                                setSelectedSendPlayers((prev) =>
                                  e.target.checked
                                    ? [...prev, player.player_id]
                                    : prev.filter((id) => id !== player.player_id)
                                );
                              }}
                            />
                            <span>{player.player.display_name}</span>
                            <span className="text-muted">({player.player.position})</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                        Message (optional)
                      </label>
                      <input
                        type="text"
                        value={tradeMessage}
                        onChange={(e) => setTradeMessage(e.target.value)}
                        placeholder="Sweeten the deal with a message..."
                        maxLength={200}
                        className="mt-2 w-full rounded-[1rem] border border-line bg-white/6 px-4 py-3 text-sm text-foreground placeholder:text-muted"
                      />
                    </div>

                    <Button
                      variant="accent"
                      disabled={
                        !selectedReceiverTeamId ||
                        selectedSendPlayers.length === 0 ||
                        busyId === "new"
                      }
                      onClick={handleSubmitProposal}
                    >
                      Send trade proposal
                    </Button>
                  </div>
                </SurfaceCard>
              </MotionReveal>
            ) : null}

            {proposals.length === 0 && !showForm ? (
              <MotionReveal delay={60}>
                <div className="rounded-[1.35rem] border border-dashed border-line bg-white/4 px-5 py-8 text-center">
                  <p className="text-sm font-semibold text-foreground">No trades yet</p>
                  <p className="mt-1 text-sm text-muted">
                    Propose a trade above to start swapping players with other managers.
                  </p>
                </div>
              </MotionReveal>
            ) : null}

            {pendingProposals.length > 0 ? (
              <MotionReveal delay={60}>
                <SurfaceCard
                  eyebrow="Active trades"
                  title="Pending proposals"
                  description="Respond to proposals sent to you, or vote on trades between other managers."
                >
                  <div className="space-y-4">
                    {pendingProposals.map((proposal) => {
                      const isSender = leagueDetails?.memberships.some(
                        (m) => m.user_id === session?.user.id && m.id === proposal.proposer_team_id
                      );
                      const isReceiver = leagueDetails?.memberships.some(
                        (m) => m.user_id === session?.user.id && m.id === proposal.receiver_team_id
                      );
                      const sendingAssets = proposal.assets.filter(
                        (a) => a.from_team_id === proposal.proposer_team_id
                      );
                      const receivingAssets = proposal.assets.filter(
                        (a) => a.from_team_id === proposal.receiver_team_id
                      );
                      const alreadyVoted = proposal.votes.some(
                        (v) => v.user_id === session?.user.id
                      );

                      return (
                        <ScrollReveal key={proposal.id}>
                          <div className="rounded-[1.35rem] border border-brand/20 bg-brand/6 p-4 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <ArrowRightLeft className="size-4 text-brand-strong" />
                                <p className="text-sm font-semibold text-foreground">
                                  {proposal.proposer_team_name} → {proposal.receiver_team_name}
                                </p>
                              </div>
                              <Pill tone="brand">
                                {new Date(proposal.review_period_ends_at) > new Date()
                                  ? `Review ends ${new Date(proposal.review_period_ends_at).toLocaleDateString()}`
                                  : "Review period ended"}
                              </Pill>
                            </div>

                            {proposal.message ? (
                              <p className="text-sm italic text-muted">&ldquo;{proposal.message}&rdquo;</p>
                            ) : null}

                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1">
                                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                                  {proposal.proposer_team_name} sends
                                </p>
                                {sendingAssets.map((a) => (
                                  <p key={a.id} className="text-sm text-foreground">
                                    {a.player_name} ({a.player_position})
                                  </p>
                                ))}
                              </div>
                              <div className="space-y-1">
                                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-strong">
                                  {proposal.receiver_team_name} sends
                                </p>
                                {receivingAssets.map((a) => (
                                  <p key={a.id} className="text-sm text-foreground">
                                    {a.player_name} ({a.player_position})
                                  </p>
                                ))}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 text-sm text-muted">
                              <span>Vetoes: {proposal.veto_count}/{proposal.veto_threshold} needed</span>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {isReceiver ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="primary"
                                    disabled={busyId === proposal.id}
                                    onClick={() => handleRespond(proposal.id, "accepted")}
                                  >
                                    <Check className="size-3.5" /> Accept
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={busyId === proposal.id}
                                    onClick={() => handleRespond(proposal.id, "rejected")}
                                  >
                                    <X className="size-3.5" /> Reject
                                  </Button>
                                </>
                              ) : null}

                              {isSender ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={busyId === proposal.id}
                                  onClick={() => handleCancel(proposal.id)}
                                >
                                  <Ban className="size-3.5" /> Cancel
                                </Button>
                              ) : null}

                              {!isSender && !isReceiver && !alreadyVoted ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={busyId === proposal.id}
                                    onClick={() => {
                                      const myTeamMembership = leagueDetails?.memberships.find(
                                        (m) => m.user_id === session?.user.id
                                      );
                                      if (myTeamMembership) {
                                        handleVote(proposal.id, myTeamMembership.id, "approve");
                                      }
                                    }}
                                  >
                                    <ThumbsUp className="size-3.5" /> Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={busyId === proposal.id}
                                    onClick={() => {
                                      const myTeamMembership = leagueDetails?.memberships.find(
                                        (m) => m.user_id === session?.user.id
                                      );
                                      if (myTeamMembership) {
                                        handleVote(proposal.id, myTeamMembership.id, "veto");
                                      }
                                    }}
                                  >
                                    <ThumbsDown className="size-3.5" /> Veto
                                  </Button>
                                </>
                              ) : null}

                              {alreadyVoted ? (
                                <Pill tone="default">You voted</Pill>
                              ) : null}
                            </div>
                          </div>
                        </ScrollReveal>
                      );
                    })}
                  </div>
                </SurfaceCard>
              </MotionReveal>
            ) : null}

            {completedProposals.length > 0 ? (
              <MotionReveal delay={120}>
                <SurfaceCard
                  eyebrow="Trade history"
                  title="Past proposals"
                  tone="accent"
                >
                  <div className="space-y-3">
                    {completedProposals.slice(0, 10).map((proposal) => (
                      <div
                        key={proposal.id}
                        className="flex items-center justify-between gap-3 rounded-[1.1rem] border border-line bg-panel-soft px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {proposal.proposer_team_name} ↔ {proposal.receiver_team_name}
                          </p>
                          <p className="mt-0.5 text-sm text-muted">
                            {proposal.assets.map((a) => a.player_name).join(", ")}
                          </p>
                        </div>
                        <Pill tone={statusTone(proposal.status) as "brand" | "success" | "default"}>
                          {proposal.status}
                        </Pill>
                      </div>
                    ))}
                  </div>
                </SurfaceCard>
              </MotionReveal>
            ) : null}
          </section>
        );
      }}
    </FantasyAuthGate>
  );
}
