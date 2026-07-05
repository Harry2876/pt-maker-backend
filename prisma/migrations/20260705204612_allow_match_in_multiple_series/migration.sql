/*
  Warnings:

  - A unique constraint covering the columns `[seriesId,quickMatchId]` on the table `quick_series_matches` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "quick_series_matches_quickMatchId_key";

-- CreateIndex
CREATE UNIQUE INDEX "quick_series_matches_seriesId_quickMatchId_key" ON "quick_series_matches"("seriesId", "quickMatchId");
