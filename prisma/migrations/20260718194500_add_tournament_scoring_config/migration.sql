-- Add tournament-level scoring config (same shape as quick_matches).
-- Safe for production: additive only, nullable columns, defaults for existing rows.
ALTER TABLE "public"."tournaments" ADD COLUMN IF NOT EXISTS "killPointsValue" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "public"."tournaments" ADD COLUMN IF NOT EXISTS "positionPointsConfig" JSONB;
ALTER TABLE "public"."tournaments" ADD COLUMN IF NOT EXISTS "scoringDescription" TEXT;
