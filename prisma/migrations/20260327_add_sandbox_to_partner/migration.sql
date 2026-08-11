-- AlterTable: Add isSandbox to Partner
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "isSandbox" BOOLEAN NOT NULL DEFAULT false;
