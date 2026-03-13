import { getFantasyModeConfig } from "@/lib/fantasy-modes";
import type {
  FantasyContestHorizon,
  FantasyGameVariant,
  FantasyLeagueRecord,
  FantasySlateWindow,
} from "@/types/fantasy";

type DailySlateTuple = [key: string, label: string, startsAt: string, endsAt: string, matchCount: number];

const dailySlateTuples: DailySlateTuple[] = [
  ["2026-03-13", "Friday, Mar 13", "2026-03-13T21:00:00.000Z", "2026-03-14T01:00:00.000Z", 1],
  ["2026-03-14", "Saturday, Mar 14", "2026-03-14T13:30:00.000Z", "2026-03-15T01:45:00.000Z", 5],
  ["2026-03-15", "Sunday, Mar 15", "2026-03-15T17:00:00.000Z", "2026-03-16T00:00:00.000Z", 2],
  ["2026-03-20", "Friday, Mar 20", "2026-03-20T21:00:00.000Z", "2026-03-21T03:00:00.000Z", 3],
  ["2026-03-21", "Saturday, Mar 21", "2026-03-21T17:00:00.000Z", "2026-03-22T01:45:00.000Z", 3],
  ["2026-03-22", "Sunday, Mar 22", "2026-03-22T15:00:00.000Z", "2026-03-23T00:00:00.000Z", 2],
  ["2026-03-25", "Wednesday, Mar 25", "2026-03-25T20:00:00.000Z", "2026-03-26T03:00:00.000Z", 5],
  ["2026-03-27", "Friday, Mar 27", "2026-03-27T23:00:00.000Z", "2026-03-28T03:00:00.000Z", 1],
  ["2026-03-28", "Saturday, Mar 28", "2026-03-28T13:00:00.000Z", "2026-03-29T01:45:00.000Z", 6],
  ["2026-03-29", "Sunday, Mar 29", "2026-03-29T20:00:00.000Z", "2026-03-30T00:00:00.000Z", 1],
  ["2026-04-03", "Friday, Apr 3", "2026-04-03T21:00:00.000Z", "2026-04-04T02:00:00.000Z", 4],
  ["2026-04-04", "Saturday, Apr 4", "2026-04-04T17:00:00.000Z", "2026-04-05T01:45:00.000Z", 3],
  ["2026-04-05", "Sunday, Apr 5", "2026-04-05T18:00:00.000Z", "2026-04-05T22:00:00.000Z", 1],
  ["2026-04-24", "Friday, Apr 24", "2026-04-24T18:30:00.000Z", "2026-04-25T01:00:00.000Z", 2],
  ["2026-04-25", "Saturday, Apr 25", "2026-04-25T14:00:00.000Z", "2026-04-26T01:45:00.000Z", 4],
  ["2026-04-26", "Sunday, Apr 26", "2026-04-26T19:00:00.000Z", "2026-04-27T01:00:00.000Z", 2],
  ["2026-04-29", "Wednesday, Apr 29", "2026-04-29T20:00:00.000Z", "2026-04-30T03:00:00.000Z", 4],
  ["2026-05-01", "Friday, May 1", "2026-05-01T21:00:00.000Z", "2026-05-02T01:00:00.000Z", 1],
  ["2026-05-02", "Saturday, May 2", "2026-05-02T17:00:00.000Z", "2026-05-03T01:45:00.000Z", 3],
  ["2026-05-03", "Sunday, May 3", "2026-05-03T14:00:00.000Z", "2026-05-04T00:00:00.000Z", 4],
  ["2026-05-06", "Wednesday, May 6", "2026-05-06T23:00:00.000Z", "2026-05-07T03:00:00.000Z", 1],
  ["2026-05-08", "Friday, May 8", "2026-05-08T19:30:00.000Z", "2026-05-09T01:00:00.000Z", 2],
  ["2026-05-09", "Saturday, May 9", "2026-05-09T19:30:00.000Z", "2026-05-10T01:45:00.000Z", 3],
  ["2026-05-10", "Sunday, May 10", "2026-05-10T13:30:00.000Z", "2026-05-11T00:00:00.000Z", 3],
  ["2026-05-12", "Tuesday, May 12", "2026-05-12T21:00:00.000Z", "2026-05-13T01:00:00.000Z", 1],
  ["2026-05-15", "Friday, May 15", "2026-05-15T21:00:00.000Z", "2026-05-16T03:00:00.000Z", 4],
  ["2026-05-16", "Saturday, May 16", "2026-05-16T19:30:00.000Z", "2026-05-17T01:45:00.000Z", 2],
  ["2026-05-17", "Sunday, May 17", "2026-05-17T19:00:00.000Z", "2026-05-18T01:00:00.000Z", 2],
  ["2026-05-20", "Wednesday, May 20", "2026-05-20T21:00:00.000Z", "2026-05-21T03:00:00.000Z", 3],
  ["2026-05-22", "Friday, May 22", "2026-05-22T21:00:00.000Z", "2026-05-23T01:00:00.000Z", 1],
  ["2026-05-23", "Saturday, May 23", "2026-05-23T17:00:00.000Z", "2026-05-24T01:45:00.000Z", 3],
  ["2026-05-24", "Sunday, May 24", "2026-05-24T14:00:00.000Z", "2026-05-25T00:00:00.000Z", 3],
  ["2026-05-29", "Friday, May 29", "2026-05-29T20:00:00.000Z", "2026-05-30T01:00:00.000Z", 2],
  ["2026-05-30", "Saturday, May 30", "2026-05-30T14:30:00.000Z", "2026-05-30T23:30:00.000Z", 3],
  ["2026-05-31", "Sunday, May 31", "2026-05-31T14:00:00.000Z", "2026-06-01T00:00:00.000Z", 3],
  ["2026-07-03", "Friday, Jul 3", "2026-07-03T21:00:00.000Z", "2026-07-04T03:00:00.000Z", 3],
  ["2026-07-04", "Saturday, Jul 4", "2026-07-04T19:30:00.000Z", "2026-07-05T01:45:00.000Z", 2],
  ["2026-07-05", "Sunday, Jul 5", "2026-07-05T13:00:00.000Z", "2026-07-06T00:00:00.000Z", 3],
  ["2026-07-10", "Friday, Jul 10", "2026-07-10T21:00:00.000Z", "2026-07-11T03:00:00.000Z", 4],
  ["2026-07-11", "Saturday, Jul 11", "2026-07-11T19:30:00.000Z", "2026-07-12T01:45:00.000Z", 2],
  ["2026-07-12", "Sunday, Jul 12", "2026-07-12T17:00:00.000Z", "2026-07-13T00:00:00.000Z", 2],
  ["2026-07-15", "Wednesday, Jul 15", "2026-07-15T20:00:00.000Z", "2026-07-16T00:00:00.000Z", 2],
  ["2026-07-17", "Friday, Jul 17", "2026-07-17T21:00:00.000Z", "2026-07-18T01:00:00.000Z", 1],
  ["2026-07-18", "Saturday, Jul 18", "2026-07-18T13:00:00.000Z", "2026-07-19T01:45:00.000Z", 6],
  ["2026-07-19", "Sunday, Jul 19", "2026-07-19T20:00:00.000Z", "2026-07-20T00:00:00.000Z", 1],
  ["2026-07-24", "Friday, Jul 24", "2026-07-24T21:00:00.000Z", "2026-07-25T03:00:00.000Z", 3],
  ["2026-07-25", "Saturday, Jul 25", "2026-07-25T18:00:00.000Z", "2026-07-26T00:45:00.000Z", 2],
  ["2026-07-26", "Sunday, Jul 26", "2026-07-26T18:00:00.000Z", "2026-07-27T02:00:00.000Z", 3],
  ["2026-07-29", "Wednesday, Jul 29", "2026-07-29T21:00:00.000Z", "2026-07-30T03:00:00.000Z", 3],
  ["2026-07-31", "Friday, Jul 31", "2026-07-31T21:00:00.000Z", "2026-08-01T01:00:00.000Z", 1],
  ["2026-08-01", "Saturday, Aug 1", "2026-08-01T17:00:00.000Z", "2026-08-02T01:45:00.000Z", 4],
  ["2026-08-02", "Sunday, Aug 2", "2026-08-02T17:00:00.000Z", "2026-08-03T02:00:00.000Z", 3],
  ["2026-08-05", "Wednesday, Aug 5", "2026-08-05T23:00:00.000Z", "2026-08-06T03:00:00.000Z", 1],
  ["2026-08-07", "Friday, Aug 7", "2026-08-07T20:00:00.000Z", "2026-08-08T01:00:00.000Z", 2],
  ["2026-08-08", "Saturday, Aug 8", "2026-08-08T17:00:00.000Z", "2026-08-09T01:45:00.000Z", 3],
  ["2026-08-09", "Sunday, Aug 9", "2026-08-09T17:00:00.000Z", "2026-08-10T02:00:00.000Z", 3],
  ["2026-08-14", "Friday, Aug 14", "2026-08-14T21:00:00.000Z", "2026-08-15T03:00:00.000Z", 4],
  ["2026-08-15", "Saturday, Aug 15", "2026-08-15T19:30:00.000Z", "2026-08-16T01:45:00.000Z", 2],
  ["2026-08-16", "Sunday, Aug 16", "2026-08-16T20:00:00.000Z", "2026-08-17T02:00:00.000Z", 2],
  ["2026-08-19", "Wednesday, Aug 19", "2026-08-19T19:30:00.000Z", "2026-08-20T01:00:00.000Z", 2],
  ["2026-08-21", "Friday, Aug 21", "2026-08-21T23:00:00.000Z", "2026-08-22T03:00:00.000Z", 1],
  ["2026-08-22", "Saturday, Aug 22", "2026-08-22T19:30:00.000Z", "2026-08-23T01:45:00.000Z", 3],
  ["2026-08-23", "Sunday, Aug 23", "2026-08-23T15:00:00.000Z", "2026-08-24T01:00:00.000Z", 4],
  ["2026-08-26", "Wednesday, Aug 26", "2026-08-26T21:00:00.000Z", "2026-08-27T01:00:00.000Z", 1],
  ["2026-08-28", "Friday, Aug 28", "2026-08-28T21:00:00.000Z", "2026-08-29T03:00:00.000Z", 2],
  ["2026-08-29", "Saturday, Aug 29", "2026-08-29T19:30:00.000Z", "2026-08-30T01:45:00.000Z", 3],
  ["2026-08-30", "Sunday, Aug 30", "2026-08-30T13:30:00.000Z", "2026-08-31T00:00:00.000Z", 2],
  ["2026-08-31", "Monday, Aug 31", "2026-08-31T21:00:00.000Z", "2026-09-01T01:00:00.000Z", 1],
  ["2026-09-04", "Friday, Sep 4", "2026-09-04T22:30:00.000Z", "2026-09-05T03:00:00.000Z", 2],
  ["2026-09-05", "Saturday, Sep 5", "2026-09-05T19:30:00.000Z", "2026-09-05T23:30:00.000Z", 1],
  ["2026-09-06", "Sunday, Sep 6", "2026-09-06T15:00:00.000Z", "2026-09-07T02:00:00.000Z", 5],
  ["2026-09-11", "Friday, Sep 11", "2026-09-11T19:30:00.000Z", "2026-09-12T03:00:00.000Z", 3],
  ["2026-09-12", "Saturday, Sep 12", "2026-09-12T19:30:00.000Z", "2026-09-13T01:45:00.000Z", 3],
  ["2026-09-13", "Sunday, Sep 13", "2026-09-13T14:00:00.000Z", "2026-09-14T00:00:00.000Z", 2],
  ["2026-09-16", "Wednesday, Sep 16", "2026-09-16T22:30:00.000Z", "2026-09-17T03:00:00.000Z", 2],
  ["2026-09-18", "Friday, Sep 18", "2026-09-18T21:00:00.000Z", "2026-09-19T01:00:00.000Z", 1],
  ["2026-09-19", "Saturday, Sep 19", "2026-09-19T17:00:00.000Z", "2026-09-20T01:45:00.000Z", 3],
  ["2026-09-20", "Sunday, Sep 20", "2026-09-20T15:00:00.000Z", "2026-09-21T00:00:00.000Z", 4],
  ["2026-09-25", "Friday, Sep 25", "2026-09-25T19:30:00.000Z", "2026-09-26T01:30:00.000Z", 3],
  ["2026-09-26", "Saturday, Sep 26", "2026-09-26T13:30:00.000Z", "2026-09-27T01:45:00.000Z", 3],
  ["2026-09-27", "Sunday, Sep 27", "2026-09-27T18:00:00.000Z", "2026-09-28T00:00:00.000Z", 2],
  ["2026-10-02", "Friday, Oct 2", "2026-10-02T21:00:00.000Z", "2026-10-03T03:00:00.000Z", 2],
  ["2026-10-03", "Saturday, Oct 3", "2026-10-03T17:00:00.000Z", "2026-10-04T01:45:00.000Z", 3],
  ["2026-10-04", "Sunday, Oct 4", "2026-10-04T13:00:00.000Z", "2026-10-05T00:00:00.000Z", 3],
  ["2026-10-16", "Friday, Oct 16", "2026-10-16T21:00:00.000Z", "2026-10-17T01:00:00.000Z", 1],
  ["2026-10-17", "Saturday, Oct 17", "2026-10-17T13:30:00.000Z", "2026-10-18T01:45:00.000Z", 4],
  ["2026-10-18", "Sunday, Oct 18", "2026-10-18T14:00:00.000Z", "2026-10-19T00:00:00.000Z", 3],
  ["2026-10-23", "Friday, Oct 23", "2026-10-23T21:00:00.000Z", "2026-10-24T03:00:00.000Z", 3],
  ["2026-10-24", "Saturday, Oct 24", "2026-10-24T19:30:00.000Z", "2026-10-25T01:45:00.000Z", 2],
  ["2026-10-25", "Sunday, Oct 25", "2026-10-25T16:00:00.000Z", "2026-10-26T00:00:00.000Z", 3],
  ["2026-11-01", "Sunday, Nov 1", "2026-11-01T18:00:00.000Z", "2026-11-01T22:00:00.000Z", 8],
];

