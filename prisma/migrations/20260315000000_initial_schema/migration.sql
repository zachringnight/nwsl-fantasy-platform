-- CreateEnum
CREATE TYPE "PlayerPosition" AS ENUM ('GK', 'DEF', 'MID', 'FWD');

-- CreateEnum
CREATE TYPE "PlayerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'INJURED');

-- CreateEnum
CREATE TYPE "LeaguePrivacy" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "LeagueStatus" AS ENUM ('SETUP', 'READY', 'LIVE', 'COMPLETE');

-- CreateEnum
CREATE TYPE "LeagueRole" AS ENUM ('COMMISSIONER', 'MANAGER');

-- CreateEnum
CREATE TYPE "WaiverModel" AS ENUM ('ROLLING_PRIORITY', 'FAAB', 'OPEN_FREE_AGENCY');

-- CreateEnum
CREATE TYPE "LineupLockPolicy" AS ENUM ('WEEKLY', 'PER_MATCH', 'HYBRID');

-- CreateEnum
CREATE TYPE "PositionScope" AS ENUM ('ALL', 'GK', 'DEF', 'MID', 'FWD');

-- CreateEnum
CREATE TYPE "ScoringCategory" AS ENUM ('APPEARANCE', 'MINUTES_60_PLUS', 'GOAL', 'ASSIST', 'CLEAN_SHEET', 'SAVE', 'GOALS_CONCEDED', 'YELLOW_CARD', 'RED_CARD', 'PENALTY_SAVE', 'PENALTY_MISS');

-- CreateEnum
CREATE TYPE "WeekStatus" AS ENUM ('UPCOMING', 'LIVE', 'FINAL');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('SCHEDULED', 'LOBBY', 'LIVE', 'PAUSED', 'COMPLETE');

-- CreateEnum
CREATE TYPE "DraftPickSource" AS ENUM ('MANUAL', 'QUEUE', 'AUTOPICK', 'COMMISSIONER');

-- CreateEnum
CREATE TYPE "LineupSlot" AS ENUM ('GK', 'DEF_1', 'DEF_2', 'MID_1', 'MID_2', 'MID_3', 'FWD_1', 'FWD_2', 'FLEX', 'BENCH_1', 'BENCH_2', 'BENCH_3');

-- CreateEnum
CREATE TYPE "FixtureStatus" AS ENUM ('SCHEDULED', 'LIVE', 'FINAL', 'POSTPONED', 'CANCELED');

-- CreateEnum
CREATE TYPE "FixtureEventType" AS ENUM ('GOAL', 'ASSIST', 'YELLOW_CARD', 'RED_CARD', 'PENALTY_SAVED', 'PENALTY_MISSED', 'SUBSTITUTION', 'CLEAN_SHEET_CONFIRMED');

-- CreateEnum
CREATE TYPE "MatchupOutcome" AS ENUM ('PENDING', 'HOME_WIN', 'AWAY_WIN', 'TIE');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DRAFT', 'WAIVER_ADD', 'FREE_AGENT_ADD', 'DROP', 'COMMISSIONER_MOVE');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'PROCESSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WaiverClaimStatus" AS ENUM ('PENDING', 'WON', 'LOST', 'CANCELED');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'QUESTIONABLE', 'OUT');

-- CreateEnum
CREATE TYPE "ProviderKey" AS ENUM ('API_FOOTBALL', 'NWSL_AVAILABILITY_REPORT', 'NWSL_DATA');

-- CreateEnum
CREATE TYPE "ProviderEntityType" AS ENUM ('CLUB', 'PLAYER', 'FIXTURE', 'STAT_LINE', 'EVENT');

-- CreateEnum
CREATE TYPE "IngestStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DRAFT_STARTING', 'LINEUP_LOCK', 'WAIVER_PROCESSED', 'MATCHUP_RESULT', 'COMMISSIONER_ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'PUSH', 'EMAIL');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AchievementKey" AS ENUM ('FIRST_DRAFT_PICK', 'WIN_STREAK_3', 'WIN_STREAK_5', 'WIN_STREAK_7', 'POINTS_100_WEEK', 'POINTS_150_WEEK', 'PERFECT_LINEUP', 'WAIVER_WIRE_HERO', 'COMEBACK_WIN', 'SEASON_CHAMPION', 'CLEAN_SWEEP', 'TOP_SCORER_WEEK', 'TRADE_PARTNER', 'CHAT_STARTER');

