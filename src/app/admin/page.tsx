"use client";

import { useState } from "react";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { MetricTile } from "@/components/ui/metric-tile";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle,
  Database,
  RefreshCw,
  Search,
  Users,
  Zap,
} from "lucide-react";

type AdminTab = "scoring" | "data" | "support";

interface ScoringOverride {
  id: string;
  playerName: string;
  leagueName: string;
  category: string;
  originalPoints: number;
  correctedPoints: number;
  reason: string;
  createdAt: string;
  status: "pending" | "applied" | "reverted";
}

interface FeedJob {
  id: string;
  name: string;
  lastRun: string;
  status: "healthy" | "stalled" | "error";
  recordsProcessed: number;
  nextRun: string;
}

interface SupportCase {
  id: string;
  displayName: string;
  leagueName: string;
  subject: string;
  status: "open" | "investigating" | "resolved";
  createdAt: string;
}

const mockOverrides: ScoringOverride[] = [
  {
    id: "so-1",
    playerName: "Sophia Smith",
    leagueName: "Rose City Press",
    category: "Goal attribution",
    originalPoints: 12,
    correctedPoints: 20,
    reason: "Missed goal event from provider feed — manual correction after video review.",
    createdAt: "2026-03-12T18:30:00Z",
    status: "applied",
  },
  {
    id: "so-2",
    playerName: "Trinity Rodman",
    leagueName: "Spirit Squad",
    category: "Assist reclassification",
    originalPoints: 8,
    correctedPoints: 13,
    reason: "Provider initially credited deflection; reclassified as assist by league office.",
    createdAt: "2026-03-11T14:15:00Z",
    status: "pending",
  },
];

const mockFeedJobs: FeedJob[] = [
  {
    id: "job-fixtures",
    name: "Fixture sync",
    lastRun: "2026-03-13T15:00:00Z",
    status: "healthy",
    recordsProcessed: 42,
    nextRun: "2026-03-13T16:00:00Z",
  },
  {
    id: "job-stats",
    name: "Player stat lines",
    lastRun: "2026-03-13T15:05:00Z",
    status: "healthy",
    recordsProcessed: 216,
    nextRun: "2026-03-13T16:05:00Z",
  },
  {
    id: "job-availability",
    name: "Availability reports",
    lastRun: "2026-03-13T12:00:00Z",
    status: "stalled",
    recordsProcessed: 0,
    nextRun: "2026-03-13T18:00:00Z",
  },
  {
    id: "job-scoring",
    name: "Fantasy point snapshots",
    lastRun: "2026-03-13T15:10:00Z",
    status: "healthy",
    recordsProcessed: 1834,
    nextRun: "2026-03-13T16:10:00Z",
  },
];

const mockSupportCases: SupportCase[] = [
  {
    id: "sc-1",
    displayName: "Megan R.",
    leagueName: "Portland Thorns FC Fan League",
    subject: "Draft pick timer expired before I could select — requesting manual pick correction",
    status: "investigating",
    createdAt: "2026-03-12T22:10:00Z",
  },
  {
    id: "sc-2",
    displayName: "Taylor K.",
    leagueName: "Spirit Squad",
    subject: "Waiver claim not processed after priority window closed",
    status: "open",
    createdAt: "2026-03-13T08:45:00Z",
  },
  {
    id: "sc-3",
    displayName: "Jordan B.",
    leagueName: "Bay Area FC",
    subject: "Incorrect salary displayed for player after trade",
    status: "resolved",
    createdAt: "2026-03-10T16:20:00Z",
  },
];

const statusIcons: Record<string, typeof CheckCircle> = {
  healthy: CheckCircle,
  applied: CheckCircle,
  resolved: CheckCircle,
  stalled: AlertTriangle,
  error: AlertTriangle,
  pending: RefreshCw,
  open: Search,
  investigating: Search,
};

