-- CreateEnum
CREATE TYPE "TemplatePresetGraphicType" AS ENUM ('STANDINGS', 'SERIES_STANDINGS', 'SLOT_LIST', 'ROSTER', 'TOP_10');

-- CreateTable
CREATE TABLE "template_presets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "graphicType" "TemplatePresetGraphicType" NOT NULL,
    "template" TEXT NOT NULL,
    "formatType" TEXT,
    "formValues" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "template_presets_userId_graphicType_template_idx" ON "template_presets"("userId", "graphicType", "template");

-- CreateIndex
CREATE INDEX "template_presets_userId_createdAt_idx" ON "template_presets"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "template_presets" ADD CONSTRAINT "template_presets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
