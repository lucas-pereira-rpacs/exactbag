-- AlterTable: Add cancellation and refund fields to Sale
ALTER TABLE "Sale" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Sale" ADD COLUMN "refundType" TEXT;
ALTER TABLE "Sale" ADD COLUMN "refundAmount" DOUBLE PRECISION;
