-- CreateEnum
CREATE TYPE "public"."QuickMatchStatus" AS ENUM ('CREATED', 'SLOTS_UPLOADED', 'ATTENDANCE_UPLOADED', 'RESULTS_UPLOADED', 'PROCESSING', 'COMPLETED', 'ERROR', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."QuickScreenshotType" AS ENUM ('ATTENDANCE', 'RESULT');

-- CreateEnum
CREATE TYPE "public"."SlotStatus" AS ENUM ('PENDING', 'DETECTED', 'MATCHED', 'NOT_FOUND');

-- CreateTable
CREATE TABLE "public"."quick_matches" (
    "id" TEXT NOT NULL,
    "matchName" TEXT NOT NULL,
    "game" TEXT NOT NULL DEFAULT 'BGMI',
    "map" TEXT,
    "status" "public"."QuickMatchStatus" NOT NULL DEFAULT 'CREATED',
    "processingStep" TEXT,
    "aiProcessingId" TEXT,
    "teamsDetected" INTEGER NOT NULL DEFAULT 0,
    "warningsCount" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quick_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."quick_slot_assignments" (
    "id" TEXT NOT NULL,
    "quickMatchId" TEXT NOT NULL,
    "slotNumber" INTEGER NOT NULL,
    "teamName" TEXT NOT NULL,
    "playerNames" JSONB,
    "status" "public"."SlotStatus" NOT NULL DEFAULT 'PENDING',
    "detectedInAttendance" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quick_slot_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."quick_screenshots" (
    "id" TEXT NOT NULL,
    "quickMatchId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "type" "public"."QuickScreenshotType" NOT NULL,
    "pageNumber" INTEGER,
    "isProcessed" BOOLEAN NOT NULL DEFAULT false,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quick_screenshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."quick_match_results" (
    "id" TEXT NOT NULL,
    "quickMatchId" TEXT NOT NULL,
    "slotNumber" INTEGER NOT NULL,
    "teamName" TEXT NOT NULL,
    "detectedTeamName" TEXT,
    "position" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "totalKills" INTEGER NOT NULL,
    "positionPoints" INTEGER NOT NULL,
    "killPoints" INTEGER NOT NULL,
    "totalPoints" INTEGER NOT NULL,
    "playerResults" JSONB,
    "status" "public"."ResultStatus" NOT NULL DEFAULT 'PENDING',
    "warningType" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "aiConfidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quick_match_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."quick_points_tables" (
    "id" TEXT NOT NULL,
    "quickMatchId" TEXT NOT NULL,
    "tableImageUrl" TEXT,
    "csvData" JSONB,
    "pngGeneratedAt" TIMESTAMP(3),
    "generationTimeMs" INTEGER,
    "template" TEXT NOT NULL DEFAULT 'default',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quick_points_tables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quick_matches_userId_createdAt_idx" ON "public"."quick_matches"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "quick_matches_status_createdAt_idx" ON "public"."quick_matches"("status", "createdAt");

-- CreateIndex
CREATE INDEX "quick_matches_userId_status_idx" ON "public"."quick_matches"("userId", "status");

-- CreateIndex
CREATE INDEX "quick_slot_assignments_quickMatchId_status_idx" ON "public"."quick_slot_assignments"("quickMatchId", "status");

-- CreateIndex
CREATE INDEX "quick_slot_assignments_quickMatchId_teamName_idx" ON "public"."quick_slot_assignments"("quickMatchId", "teamName");

-- CreateIndex
CREATE UNIQUE INDEX "quick_slot_assignments_quickMatchId_slotNumber_key" ON "public"."quick_slot_assignments"("quickMatchId", "slotNumber");

-- CreateIndex
CREATE INDEX "quick_screenshots_quickMatchId_type_idx" ON "public"."quick_screenshots"("quickMatchId", "type");

-- CreateIndex
CREATE INDEX "quick_screenshots_quickMatchId_isProcessed_idx" ON "public"."quick_screenshots"("quickMatchId", "isProcessed");

-- CreateIndex
CREATE INDEX "quick_match_results_quickMatchId_totalPoints_idx" ON "public"."quick_match_results"("quickMatchId", "totalPoints" DESC);

-- CreateIndex
CREATE INDEX "quick_match_results_quickMatchId_needsReview_idx" ON "public"."quick_match_results"("quickMatchId", "needsReview");

-- CreateIndex
CREATE INDEX "quick_match_results_quickMatchId_position_idx" ON "public"."quick_match_results"("quickMatchId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "quick_match_results_quickMatchId_slotNumber_key" ON "public"."quick_match_results"("quickMatchId", "slotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "quick_points_tables_quickMatchId_key" ON "public"."quick_points_tables"("quickMatchId");

-- CreateIndex
CREATE INDEX "quick_points_tables_quickMatchId_idx" ON "public"."quick_points_tables"("quickMatchId");

-- CreateIndex
CREATE INDEX "quick_points_tables_expiresAt_idx" ON "public"."quick_points_tables"("expiresAt");

-- AddForeignKey
ALTER TABLE "public"."quick_matches" ADD CONSTRAINT "quick_matches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."quick_slot_assignments" ADD CONSTRAINT "quick_slot_assignments_quickMatchId_fkey" FOREIGN KEY ("quickMatchId") REFERENCES "public"."quick_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."quick_screenshots" ADD CONSTRAINT "quick_screenshots_quickMatchId_fkey" FOREIGN KEY ("quickMatchId") REFERENCES "public"."quick_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."quick_match_results" ADD CONSTRAINT "quick_match_results_quickMatchId_fkey" FOREIGN KEY ("quickMatchId") REFERENCES "public"."quick_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."quick_points_tables" ADD CONSTRAINT "quick_points_tables_quickMatchId_fkey" FOREIGN KEY ("quickMatchId") REFERENCES "public"."quick_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
