-- Migration: add_webhook_url_to_partner
-- Date: 2026-03-22
-- Purpose: Add webhookUrl field for partner callbacks (optional)

ALTER TABLE "Partner" ADD COLUMN "webhookUrl" TEXT;

-- Create index for faster lookups of partners with webhooks
CREATE INDEX "Partner_webhookUrl_idx" ON "Partner"("webhookUrl") WHERE "webhookUrl" IS NOT NULL;
