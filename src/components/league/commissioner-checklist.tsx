"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SurfaceCard } from "@/components/common/surface-card";
import { MotionReveal } from "@/components/ui/motion-reveal";
import { getButtonClassName } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CommissionerChecklistProps {
  leagueId: string;
  leagueName: string;
  leagueCode: string;
  memberCount: number;
  targetMemberCount: number;
  draftScheduled: boolean;
  draftAt: string | null;
  gameVariant: string;
}

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  complete: boolean;
  /** Render the action area for incomplete items */
  action?: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function storageKey(leagueId: string) {
  return `nwsl_checklist_dismissed_${leagueId}`;
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("h-5 w-5", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CircleIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("h-5 w-5", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <circle cx={12} cy={12} r={9} />
    </svg>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("h-3.5 w-3.5", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-2M8 5a2 2 0 012-2h4a2 2 0 012 2M8 5a2 2 0 002 2h4a2 2 0 002-2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("h-3.5 w-3.5", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Copy code button                                                   */
/* ------------------------------------------------------------------ */

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, [code]);

  return (
    <button
      aria-label={copied ? "Copied" : "Copy league code"}
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/6 px-3 py-1.5 text-xs font-semibold tracking-wide text-foreground transition hover:bg-white/10"
      onClick={handleCopy}
      type="button"
    >
      <span className="font-mono">{code}</span>
      {copied ? (
        <CheckIcon className="text-brand-lime" />
      ) : (
        <ClipboardIcon className="text-muted" />
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Invite action                                                      */
/* ------------------------------------------------------------------ */

function InviteAction({
  leagueCode,
  leagueId,
  memberCount,
  targetMemberCount,
}: {
  leagueCode: string;
  leagueId: string;
  memberCount: number;
  targetMemberCount: number;
}) {
  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/leagues/join?code=${leagueCode}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Join my NWSL Fantasy league", url });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      /* share cancelled or unavailable */
    }
  }, [leagueCode]);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        {memberCount} of {targetMemberCount} managers joined
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <CopyCodeButton code={leagueCode} />
        <button
          className={getButtonClassName({ variant: "ghost", size: "sm" })}
          onClick={handleShare}
          type="button"
        >
          Share invite link
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Checklist row                                                      */
/* ------------------------------------------------------------------ */

function ChecklistRow({
  item,
  delay,
}: {
  item: ChecklistItem;
  delay: number;
}) {
  return (
    <MotionReveal delay={delay}>
      <div
        className={cn(
          "rounded-[1.2rem] border p-4 transition",
          item.complete
            ? "border-brand-lime/20 bg-brand-lime/5"
            : "border-line bg-white/6"
        )}
      >
        <div className="flex items-start gap-3">
          {item.complete ? (
            <CheckCircleIcon className="mt-0.5 shrink-0 text-brand-lime" />
          ) : (
            <CircleIcon className="mt-0.5 shrink-0 text-muted" />
          )}
          <div className="min-w-0 flex-1 space-y-1.5">
            <p
              className={cn(
                "text-sm font-semibold",
                item.complete ? "text-brand-lime" : "text-foreground"
              )}
            >
              {item.title}
            </p>
            <p className="text-[0.8rem] leading-5 text-muted">
              {item.description}
            </p>
            {!item.complete && item.action ? (
              <div className="pt-1">{item.action}</div>
            ) : null}
          </div>
        </div>
      </div>
    </MotionReveal>
  );
}

/* ------------------------------------------------------------------ */
/*  Progress bar                                                       */
/* ------------------------------------------------------------------ */

function ProgressBar({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-1.5">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-brand-strong">
        {completed} of {total} steps complete
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-brand-lime transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function CommissionerChecklist({
  leagueId,
  leagueName,
  leagueCode,
  memberCount,
  targetMemberCount,
  draftScheduled,
  draftAt,
  gameVariant,
}: CommissionerChecklistProps) {
  const [dismissed, setDismissed] = useState(true); // default hidden to avoid flash

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(storageKey(leagueId)) === "true");
    } catch {
      setDismissed(false);
    }
  }, [leagueId]);

  const handleDismiss = useCallback(() => {
    try {
      localStorage.setItem(storageKey(leagueId), "true");
    } catch {
      /* storage unavailable */
    }
    setDismissed(true);
  }, [leagueId]);

  const isClassic = gameVariant === "classic";
  const invitesComplete = memberCount >= 2;
  const draftStepComplete = isClassic ? draftScheduled : true;

  const items: ChecklistItem[] = useMemo(() => {
    const list: ChecklistItem[] = [
      {
        id: "create",
        title: "Created league",
        description: `${leagueName} is ready for managers to join.`,
        complete: true,
      },
      {
        id: "invite",
        title: "Invite managers",
        description: invitesComplete
          ? `${memberCount} managers have joined so far.`
          : "Share your league code so others can join.",
        complete: invitesComplete,
        action: (
          <InviteAction
            leagueCode={leagueCode}
            leagueId={leagueId}
            memberCount={memberCount}
            targetMemberCount={targetMemberCount}
          />
        ),
      },
    ];

    if (isClassic) {
      list.push({
        id: "draft-date",
        title: "Set draft date",
        description: draftScheduled
          ? `Draft scheduled for ${draftAt ? new Date(draftAt).toLocaleString() : "TBD"}.`
          : "Choose when your league will draft.",
        complete: draftScheduled,
        action: (
          <Link
            className={getButtonClassName({ variant: "secondary", size: "sm" })}
            href={`/leagues/${leagueId}/settings`}
          >
            Schedule draft
          </Link>
        ),
      });
    }

    const allPrereqsMet = invitesComplete && draftStepComplete;

    list.push({
      id: "start-draft",
      title: isClassic ? "Start the draft" : "Start building rosters",
      description: allPrereqsMet
        ? isClassic
          ? "Everything is set. Open the draft room when you are ready."
          : "Everything is set. Managers can start building rosters."
        : "Complete the steps above to unlock this.",
      complete: false,
      action: allPrereqsMet ? (
        <Link
          className={getButtonClassName({ variant: "primary", size: "sm" })}
          href={
            isClassic
              ? `/leagues/${leagueId}/draft`
              : `/leagues/${leagueId}/team`
          }
        >
          {isClassic ? "Open draft room" : "Open salary-cap hub"}
        </Link>
      ) : undefined,
    });

    return list;
  }, [
    draftAt,
    draftScheduled,
    draftStepComplete,
    invitesComplete,
    isClassic,
    leagueCode,
    leagueId,
    leagueName,
    memberCount,
    targetMemberCount,
  ]);

  const completedCount = items.filter((i) => i.complete).length;

  if (dismissed) return null;

  return (
    <MotionReveal>
      <SurfaceCard
        className="relative"
        eyebrow="Commissioner setup"
        title="Launch checklist"
        tone="accent"
      >
        {/* Dismiss button */}
        <button
          aria-label="Dismiss checklist"
          className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/8 text-white/60 transition hover:bg-white/15 hover:text-white"
          onClick={handleDismiss}
          type="button"
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              d="M18 6 6 18M6 6l12 12"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="space-y-4">
          <MotionReveal delay={0}>
            <ProgressBar completed={completedCount} total={items.length} />
          </MotionReveal>

          <div className="space-y-3">
            {items.map((item, i) => (
              <ChecklistRow
                key={item.id}
                delay={80 + i * 80}
                item={item}
              />
            ))}
          </div>
        </div>
      </SurfaceCard>
    </MotionReveal>
  );
}
