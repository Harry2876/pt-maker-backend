/*
  Warnings:

  - You are about to drop the column `lastAppVersion` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `lastVersionUpdate` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `registeredAppVersion` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[revenueCatAppUserId]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "lastAppVersion",
DROP COLUMN "lastVersionUpdate",
DROP COLUMN "registeredAppVersion",
ADD COLUMN     "proProductIdentifier" TEXT,
ADD COLUMN     "revenueCatAppUserId" TEXT,
ADD COLUMN     "revenueCatLastEventId" TEXT,
ADD COLUMN     "revenueCatLastSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "revenuecat_webhook_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "appUserId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenuecat_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "revenuecat_webhook_events_eventId_key" ON "revenuecat_webhook_events"("eventId");

-- CreateIndex
CREATE INDEX "revenuecat_webhook_events_appUserId_idx" ON "revenuecat_webhook_events"("appUserId");

-- CreateIndex
CREATE INDEX "revenuecat_webhook_events_processedAt_idx" ON "revenuecat_webhook_events"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_revenueCatAppUserId_key" ON "users"("revenueCatAppUserId");

-- AddForeignKey
ALTER TABLE "revenuecat_webhook_events" ADD CONSTRAINT "revenuecat_webhook_events_appUserId_fkey" FOREIGN KEY ("appUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
