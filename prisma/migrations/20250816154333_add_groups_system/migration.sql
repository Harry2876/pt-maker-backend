-- CreateEnum
CREATE TYPE "public"."TournamentType" AS ENUM ('PAID_SCRIM', 'TOURNAMENT');

-- AlterTable
ALTER TABLE "public"."matches" ADD COLUMN     "groupId" TEXT;

-- AlterTable
ALTER TABLE "public"."tournaments" ADD COLUMN     "entryFee" DOUBLE PRECISION,
ADD COLUMN     "maxTeams" INTEGER,
ADD COLUMN     "prizePool" DOUBLE PRECISION,
ADD COLUMN     "tournamentType" "public"."TournamentType" NOT NULL DEFAULT 'PAID_SCRIM';

-- CreateTable
CREATE TABLE "public"."groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxTeams" INTEGER NOT NULL DEFAULT 24,
    "qualificationSpots" INTEGER NOT NULL DEFAULT 8,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tournamentId" TEXT NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."team_registrations" (
    "id" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "contactInfo" TEXT NOT NULL,
    "registrationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "finalPosition" INTEGER,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "groupId" TEXT,

    CONSTRAINT "team_registrations_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."matches" ADD CONSTRAINT "matches_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."groups" ADD CONSTRAINT "groups_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."team_registrations" ADD CONSTRAINT "team_registrations_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."team_registrations" ADD CONSTRAINT "team_registrations_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
