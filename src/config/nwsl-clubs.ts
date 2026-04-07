/**
 * NWSL club metadata for logos, colors, and display.
 * Logo files should be placed in public/clubs/ as {abbreviation}.svg
 */

export interface NwslClub {
  name: string;
  abbreviation: string;
  /** Primary brand color (hex) */
  color: string;
  /** Path to logo image in /public */
  logo: string;
}

export const NWSL_CLUBS: Record<string, NwslClub> = {
  "Angel City FC": {
    name: "Angel City FC",
    abbreviation: "ACFC",
    color: "#D4145A",
    logo: "/clubs/ACFC.svg",
  },
  "Bay FC": {
    name: "Bay FC",
    abbreviation: "BAY",
    color: "#FFA500",
    logo: "/clubs/BAY.svg",
  },
  "Chicago Red Stars": {
    name: "Chicago Red Stars",
    abbreviation: "CHI",
    color: "#CF2030",
    logo: "/clubs/CHI.svg",
  },
  "Houston Dash": {
    name: "Houston Dash",
    abbreviation: "HOU",
    color: "#F36F21",
    logo: "/clubs/HOU.svg",
  },
  "Kansas City Current": {
    name: "Kansas City Current",
    abbreviation: "KC",
    color: "#D31145",
    logo: "/clubs/KC.svg",
  },
  "NJ/NY Gotham FC": {
    name: "NJ/NY Gotham FC",
    abbreviation: "GOT",
    color: "#1A1A2E",
    logo: "/clubs/GOT.svg",
  },
  "North Carolina Courage": {
    name: "North Carolina Courage",
    abbreviation: "NC",
    color: "#002B5C",
    logo: "/clubs/NC.svg",
  },
  "Orlando Pride": {
    name: "Orlando Pride",
    abbreviation: "ORL",
    color: "#633492",
    logo: "/clubs/ORL.svg",
  },
  "Portland Thorns FC": {
    name: "Portland Thorns FC",
    abbreviation: "POR",
    color: "#00482B",
    logo: "/clubs/POR.svg",
  },
  "Racing Louisville FC": {
    name: "Racing Louisville FC",
    abbreviation: "LOU",
    color: "#7B2D8E",
    logo: "/clubs/LOU.svg",
  },
  "San Diego Wave FC": {
    name: "San Diego Wave FC",
    abbreviation: "SD",
    color: "#003DA5",
    logo: "/clubs/SD.svg",
  },
  "Seattle Reign FC": {
    name: "Seattle Reign FC",
    abbreviation: "SEA",
    color: "#002244",
    logo: "/clubs/SEA.svg",
  },
  "Utah Royals FC": {
    name: "Utah Royals FC",
    abbreviation: "UTA",
    color: "#FFB81C",
    logo: "/clubs/UTA.svg",
  },
  "Washington Spirit": {
    name: "Washington Spirit",
    abbreviation: "WAS",
    color: "#C8102E",
    logo: "/clubs/WAS.svg",
  },
};

/** Look up club by name, abbreviation, or partial match */
export function findClub(query: string): NwslClub | null {
  if (!query) return null;
  const q = query.trim().toLowerCase();

  // Exact name match
  for (const club of Object.values(NWSL_CLUBS)) {
    if (club.name.toLowerCase() === q) return club;
  }

  // Abbreviation match
  for (const club of Object.values(NWSL_CLUBS)) {
    if (club.abbreviation.toLowerCase() === q) return club;
  }

  // Partial match
  for (const club of Object.values(NWSL_CLUBS)) {
    if (club.name.toLowerCase().includes(q) || q.includes(club.abbreviation.toLowerCase())) {
      return club;
    }
  }

  return null;
}

/** All clubs as a flat array, sorted alphabetically */
export const NWSL_CLUBS_LIST = Object.values(NWSL_CLUBS).sort((a, b) =>
  a.name.localeCompare(b.name)
);
