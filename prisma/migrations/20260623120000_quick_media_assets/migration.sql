-- CreateEnum
CREATE TYPE "QuickMediaAssetType" AS ENUM ('STANDINGS', 'SLOT_LIST', 'ROSTER', 'TOP_10', 'SERIES_STANDINGS');

-- CreateTable
CREATE TABLE "quick_media_assets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quickMatchId" TEXT,
    "quickSeriesId" TEXT,
    "assetType" "QuickMediaAssetType" NOT NULL,
    "r2Key" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/png',
    "filename" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quick_media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quick_media_assets_userId_idx" ON "quick_media_assets"("userId");
CREATE INDEX "quick_media_assets_quickMatchId_createdAt_idx" ON "quick_media_assets"("quickMatchId", "createdAt" DESC);
CREATE INDEX "quick_media_assets_quickSeriesId_createdAt_idx" ON "quick_media_assets"("quickSeriesId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "quick_media_assets" ADD CONSTRAINT "quick_media_assets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quick_media_assets" ADD CONSTRAINT "quick_media_assets_quickMatchId_fkey" FOREIGN KEY ("quickMatchId") REFERENCES "quick_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quick_media_assets" ADD CONSTRAINT "quick_media_assets_quickSeriesId_fkey" FOREIGN KEY ("quickSeriesId") REFERENCES "quick_tournament_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
