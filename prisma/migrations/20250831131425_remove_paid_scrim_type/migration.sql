/*
  Warnings:

  - The values [PAID_SCRIM] on the enum `TournamentType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."TournamentType_new" AS ENUM ('TOURNAMENT');
ALTER TABLE "public"."tournaments" ALTER COLUMN "tournamentType" DROP DEFAULT;
ALTER TABLE "public"."tournaments" ALTER COLUMN "tournamentType" TYPE "public"."TournamentType_new" USING ("tournamentType"::text::"public"."TournamentType_new");
ALTER TYPE "public"."TournamentType" RENAME TO "TournamentType_old";
ALTER TYPE "public"."TournamentType_new" RENAME TO "TournamentType";
DROP TYPE "public"."TournamentType_old";
ALTER TABLE "public"."tournaments" ALTER COLUMN "tournamentType" SET DEFAULT 'TOURNAMENT';
COMMIT;

-- AlterTable
ALTER TABLE "public"."tournaments" ALTER COLUMN "tournamentType" SET DEFAULT 'TOURNAMENT';
