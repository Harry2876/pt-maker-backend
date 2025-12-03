-- AlterTable
ALTER TABLE "public"."quick_matches" ADD COLUMN     "killPointsValue" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "positionPointsConfig" JSONB,
ADD COLUMN     "scoringDescription" TEXT;
