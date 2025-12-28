-- CreateEnum
CREATE TYPE "public"."QuickSeriesStatus" AS ENUM ('CREATED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "public"."quick_tournament_series" (
    "id" TEXT NOT NULL,
    "seriesName" TEXT NOT NULL,
    "game" TEXT NOT NULL DEFAULT 'BGMI',
    "totalMatches" INTEGER NOT NULL DEFAULT 3,
    "matchesCompleted" INTEGER NOT NULL DEFAULT 0,
    "status" "public"."QuickSeriesStatus" NOT NULL DEFAULT 'CREATED',
    "positionPointsConfig" JSONB,
    "killPointsValue" INTEGER NOT NULL DEFAULT 1,
    "scoringDescription" TEXT,
    "currentMatchNumber" INTEGER NOT NULL DEFAULT 1,
    "isFinished" BOOLEAN NOT NULL DEFAULT false,
    "winnerTeamName" TEXT,
    "finalStandings" JSONB,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quick_tournament_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."quick_series_matches" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "quickMatchId" TEXT NOT NULL,
    "matchOrder" INTEGER NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "matchWeight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "bonusPoints" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quick_series_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."quick_series_leaderboards" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "leaderboardData" JSONB NOT NULL,
    "lastUpdatedMatch" INTEGER NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quick_series_leaderboards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quick_tournament_series_userId_createdAt_idx" ON "public"."quick_tournament_series"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "quick_tournament_series_status_createdAt_idx" ON "public"."quick_tournament_series"("status", "createdAt");

-- CreateIndex
CREATE INDEX "quick_tournament_series_userId_status_idx" ON "public"."quick_tournament_series"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quick_series_matches_quickMatchId_key" ON "public"."quick_series_matches"("quickMatchId");

-- CreateIndex
CREATE INDEX "quick_series_matches_seriesId_matchOrder_idx" ON "public"."quick_series_matches"("seriesId", "matchOrder");

-- CreateIndex
CREATE INDEX "quick_series_matches_quickMatchId_idx" ON "public"."quick_series_matches"("quickMatchId");

-- CreateIndex
CREATE UNIQUE INDEX "quick_series_matches_seriesId_matchOrder_key" ON "public"."quick_series_matches"("seriesId", "matchOrder");

-- CreateIndex
CREATE UNIQUE INDEX "quick_series_leaderboards_seriesId_key" ON "public"."quick_series_leaderboards"("seriesId");

-- CreateIndex
CREATE INDEX "quick_series_leaderboards_seriesId_idx" ON "public"."quick_series_leaderboards"("seriesId");

-- AddForeignKey
ALTER TABLE "public"."quick_tournament_series" ADD CONSTRAINT "quick_tournament_series_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."quick_series_matches" ADD CONSTRAINT "quick_series_matches_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "public"."quick_tournament_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."quick_series_matches" ADD CONSTRAINT "quick_series_matches_quickMatchId_fkey" FOREIGN KEY ("quickMatchId") REFERENCES "public"."quick_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."quick_series_leaderboards" ADD CONSTRAINT "quick_series_leaderboards_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "public"."quick_tournament_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
