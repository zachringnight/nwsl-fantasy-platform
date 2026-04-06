"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

const SEASONS = [
  { value: "2026", label: "2026" },
  { value: "2025", label: "2025" },
] as const;

export type Season = "2025" | "2026";

export function useAnalyticsSeason(): Season {
  const searchParams = useSearchParams();
  const raw = searchParams.get("season");
  if (raw === "2025") return "2025";
  return "2026"; // default to current season
}

export function SeasonSelector() {
  const season = useAnalyticsSeason();
  const router = useRouter();
  const pathname = usePathname();

  const setSeason = useCallback(
    (s: string) => {
      const params = new URLSearchParams(window.location.search);
      if (s === "2026") {
        params.delete("season");
      } else {
        params.set("season", s);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname]
  );

  return (
    <div className="flex items-center gap-1">
      {SEASONS.map((s) => (
        <button
          key={s.value}
          type="button"
          onClick={() => setSeason(s.value)}
          className={
            season === s.value
              ? "rounded-full bg-brand/20 px-3 py-1.5 text-xs font-semibold text-brand-strong"
              : "rounded-full px-3 py-1.5 text-xs font-semibold text-muted hover:bg-white/6 hover:text-foreground"
          }
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
