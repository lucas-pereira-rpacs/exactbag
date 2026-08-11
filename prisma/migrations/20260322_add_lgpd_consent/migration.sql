-- Migration: add_lgpd_consent_fields
-- Date: 2026-03-22
-- Purpose: Add LGPD consent tracking fields to Partner model

ALTER TABLE "Partner" ADD COLUMN "optOutMarketing" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Partner" ADD COLUMN "optOutAnalytics" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Partner" ADD COLUMN "consentDate" TIMESTAMP(3);

-- Create index for faster consent lookups
CREATE INDEX "Partner_optOutMarketing_idx" ON "Partner"("optOutMarketing");
CREATE INDEX "Partner_optOutAnalytics_idx" ON "Partner"("optOutAnalytics");
