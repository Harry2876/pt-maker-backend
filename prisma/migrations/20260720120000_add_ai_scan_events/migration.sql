-- CreateEnum
CREATE TYPE "OcrScanType" AS ENUM ('ATTENDANCE', 'RESULT');

-- CreateTable
CREATE TABLE "ai_scan_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quickMatchId" TEXT NOT NULL,
    "scanType" "OcrScanType" NOT NULL,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "imagesProcessed" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "processingTimeMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_scan_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_scan_events_createdAt_idx" ON "ai_scan_events"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "ai_scan_events_userId_createdAt_idx" ON "ai_scan_events"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ai_scan_events_quickMatchId_createdAt_idx" ON "ai_scan_events"("quickMatchId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ai_scan_events_scanType_createdAt_idx" ON "ai_scan_events"("scanType", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ai_scan_events_success_createdAt_idx" ON "ai_scan_events"("success", "createdAt");

-- AddForeignKey
ALTER TABLE "ai_scan_events" ADD CONSTRAINT "ai_scan_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_scan_events" ADD CONSTRAINT "ai_scan_events_quickMatchId_fkey" FOREIGN KEY ("quickMatchId") REFERENCES "quick_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
