ALTER TABLE "PhysicalTagOrder"
ADD COLUMN IF NOT EXISTS "receiptSentAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "PhysicalTagOrder_outboundDate_receiptSentAt_idx"
ON "PhysicalTagOrder"("outboundDate", "receiptSentAt");
