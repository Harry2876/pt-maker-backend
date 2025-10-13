-- CreateTable
CREATE TABLE "public"."discord_users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "discriminator" TEXT,
    "email" TEXT,
    "avatar" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "linkedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."discord_guilds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "description" TEXT,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT NOT NULL,
    "botEnabled" BOOLEAN NOT NULL DEFAULT true,
    "commandPrefix" TEXT NOT NULL DEFAULT 'sz',
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "premiumUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_guilds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."discord_guild_members" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "nickname" TEXT,
    "roles" TEXT[],
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "canManageTournaments" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_guild_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."discord_scrims" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "game" TEXT NOT NULL,
    "maxTeams" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "scheduledAt" TIMESTAMP(3),
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_scrims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discord_users_linkedUserId_key" ON "public"."discord_users"("linkedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "discord_guild_members_userId_guildId_key" ON "public"."discord_guild_members"("userId", "guildId");

-- AddForeignKey
ALTER TABLE "public"."discord_users" ADD CONSTRAINT "discord_users_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."discord_guilds" ADD CONSTRAINT "discord_guilds_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."discord_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."discord_guild_members" ADD CONSTRAINT "discord_guild_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."discord_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."discord_guild_members" ADD CONSTRAINT "discord_guild_members_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "public"."discord_guilds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."discord_scrims" ADD CONSTRAINT "discord_scrims_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "public"."discord_guilds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
