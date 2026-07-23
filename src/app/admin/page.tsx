"use client";

import { useCallback, useEffect, useState } from "react";
import { Database, RefreshCw, Users, Zap } from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { StatusBanner } from "@/components/common/status-banner";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { FantasyAuthGate } from "@/features/shared/components/fantasy-auth-gate";

type AdminTab = "scoring" | "data" | "support";

interface ScoringOverride {
  id: string;
  player_id: string;
  player_name: string;
  match_id: string;
  original_points: number;
  corrected_points: number;
  reason: string;
  status: "applied" | "reverted";
  created_at: string;
}

interface FeedJob {
  id: string;
  description: string;
  frequency: string;
  lastRun: {
    status: "success" | "skipped" | "error";
    summary: string;
    completed_at: string;
  } | null;
}

const emptyForm = {
  playerId: "",
  playerName: "",
  matchId: "",
  correctedPoints: "",
  reason: "",
};

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>("scoring");
  const [overrides, setOverrides] = useState<ScoringOverride[]>([]);
  const [jobs, setJobs] = useState<FeedJob[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  const refresh = useCallback(async () => {
    const [overrideResponse, jobsResponse] = await Promise.all([
      fetch("/api/admin/overrides"),
      fetch("/api/admin/jobs"),
    ]);

    if (overrideResponse.ok) {
      const data = (await overrideResponse.json()) as {
        overrides: ScoringOverride[];
      };
      setOverrides(data.overrides);
    }
    if (jobsResponse.ok) {
      const data = (await jobsResponse.json()) as { jobs: FeedJob[] };
      setJobs(data.jobs);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function submitOverride(event: React.FormEvent) {
    event.preventDefault();
    setIsWorking(true);
    setMessage("");

    const response = await fetch("/api/admin/overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        correctedPoints: Number(form.correctedPoints),
      }),
    });
    const result = (await response.json()) as {
      error?: string;
      override?: ScoringOverride;
    };

    if (!response.ok || !result.override) {
      setMessage(result.error ?? "Unable to save correction.");
    } else {
      setMessage("Correction applied to standings, matchups, and DFS reads.");
      setOverrides((current) => [result.override!, ...current]);
      setForm(emptyForm);
    }
    setIsWorking(false);
  }

  async function runJob(jobId: string) {
    setIsWorking(true);
    setMessage("");
    const response = await fetch("/api/admin/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    const result = (await response.json()) as { error?: string; summary?: string };
    setMessage(result.error ?? result.summary ?? "Job completed.");
    await refresh();
    setIsWorking(false);
  }

  const tabs: Array<{ key: AdminTab; label: string; icon: typeof Zap }> = [
    { key: "scoring", label: "Scoring", icon: Zap },
    { key: "data", label: "Data feeds", icon: Database },
    { key: "support", label: "Support", icon: Users },
  ];

  return (
    <FantasyAuthGate
      loadingTitle="Checking access"
      loadingDescription="Verifying your access."
      requireAdmin
      signedOutTitle="Admin access required"
      signedOutDescription="Sign in with an admin account to access the operations desk."
      unauthorizedTitle="Admin access required"
      unauthorizedDescription="Your account is not on the admin allowlist."
    >
      {() => (
        <AppShell
          eyebrow="Admin"
          title="League operations desk"
          description="Real scoring corrections and job operations."
        >
          <section className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  className={[
                    "inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-medium transition",
                    activeTab === tab.key
                      ? "border-brand bg-brand text-white"
                      : "border-line bg-panel-soft text-muted",
                  ].join(" ")}
                  onClick={() => setActiveTab(tab.key)}
                  type="button"
                >
                  <Icon className="size-4" />
                  {tab.label}
                </button>
              );
            })}
          </section>

          {message ? (
            <StatusBanner
              title="Admin operation"
              message={message}
              tone="info"
            />
          ) : null}

          {activeTab === "scoring" ? (
            <section className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-3">
                <MetricTile label="Applied overrides" value={overrides.filter((item) => item.status === "applied").length} detail="Currently active corrections." tone="brand" />
                <MetricTile label="Reverted" value={overrides.filter((item) => item.status === "reverted").length} detail="Corrections retained for audit." />
                <MetricTile label="Total audit rows" value={overrides.length} detail="Persistent scoring history." tone="accent" />
              </div>

              <SurfaceCard
                eyebrow="New correction"
                title="Apply a scoring override"
                description="The matching player and official match snapshot will use the corrected total on every scoring read."
                tone="accent"
              >
                <form className="grid gap-4 sm:grid-cols-2" onSubmit={submitOverride}>
                  {[
                    ["playerName", "Player name"],
                    ["playerId", "Official player ID"],
                    ["matchId", "Official match ID"],
                    ["correctedPoints", "Corrected points"],
                  ].map(([key, label]) => (
                    <label className="space-y-2" key={key}>
                      <span className="text-sm font-medium text-foreground">{label}</span>
                      <input
                        className="field-control"
                        type={key === "correctedPoints" ? "number" : "text"}
                        value={form[key as keyof typeof form]}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                  ))}
                  <label className="space-y-2 sm:col-span-2">
                    <span className="text-sm font-medium text-foreground">Audit reason</span>
                    <textarea
                      className="field-control min-h-24"
                      value={form.reason}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, reason: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <Button disabled={isWorking} type="submit">
                    {isWorking ? "Applying…" : "Apply correction"}
                  </Button>
                </form>
              </SurfaceCard>

              <SurfaceCard
                eyebrow="Audit log"
                title="Scoring correction history"
                description="Newest corrections first."
              >
                <div className="space-y-3">
                  {overrides.length === 0 ? (
                    <p className="text-sm text-muted">No corrections have been submitted.</p>
                  ) : overrides.map((override) => (
                    <div key={override.id} className="rounded-[1.2rem] border border-line bg-white/6 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-foreground">{override.player_name}</p>
                          <p className="text-xs text-muted">{override.player_id} • {override.match_id}</p>
                          <p className="mt-2 text-sm text-muted">{override.reason}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-foreground">{Number(override.corrected_points).toFixed(1)} pts</p>
                          <p className="text-xs text-muted line-through">{Number(override.original_points).toFixed(1)} pts</p>
                          <Pill tone={override.status === "applied" ? "success" : "accent"}>{override.status}</Pill>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </SurfaceCard>
            </section>
          ) : null}

          {activeTab === "data" ? (
            <SurfaceCard
              eyebrow="Job registry"
              title="Live data operations"
              description="These are the jobs registered in the real API runtime."
            >
              <div className="space-y-3">
                {jobs.map((job) => (
                  <div key={job.id} className="flex flex-wrap items-center justify-between gap-4 rounded-[1.2rem] border border-line bg-white/6 p-4">
                    <div>
                      <p className="font-semibold text-foreground">{job.id}</p>
                      <p className="text-sm text-muted">{job.description}</p>
                      <p className="text-xs text-muted">{job.lastRun?.summary ?? `Never run • ${job.frequency}`}</p>
                    </div>
                    <Button
                      disabled={isWorking || job.id === "fantasy-scoring"}
                      onClick={() => void runJob(job.id)}
                      variant="secondary"
                    >
                      <RefreshCw className="size-4" />
                      {job.id === "fantasy-scoring" ? "Needs match params" : "Run now"}
                    </Button>
                  </div>
                ))}
              </div>
            </SurfaceCard>
          ) : null}

          {activeTab === "support" ? (
            <SurfaceCard
              eyebrow="Follow-on"
              title="Support queue is not connected"
              description="No ticketing backend exists in this repository. This tab is intentionally non-interactive until a real support source is selected."
            >
              <p className="text-sm text-muted">No fabricated support cases are shown.</p>
            </SurfaceCard>
          ) : null}
        </AppShell>
      )}
    </FantasyAuthGate>
  );
}
