-- CreateEnum
CREATE TYPE "public"."TieBreakingRuleType" AS ENUM ('KILL_POINTS', 'PLACEMENT_POINTS', 'TOTAL_POINTS', 'CUSTOM_FIELD', 'MANUAL');

-- CreateEnum
CREATE TYPE "public"."TieBreakingEntityType" AS ENUM ('MATCH', 'SERIES');

-- CreateEnum
CREATE TYPE "public"."ConflictStatus" AS ENUM ('DETECTED', 'RESOLVED_AUTO', 'RESOLVED_MANUAL', 'IGNORED');

-- CreateTable
CREATE TABLE "public"."tie_breaking_configs" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityType" "public"."TieBreakingEntityType" NOT NULL,
    "autoResolveEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "tie_breaking_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tie_breaking_rules" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "type" "public"."TieBreakingRuleType" NOT NULL,
    "priority" INTEGER NOT NULL,
    "ascending" BOOLEAN NOT NULL DEFAULT false,
    "fieldName" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tie_breaking_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."conflict_groups" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "status" "public"."ConflictStatus" NOT NULL DEFAULT 'DETECTED',
    "conflictKey" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "reason" TEXT,

    CONSTRAINT "conflict_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."manual_tie_breaking" (
    "id" TEXT NOT NULL,
    "conflictGroupId" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "finalPosition" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_tie_breaking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tie_breaking_configs_entityId_entityType_key" ON "public"."tie_breaking_configs"("entityId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "tie_breaking_rules_configId_priority_key" ON "public"."tie_breaking_rules"("configId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "manual_tie_breaking_conflictGroupId_resultId_key" ON "public"."manual_tie_breaking"("conflictGroupId", "resultId");

-- CreateIndex
CREATE UNIQUE INDEX "manual_tie_breaking_conflictGroupId_finalPosition_key" ON "public"."manual_tie_breaking"("conflictGroupId", "finalPosition");

-- AddForeignKey
ALTER TABLE "public"."tie_breaking_configs" ADD CONSTRAINT "tie_breaking_configs_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tie_breaking_rules" ADD CONSTRAINT "tie_breaking_rules_configId_fkey" FOREIGN KEY ("configId") REFERENCES "public"."tie_breaking_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conflict_groups" ADD CONSTRAINT "conflict_groups_configId_fkey" FOREIGN KEY ("configId") REFERENCES "public"."tie_breaking_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conflict_groups" ADD CONSTRAINT "conflict_groups_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."manual_tie_breaking" ADD CONSTRAINT "manual_tie_breaking_conflictGroupId_fkey" FOREIGN KEY ("conflictGroupId") REFERENCES "public"."conflict_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
