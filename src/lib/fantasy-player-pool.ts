import type {
  AvailabilityStatus,
  FantasyPoolPlayer,
  PlayerPosition,
} from "@/types/fantasy";
import { officialFantasyPlayerPool } from "@/lib/generated/fantasy-player-pool.generated";

interface ClubSeed {
  name: string;
  strength: number;
  featured: Array<{
    name: string;
    position: PlayerPosition;
    averagePoints: number;
    availability?: AvailabilityStatus;
  }>;
}

const clubSeeds: ClubSeed[] = [
  {
    name: "Angel City FC",
    strength: 0.4,
    featured: [
      { name: "Alyssa Thompson", position: "FWD", averagePoints: 15.4 },
      { name: "Sarah Gorden", position: "DEF", averagePoints: 11.2 },
    ],
  },
  {
    name: "Bay FC",
    strength: 0.2,
    featured: [
      { name: "Racheal Kundananji", position: "FWD", averagePoints: 15.1 },
      { name: "Asisat Oshoala", position: "FWD", averagePoints: 13.6 },
    ],
  },
  {
    name: "Boston Legacy FC",
    strength: -0.2,
    featured: [{ name: "Boston Legacy Captain", position: "MID", averagePoints: 11.8 }],
  },
  {
    name: "Chicago Stars FC",
    strength: 0.1,
    featured: [
      { name: "Alyssa Naeher", position: "GK", averagePoints: 10.4 },
      { name: "Julia Grosso", position: "MID", averagePoints: 12.4 },
    ],
  },
  {
    name: "Denver Summit FC",
    strength: -0.15,
    featured: [{ name: "Denver Summit Captain", position: "FWD", averagePoints: 12.2 }],
  },
  {
    name: "Houston Dash",
    strength: 0.05,
    featured: [
      { name: "Jane Campbell", position: "GK", averagePoints: 10.1 },
      { name: "Diana Ordonez", position: "FWD", averagePoints: 12.3 },
    ],
  },
  {
    name: "Kansas City Current",
    strength: 0.75,
    featured: [
      { name: "Temwa Chawinga", position: "FWD", averagePoints: 16.4 },
      { name: "Debinha", position: "MID", averagePoints: 13.7 },
    ],
  },
  {
    name: "NJ/NY Gotham FC",
    strength: 0.65,
    featured: [
      { name: "Esther Gonzalez", position: "FWD", averagePoints: 15.5 },
      { name: "Rose Lavelle", position: "MID", averagePoints: 13.8, availability: "questionable" },
    ],
  },
  {
    name: "North Carolina Courage",
    strength: 0.45,
    featured: [
      { name: "Ashley Sanchez", position: "MID", averagePoints: 13.4 },
      { name: "Denise O'Sullivan", position: "MID", averagePoints: 12.7 },
    ],
  },
  {
    name: "Orlando Pride",
    strength: 0.8,
    featured: [
      { name: "Barbra Banda", position: "FWD", averagePoints: 16.1 },
      { name: "Marta", position: "MID", averagePoints: 13.9 },
    ],
  },
  {
    name: "Portland Thorns FC",
    strength: 0.7,
    featured: [
      { name: "Sophia Wilson", position: "FWD", averagePoints: 15.8 },
      { name: "Sam Coffey", position: "MID", averagePoints: 13.5 },
    ],
  },
  {
    name: "Racing Louisville FC",
    strength: 0.15,
    featured: [
      { name: "Savannah DeMelo", position: "MID", averagePoints: 12.9 },
      { name: "Taylor Flint", position: "MID", averagePoints: 12.1 },
    ],
  },
  {
    name: "San Diego Wave FC",
    strength: 0.55,
    featured: [
      { name: "Naomi Girma", position: "DEF", averagePoints: 12.6, availability: "questionable" },
      { name: "Maria Sanchez", position: "MID", averagePoints: 12.9 },
    ],
  },
  {
    name: "Seattle Reign FC",
    strength: 0.3,
    featured: [
      { name: "Jess Fishlock", position: "MID", averagePoints: 12.8 },
      { name: "Jordyn Huitema", position: "FWD", averagePoints: 12.6 },
    ],
  },
  {
    name: "Utah Royals FC",
    strength: 0.0,
    featured: [
      { name: "Ally Sentnor", position: "MID", averagePoints: 12.3 },
      { name: "Kate Del Fava", position: "DEF", averagePoints: 10.5 },
    ],
  },
  {
    name: "Washington Spirit",
    strength: 0.72,
    featured: [
      { name: "Trinity Rodman", position: "FWD", averagePoints: 15.7 },
      { name: "Croix Bethune", position: "MID", averagePoints: 14.1 },
    ],
  },
];

const firstNames = [
  "Avery",
  "Jordan",
  "Sage",
  "Parker",
  "Skylar",
  "Harper",
  "Quinn",
  "Riley",
  "Morgan",
  "Taylor",
  "Cameron",
  "Reese",
  "Kendall",
  "Sydney",
  "Mia",
  "Sloane",
  "Madison",
  "Noa",
  "Reagan",
  "Briar",
  "Lena",
  "Nia",
  "Talia",
  "Camila",
  "Ari",
  "Peyton",
  "Teagan",
  "Dakota",
  "Casey",
  "Amani",
  "Lucia",
  "Elena",
  "Jade",
  "Maren",
  "Kaia",
  "Aubrey",
  "Laila",
  "Nadia",
  "Emery",
  "Zuri",
];

