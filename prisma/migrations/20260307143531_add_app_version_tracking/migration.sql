-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "lastAppVersion" TEXT,
ADD COLUMN     "lastVersionUpdate" TIMESTAMP(3),
ADD COLUMN     "registeredAppVersion" TEXT;