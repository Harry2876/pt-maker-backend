/*
  Warnings:

  - The values [SUCCESS,REFUNDED] on the enum `PaymentStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `errorMessage` on the `matches` table. All the data in the column will be lost.
  - You are about to drop the column `mapName` on the `matches` table. All the data in the column will be lost.
  - You are about to drop the column `pointsData` on the `matches` table. All the data in the column will be lost.
  - You are about to drop the column `processingStatus` on the `matches` table. All the data in the column will be lost.
  - You are about to drop the column `processingTime` on the `matches` table. All the data in the column will be lost.
  - You are about to drop the column `projectId` on the `matches` table. All the data in the column will be lost.
  - You are about to drop the column `resultImageUrl` on the `matches` table. All the data in the column will be lost.
  - You are about to drop the column `totalTeams` on the `matches` table. All the data in the column will be lost.
  - You are about to drop the column `paymentProvider` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `providerOrderId` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `providerPaymentId` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `subscriptionMonth` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `hasAnalytics` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `hasApiAccess` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `hasCustomBrand` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `maxMatches` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `maxProjects` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `emailVerified` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `fullName` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `image` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `lastLoginAt` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `organization` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `image_uploads` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `project_analytics` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `projects` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `team_results` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `usage_records` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[transactionId]` on the table `payments` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripePriceId]` on the table `subscriptions` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `tournamentId` to the `matches` table without a default value. This is not possible if the table is not empty.
  - Added the required column `purchaseType` to the `payments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `transactionId` to the `payments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `billingCycle` to the `subscriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `planName` to the `subscriptions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."SubscriptionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "public"."TournamentStatus" AS ENUM ('UPCOMING', 'ONGOING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."MatchStatus" AS ENUM ('PENDING_PROCESSING', 'PROCESSED', 'ERROR');

-- CreateEnum
CREATE TYPE "public"."PurchaseType" AS ENUM ('SUBSCRIPTION', 'CREDIT_PACK');

-- CreateEnum
CREATE TYPE "public"."ScreenshotType" AS ENUM ('SLOT_LIST', 'RESULT_SCREEN');

-- CreateEnum
CREATE TYPE "public"."TemplateType" AS ENUM ('PREDEFINED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "public"."DataFieldType" AS ENUM ('TEAM_NAME', 'PLAYER_NAME', 'KILLS', 'POSITION', 'POINTS', 'MATCH_TITLE', 'DATE', 'TOURNAMENT_NAME');

-- CreateEnum
CREATE TYPE "public"."TextAlignment" AS ENUM ('LEFT', 'CENTER', 'RIGHT');

-- AlterEnum
BEGIN;
CREATE TYPE "public"."PaymentStatus_new" AS ENUM ('SUCCEEDED', 'PENDING', 'FAILED');
ALTER TABLE "public"."payments" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."payments" ALTER COLUMN "status" TYPE "public"."PaymentStatus_new" USING ("status"::text::"public"."PaymentStatus_new");
ALTER TYPE "public"."PaymentStatus" RENAME TO "PaymentStatus_old";
ALTER TYPE "public"."PaymentStatus_new" RENAME TO "PaymentStatus";
DROP TYPE "public"."PaymentStatus_old";
ALTER TABLE "public"."payments" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- DropForeignKey
ALTER TABLE "public"."image_uploads" DROP CONSTRAINT "image_uploads_matchId_fkey";

-- DropForeignKey
ALTER TABLE "public"."matches" DROP CONSTRAINT "matches_projectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."project_analytics" DROP CONSTRAINT "project_analytics_projectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."projects" DROP CONSTRAINT "projects_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."team_results" DROP CONSTRAINT "team_results_matchId_fkey";

-- DropForeignKey
ALTER TABLE "public"."usage_records" DROP CONSTRAINT "usage_records_userId_fkey";

-- DropIndex
DROP INDEX "public"."payments_providerOrderId_key";

-- DropIndex
DROP INDEX "public"."users_email_key";

-- AlterTable
ALTER TABLE "public"."matches" DROP COLUMN "errorMessage",
DROP COLUMN "mapName",
DROP COLUMN "pointsData",
DROP COLUMN "processingStatus",
DROP COLUMN "processingTime",
DROP COLUMN "projectId",
DROP COLUMN "resultImageUrl",
DROP COLUMN "totalTeams",
ADD COLUMN     "matchDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "processedData" JSONB,
ADD COLUMN     "status" "public"."MatchStatus" NOT NULL DEFAULT 'PENDING_PROCESSING',
ADD COLUMN     "tournamentId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."payments" DROP COLUMN "paymentProvider",
DROP COLUMN "providerOrderId",
DROP COLUMN "providerPaymentId",
DROP COLUMN "subscriptionMonth",
ADD COLUMN     "creditsAdded" INTEGER,
ADD COLUMN     "purchaseType" "public"."PurchaseType" NOT NULL,
ADD COLUMN     "transactionId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."subscriptions" DROP COLUMN "currency",
DROP COLUMN "hasAnalytics",
DROP COLUMN "hasApiAccess",
DROP COLUMN "hasCustomBrand",
DROP COLUMN "maxMatches",
DROP COLUMN "maxProjects",
DROP COLUMN "name",
ADD COLUMN     "billingCycle" "public"."BillingCycle" NOT NULL,
ADD COLUMN     "planName" TEXT NOT NULL,
ADD COLUMN     "stripePriceId" TEXT;

-- AlterTable
ALTER TABLE "public"."users" DROP COLUMN "email",
DROP COLUMN "emailVerified",
DROP COLUMN "fullName",
DROP COLUMN "image",
DROP COLUMN "isActive",
DROP COLUMN "lastLoginAt",
DROP COLUMN "organization",
ADD COLUMN     "credits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "otp" TEXT,
ADD COLUMN     "otpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "subscriptionEndDate" TIMESTAMP(3),
ADD COLUMN     "subscriptionStatus" "public"."SubscriptionStatus" NOT NULL DEFAULT 'INACTIVE';

-- DropTable
DROP TABLE "public"."image_uploads";

-- DropTable
DROP TABLE "public"."project_analytics";

-- DropTable
DROP TABLE "public"."projects";

-- DropTable
DROP TABLE "public"."team_results";

-- DropTable
DROP TABLE "public"."usage_records";

-- DropEnum
DROP TYPE "public"."ImageType";

-- DropEnum
DROP TYPE "public"."ProcessingStatus";

-- DropEnum
DROP TYPE "public"."ProjectStatus";

-- DropEnum
DROP TYPE "public"."UsageType";

-- CreateTable
CREATE TABLE "public"."tournaments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "status" "public"."TournamentStatus" NOT NULL DEFAULT 'UPCOMING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."screenshots" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "type" "public"."ScreenshotType" NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "isProcessed" BOOLEAN NOT NULL DEFAULT false,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchId" TEXT NOT NULL,

    CONSTRAINT "screenshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."templates" (
    "id" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "configJson" JSONB NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "templateType" "public"."TemplateType" NOT NULL DEFAULT 'PREDEFINED',
    "originalImageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."template_data_fields" (
    "id" TEXT NOT NULL,
    "fieldType" "public"."DataFieldType" NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "fontSize" INTEGER,
    "fontColor" TEXT,
    "alignment" "public"."TextAlignment" NOT NULL DEFAULT 'LEFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "templateId" TEXT NOT NULL,

    CONSTRAINT "template_data_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."activity_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_transactionId_key" ON "public"."payments"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripePriceId_key" ON "public"."subscriptions"("stripePriceId");

-- AddForeignKey
ALTER TABLE "public"."tournaments" ADD CONSTRAINT "tournaments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."teams" ADD CONSTRAINT "teams_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."matches" ADD CONSTRAINT "matches_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."screenshots" ADD CONSTRAINT "screenshots_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "public"."matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."templates" ADD CONSTRAINT "templates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."template_data_fields" ADD CONSTRAINT "template_data_fields_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."activity_logs" ADD CONSTRAINT "activity_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