-- CreateEnum
CREATE TYPE "TradeProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'VETOED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TradeVoteDecision" AS ENUM ('APPROVE', 'VETO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL,
    "nwslSlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "currentClubId" TEXT,
    "displayName" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "primaryPosition" "PlayerPosition" NOT NULL,
    "nationality" TEXT,
    "headshotUrl" TEXT,
    "status" "PlayerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "League" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "privacy" "LeaguePrivacy" NOT NULL DEFAULT 'PRIVATE',
    "status" "LeagueStatus" NOT NULL DEFAULT 'SETUP',
    "seasonYear" INTEGER NOT NULL DEFAULT 2026,
    "managerCountTarget" INTEGER NOT NULL DEFAULT 10,
    "commissionerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueSettings" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "rosterSize" INTEGER NOT NULL DEFAULT 12,
    "startingGoalkeepers" INTEGER NOT NULL DEFAULT 1,
    "startingDefenders" INTEGER NOT NULL DEFAULT 2,
    "startingMidfielders" INTEGER NOT NULL DEFAULT 3,
    "startingForwards" INTEGER NOT NULL DEFAULT 2,
    "flexSlots" INTEGER NOT NULL DEFAULT 1,
    "benchSlots" INTEGER NOT NULL DEFAULT 3,
    "maxPlayersPerClub" INTEGER NOT NULL DEFAULT 4,
    "waiverModel" "WaiverModel" NOT NULL DEFAULT 'ROLLING_PRIORITY',
    "waiverRunTime" TEXT NOT NULL DEFAULT '02:00',
    "lineupLockPolicy" "LineupLockPolicy" NOT NULL DEFAULT 'PER_MATCH',
    "playoffsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "playoffTeamCount" INTEGER NOT NULL DEFAULT 4,
    "pickTimerEarlySeconds" INTEGER NOT NULL DEFAULT 75,
    "pickTimerLateSeconds" INTEGER NOT NULL DEFAULT 60,
    "lateRoundStart" INTEGER NOT NULL DEFAULT 9,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueScoringRule" (
    "id" TEXT NOT NULL,
    "leagueSettingsId" TEXT NOT NULL,
    "category" "ScoringCategory" NOT NULL,
    "positionScope" "PositionScope" NOT NULL DEFAULT 'ALL',
    "value" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueScoringRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueInvite" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "inviteUrl" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueMembership" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "LeagueRole" NOT NULL DEFAULT 'MANAGER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyTeam" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "draftSlot" INTEGER,
    "waiverPriority" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FantasyTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueWeek" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isPlayoff" BOOLEAN NOT NULL DEFAULT false,
    "status" "WeekStatus" NOT NULL DEFAULT 'UPCOMING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "roomOpenedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "currentRound" INTEGER NOT NULL DEFAULT 1,
    "currentPickNumber" INTEGER NOT NULL DEFAULT 1,
    "currentSlot" INTEGER,
    "pickTimerEarlySeconds" INTEGER NOT NULL DEFAULT 75,
    "pickTimerLateSeconds" INTEGER NOT NULL DEFAULT 60,
    "lateRoundStart" INTEGER NOT NULL DEFAULT 9,
    "pauseRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftSlot" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "pickInRound" INTEGER NOT NULL,
    "overallPick" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftPick" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "draftSlotId" TEXT NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "overallPick" INTEGER NOT NULL,
    "source" "DraftPickSource" NOT NULL,
    "queuedAtPick" BOOLEAN NOT NULL DEFAULT false,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftQueueItem" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterSpot" (
    "id" TEXT NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "acquisitionType" "TransactionType" NOT NULL,
    "acquisitionSourceId" TEXT,
    "isKeeperEligible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RosterSpot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineupEntry" (
    "id" TEXT NOT NULL,
    "leagueWeekId" TEXT NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "rosterSpotId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "slot" "LineupSlot" NOT NULL,
    "starter" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineupEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fixture" (
    "id" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "providerStatus" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "homeClubId" TEXT NOT NULL,
    "awayClubId" TEXT NOT NULL,
    "venueName" TEXT,
    "status" "FixtureStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fixture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixtureEvent" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "clubId" TEXT,
    "playerId" TEXT,
    "assistingPlayerId" TEXT,
    "payloadId" TEXT,
    "eventType" "FixtureEventType" NOT NULL,
    "minute" INTEGER NOT NULL,
    "stoppageMinute" INTEGER,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixtureEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerMatchStatLine" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "cleanSheet" BOOLEAN NOT NULL DEFAULT false,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "goalsConceded" INTEGER NOT NULL DEFAULT 0,
    "yellowCards" INTEGER NOT NULL DEFAULT 0,
    "redCards" INTEGER NOT NULL DEFAULT 0,
    "penaltySaves" INTEGER NOT NULL DEFAULT 0,
    "penaltyMisses" INTEGER NOT NULL DEFAULT 0,
    "sourcePayloadId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerMatchStatLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyPointSnapshot" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueWeekId" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "statLineId" TEXT,
    "totalPoints" DOUBLE PRECISION NOT NULL,
    "breakdown" JSONB NOT NULL,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FantasyPointSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Matchup" (
    "id" TEXT NOT NULL,
    "leagueWeekId" TEXT NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "homeProjectedPoints" DOUBLE PRECISION,
    "awayProjectedPoints" DOUBLE PRECISION,
    "homeFinalPoints" DOUBLE PRECISION,
    "awayFinalPoints" DOUBLE PRECISION,
    "outcome" "MatchupOutcome" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Matchup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandingEntry" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueWeekId" TEXT NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "ties" INTEGER NOT NULL DEFAULT 0,
    "pointsFor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pointsAgainst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StandingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "fantasyTeamFromId" TEXT,
    "fantasyTeamToId" TEXT,
    "playerId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL,
    "processedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaiverClaim" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "requestedPlayerId" TEXT NOT NULL,
    "dropPlayerId" TEXT,
    "processingWeekId" TEXT NOT NULL,
    "processedTransactionId" TEXT,
    "priorityAtSubmission" INTEGER NOT NULL,
    "bidAmount" INTEGER,
    "status" "WaiverClaimStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WaiverClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityReport" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityReportItem" (
    "id" TEXT NOT NULL,
    "availabilityReportId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "status" "AvailabilityStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityReportItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "key" "ProviderKey" NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderIngestRun" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "status" "IngestStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ProviderIngestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderPayload" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "ingestRunId" TEXT,
    "endpoint" TEXT NOT NULL,
    "entityType" "ProviderEntityType" NOT NULL,
    "externalId" TEXT,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderPayload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderPlayerMap" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "providerPlayerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderPlayerMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderClubMap" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "providerClubId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderClubMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderFixtureMap" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "providerFixtureId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderFixtureMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "draftStarting" BOOLEAN NOT NULL DEFAULT true,
    "lineupLock" BOOLEAN NOT NULL DEFAULT true,
    "waiverProcessed" BOOLEAN NOT NULL DEFAULT true,
    "matchupResult" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leagueId" TEXT,
    "fantasyTeamId" TEXT,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringOverride" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "deltaPoints" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoringOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT,
    "actorUserId" TEXT,
    "actorType" "AuditActorType" NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leagueId" TEXT,
    "key" "AchievementKey" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Streak" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "streakType" TEXT NOT NULL,
    "currentCount" INTEGER NOT NULL DEFAULT 0,
    "bestCount" INTEGER NOT NULL DEFAULT 0,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Streak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeProposal" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "proposerTeamId" TEXT NOT NULL,
    "receiverTeamId" TEXT NOT NULL,
    "status" "TradeProposalStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "reviewPeriodEndsAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "vetoCount" INTEGER NOT NULL DEFAULT 0,
    "vetoThreshold" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeAsset" (
    "id" TEXT NOT NULL,
    "tradeProposalId" TEXT NOT NULL,
    "fromTeamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "playerPosition" "PlayerPosition" NOT NULL,
    "clubName" TEXT NOT NULL,

    CONSTRAINT "TradeAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeVote" (
    "id" TEXT NOT NULL,
    "tradeProposalId" TEXT NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "decision" "TradeVoteDecision" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Club_nwslSlug_key" ON "Club"("nwslSlug");

-- CreateIndex
CREATE UNIQUE INDEX "League_slug_key" ON "League"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueSettings_leagueId_key" ON "LeagueSettings"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueScoringRule_leagueSettingsId_category_positionScope_key" ON "LeagueScoringRule"("leagueSettingsId", "category", "positionScope");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueInvite_code_key" ON "LeagueInvite"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueMembership_leagueId_userId_key" ON "LeagueMembership"("leagueId", "userId");

-- CreateIndex
CREATE INDEX "LeagueMembership_userId_idx" ON "LeagueMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyTeam_membershipId_key" ON "FantasyTeam"("membershipId");

-- CreateIndex
CREATE INDEX "FantasyTeam_leagueId_idx" ON "FantasyTeam"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueWeek_leagueId_sequence_key" ON "LeagueWeek"("leagueId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Draft_leagueId_key" ON "Draft"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftSlot_draftId_round_pickInRound_key" ON "DraftSlot"("draftId", "round", "pickInRound");

-- CreateIndex
CREATE UNIQUE INDEX "DraftSlot_draftId_overallPick_key" ON "DraftSlot"("draftId", "overallPick");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_draftSlotId_key" ON "DraftPick"("draftSlotId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_draftId_playerId_key" ON "DraftPick"("draftId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftQueueItem_draftId_fantasyTeamId_playerId_key" ON "DraftQueueItem"("draftId", "fantasyTeamId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftQueueItem_draftId_fantasyTeamId_position_key" ON "DraftQueueItem"("draftId", "fantasyTeamId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "RosterSpot_fantasyTeamId_playerId_key" ON "RosterSpot"("fantasyTeamId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "LineupEntry_leagueWeekId_fantasyTeamId_slot_key" ON "LineupEntry"("leagueWeekId", "fantasyTeamId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "LineupEntry_leagueWeekId_rosterSpotId_key" ON "LineupEntry"("leagueWeekId", "rosterSpotId");

-- CreateIndex
CREATE INDEX "FixtureEvent_fixtureId_minute_idx" ON "FixtureEvent"("fixtureId", "minute");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerMatchStatLine_fixtureId_playerId_version_key" ON "PlayerMatchStatLine"("fixtureId", "playerId", "version");

-- CreateIndex
CREATE INDEX "PlayerMatchStatLine_fixtureId_playerId_idx" ON "PlayerMatchStatLine"("fixtureId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyPointSnapshot_leagueId_leagueWeekId_fixtureId_playerId_key" ON "FantasyPointSnapshot"("leagueId", "leagueWeekId", "fixtureId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Matchup_leagueWeekId_homeTeamId_key" ON "Matchup"("leagueWeekId", "homeTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "Matchup_leagueWeekId_awayTeamId_key" ON "Matchup"("leagueWeekId", "awayTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "StandingEntry_leagueWeekId_fantasyTeamId_key" ON "StandingEntry"("leagueWeekId", "fantasyTeamId");

-- CreateIndex
CREATE INDEX "StandingEntry_leagueId_rank_idx" ON "StandingEntry"("leagueId", "rank");

-- CreateIndex
CREATE INDEX "Transaction_leagueId_createdAt_idx" ON "Transaction"("leagueId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WaiverClaim_processedTransactionId_key" ON "WaiverClaim"("processedTransactionId");

-- CreateIndex
CREATE INDEX "WaiverClaim_leagueId_status_createdAt_idx" ON "WaiverClaim"("leagueId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityReport_clubId_reportDate_key" ON "AvailabilityReport"("clubId", "reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityReportItem_availabilityReportId_playerId_key" ON "AvailabilityReportItem"("availabilityReportId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_key_key" ON "Provider"("key");

-- CreateIndex
CREATE INDEX "ProviderIngestRun_providerId_startedAt_idx" ON "ProviderIngestRun"("providerId", "startedAt");

-- CreateIndex
CREATE INDEX "ProviderPayload_providerId_entityType_externalId_idx" ON "ProviderPayload"("providerId", "entityType", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderPlayerMap_providerId_providerPlayerId_key" ON "ProviderPlayerMap"("providerId", "providerPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderPlayerMap_providerId_playerId_key" ON "ProviderPlayerMap"("providerId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderClubMap_providerId_providerClubId_key" ON "ProviderClubMap"("providerId", "providerClubId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderClubMap_providerId_clubId_key" ON "ProviderClubMap"("providerId", "clubId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderFixtureMap_providerId_providerFixtureId_key" ON "ProviderFixtureMap"("providerId", "providerFixtureId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderFixtureMap_providerId_fixtureId_key" ON "ProviderFixtureMap"("providerId", "fixtureId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_leagueId_createdAt_idx" ON "AuditLog"("leagueId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_userId_leagueId_key_key" ON "Achievement"("userId", "leagueId", "key");

-- CreateIndex
CREATE INDEX "Achievement_userId_earnedAt_idx" ON "Achievement"("userId", "earnedAt");

-- CreateIndex
CREATE INDEX "Achievement_leagueId_idx" ON "Achievement"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "Streak_userId_leagueId_streakType_key" ON "Streak"("userId", "leagueId", "streakType");

-- CreateIndex
CREATE INDEX "Streak_leagueId_idx" ON "Streak"("leagueId");

-- CreateIndex
CREATE INDEX "ChatMessage_leagueId_createdAt_idx" ON "ChatMessage"("leagueId", "createdAt");

-- CreateIndex
CREATE INDEX "TradeProposal_leagueId_status_createdAt_idx" ON "TradeProposal"("leagueId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TradeProposal_proposerTeamId_idx" ON "TradeProposal"("proposerTeamId");

-- CreateIndex
CREATE INDEX "TradeProposal_receiverTeamId_idx" ON "TradeProposal"("receiverTeamId");

-- CreateIndex
CREATE INDEX "TradeAsset_tradeProposalId_idx" ON "TradeAsset"("tradeProposalId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeVote_tradeProposalId_fantasyTeamId_key" ON "TradeVote"("tradeProposalId", "fantasyTeamId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_currentClubId_fkey" FOREIGN KEY ("currentClubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_commissionerId_fkey" FOREIGN KEY ("commissionerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueSettings" ADD CONSTRAINT "LeagueSettings_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueScoringRule" ADD CONSTRAINT "LeagueScoringRule_leagueSettingsId_fkey" FOREIGN KEY ("leagueSettingsId") REFERENCES "LeagueSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueInvite" ADD CONSTRAINT "LeagueInvite_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueInvite" ADD CONSTRAINT "LeagueInvite_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueMembership" ADD CONSTRAINT "LeagueMembership_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueMembership" ADD CONSTRAINT "LeagueMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTeam" ADD CONSTRAINT "FantasyTeam_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTeam" ADD CONSTRAINT "FantasyTeam_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "LeagueMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueWeek" ADD CONSTRAINT "LeagueWeek_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftSlot" ADD CONSTRAINT "DraftSlot_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftSlot" ADD CONSTRAINT "DraftSlot_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_draftSlotId_fkey" FOREIGN KEY ("draftSlotId") REFERENCES "DraftSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftQueueItem" ADD CONSTRAINT "DraftQueueItem_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftQueueItem" ADD CONSTRAINT "DraftQueueItem_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftQueueItem" ADD CONSTRAINT "DraftQueueItem_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterSpot" ADD CONSTRAINT "RosterSpot_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterSpot" ADD CONSTRAINT "RosterSpot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineupEntry" ADD CONSTRAINT "LineupEntry_leagueWeekId_fkey" FOREIGN KEY ("leagueWeekId") REFERENCES "LeagueWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineupEntry" ADD CONSTRAINT "LineupEntry_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineupEntry" ADD CONSTRAINT "LineupEntry_rosterSpotId_fkey" FOREIGN KEY ("rosterSpotId") REFERENCES "RosterSpot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineupEntry" ADD CONSTRAINT "LineupEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_homeClubId_fkey" FOREIGN KEY ("homeClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_awayClubId_fkey" FOREIGN KEY ("awayClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixtureEvent" ADD CONSTRAINT "FixtureEvent_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixtureEvent" ADD CONSTRAINT "FixtureEvent_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixtureEvent" ADD CONSTRAINT "FixtureEvent_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixtureEvent" ADD CONSTRAINT "FixtureEvent_assistingPlayerId_fkey" FOREIGN KEY ("assistingPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixtureEvent" ADD CONSTRAINT "FixtureEvent_payloadId_fkey" FOREIGN KEY ("payloadId") REFERENCES "ProviderPayload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMatchStatLine" ADD CONSTRAINT "PlayerMatchStatLine_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMatchStatLine" ADD CONSTRAINT "PlayerMatchStatLine_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMatchStatLine" ADD CONSTRAINT "PlayerMatchStatLine_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMatchStatLine" ADD CONSTRAINT "PlayerMatchStatLine_sourcePayloadId_fkey" FOREIGN KEY ("sourcePayloadId") REFERENCES "ProviderPayload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyPointSnapshot" ADD CONSTRAINT "FantasyPointSnapshot_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyPointSnapshot" ADD CONSTRAINT "FantasyPointSnapshot_leagueWeekId_fkey" FOREIGN KEY ("leagueWeekId") REFERENCES "LeagueWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyPointSnapshot" ADD CONSTRAINT "FantasyPointSnapshot_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyPointSnapshot" ADD CONSTRAINT "FantasyPointSnapshot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyPointSnapshot" ADD CONSTRAINT "FantasyPointSnapshot_statLineId_fkey" FOREIGN KEY ("statLineId") REFERENCES "PlayerMatchStatLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matchup" ADD CONSTRAINT "Matchup_leagueWeekId_fkey" FOREIGN KEY ("leagueWeekId") REFERENCES "LeagueWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matchup" ADD CONSTRAINT "Matchup_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matchup" ADD CONSTRAINT "Matchup_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingEntry" ADD CONSTRAINT "StandingEntry_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingEntry" ADD CONSTRAINT "StandingEntry_leagueWeekId_fkey" FOREIGN KEY ("leagueWeekId") REFERENCES "LeagueWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingEntry" ADD CONSTRAINT "StandingEntry_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fantasyTeamFromId_fkey" FOREIGN KEY ("fantasyTeamFromId") REFERENCES "FantasyTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fantasyTeamToId_fkey" FOREIGN KEY ("fantasyTeamToId") REFERENCES "FantasyTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_requestedPlayerId_fkey" FOREIGN KEY ("requestedPlayerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_dropPlayerId_fkey" FOREIGN KEY ("dropPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_processingWeekId_fkey" FOREIGN KEY ("processingWeekId") REFERENCES "LeagueWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_processedTransactionId_fkey" FOREIGN KEY ("processedTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityReport" ADD CONSTRAINT "AvailabilityReport_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityReportItem" ADD CONSTRAINT "AvailabilityReportItem_availabilityReportId_fkey" FOREIGN KEY ("availabilityReportId") REFERENCES "AvailabilityReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityReportItem" ADD CONSTRAINT "AvailabilityReportItem_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderIngestRun" ADD CONSTRAINT "ProviderIngestRun_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderPayload" ADD CONSTRAINT "ProviderPayload_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderPayload" ADD CONSTRAINT "ProviderPayload_ingestRunId_fkey" FOREIGN KEY ("ingestRunId") REFERENCES "ProviderIngestRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderPlayerMap" ADD CONSTRAINT "ProviderPlayerMap_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderPlayerMap" ADD CONSTRAINT "ProviderPlayerMap_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderClubMap" ADD CONSTRAINT "ProviderClubMap_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderClubMap" ADD CONSTRAINT "ProviderClubMap_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderFixtureMap" ADD CONSTRAINT "ProviderFixtureMap_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderFixtureMap" ADD CONSTRAINT "ProviderFixtureMap_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringOverride" ADD CONSTRAINT "ScoringOverride_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringOverride" ADD CONSTRAINT "ScoringOverride_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringOverride" ADD CONSTRAINT "ScoringOverride_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringOverride" ADD CONSTRAINT "ScoringOverride_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "FantasyPointSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringOverride" ADD CONSTRAINT "ScoringOverride_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Streak" ADD CONSTRAINT "Streak_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Streak" ADD CONSTRAINT "Streak_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Streak" ADD CONSTRAINT "Streak_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeProposal" ADD CONSTRAINT "TradeProposal_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeProposal" ADD CONSTRAINT "TradeProposal_proposerTeamId_fkey" FOREIGN KEY ("proposerTeamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeProposal" ADD CONSTRAINT "TradeProposal_receiverTeamId_fkey" FOREIGN KEY ("receiverTeamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAsset" ADD CONSTRAINT "TradeAsset_tradeProposalId_fkey" FOREIGN KEY ("tradeProposalId") REFERENCES "TradeProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAsset" ADD CONSTRAINT "TradeAsset_fromTeamId_fkey" FOREIGN KEY ("fromTeamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAsset" ADD CONSTRAINT "TradeAsset_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeVote" ADD CONSTRAINT "TradeVote_tradeProposalId_fkey" FOREIGN KEY ("tradeProposalId") REFERENCES "TradeProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeVote" ADD CONSTRAINT "TradeVote_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeVote" ADD CONSTRAINT "TradeVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
