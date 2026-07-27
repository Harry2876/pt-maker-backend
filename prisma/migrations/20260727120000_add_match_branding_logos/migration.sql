ALTER TABLE public."quick_matches" ADD COLUMN IF NOT EXISTS "organiserLogoR2Key" TEXT;
ALTER TABLE public."quick_matches" ADD COLUMN IF NOT EXISTS "organiserLogoStorageUrl" TEXT;
ALTER TABLE public."quick_matches" ADD COLUMN IF NOT EXISTS "sponsorLogoR2Key" TEXT;
ALTER TABLE public."quick_matches" ADD COLUMN IF NOT EXISTS "sponsorLogoStorageUrl" TEXT;