const lastNames = [
  "Hart",
  "Soto",
  "Lin",
  "Bennett",
  "Morris",
  "Park",
  "Molina",
  "Walsh",
  "Mercer",
  "Delgado",
  "Cole",
  "Silva",
  "Brooks",
  "Flores",
  "Nguyen",
  "Vega",
  "Bishop",
  "James",
  "Vasquez",
  "Monroe",
  "Kent",
  "Alvarez",
  "Foster",
  "Kim",
  "Reed",
  "Shaw",
  "Hughes",
  "Castillo",
  "Cruz",
  "Doyle",
  "Wells",
  "Pena",
  "Myers",
  "Lopez",
  "Serrano",
  "West",
  "Blake",
  "Prince",
  "Fox",
  "Carson",
];

const rosterTemplate: Array<{ position: PlayerPosition; averagePoints: number }> = [
  { position: "GK", averagePoints: 9.1 },
  { position: "GK", averagePoints: 8.4 },
  { position: "DEF", averagePoints: 10.7 },
  { position: "DEF", averagePoints: 10.1 },
  { position: "DEF", averagePoints: 9.6 },
  { position: "MID", averagePoints: 12.2 },
  { position: "MID", averagePoints: 11.5 },
  { position: "MID", averagePoints: 10.8 },
  { position: "FWD", averagePoints: 13.8 },
  { position: "FWD", averagePoints: 12.9 },
];

const positionSalaryPremium: Record<PlayerPosition, number> = {
  GK: 0,
  DEF: 1,
  MID: 2,
  FWD: 3,
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildDepthName(clubIndex: number, slotIndex: number) {
  return `${firstNames[(clubIndex * 7 + slotIndex * 3) % firstNames.length]} ${
    lastNames[(clubIndex * 11 + slotIndex * 5) % lastNames.length]
  }`;
}

function buildAvailability(clubIndex: number, slotIndex: number): AvailabilityStatus {
  const marker = (clubIndex + 1) * (slotIndex + 3);

  if (marker % 17 === 0) {
    return "out";
  }

  if (marker % 9 === 0) {
    return "questionable";
  }

  return "available";
}

const legacyFantasyPlayerPool = (() => {
  const usedIds = new Set<string>();
  const players: Omit<FantasyPoolPlayer, "rank">[] = [];

  clubSeeds.forEach((club, clubIndex) => {
    const positionCounts: Record<PlayerPosition, number> = {
      GK: 0,
      DEF: 0,
      MID: 0,
      FWD: 0,
    };

    const featuredByPosition = club.featured.reduce<Record<PlayerPosition, ClubSeed["featured"]>>(
      (accumulator, player) => {
        accumulator[player.position].push(player);
        return accumulator;
      },
      { GK: [], DEF: [], MID: [], FWD: [] }
    );

    rosterTemplate.forEach((slot, slotIndex) => {
      const featuredPlayer = featuredByPosition[slot.position].shift();
      const baseName = featuredPlayer?.name ?? buildDepthName(clubIndex, slotIndex);
      const idBase = slugify(`${club.name}-${baseName}-${slot.position}`);
      let id = idBase;
      let suffix = 2;

      while (usedIds.has(id)) {
        id = `${idBase}-${suffix}`;
        suffix += 1;
      }

      usedIds.add(id);
      positionCounts[slot.position] += 1;

      players.push({
        id,
        display_name: baseName,
        club_name: club.name,
        position: slot.position,
        average_points: Number(
          (
            (featuredPlayer?.averagePoints ??
              slot.averagePoints + club.strength - positionCounts[slot.position] * 0.18) +
            clubIndex * 0.01
          ).toFixed(1)
        ),
        availability:
          featuredPlayer?.availability ?? buildAvailability(clubIndex, slotIndex),
        salary_cost: 0,
      });
    });
  });

  return players
    .sort((left, right) => right.average_points - left.average_points)
    .map((player, index) => ({
      ...player,
      rank: index + 1,
      salary_cost: Math.max(
        6,
        Math.min(
          18,
          Math.round(
            player.average_points * 0.9 +
              positionSalaryPremium[player.position] -
              clubSeeds.find((club) => club.name === player.club_name)!.strength
          )
        )
      ),
    })) satisfies FantasyPoolPlayer[];
})();

export const fantasyPlayerPool: FantasyPoolPlayer[] = officialFantasyPlayerPool;

const fantasyPlayerPoolById = new Map(fantasyPlayerPool.map((player) => [player.id, player]));
const legacyFantasyPlayerPoolById = new Map(
  legacyFantasyPlayerPool.map((player) => [player.id, player])
);

export function getFantasyPlayerPool() {
  return fantasyPlayerPool;
}

export function getFantasyPlayerById(playerId: string) {
  return (
    fantasyPlayerPoolById.get(playerId) ??
    legacyFantasyPlayerPoolById.get(playerId) ??
    null
  );
}
