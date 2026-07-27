import type { MatchResult } from "@/types/analytics";

export type MatchDateFilter = "next" | "all" | string;
export type MatchOrder = "asc" | "desc";
export type MatchStatusFilter = "all" | MatchResult["status"];

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MATCH_STATUSES = new Set<MatchResult["status"]>([
  "completed",
  "live",
  "upcoming",
  "postponed",
  "canceled",
]);

function isCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function sortedUniqueDates(values: readonly string[]): string[] {
  return [...new Set(values.filter(isCalendarDate))].sort((left, right) =>
    left.localeCompare(right)
  );
}

export function todayDateIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function nextAvailableDate(
  values: readonly string[],
  today = todayDateIso()
): string | null {
  const dates = sortedUniqueDates(values);
  if (dates.length === 0) return null;

  return dates.find((date) => date >= today) ?? dates.at(-1) ?? null;
}

export function resolveDateFilter(
  raw: string | null,
  availableDates: readonly string[]
): MatchDateFilter {
  if (raw === "all" || raw === "next") return raw;
  if (raw && isCalendarDate(raw) && availableDates.includes(raw)) return raw;
  return "next";
}

export function resolveMatchOrder(raw: string | null): MatchOrder {
  return raw === "desc" ? "desc" : "asc";
}

export function resolveStatusFilter(raw: string | null): MatchStatusFilter {
  if (raw && MATCH_STATUSES.has(raw as MatchResult["status"])) {
    return raw as MatchResult["status"];
  }
  return "all";
}

export function stableSortByDate<T extends { date: string }>(
  rows: readonly T[],
  order: MatchOrder
): T[] {
  const direction = order === "asc" ? 1 : -1;

  return rows
    .map((row, originalIndex) => ({ row, originalIndex }))
    .sort((left, right) => {
      const dateOrder = left.row.date.localeCompare(right.row.date) * direction;
      return dateOrder || left.originalIndex - right.originalIndex;
    })
    .map(({ row }) => row);
}

export function browserStateHref(
  pathname: string,
  searchParams: Pick<URLSearchParams, "toString">,
  updates: Record<string, string | null>
): string {
  const params = new URLSearchParams(searchParams.toString());

  for (const [key, value] of Object.entries(updates)) {
    if (value === null) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }

  // Match dates are the canonical schedule control. Remove the retired
  // pseudo-matchday query whenever the browser state changes.
  params.delete("matchday");

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