function formatRangeLabel(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const monthFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  });

  const startMonth = monthFormatter.format(start);
  const endMonth = monthFormatter.format(end);
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();

  return sameMonth
    ? `${startMonth} ${startDay}-${endDay}`
    : `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
}

function getWeekStartKey(isoString: string) {
  const date = new Date(isoString);
  const offset = (date.getUTCDay() + 6) % 7;

  date.setUTCDate(date.getUTCDate() - offset);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

const dailySlateWindows: FantasySlateWindow[] = dailySlateTuples.map(
  ([key, label, startsAt, endsAt, matchCount]) => ({
    key,
    label,
    cadence: "daily",
    starts_at: startsAt,
    lock_at: startsAt,
    ends_at: endsAt,
    match_count: matchCount,
    slate_keys: [key],
  })
);

const weeklySlateWindows: FantasySlateWindow[] = Array.from(
  [...dailySlateWindows].reduce<Map<string, FantasySlateWindow>>((weeks, slate) => {
    const weekStart = getWeekStartKey(slate.starts_at);
    const existing = weeks.get(weekStart);

    if (!existing) {
      weeks.set(weekStart, {
        key: weekStart,
        label: "",
        cadence: "weekly",
        starts_at: slate.starts_at,
        lock_at: slate.lock_at,
        ends_at: slate.ends_at,
        match_count: slate.match_count,
        slate_keys: [slate.key],
      });
      return weeks;
    }

    existing.starts_at =
      existing.starts_at < slate.starts_at ? existing.starts_at : slate.starts_at;
    existing.lock_at =
      existing.lock_at < slate.lock_at ? existing.lock_at : slate.lock_at;
    existing.ends_at = existing.ends_at > slate.ends_at ? existing.ends_at : slate.ends_at;
    existing.match_count += slate.match_count;
    existing.slate_keys.push(slate.key);

    return weeks;
  }, new Map()).values()
).sort((left, right) => left.starts_at.localeCompare(right.starts_at)).map((window, index) => ({
  ...window,
  key: `week-${String(index + 1).padStart(2, "0")}`,
  label: `Week ${index + 1} • ${formatRangeLabel(window.starts_at, window.ends_at)}`,
}));

const seasonSlateWindow: FantasySlateWindow = {
  key: "season-2026",
  label: "2026 Season",
  cadence: "season",
  starts_at: dailySlateWindows[0]!.starts_at,
  lock_at: dailySlateWindows[0]!.lock_at,
  ends_at: dailySlateWindows[dailySlateWindows.length - 1]!.ends_at,
  match_count: dailySlateWindows.reduce((total, slate) => total + slate.match_count, 0),
  slate_keys: dailySlateWindows.map((slate) => slate.key),
};

function resolveContestHorizon(
  leagueOrVariant: FantasyLeagueRecord | FantasyGameVariant
): FantasyContestHorizon {
  if (typeof leagueOrVariant === "string") {
    return getFantasyModeConfig(leagueOrVariant).contestHorizon;
  }

  return leagueOrVariant.contest_horizon;
}

export function getFantasySlateWindows(
  leagueOrVariant: FantasyLeagueRecord | FantasyGameVariant
) {
  const contestHorizon = resolveContestHorizon(leagueOrVariant);

  if (contestHorizon === "season") {
    return [seasonSlateWindow];
  }

  if (contestHorizon === "weekly") {
    return weeklySlateWindows;
  }

  return dailySlateWindows;
}

export function getFantasyTargetSlate(
  leagueOrVariant: FantasyLeagueRecord | FantasyGameVariant,
  requestedSlateKey?: string,
  now = new Date()
) {
  const slates = getFantasySlateWindows(leagueOrVariant);

  if (requestedSlateKey) {
    const requested = slates.find((slate) => slate.key === requestedSlateKey);

    if (requested) {
      return requested;
    }
  }

  const nowMs = now.getTime();

  return (
    slates.find((slate) => new Date(slate.ends_at).getTime() >= nowMs) ??
    slates[slates.length - 1]
  );
}

export function getFantasyDefaultLockAt(leagueOrVariant: FantasyLeagueRecord | FantasyGameVariant) {
  return getFantasySlateWindows(leagueOrVariant)[0]!.lock_at;
}

export function getFantasySlateStatus(slate: FantasySlateWindow, now = new Date()) {
  const nowMs = now.getTime();
  const startsAt = new Date(slate.starts_at).getTime();
  const endsAt = new Date(slate.ends_at).getTime();

  if (nowMs < startsAt) {
    return "upcoming" as const;
  }

  if (nowMs <= endsAt) {
    return "live" as const;
  }

  return "complete" as const;
}

export function formatFantasySlateRange(slate: FantasySlateWindow) {
  return `${formatRangeLabel(slate.starts_at, slate.ends_at)} • ${slate.match_count} match${slate.match_count === 1 ? "" : "es"}`;
}
