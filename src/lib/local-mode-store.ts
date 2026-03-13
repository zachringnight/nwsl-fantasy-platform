import type {
  LocalAppState,
  LocalExperienceLevel,
  LocalLeague,
  LocalLeagueMember,
  LocalUser,
} from "@/types/local-mode";

const STORAGE_KEY = "nwsl_fantasy_phase1_local_state";
const EVENT_NAME = "nwsl-fantasy-local-state";

const defaultState: LocalAppState = {
  currentUserId: null,
  users: [],
  leagues: [],
};

function canUseBrowser() {
  return typeof window !== "undefined";
}

function createId() {
  return canUseBrowser() && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createLeagueCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function emitStateUpdate() {
  if (!canUseBrowser()) {
    return;
  }

  window.dispatchEvent(new Event(EVENT_NAME));
}

export function readLocalAppState(): LocalAppState {
  if (!canUseBrowser()) {
    return defaultState;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return defaultState;
  }

  try {
    return JSON.parse(raw) as LocalAppState;
  } catch {
    return defaultState;
  }
}

export function writeLocalAppState(state: LocalAppState) {
  if (!canUseBrowser()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  emitStateUpdate();
}

export function subscribeToLocalAppState(callback: () => void) {
  if (!canUseBrowser()) {
    return () => undefined;
  }

  const handler = () => callback();

  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", handler);

  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}

export function getCurrentLocalUser() {
  const state = readLocalAppState();
  return state.users.find((user) => user.id === state.currentUserId) ?? null;
}

export function signOutLocalUser() {
  const state = readLocalAppState();
  writeLocalAppState({
    ...state,
    currentUserId: null,
  });
}

export function registerLocalUser(input: {
  displayName: string;
  email: string;
}): LocalUser {
  const state = readLocalAppState();
  const email = input.email.trim().toLowerCase();
  const now = new Date().toISOString();

  const existingUser = state.users.find((user) => user.email === email);

  if (existingUser) {
    const updatedUser: LocalUser = {
      ...existingUser,
      displayName: input.displayName.trim() || existingUser.displayName,
      updatedAt: now,
    };

    writeLocalAppState({
      ...state,
      currentUserId: updatedUser.id,
      users: state.users.map((user) => (user.id === updatedUser.id ? updatedUser : user)),
    });

    return updatedUser;
  }

  const user: LocalUser = {
    id: createId(),
    displayName: input.displayName.trim(),
    email,
    onboardingComplete: false,
    createdAt: now,
    updatedAt: now,
  };

  writeLocalAppState({
    currentUserId: user.id,
    users: [user, ...state.users],
    leagues: state.leagues,
  });

  return user;
}

export function loginLocalUser(emailInput: string) {
  const state = readLocalAppState();
  const email = emailInput.trim().toLowerCase();
  const user = state.users.find((entry) => entry.email === email) ?? null;

  if (!user) {
    return null;
  }

  writeLocalAppState({
    ...state,
    currentUserId: user.id,
  });

  return user;
}

export function completeLocalOnboarding(input: {
  favoriteClub: string;
  experienceLevel: LocalExperienceLevel;
}) {
  const state = readLocalAppState();

  if (!state.currentUserId) {
    return null;
  }

  const updatedAt = new Date().toISOString();
  let updatedUser: LocalUser | null = null;

  const users = state.users.map((user) => {
    if (user.id !== state.currentUserId) {
      return user;
    }

    updatedUser = {
      ...user,
      favoriteClub: input.favoriteClub,
      experienceLevel: input.experienceLevel,
      onboardingComplete: true,
      updatedAt,
    };

    return updatedUser;
  });

  if (!updatedUser) {
    return null;
  }

  writeLocalAppState({
    ...state,
    users,
  });

  return updatedUser;
}

function buildMember(user: LocalUser, role: LocalLeagueMember["role"]): LocalLeagueMember {
  return {
    userId: user.id,
    displayName: user.displayName,
    teamName: `${user.displayName} FC`,
    role,
    joinedAt: new Date().toISOString(),
  };
}

export function createLocalLeague(input: {
  name: string;
  draftAt: string;
  managerCountTarget: number;
}) {
  const state = readLocalAppState();
  const user = getCurrentLocalUser();

  if (!user) {
    return null;
  }

  const code = createLeagueCode();
  const now = new Date().toISOString();
  const league: LocalLeague = {
    id: createId(),
    name: input.name.trim(),
    code,
    invitePath: `/leagues/join?code=${code}`,
    privacy: "private",
    managerCountTarget: input.managerCountTarget,
    draftAt: input.draftAt,
    commissionerUserId: user.id,
    createdAt: now,
    updatedAt: now,
    members: [buildMember(user, "commissioner")],
  };

  writeLocalAppState({
    ...state,
    leagues: [league, ...state.leagues],
  });

  return league;
}

export function joinLocalLeagueByCode(codeInput: string) {
  const state = readLocalAppState();
  const user = getCurrentLocalUser();
  const code = codeInput.trim().toUpperCase();

  if (!user) {
    return { league: null, error: "You need an account before joining a league." };
  }

  const targetLeague = state.leagues.find((league) => league.code === code);

  if (!targetLeague) {
    return { league: null, error: "That league code does not exist." };
  }

  if (
    targetLeague.members.length >= targetLeague.managerCountTarget &&
    !targetLeague.members.some((member) => member.userId === user.id)
  ) {
    return { league: null, error: "That league is already full." };
  }

  if (targetLeague.members.some((member) => member.userId === user.id)) {
    return { league: targetLeague, error: null };
  }

  const updatedLeague: LocalLeague = {
    ...targetLeague,
    updatedAt: new Date().toISOString(),
    members: [...targetLeague.members, buildMember(user, "manager")],
  };

  writeLocalAppState({
    ...state,
    leagues: state.leagues.map((league) =>
      league.id === updatedLeague.id ? updatedLeague : league
    ),
  });

  return { league: updatedLeague, error: null };
}

export function getLeaguesForCurrentUser() {
  const user = getCurrentLocalUser();

  if (!user) {
    return [];
  }

  return readLocalAppState().leagues.filter((league) =>
    league.members.some((member) => member.userId === user.id)
  );
}

export function getLeagueById(leagueId: string) {
  return readLocalAppState().leagues.find((league) => league.id === leagueId) ?? null;
}
