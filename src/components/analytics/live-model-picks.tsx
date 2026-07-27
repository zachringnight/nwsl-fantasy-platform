import { Activity, CircleAlert, Database, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Pill } from "@/components/ui/pill";
import type { LiveModelBoard } from "@/lib/analytics/live-model-board";
import {
  analyticsMatchHref,
  analyticsTeamHref,
  analyticsTeamId,
} from "@/lib/analytics/entity-routes";
import { formatAmericanOdds } from "@/lib/odds-format";

function numberFrom(record: Record<string, unknown>, key: string): number {
  const value = Number(record[key]);
  return Number.isFinite(value) ? value : 0;
}

function stringFrom(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function reasonLabel(reason: string): string {
  return reason
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function dateTimeLabel(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="border-t border-line pt-4">
      <p className="text-[0.65rem] font-medium uppercase tracking-widest text-muted">
        {label}
      </p>
      <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{detail}</p>
    </div>
  );
}

export function LiveModelPicks({ board }: { board: LiveModelBoard }) {
  const currentPicks = board.slate.filter((row) => row.actionable);
  const pricedRows = board.slate.filter(
    (row) =>
      row.line !== null &&
      row.overOdds !== null &&
      row.underOdds !== null &&
      row.sportsbook !== null &&
      row.quoteTimestamp !== null
  );
  const unpricedMatches = Math.max(
    board.matchesInWindow - board.pricedMatches,
    0
  );
  const settled = numberFrom(board.forwardResults, "settled");
  const pending = numberFrom(board.forwardResults, "pending");
  const wins = numberFrom(board.forwardResults, "wins");
  const losses = numberFrom(board.forwardResults, "losses");
  const pushes = numberFrom(board.forwardResults, "pushes");
  const pnlUnits = numberFrom(board.forwardResults, "pnl_units");
  const roiUnits = numberFrom(board.forwardResults, "roi_units");
  const evidenceBets = numberFrom(board.evidenceSummary, "bets");
  const evidenceWins = numberFrom(board.evidenceSummary, "wins");
  const evidenceLosses = numberFrom(board.evidenceSummary, "losses");
  const evidenceRoi = numberFrom(board.evidenceSummary, "roiUnits");
  const authoritative =
    board.sourceHealth.authoritative &&
    typeof board.sourceHealth.authoritative === "object"
      ? (board.sourceHealth.authoritative as Record<string, unknown>)
      : {};
  const sourceStatus = stringFrom(authoritative, "status") || "unknown";
  const draftKings =
    board.sourceHealth.draftkings_apify &&
    typeof board.sourceHealth.draftkings_apify === "object"
      ? (board.sourceHealth.draftkings_apify as Record<string, unknown>)
      : {};
  const draftKingsStatus = stringFrom(draftKings, "status") || "unknown";
  const topReasons = Object.entries(board.reasonCounts)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 3);

  return (
    <section className="overflow-hidden rounded-[1.4rem] border border-line bg-white/5">
      <div className="border-b border-line bg-[linear-gradient(120deg,rgba(191,255,0,0.08),transparent_55%)] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={board.isStale ? "default" : "success"}>
                {board.isStale ? <CircleAlert className="size-3.5" /> : <Activity className="size-3.5" />}
                {board.isStale ? "Stale snapshot" : "Daily model live"}
              </Pill>
              <Pill tone="brand">Research tracking only</Pill>
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
              Frozen totals policy
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              Automated DraftKings OVER 2.5 selections using fresh, paired prices and the
              locked 0.25% bankroll cap. The system records research picks and outcomes; it
              never places a wager.
            </p>
          </div>
          <div className="shrink-0 text-left text-xs leading-5 text-muted sm:text-right">
            <p>Generated {dateTimeLabel(board.generatedAt)}</p>
            <p>
              {board.pricedMatches}/{board.matchesInWindow} fixtures priced
            </p>
            <p className={sourceStatus === "healthy" ? "text-brand-lime" : "text-accent"}>
              Odds pipeline: {sourceStatus}
            </p>
            <p>DraftKings via Apify: {draftKingsStatus}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
        <Metric
          label="Current run"
          value={board.isStale ? "STALE" : String(currentPicks.length)}
          detail={
            board.isStale
              ? "Old snapshots are never presented as current picks."
              : currentPicks.length === 1
                ? "One threshold-clearing pick."
                : `${currentPicks.length} threshold-clearing picks.`
          }
        />
        <Metric
          label="Forward record"
          value={`${wins}-${losses}${pushes ? `-${pushes}` : ""}`}
          detail={`${settled} settled · ${pending} pending · ${pnlUnits >= 0 ? "+" : ""}${pnlUnits.toFixed(2)} units`}
        />
        <Metric
          label="Forward ROI"
          value={settled > 0 ? percent(roiUnits) : "N/A"}
          detail={settled > 0 ? "Locked-pick results only." : "No live policy pick has settled yet."}
        />
        <Metric
          label="2026 holdout"
          value={evidenceBets ? `${evidenceWins}-${evidenceLosses}` : "N/A"}
          detail={
            evidenceBets
              ? `${percent(evidenceRoi)} flat-stake ROI; retrospective, not live.`
              : "Held-out evidence unavailable."
          }
        />
      </div>

      <div className="border-t border-line p-5 sm:p-6">
        {board.isStale ? (
          <div className="flex gap-3 rounded-2xl border border-accent/30 bg-accent/10 p-4">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-accent" />
            <div>
              <p className="font-semibold text-foreground">No current recommendation</p>
              <p className="mt-1 text-sm leading-6 text-muted">
                The latest successful model run is more than 30 hours old. The historical
                record remains visible, but its slate is suppressed until automation publishes
                a fresh run.
              </p>
            </div>
          </div>
        ) : currentPicks.length === 0 ? (
          <div className="rounded-2xl border border-line bg-black/10 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <ShieldCheck className="size-5 text-brand-lime" />
              <p className="font-semibold text-foreground">
                NO BET — policy thresholds not cleared
              </p>
            </div>
            {topReasons.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {topReasons.map(([reason, count]) => (
                  <span
                    key={reason}
                    className="rounded-full border border-line bg-white/5 px-3 py-1.5 text-xs text-muted"
                  >
                    {reasonLabel(reason)} · {count}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {currentPicks.map((pick) => (
              <article
                key={`${pick.matchId}-${pick.line}`}
                className="rounded-2xl border border-brand-strong/25 bg-brand/10 p-5 transition hover:border-brand-strong/50"
              >
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={analyticsMatchHref(pick.matchId)}
                    aria-label={`Open ${pick.homeTeam} vs ${pick.awayTeam}`}
                    className="text-xs uppercase tracking-widest text-muted transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                  >
                    {pick.matchDate}
                  </Link>
                  <Pill tone="success">Validated pick</Pill>
                </div>
                <h3 className="mt-3 flex flex-wrap items-center gap-x-2 text-lg font-semibold text-foreground">
                  <Link
                    href={analyticsTeamHref(analyticsTeamId(pick.homeTeam))}
                    className="transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                  >
                    {pick.homeTeam}
                  </Link>
                  <span className="text-muted">vs</span>
                  <Link
                    href={analyticsTeamHref(analyticsTeamId(pick.awayTeam))}
                    className="transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                  >
                    {pick.awayTeam}
                  </Link>
                </h3>
                <p className="mt-3 font-mono text-xl font-semibold text-brand-lime">
                  OVER {pick.line?.toFixed(1)} @ {formatAmericanOdds(pick.overOdds)}
                </p>
                <p className="mt-1 text-sm text-muted">{pick.sportsbook}</p>
                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-sm">
                  <div>
                    <p className="text-xs text-muted">EV edge</p>
                    <p className="mt-1 font-mono text-foreground">
                      {percent(pick.expectedValue ?? 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Confidence</p>
                    <p className="mt-1 font-mono text-foreground">
                      {percent(pick.confidence ?? 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Stake cap</p>
                    <p className="mt-1 font-mono text-foreground">
                      {percent(pick.stakePct)}
                    </p>
                  </div>
                </div>
                <Link
                  href={analyticsMatchHref(pick.matchId)}
                  className="mt-4 inline-flex text-xs font-semibold text-brand-strong hover:underline hover:underline-offset-4"
                >
                  Open match page
                </Link>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-line p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-brand-strong">
              Totals market decision board
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted">
              These are the exact paired prices evaluated by this run, including
              rows that correctly finished as no bet.
            </p>
          </div>
          <span className="text-xs text-muted">
            {pricedRows.length} priced · {unpricedMatches} odds not posted
          </span>
        </div>

        {pricedRows.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {pricedRows.map((row) => (
              <article
                key={`${row.matchId}-${row.sportsbook}-${row.line}`}
                className={
                  row.actionable
                    ? "rounded-2xl border border-brand-strong/30 bg-brand/10 p-5"
                    : "rounded-2xl border border-line bg-black/10 p-5"
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={analyticsMatchHref(row.matchId)}
                    aria-label={`Open ${row.homeTeam} vs ${row.awayTeam}`}
                    className="text-xs uppercase tracking-widest text-muted transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                  >
                    {row.matchDate}
                  </Link>
                  <Pill tone={row.actionable ? "success" : "default"}>
                    {row.actionable ? "Validated pick" : reasonLabel(row.reason)}
                  </Pill>
                </div>
                <h4 className="mt-3 flex flex-wrap items-center gap-x-2 font-semibold text-foreground">
                  <Link
                    href={analyticsTeamHref(analyticsTeamId(row.homeTeam))}
                    className="transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                  >
                    {row.homeTeam}
                  </Link>
                  <span className="text-muted">vs</span>
                  <Link
                    href={analyticsTeamHref(analyticsTeamId(row.awayTeam))}
                    className="transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                  >
                    {row.awayTeam}
                  </Link>
                </h4>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-line bg-white/4 px-3 py-2.5">
                    <p className="text-[0.62rem] uppercase tracking-widest text-muted">
                      Over {row.line?.toFixed(1)}
                    </p>
                    <p className="mt-1 font-mono text-lg font-semibold text-brand-lime">
                      {formatAmericanOdds(row.overOdds)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-line bg-white/4 px-3 py-2.5">
                    <p className="text-[0.62rem] uppercase tracking-widest text-muted">
                      Under {row.line?.toFixed(1)}
                    </p>
                    <p className="mt-1 font-mono text-lg font-semibold text-foreground">
                      {formatAmericanOdds(row.underOdds)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-sm">
                  <div>
                    <p className="text-xs text-muted">Model over</p>
                    <p className="mt-1 font-mono text-foreground">
                      {row.modelProbability === null
                        ? "—"
                        : percent(row.modelProbability)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Market no-vig</p>
                    <p className="mt-1 font-mono text-foreground">
                      {row.marketNoVigProbability === null
                        ? "—"
                        : percent(row.marketNoVigProbability)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Expected value</p>
                    <p className="mt-1 font-mono text-foreground">
                      {row.expectedValue === null
                        ? "—"
                        : percent(row.expectedValue)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <span>{row.sportsbook}</span>
                  <span>
                    Captured{" "}
                    {row.quoteTimestamp
                      ? dateTimeLabel(row.quoteTimestamp)
                      : "Unknown"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line bg-black/10 p-5">
            <p className="font-medium text-foreground">
              No paired totals prices available
            </p>
            <p className="mt-1 text-sm leading-6 text-muted">
              The model kept every fixture as no bet because no fresh over/under
              pair was stored for this run.
            </p>
          </div>
        )}
      </div>

      {board.picks.length > 0 ? (
        <div className="border-t border-line p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-widest text-brand-strong">
                Tracked picks
              </h3>
              <p className="mt-1 text-xs text-muted">
                Locked prices and settlement results are retained across daily runs.
              </p>
            </div>
            <span className="text-xs text-muted">{board.picks.length} recorded</span>
          </div>
          <div className="space-y-2">
            {board.picks.slice(0, 8).map((pick) => (
              <article
                key={pick.pickKey}
                className="grid gap-3 rounded-xl border border-line bg-black/10 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <Link
                    href={analyticsMatchHref(pick.matchId)}
                    className="text-xs uppercase tracking-widest text-muted transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                  >
                    {pick.matchDate}
                  </Link>
                  <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-foreground">
                    <Link
                      href={analyticsTeamHref(analyticsTeamId(pick.homeTeam))}
                      className="font-medium transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                    >
                      {pick.homeTeam}
                    </Link>
                    <span className="text-muted">vs</span>
                    <Link
                      href={analyticsTeamHref(analyticsTeamId(pick.awayTeam))}
                      className="font-medium transition hover:text-brand-strong hover:underline hover:underline-offset-4"
                    >
                      {pick.awayTeam}
                    </Link>
                  </p>
                </div>
                <div className="font-mono text-sm text-foreground">
                  OVER {pick.line.toFixed(1)} @ {formatAmericanOdds(pick.overOdds)}
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <Pill
                    tone={
                      pick.result === "win"
                        ? "success"
                        : pick.result === "loss"
                          ? "accent"
                          : "default"
                    }
                  >
                    {pick.result}
                  </Pill>
                  <span className="min-w-14 text-right font-mono text-xs text-muted">
                    {pick.pnlUnits === null
                      ? "Pending"
                      : `${pick.pnlUnits >= 0 ? "+" : ""}${pick.pnlUnits.toFixed(2)}u`}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-line px-5 py-4 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span className="inline-flex items-center gap-2">
          <Database className="size-3.5" />
          Supabase updates directly after each successful automation run.
        </span>
        <span>
          Policy {board.policyId} · artifact {board.artifactVersion}
        </span>
      </div>
    </section>
  );
}
