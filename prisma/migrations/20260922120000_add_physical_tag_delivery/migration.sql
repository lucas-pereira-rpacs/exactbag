ALTER TABLE "PhysicalTagOrder"
ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "deliveredByEmail" TEXT;

CREATE INDEX IF NOT EXISTS "PhysicalTagOrder_deliveredAt_idx"
ON "PhysicalTagOrder"("deliveredAt");
