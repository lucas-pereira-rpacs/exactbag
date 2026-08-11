CREATE TABLE "DownloadToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "saleId" TEXT,
    "submissionId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "productData" TEXT NOT NULL,
    "downloaded" BOOLEAN NOT NULL DEFAULT false,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "maxDownloads" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "firstDownloadAt" TIMESTAMP(3),
    "lastDownloadAt" TIMESTAMP(3),

    CONSTRAINT "DownloadToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DownloadToken_token_key" ON "DownloadToken"("token");
CREATE INDEX "DownloadToken_saleId_idx" ON "DownloadToken"("saleId");
CREATE INDEX "DownloadToken_customerEmail_idx" ON "DownloadToken"("customerEmail");
CREATE INDEX "DownloadToken_createdAt_idx" ON "DownloadToken"("createdAt");
CREATE INDEX "DownloadToken_expiresAt_idx" ON "DownloadToken"("expiresAt");

ALTER TABLE "DownloadToken" ADD CONSTRAINT "DownloadToken_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;