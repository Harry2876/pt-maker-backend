-- CreateTable
CREATE TABLE "public"."quick_match_crops" (
    "id" TEXT NOT NULL,
    "quickMatchId" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "cropUrl" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "cropData" JSONB NOT NULL,
    "cropType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quick_match_crops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quick_match_crops_quickMatchId_cropType_idx" ON "public"."quick_match_crops"("quickMatchId", "cropType");

-- CreateIndex
CREATE INDEX "quick_match_crops_quickMatchId_isActive_idx" ON "public"."quick_match_crops"("quickMatchId", "isActive");

-- CreateIndex
CREATE INDEX "quick_match_crops_expiresAt_idx" ON "public"."quick_match_crops"("expiresAt");

-- AddForeignKey
ALTER TABLE "public"."quick_match_crops" ADD CONSTRAINT "quick_match_crops_quickMatchId_fkey" FOREIGN KEY ("quickMatchId") REFERENCES "public"."quick_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
