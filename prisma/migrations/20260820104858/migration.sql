-- DropIndex
DROP INDEX "Partner_optOutAnalytics_idx";

-- DropIndex
DROP INDEX "Partner_optOutMarketing_idx";

-- AlterTable
ALTER TABLE "Partner" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Sale" ALTER COLUMN "outboundDate" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "returnDate" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Submission" ALTER COLUMN "payload" SET DATA TYPE TEXT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DashboardUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'atendente',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DashboardUser_email_key" ON "DashboardUser"("email");

-- CreateIndex
CREATE INDEX "DashboardUser_email_idx" ON "DashboardUser"("email");

-- CreateIndex
CREATE INDEX "DashboardUser_role_idx" ON "DashboardUser"("role");

-- CreateIndex
CREATE INDEX "Partner_partnerId_idx" ON "Partner"("partnerId");

-- CreateIndex
CREATE INDEX "Partner_email_idx" ON "Partner"("email");

-- CreateIndex
CREATE INDEX "Partner_createdAt_idx" ON "Partner"("createdAt");

-- CreateIndex
CREATE INDEX "Sale_partnerId_idx" ON "Sale"("partnerId");

-- CreateIndex
CREATE INDEX "Sale_customerEmail_idx" ON "Sale"("customerEmail");

-- CreateIndex
CREATE INDEX "Sale_saleId_idx" ON "Sale"("saleId");

-- CreateIndex
CREATE INDEX "Sale_createdAt_idx" ON "Sale"("createdAt");

-- CreateIndex
CREATE INDEX "Sale_status_idx" ON "Sale"("status");

-- CreateIndex
CREATE INDEX "Submission_saleId_idx" ON "Submission"("saleId");

-- CreateIndex
CREATE INDEX "Submission_formId_idx" ON "Submission"("formId");

-- CreateIndex
CREATE INDEX "Submission_createdAt_idx" ON "Submission"("createdAt");

-- CreateIndex
CREATE INDEX "Submission_saleId_formId_idx" ON "Submission"("saleId", "formId");

-- CreateIndex
CREATE INDEX "Submission_createdAt_status_idx" ON "Submission"("createdAt", "status");