const statusColors: Record<string, string> = {
  healthy: "text-brand-lime",
  applied: "text-brand-lime",
  resolved: "text-brand-lime",
  stalled: "text-warning",
  error: "text-danger",
  pending: "text-brand-strong",
  open: "text-warning",
  investigating: "text-brand-strong",
};

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>("scoring");
  const [searchQuery, setSearchQuery] = useState("");
  const [overrideForm, setOverrideForm] = useState({
    playerName: "",
    leagueName: "",
    category: "",
    originalPoints: "",
    correctedPoints: "",
    reason: "",
  });

  const tabs: Array<{ key: AdminTab; label: string; icon: typeof Zap }> = [
    { key: "scoring", label: "Scoring", icon: Zap },
    { key: "data", label: "Data feeds", icon: Database },
    { key: "support", label: "Support", icon: Users },
  ];

  function handleOverrideSubmit(event: React.FormEvent) {
    event.preventDefault();
    setOverrideForm({
      playerName: "",
      leagueName: "",
      category: "",
      originalPoints: "",
      correctedPoints: "",
      reason: "",
    });
  }

  return (
    <AppShell
      eyebrow="Admin"
      title="League operations desk"
      description="Review support cases, scoring corrections, and league operations from one secure workspace."
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
                  : "border-line bg-panel-soft text-muted hover:border-brand-strong/35 hover:text-foreground",
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

      {activeTab === "scoring" && (
        <section className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-3">
            <MetricTile
              label="Pending overrides"
              value={mockOverrides.filter((o) => o.status === "pending").length}
              detail="Corrections awaiting review and application."
            />
            <MetricTile
              label="Applied this week"
              value={mockOverrides.filter((o) => o.status === "applied").length}
              detail="Successfully applied scoring corrections."
              tone="brand"
            />
            <MetricTile
              label="Total corrections"
              value={mockOverrides.length}
              detail="All-time scoring override history."
              tone="accent"
            />
          </div>

          <SurfaceCard
            eyebrow="Override history"
            title="Scoring correction audit log"
            description="Every override is tracked with the original value, correction, and the reason for the change."
          >
            <div className="space-y-3">
              {mockOverrides.map((override) => {
                const StatusIcon = statusIcons[override.status] ?? RefreshCw;
                return (
                  <div
                    key={override.id}
                    className="rounded-[1.2rem] border border-line bg-white/6 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="font-semibold text-foreground">
                          {override.playerName}
                          <span className="ml-2 text-sm font-normal text-muted">
                            {override.leagueName}
                          </span>
                        </p>
                        <p className="text-sm text-muted">{override.category}</p>
                        <p className="text-sm leading-6 text-muted">{override.reason}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm text-muted line-through">
                          {override.originalPoints} pts
                        </span>
                        <span className="font-semibold text-foreground">
                          {override.correctedPoints} pts
                        </span>
                        <StatusIcon
                          className={`size-4 ${statusColors[override.status]}`}
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Pill tone={override.status === "applied" ? "success" : "brand"}>
                        {override.status}
                      </Pill>
                      <span className="text-xs text-muted">
                        {new Date(override.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </SurfaceCard>

          <SurfaceCard
            eyebrow="New correction"
            title="Submit a manual scoring override"
            description="Create a correction with a clear reason so the audit trail stays complete."
            tone="accent"
          >
            <form className="space-y-4" onSubmit={handleOverrideSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">Player name</span>
                  <input
                    className="field-control"
                    placeholder="Sophia Smith"
                    value={overrideForm.playerName}
                    onChange={(e) =>
                      setOverrideForm({ ...overrideForm, playerName: e.target.value })
                    }
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">League name</span>
                  <input
                    className="field-control"
                    placeholder="Rose City Press"
                    value={overrideForm.leagueName}
                    onChange={(e) =>
                      setOverrideForm({ ...overrideForm, leagueName: e.target.value })
                    }
                  />
                </label>
              </div>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">Category</span>
                <input
                  className="field-control"
                  placeholder="Goal attribution, assist reclassification, etc."
                  value={overrideForm.category}
                  onChange={(e) =>
                    setOverrideForm({ ...overrideForm, category: e.target.value })
                  }
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">Original points</span>
                  <input
                    className="field-control"
                    type="number"
                    placeholder="0"
                    value={overrideForm.originalPoints}
                    onChange={(e) =>
                      setOverrideForm({ ...overrideForm, originalPoints: e.target.value })
                    }
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">Corrected points</span>
                  <input
                    className="field-control"
                    type="number"
                    placeholder="0"
                    value={overrideForm.correctedPoints}
                    onChange={(e) =>
                      setOverrideForm({ ...overrideForm, correctedPoints: e.target.value })
                    }
                  />
                </label>
              </div>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">Reason</span>
                <textarea
                  className="field-control min-h-[5rem] resize-y"
                  placeholder="Describe why the correction is needed and what evidence supports it."
                  value={overrideForm.reason}
                  onChange={(e) =>
                    setOverrideForm({ ...overrideForm, reason: e.target.value })
                  }
                />
              </label>
              <Button type="submit">Submit correction</Button>
            </form>
          </SurfaceCard>
        </section>
      )}

      {activeTab === "data" && (
        <section className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-4">
            <MetricTile
              label="Healthy feeds"
              value={mockFeedJobs.filter((j) => j.status === "healthy").length}
              detail="Running on schedule."
            />
            <MetricTile
              label="Stalled"
              value={mockFeedJobs.filter((j) => j.status === "stalled").length}
              detail="Missed their last window."
              tone="accent"
            />
            <MetricTile
              label="Total records"
              value={mockFeedJobs.reduce((sum, j) => sum + j.recordsProcessed, 0).toLocaleString()}
              detail="Processed in last cycle."
              tone="brand"
            />
            <MetricTile
              label="Active jobs"
              value={mockFeedJobs.length}
              detail="Registered data ingestion jobs."
            />
          </div>

          <SurfaceCard
            eyebrow="Feed health"
            title="Data ingestion pipeline status"
            description="Monitor each feed for timing, volume, and error state."
          >
            <div className="space-y-3">
              {mockFeedJobs.map((job) => {
                const StatusIcon = statusIcons[job.status] ?? RefreshCw;
                return (
                  <div
                    key={job.id}
                    className="flex items-center justify-between rounded-[1.2rem] border border-line bg-white/6 p-4"
                  >
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">{job.name}</p>
                      <p className="text-sm text-muted">
                        Last run: {new Date(job.lastRun).toLocaleString()} •{" "}
                        {job.recordsProcessed.toLocaleString()} records
                      </p>
                      <p className="text-sm text-muted">
                        Next run: {new Date(job.nextRun).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Pill
                        tone={
                          job.status === "healthy"
                            ? "success"
                            : job.status === "stalled"
                              ? "accent"
                              : "brand"
                        }
                      >
                        <StatusIcon className="size-3.5" />
                        {job.status}
                      </Pill>
                    </div>
                  </div>
                );
              })}
            </div>
          </SurfaceCard>
        </section>
      )}

      {activeTab === "support" && (
        <section className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-3">
            <MetricTile
              label="Open cases"
              value={mockSupportCases.filter((c) => c.status === "open").length}
              detail="Awaiting initial review."
            />
            <MetricTile
              label="Investigating"
              value={mockSupportCases.filter((c) => c.status === "investigating").length}
              detail="Currently being worked."
              tone="brand"
            />
            <MetricTile
              label="Resolved"
              value={mockSupportCases.filter((c) => c.status === "resolved").length}
              detail="Closed this period."
              tone="accent"
            />
          </div>

          <SurfaceCard
            eyebrow="Account lookup"
            title="Find accounts, leagues, and commissioner actions"
            description="Search by display name, league name, or user ID."
          >
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-brand-strong" />
              <input
                className="field-control pl-11"
                placeholder="Search by name, league, or user ID"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>
          </SurfaceCard>

          <SurfaceCard
            eyebrow="Case queue"
            title="Support cases"
            description="Track user-reported issues from intake through resolution."
            tone="accent"
          >
            <div className="space-y-3">
              {mockSupportCases.map((supportCase) => {
                const StatusIcon = statusIcons[supportCase.status] ?? Search;
                return (
                  <div
                    key={supportCase.id}
                    className="rounded-[1.2rem] border border-line bg-white/6 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="font-semibold text-foreground">
                          {supportCase.displayName}
                          <span className="ml-2 text-sm font-normal text-muted">
                            {supportCase.leagueName}
                          </span>
                        </p>
                        <p className="text-sm leading-6 text-muted">
                          {supportCase.subject}
                        </p>
                      </div>
                      <Pill
                        tone={
                          supportCase.status === "resolved"
                            ? "success"
                            : supportCase.status === "investigating"
                              ? "brand"
                              : "accent"
                        }
                      >
                        <StatusIcon className="size-3.5" />
                        {supportCase.status}
                      </Pill>
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      {new Date(supportCase.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                );
              })}
            </div>
          </SurfaceCard>
        </section>
      )}
    </AppShell>
  );
}
