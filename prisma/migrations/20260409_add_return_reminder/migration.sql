-- AlterTable
ALTER TABLE "NativeRegistration" ADD COLUMN "returnReminderSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "NativeRegistration_returnDate_idx" ON "NativeRegistration"("returnDate");
