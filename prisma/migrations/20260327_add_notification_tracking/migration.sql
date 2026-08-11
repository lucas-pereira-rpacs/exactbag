-- Add notification deduplication fields to Sale
ALTER TABLE "Sale" ADD COLUMN "welcomeSentAt" TIMESTAMP(3);
ALTER TABLE "Sale" ADD COLUMN "vesperaSentAt" TIMESTAMP(3);

-- Index for véspera scheduler: find sales with outboundDate tomorrow that haven't been notified
CREATE INDEX "Sale_outboundDate_vesperaSentAt_idx" ON "Sale"("outboundDate", "vesperaSentAt");
