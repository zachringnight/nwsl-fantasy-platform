import {
  addPlayerToDraftQueue,
  autopickCurrentDraftTurn,
  autofillRosterLineup,
  autofillSalaryCapEntry,
  cancelWaiverClaim,
  clearSalaryCapEntry,
  createHostedLeague,
  ensureCurrentProfile,
  ensureHostedSession,
  fetchCurrentProfile,
  joinHostedLeagueByCode,
  loadLeagueById,
  loadLeagueMatchup,
  loadLeaguePlayerListings,
  loadLeagueStandings,
  loadMyLeagues,
  loadRosterState,
  loadSalaryCapEntryState,
  loadDraftState,
  loadTransactionHub,
  makeDraftPick,
  moveDraftQueueItem,
  processWaiverClaims,
  revealDraftOrder,
  removePlayerFromDraftQueue,
  reopenSalaryCapEntry,
  saveRosterLineup,
  saveSalaryCapEntry,
  submitWaiverClaim,
  submitSalaryCapEntry,
  updateDraftStatus,
  updateLeagueSettings,
  upsertFantasyProfile,
} from "@/lib/fantasy-api";

export interface FantasyDataClient {
  addPlayerToDraftQueue: typeof addPlayerToDraftQueue;
  autopickCurrentDraftTurn: typeof autopickCurrentDraftTurn;
  autofillRosterLineup: typeof autofillRosterLineup;
  autofillSalaryCapEntry: typeof autofillSalaryCapEntry;
  cancelWaiverClaim: typeof cancelWaiverClaim;
  clearSalaryCapEntry: typeof clearSalaryCapEntry;
  createHostedLeague: typeof createHostedLeague;
  ensureCurrentProfile: typeof ensureCurrentProfile;
  ensureHostedSession: typeof ensureHostedSession;
  fetchCurrentProfile: typeof fetchCurrentProfile;
  joinHostedLeagueByCode: typeof joinHostedLeagueByCode;
  loadLeagueById: typeof loadLeagueById;
  loadLeagueMatchup: typeof loadLeagueMatchup;
  loadLeaguePlayerListings: typeof loadLeaguePlayerListings;
  loadLeagueStandings: typeof loadLeagueStandings;
  loadMyLeagues: typeof loadMyLeagues;
  loadRosterState: typeof loadRosterState;
  loadSalaryCapEntryState: typeof loadSalaryCapEntryState;
  loadDraftState: typeof loadDraftState;
  loadTransactionHub: typeof loadTransactionHub;
  makeDraftPick: typeof makeDraftPick;
  moveDraftQueueItem: typeof moveDraftQueueItem;
  processWaiverClaims: typeof processWaiverClaims;
  revealDraftOrder: typeof revealDraftOrder;
  removePlayerFromDraftQueue: typeof removePlayerFromDraftQueue;
  reopenSalaryCapEntry: typeof reopenSalaryCapEntry;
  saveRosterLineup: typeof saveRosterLineup;
  saveSalaryCapEntry: typeof saveSalaryCapEntry;
  submitWaiverClaim: typeof submitWaiverClaim;
  submitSalaryCapEntry: typeof submitSalaryCapEntry;
  updateDraftStatus: typeof updateDraftStatus;
  updateLeagueSettings: typeof updateLeagueSettings;
  upsertFantasyProfile: typeof upsertFantasyProfile;
}

export const supabaseFantasyDataClient: FantasyDataClient = {
  addPlayerToDraftQueue,
  autopickCurrentDraftTurn,
  autofillRosterLineup,
  autofillSalaryCapEntry,
  cancelWaiverClaim,
  clearSalaryCapEntry,
  createHostedLeague,
  ensureCurrentProfile,
  ensureHostedSession,
  fetchCurrentProfile,
  joinHostedLeagueByCode,
  loadLeagueById,
  loadLeagueMatchup,
  loadLeaguePlayerListings,
  loadLeagueStandings,
  loadMyLeagues,
  loadRosterState,
  loadSalaryCapEntryState,
  loadDraftState,
  loadTransactionHub,
  makeDraftPick,
  moveDraftQueueItem,
  processWaiverClaims,
  revealDraftOrder,
  removePlayerFromDraftQueue,
  reopenSalaryCapEntry,
  saveRosterLineup,
  saveSalaryCapEntry,
  submitWaiverClaim,
  submitSalaryCapEntry,
  updateDraftStatus,
  updateLeagueSettings,
  upsertFantasyProfile,
};
