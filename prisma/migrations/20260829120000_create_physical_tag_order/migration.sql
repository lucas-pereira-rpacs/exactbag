-- Physical tag orders were previously created only by the application bootstrap.
-- Keep this migration idempotent so existing environments are not disrupted.
CREATE TABLE IF NOT EXISTS "PhysicalTagOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" INTEGER NOT NULL,
    "product" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT,
    "outboundDate" TIMESTAMP(3),
    "receiptSentAt" TIMESTAMP(3),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "hasInsurance" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "partnerId" TEXT,
    "operatorEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhysicalTagOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PhysicalTagOrder_orderNumber_key"
ON "PhysicalTagOrder"("orderNumber");

CREATE INDEX IF NOT EXISTS "PhysicalTagOrder_createdAt_idx"
ON "PhysicalTagOrder"("createdAt");

CREATE INDEX IF NOT EXISTS "PhysicalTagOrder_outboundDate_receiptSentAt_idx"
ON "PhysicalTagOrder"("outboundDate", "receiptSentAt");
