export type LocalExperienceLevel = "new" | "casual" | "experienced";

export interface LocalUser {
  id: string;
  displayName: string;
  email: string;
  favoriteClub?: string;
  experienceLevel?: LocalExperienceLevel;
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LocalLeagueMember {
  userId: string;
  displayName: string;
  teamName: string;
  role: "commissioner" | "manager";
  joinedAt: string;
}

export interface LocalLeague {
  id: string;
  name: string;
  code: string;
  invitePath: string;
  privacy: "private";
  managerCountTarget: number;
  draftAt: string;
  commissionerUserId: string;
  createdAt: string;
  updatedAt: string;
  members: LocalLeagueMember[];
}

export interface LocalAppState {
  currentUserId: string | null;
  users: LocalUser[];
  leagues: LocalLeague[];
}
