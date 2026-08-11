-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Sale_slug_key" ON "Sale"("slug");
