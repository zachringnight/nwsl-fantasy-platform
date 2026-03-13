import type { DemoLeague, DemoMatchup, DemoPlayer } from "@/types/fantasy";

export const demoLeagues: DemoLeague[] = [
  {
    id: "founders-cup",
    name: "Founders Cup",
    status: "1st place",
    record: "6-2-1",
    nextAction: "Set one DEF slot before Saturday lock",
    draftStatus: "Draft complete",
  },
  {
    id: "friends-of-nwsl",
    name: "Friends of NWSL",
    status: "6th place",
    record: "4-5-0",
    nextAction: "Queue two waiver claims before Tuesday processing",
    draftStatus: "Draft complete",
  },
  {
    id: "open-public-league",
    name: "Open Public League",
    status: "Draft in 3 days",
    record: "0-0-0",
    nextAction: "Review rankings and queue top forwards",
    draftStatus: "Pre-draft",
  },
];

export const demoPlayers: DemoPlayer[] = [
  {
    id: "temwa-chawinga",
    name: "Temwa Chawinga",
    club: "Kansas City Current",
    position: "FWD",
    averagePoints: 14.6,
    availability: "available",
  },
  {
    id: "sam-coffey",
    name: "Sam Coffey",
    club: "Portland Thorns",
    position: "MID",
    averagePoints: 12.1,
    availability: "available",
  },
  {
    id: "naomi-girma",
    name: "Naomi Girma",
    club: "San Diego Wave",
    position: "DEF",
    averagePoints: 10.8,
    availability: "questionable",
  },
  {
    id: "alyssa-naeher",
    name: "Alyssa Naeher",
    club: "Chicago Stars",
    position: "GK",
    averagePoints: 9.4,
    availability: "available",
  },
];

export const demoMatchups: DemoMatchup[] = [
  {
    leagueName: "Founders Cup",
    homeTeam: "Rose City Press",
    awayTeam: "Blue Wave FC",
    homePoints: 82.5,
    awayPoints: 79.0,
    status: "Live • 74'",
  },
  {
    leagueName: "Friends of NWSL",
    homeTeam: "Angel City Values",
    awayTeam: "The High Press",
    homePoints: 64.75,
    awayPoints: 70.5,
    status: "Pregame • Saturday",
  },
];

export const demoDraftQueue = ["Sam Coffey", "Marta", "Alyssa Naeher"];

export const demoDraftBoard = [
  "Temwa Chawinga",
  "Sophia Wilson",
  "Trinity Rodman",
  "Mallory Swanson",
  "Debinha",
];
