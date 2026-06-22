-- Team logo presets (user library, 1-25 entries per preset)
CREATE TABLE "team_logo_presets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "team_logo_presets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "team_logo_preset_entries" (
    "id" TEXT NOT NULL,
    "presetId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "logoR2Key" TEXT NOT NULL,
    "logoStorageUrl" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "team_logo_preset_entries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "quick_slot_assignments" ADD COLUMN "logoPresetEntryId" TEXT;
ALTER TABLE "quick_slot_assignments" ADD COLUMN "matchLogoR2Key" TEXT;
ALTER TABLE "quick_slot_assignments" ADD COLUMN "matchLogoStorageUrl" TEXT;

ALTER TABLE "quick_tournament_series" ADD COLUMN "slotSourceQuickMatchId" TEXT;

CREATE INDEX "team_logo_presets_userId_createdAt_idx" ON "team_logo_presets"("userId", "createdAt" DESC);
CREATE INDEX "team_logo_preset_entries_presetId_sortOrder_idx" ON "team_logo_preset_entries"("presetId", "sortOrder");
CREATE INDEX "quick_slot_assignments_logoPresetEntryId_idx" ON "quick_slot_assignments"("logoPresetEntryId");

ALTER TABLE "team_logo_presets" ADD CONSTRAINT "team_logo_presets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_logo_preset_entries" ADD CONSTRAINT "team_logo_preset_entries_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "team_logo_presets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quick_slot_assignments" ADD CONSTRAINT "quick_slot_assignments_logoPresetEntryId_fkey" FOREIGN KEY ("logoPresetEntryId") REFERENCES "team_logo_preset_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
