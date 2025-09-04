/*
  Warnings:

  - You are about to drop the column `bonusRules` on the `scoring_rules` table. All the data in the column will be lost.
  - You are about to drop the column `positionPoints` on the `scoring_rules` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[tournamentId,priority]` on the table `scoring_rules` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `createdBy` to the `scoring_rules` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ruleName` to the `scoring_rules` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ruleType` to the `scoring_rules` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."scoring_rules_tournamentId_key";

-- AlterTable
ALTER TABLE "public"."scoring_rules" DROP COLUMN "bonusRules",
DROP COLUMN "positionPoints",
ADD COLUMN     "createdBy" TEXT NOT NULL,
ADD COLUMN     "customFormula" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "positionMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "ruleName" TEXT NOT NULL,
ADD COLUMN     "ruleType" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "scoring_rules_tournamentId_priority_key" ON "public"."scoring_rules"("tournamentId", "priority");
