import type { NavigationItem, NavigationSection } from "@/types/navigation";

export const primaryNavigation: NavigationItem[] = [
  { href: "/", label: "Home", shortLabel: "Home" },
  { href: "/dashboard", label: "Dashboard", shortLabel: "Dash", requiresAuth: true },
  { href: "/leagues", label: "Leagues", shortLabel: "Leagues", requiresAuth: true },
  { href: "/players", label: "Players", shortLabel: "Players", requiresAuth: true },
  { href: "/help", label: "Help", shortLabel: "Help" },
];

export const globalSettingsNavigation: NavigationSection[] = [
  {
    title: "Account",
    items: [
      { href: "/settings", label: "User settings", shortLabel: "Settings", requiresAuth: true },
      {
        href: "/notifications",
        label: "Notifications",
        shortLabel: "Alerts",
        requiresAuth: true,
      },
    ],
  },
  {
    title: "Support",
    items: [
      { href: "/rules", label: "Rules explainer", shortLabel: "Rules" },
      { href: "/help", label: "FAQ and support", shortLabel: "FAQ" },
    ],
  },
];

export function buildLeagueNavigation(leagueId: string): NavigationItem[] {
  return [
    { href: `/leagues/${leagueId}`, label: "League Home", shortLabel: "Home", requiresAuth: true },
    {
      href: `/leagues/${leagueId}/team`,
      label: "My Team",
      shortLabel: "Team",
      requiresAuth: true,
    },
    {
      href: `/leagues/${leagueId}/matchup`,
      label: "Matchup",
      shortLabel: "Matchup",
      requiresAuth: true,
    },
    {
      href: `/leagues/${leagueId}/players`,
      label: "Players",
      shortLabel: "Players",
      requiresAuth: true,
    },
    {
      href: `/leagues/${leagueId}/standings`,
      label: "Standings",
      shortLabel: "Standings",
      requiresAuth: true,
    },
    {
      href: `/leagues/${leagueId}/transactions`,
      label: "Transactions",
      shortLabel: "Moves",
      requiresAuth: true,
    },
    {
      href: `/leagues/${leagueId}/trades`,
      label: "Trades",
      shortLabel: "Trades",
      requiresAuth: true,
    },
    {
      href: `/leagues/${leagueId}/chat`,
      label: "Chat",
      shortLabel: "Chat",
      requiresAuth: true,
    },
    {
      href: `/leagues/${leagueId}/achievements`,
      label: "Badges",
      shortLabel: "Badges",
      requiresAuth: true,
    },
    {
      href: `/leagues/${leagueId}/draft`,
      label: "Draft",
      shortLabel: "Draft",
      requiresAuth: true,
    },
    {
      href: `/leagues/${leagueId}/settings`,
      label: "League Settings",
      shortLabel: "Settings",
      requiresAuth: true,
    },
  ];
}
