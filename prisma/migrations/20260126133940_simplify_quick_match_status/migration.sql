/*
  Warnings:

  - The values [CREATED,SLOTS_UPLOADED,ATTENDANCE_UPLOADED,RESULTS_UPLOADED,PROCESSING,CANCELLED] on the enum `QuickMatchStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."QuickMatchStatus_new" AS ENUM ('ACTIVE', 'COMPLETED', 'ERROR');
ALTER TABLE "public"."quick_matches" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."quick_matches" ALTER COLUMN "status" TYPE "public"."QuickMatchStatus_new" USING ("status"::text::"public"."QuickMatchStatus_new");
ALTER TYPE "public"."QuickMatchStatus" RENAME TO "QuickMatchStatus_old";
ALTER TYPE "public"."QuickMatchStatus_new" RENAME TO "QuickMatchStatus";
DROP TYPE "public"."QuickMatchStatus_old";
COMMIT;

-- AlterTable
ALTER TABLE "public"."quick_matches" ALTER COLUMN "status" DROP DEFAULT;
