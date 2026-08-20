-- Replace the sale-level integration blob with a dedicated integration request store.
CREATE TABLE "Requests" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "error_messages" JSONB,
    "responses" JSONB,
    "integration" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Requests_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Requests_saleId_idx" ON "Requests"("saleId");
CREATE INDEX "Requests_integration_idx" ON "Requests"("integration");
CREATE INDEX "Requests_createdAt_idx" ON "Requests"("createdAt");

DROP INDEX IF EXISTS "Sale_integration_responses_idx";
ALTER TABLE "Sale" DROP COLUMN IF EXISTS "integration_responses";
