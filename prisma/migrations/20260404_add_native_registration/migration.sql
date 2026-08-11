-- CreateTable
CREATE TABLE "NativeRegistration" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT,
    "saleId" TEXT,
    "passengerName" TEXT NOT NULL,
    "passengerCpf" TEXT,
    "passengerEmail" TEXT NOT NULL,
    "passengerPhone" TEXT NOT NULL,
    "baggageQty" INTEGER NOT NULL DEFAULT 1,
    "transportType" TEXT NOT NULL DEFAULT 'aereo',
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "airline" TEXT,
    "outboundDate" TIMESTAMP(3),
    "returnDate" TIMESTAMP(3),
    "hasGpsTracker" BOOLEAN NOT NULL DEFAULT false,
    "termsAccepted" BOOLEAN NOT NULL DEFAULT false,
    "termsAcceptedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "cpvNumber" TEXT,
    "cpvPdfUrl" TEXT,
    "cpvGeneratedAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "whatsappSentAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NativeRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NativeBaggageItem" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "bagType" TEXT,
    "color" TEXT,
    "brand" TEXT,
    "identifierTag" TEXT,
    "imageData" TEXT,
    "imageData2" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NativeBaggageItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NativeRegistration_cpvNumber_key" ON "NativeRegistration"("cpvNumber");

-- CreateIndex
CREATE INDEX "NativeRegistration_partnerId_createdAt_idx" ON "NativeRegistration"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "NativeRegistration_passengerEmail_idx" ON "NativeRegistration"("passengerEmail");

-- CreateIndex
CREATE INDEX "NativeRegistration_passengerCpf_idx" ON "NativeRegistration"("passengerCpf");

-- CreateIndex
CREATE INDEX "NativeRegistration_status_createdAt_idx" ON "NativeRegistration"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NativeRegistration_cpvNumber_idx" ON "NativeRegistration"("cpvNumber");

-- CreateIndex
CREATE INDEX "NativeRegistration_saleId_idx" ON "NativeRegistration"("saleId");

-- CreateIndex
CREATE INDEX "NativeBaggageItem_registrationId_idx" ON "NativeBaggageItem"("registrationId");

-- AddForeignKey
ALTER TABLE "NativeBaggageItem" ADD CONSTRAINT "NativeBaggageItem_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "NativeRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
