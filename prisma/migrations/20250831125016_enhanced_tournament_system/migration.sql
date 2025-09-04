-- CreateEnum
CREATE TYPE "public"."TournamentFormat" AS ENUM ('ELIMINATION', 'ROUND_ROBIN', 'MIXED');

-- CreateEnum
CREATE TYPE "public"."StageFormat" AS ENUM ('ELIMINATION', 'ROUND_ROBIN');

-- CreateEnum
CREATE TYPE "public"."ResultStatus" AS ENUM ('PENDING', 'PROCESSED', 'VERIFIED', 'MANUAL_ENTRY');

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('OWNER', 'ADMIN', 'MODERATOR', 'RESULT_VERIFIER', 'VIEWER');

-- CreateEnum
CREATE TYPE "public"."CollaboratorStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "public"."groups" ADD COLUMN     "matchCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "maxSlots" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN     "stageId" TEXT;

-- AlterTable
ALTER TABLE "public"."matches" ADD COLUMN     "resultStatus" "public"."ResultStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "stageNumber" INTEGER;

-- AlterTable
ALTER TABLE "public"."team_registrations" ADD COLUMN     "currentStage" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "playerDetails" JSONB,
ADD COLUMN     "slotNumber" INTEGER;

-- AlterTable
ALTER TABLE "public"."tournaments" ADD COLUMN     "allowCollaborators" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "currentStage" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "maxTeamsPerGroup" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN     "registrationFields" JSONB,
ADD COLUMN     "totalStages" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "tournamentFormat" "public"."TournamentFormat" NOT NULL DEFAULT 'ELIMINATION';

-- CreateTable
CREATE TABLE "public"."tournament_collaborators" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."UserRole" NOT NULL DEFAULT 'VIEWER',
    "status" "public"."CollaboratorStatus" NOT NULL DEFAULT 'PENDING',
    "invitedBy" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tournament_stages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stageNumber" INTEGER NOT NULL,
    "totalGroups" INTEGER NOT NULL DEFAULT 1,
    "qualificationSpots" INTEGER NOT NULL DEFAULT 8,
    "stageFormat" "public"."StageFormat" NOT NULL DEFAULT 'ELIMINATION',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tournamentId" TEXT NOT NULL,

    CONSTRAINT "tournament_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."players" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gameUuid" TEXT,
    "email" TEXT,
    "phoneNumber" TEXT,
    "totalMatches" INTEGER NOT NULL DEFAULT 0,
    "totalKills" INTEGER NOT NULL DEFAULT 0,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "averageKills" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bestPosition" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."player_stats" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "matches" INTEGER NOT NULL DEFAULT 0,
    "totalKills" INTEGER NOT NULL DEFAULT 0,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "averageKills" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bestPosition" INTEGER,

    CONSTRAINT "player_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."slot_assignments" (
    "id" TEXT NOT NULL,
    "slotNumber" INTEGER NOT NULL,
    "groupId" TEXT NOT NULL,
    "teamRegistrationId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT NOT NULL,

    CONSTRAINT "slot_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."scoring_rules" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "killPoints" INTEGER NOT NULL DEFAULT 1,
    "positionPoints" JSONB NOT NULL,
    "bonusRules" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scoring_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."match_results" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "teamRegistrationId" TEXT NOT NULL,
    "slotNumber" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "totalKills" INTEGER NOT NULL,
    "killPoints" INTEGER NOT NULL,
    "positionPoints" INTEGER NOT NULL,
    "totalMatchPoints" INTEGER NOT NULL,
    "playerResults" JSONB NOT NULL,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tournament_collaborators_tournamentId_userId_key" ON "public"."tournament_collaborators"("tournamentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "player_stats_playerId_tournamentId_key" ON "public"."player_stats"("playerId", "tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "slot_assignments_groupId_slotNumber_key" ON "public"."slot_assignments"("groupId", "slotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "scoring_rules_tournamentId_key" ON "public"."scoring_rules"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "match_results_matchId_teamRegistrationId_key" ON "public"."match_results"("matchId", "teamRegistrationId");

-- AddForeignKey
ALTER TABLE "public"."tournament_collaborators" ADD CONSTRAINT "tournament_collaborators_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_collaborators" ADD CONSTRAINT "tournament_collaborators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_collaborators" ADD CONSTRAINT "tournament_collaborators_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_stages" ADD CONSTRAINT "tournament_stages_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."player_stats" ADD CONSTRAINT "player_stats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."player_stats" ADD CONSTRAINT "player_stats_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."slot_assignments" ADD CONSTRAINT "slot_assignments_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."slot_assignments" ADD CONSTRAINT "slot_assignments_teamRegistrationId_fkey" FOREIGN KEY ("teamRegistrationId") REFERENCES "public"."team_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."slot_assignments" ADD CONSTRAINT "slot_assignments_assignedBy_fkey" FOREIGN KEY ("assignedBy") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."scoring_rules" ADD CONSTRAINT "scoring_rules_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."match_results" ADD CONSTRAINT "match_results_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "public"."matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."match_results" ADD CONSTRAINT "match_results_teamRegistrationId_fkey" FOREIGN KEY ("teamRegistrationId") REFERENCES "public"."team_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."match_results" ADD CONSTRAINT "match_results_verifiedBy_fkey" FOREIGN KEY ("verifiedBy") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."groups" ADD CONSTRAINT "groups_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "public"."tournament_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
