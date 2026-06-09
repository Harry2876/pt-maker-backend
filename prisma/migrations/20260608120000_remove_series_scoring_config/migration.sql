-- Series scoring is per-match only; remove unused aggregated config columns.
ALTER TABLE "quick_tournament_series" DROP COLUMN IF EXISTS "positionPointsConfig";
ALTER TABLE "quick_tournament_series" DROP COLUMN IF EXISTS "killPointsValue";
ALTER TABLE "quick_tournament_series" DROP COLUMN IF EXISTS "scoringDescription";
