-- CreateEnum
CREATE TYPE "public"."RegistrationStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."QueueStatus" AS ENUM ('QUEUED', 'ASSIGNED', 'WAITING_LIST', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."MeritAction" AS ENUM ('GOOD_REGISTRATION', 'ATTENDED_MATCH', 'SLOT_WASTE', 'BAN_VIOLATION', 'ADMIN_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "public"."PunishmentType" AS ENUM ('TEMPORARY_BAN', 'PERMANENT_BAN', 'SLOT_WASTE_BAN', 'MERIT_REDUCTION', 'WARNING');

-- CreateEnum
CREATE TYPE "public"."DelayType" AS ENUM ('REGISTRATION_COOLDOWN', 'PUNISHMENT_DELAY', 'ADMIN_IMPOSED');

-- CreateTable
CREATE TABLE "public"."discord_registration_sessions" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "groupId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "maxSlots" INTEGER NOT NULL DEFAULT 21,
    "currentSlots" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "duration" INTEGER NOT NULL DEFAULT 30,
    "status" "public"."RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_registration_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."discord_registration_queue" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userDiscord" TEXT NOT NULL,
    "merit" INTEGER NOT NULL DEFAULT 100,
    "position" INTEGER NOT NULL,
    "status" "public"."QueueStatus" NOT NULL DEFAULT 'QUEUED',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedSlot" INTEGER,
    "assignedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "discord_registration_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."discord_team_merit" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "currentMerit" INTEGER NOT NULL DEFAULT 100,
    "totalEarned" INTEGER NOT NULL DEFAULT 0,
    "totalLost" INTEGER NOT NULL DEFAULT 0,
    "lastAction" "public"."MeritAction",
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "notes" TEXT,

    CONSTRAINT "discord_team_merit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."discord_registration_delays" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "teamName" TEXT,
    "delayType" "public"."DelayType" NOT NULL DEFAULT 'REGISTRATION_COOLDOWN',
    "delayMinutes" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "setBy" TEXT NOT NULL,
    "setByName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discord_registration_delays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."discord_registration_toggles" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "toggledBy" TEXT NOT NULL,
    "toggledByName" TEXT NOT NULL,
    "toggledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "toggleCount" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,

    CONSTRAINT "discord_registration_toggles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."discord_team_bans" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "punishmentType" "public"."PunishmentType" NOT NULL,
    "reason" TEXT NOT NULL,
    "bannedBy" TEXT NOT NULL,
    "bannedByName" TEXT NOT NULL,
    "bannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "appealNotes" TEXT,

    CONSTRAINT "discord_team_bans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "discord_registration_sessions_guildId_idx" ON "public"."discord_registration_sessions"("guildId");

-- CreateIndex
CREATE INDEX "discord_registration_sessions_channelId_idx" ON "public"."discord_registration_sessions"("channelId");

-- CreateIndex
CREATE INDEX "discord_registration_sessions_status_idx" ON "public"."discord_registration_sessions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "discord_registration_sessions_guildId_channelId_key" ON "public"."discord_registration_sessions"("guildId", "channelId");

-- CreateIndex
CREATE INDEX "discord_registration_queue_sessionId_idx" ON "public"."discord_registration_queue"("sessionId");

-- CreateIndex
CREATE INDEX "discord_registration_queue_guildId_idx" ON "public"."discord_registration_queue"("guildId");

-- CreateIndex
CREATE INDEX "discord_registration_queue_merit_idx" ON "public"."discord_registration_queue"("merit");

-- CreateIndex
CREATE INDEX "discord_registration_queue_status_idx" ON "public"."discord_registration_queue"("status");

-- CreateIndex
CREATE UNIQUE INDEX "discord_registration_queue_sessionId_teamName_key" ON "public"."discord_registration_queue"("sessionId", "teamName");

-- CreateIndex
CREATE INDEX "discord_team_merit_guildId_idx" ON "public"."discord_team_merit"("guildId");

-- CreateIndex
CREATE INDEX "discord_team_merit_currentMerit_idx" ON "public"."discord_team_merit"("currentMerit");

-- CreateIndex
CREATE UNIQUE INDEX "discord_team_merit_guildId_teamName_key" ON "public"."discord_team_merit"("guildId", "teamName");

-- CreateIndex
CREATE INDEX "discord_registration_delays_guildId_idx" ON "public"."discord_registration_delays"("guildId");

-- CreateIndex
CREATE INDEX "discord_registration_delays_expiresAt_idx" ON "public"."discord_registration_delays"("expiresAt");

-- CreateIndex
CREATE INDEX "discord_registration_delays_isActive_idx" ON "public"."discord_registration_delays"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "discord_registration_toggles_guildId_key" ON "public"."discord_registration_toggles"("guildId");

-- CreateIndex
CREATE INDEX "discord_registration_toggles_enabled_idx" ON "public"."discord_registration_toggles"("enabled");

-- CreateIndex
CREATE INDEX "discord_team_bans_guildId_idx" ON "public"."discord_team_bans"("guildId");

-- CreateIndex
CREATE INDEX "discord_team_bans_isActive_idx" ON "public"."discord_team_bans"("isActive");

-- CreateIndex
CREATE INDEX "discord_team_bans_endTime_idx" ON "public"."discord_team_bans"("endTime");

-- CreateIndex
CREATE UNIQUE INDEX "discord_team_bans_guildId_teamName_key" ON "public"."discord_team_bans"("guildId", "teamName");

-- AddForeignKey
ALTER TABLE "public"."discord_registration_sessions" ADD CONSTRAINT "discord_registration_sessions_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "public"."discord_guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."discord_registration_queue" ADD CONSTRAINT "discord_registration_queue_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."discord_registration_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."discord_team_merit" ADD CONSTRAINT "discord_team_merit_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "public"."discord_guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."discord_registration_delays" ADD CONSTRAINT "discord_registration_delays_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "public"."discord_guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."discord_registration_toggles" ADD CONSTRAINT "discord_registration_toggles_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "public"."discord_guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."discord_team_bans" ADD CONSTRAINT "discord_team_bans_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "public"."discord_guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
