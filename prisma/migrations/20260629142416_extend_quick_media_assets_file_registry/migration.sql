-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "QuickMediaAssetType" ADD VALUE 'SCREENSHOT';
ALTER TYPE "QuickMediaAssetType" ADD VALUE 'CROP';
ALTER TYPE "QuickMediaAssetType" ADD VALUE 'TEMPLATE';
ALTER TYPE "QuickMediaAssetType" ADD VALUE 'TEMPLATE_CONFIG';
ALTER TYPE "QuickMediaAssetType" ADD VALUE 'LOGO';
ALTER TYPE "QuickMediaAssetType" ADD VALUE 'EXCEL';

-- AlterTable
ALTER TABLE "quick_media_assets" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resourceId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "quick_media_assets_assetType_resourceId_idx" ON "quick_media_assets"("assetType", "resourceId");

-- CreateIndex
CREATE INDEX "quick_media_assets_r2Key_idx" ON "quick_media_assets"("r2Key");
