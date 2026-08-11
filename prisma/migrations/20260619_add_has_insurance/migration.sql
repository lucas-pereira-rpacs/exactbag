-- AlterTable: indicador de seguro na venda (recebido via API)
ALTER TABLE "Sale" ADD COLUMN "hasInsurance" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: indicador de seguro no registro do passageiro (herdado da venda)
ALTER TABLE "NativeRegistration" ADD COLUMN "hasInsurance" BOOLEAN NOT NULL DEFAULT false;
