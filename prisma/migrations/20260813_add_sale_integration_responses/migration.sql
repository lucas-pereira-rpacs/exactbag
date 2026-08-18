-- Store responses from external integrations such as NOW.
ALTER TABLE "Sale"
ADD COLUMN IF NOT EXISTS "integration_responses" JSONB;
