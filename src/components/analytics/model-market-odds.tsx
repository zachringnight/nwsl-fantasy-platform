import { Clock3, ShieldCheck } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import type {
  LiveMatchOdds,
  LiveModelSlateRow,
} from "@/lib/analytics/live-model-board";

function percent(value: number | null, digits = 1): string {
  return value === null ? "—" : `${(value * 100).toFixed(digits)}%`;
}

function decimalOdds(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
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

function reasonLabel(reason: string): string {
  return reason
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function OddsCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | null;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-black/10 px-3 py-2.5">
      <p className="truncate text-[0.62rem] font-medium uppercase tracking-widest text-muted">
        {label}
      </p>
      <p
        className={
          accent
            ? "mt-1 font-mono text-base font-semibold text-brand-lime"
            : "mt-1 font-mono text-base font-semibold text-foreground"
        }
      >
        {decimalOdds(value)}
      </p>
    </div>
  );
}

export function ModelMarketOdds({
  odds,
  modelRow,
  heading = "Market odds",
  archived = false,
}: {
  odds: LiveMatchOdds[];
  modelRow?: LiveModelSlateRow;
  heading?: string;
  archived?: boolean;
}) {
  const sortedOdds = [...odds].sort(
    (left, right) =>
      left.marketType.localeCompare(right.marketType) ||
      left.sportsbook.localeCompare(right.sportsbook) ||
      (left.line ?? 0) - (right.line ?? 0)
  );

  return (
    <section className="glass-card rounded-[1.4rem] border border-line bg-white/4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-brand-strong">
            {heading}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Decimal prices captured by the automated odds pipeline. A model pick
            is only possible when a fresh, paired DraftKings total 2.5 price is
            available.
          </p>
        </div>
        {archived && modelRow?.quoteTimestamp ? (
          <Pill tone="default">Archived quote</Pill>
        ) : modelRow?.quoteIsFresh === true ? (
          <Pill tone="success">
            <Clock3 className="size-3.5" />
            Fresh quote
          </Pill>
        ) : modelRow?.quoteTimestamp ? (
          <Pill tone="default">Archived quote</Pill>
        ) : null}
      </div>

      {sortedOdds.length > 0 ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {sortedOdds.map((row) => (
            <article
              key={[
                row.matchId,
                row.sportsbook,
                row.marketType,
                row.line ?? "none",
                row.quoteTimestamp,
              ].join(":")}
              className="rounded-2xl border border-line bg-black/10 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground">
                    {row.sportsbook}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {dateTimeLabel(row.quoteTimestamp)}
                  </p>
                </div>
                <Pill tone={row.marketType === "total" ? "brand" : "default"}>
                  {row.marketType === "total"
                    ? `Total ${row.line?.toFixed(1) ?? "—"}`
                    : "90-minute 1X2"}
                </Pill>
              </div>

              {row.marketType === "total" ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <OddsCell label={`Over ${row.line?.toFixed(1) ?? ""}`} value={row.overOdds} accent />
                  <OddsCell label={`Under ${row.line?.toFixed(1) ?? ""}`} value={row.underOdds} />
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <OddsCell label={row.homeTeam} value={row.homeOdds} />
                  <OddsCell label="Draw" value={row.drawOdds} />
                  <OddsCell label={row.awayTeam} value={row.awayOdds} />
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-line bg-black/10 p-5">
          <p className="font-medium text-foreground">Odds not posted</p>
          <p className="mt-1 text-sm leading-6 text-muted">
            No verifiable market snapshot is stored for this match. The model
            records no price-based pick when that data is unavailable.
          </p>
        </div>
      )}

      {modelRow ? (
        <div className="mt-5 rounded-2xl border border-line bg-white/4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-brand-lime" />
              <div>
                <p className="font-semibold text-foreground">
                  Model decision
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {modelRow.sportsbook && modelRow.line !== null
                    ? `${modelRow.sportsbook} · Over ${modelRow.line.toFixed(1)} @ ${decimalOdds(modelRow.overOdds)}`
                    : "No eligible paired total quote"}
                </p>
              </div>
            </div>
            <Pill tone={modelRow.actionable ? "success" : "default"}>
              {modelRow.actionable
                ? "Validated pick"
                : reasonLabel(modelRow.reason)}
            </Pill>
          </div>
          {modelRow.modelProbability !== null ? (
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted">Model over</dt>
                <dd className="mt-1 font-mono text-sm text-foreground">
                  {percent(modelRow.modelProbability)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Market no-vig</dt>
                <dd className="mt-1 font-mono text-sm text-foreground">
                  {percent(modelRow.marketNoVigProbability)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Probability edge</dt>
                <dd className="mt-1 font-mono text-sm text-foreground">
                  {percent(modelRow.probabilityEdge)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Expected value</dt>
                <dd className="mt-1 font-mono text-sm text-foreground">
                  {percent(modelRow.expectedValue)}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
