-- CreateTable
CREATE TABLE "public"."bot_states" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "previousState" TEXT,
    "reason" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedBy" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."team_enrollments" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "leaderIgn" TEXT NOT NULL,
    "leaderDiscord" TEXT NOT NULL,
    "players" JSONB NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "enrollmentStep" INTEGER NOT NULL DEFAULT 1,
    "threadId" TEXT,
    "enrolledBy" TEXT NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "team_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."team_activity_logs" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performedBy" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_rate_limits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "lastAttempt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "cooldownUntil" TIMESTAMP(3) NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."team_name_changes" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "oldName" TEXT NOT NULL,
    "newName" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_name_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bot_states_guildId_idx" ON "public"."bot_states"("guildId");

-- CreateIndex
CREATE INDEX "bot_states_state_idx" ON "public"."bot_states"("state");

-- CreateIndex
CREATE UNIQUE INDEX "team_enrollments_guildId_teamName_key" ON "public"."team_enrollments"("guildId", "teamName");

-- CreateIndex
CREATE UNIQUE INDEX "user_rate_limits_userId_guildId_action_key" ON "public"."user_rate_limits"("userId", "guildId", "action");

-- AddForeignKey
ALTER TABLE "public"."bot_states" ADD CONSTRAINT "bot_states_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "public"."discord_guilds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."team_enrollments" ADD CONSTRAINT "team_enrollments_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "public"."discord_guilds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."team_activity_logs" ADD CONSTRAINT "team_activity_logs_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."team_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."team_name_changes" ADD CONSTRAINT "team_name_changes_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."team_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
