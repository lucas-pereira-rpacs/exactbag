const { prisma } = require("../config");
const {
  buildNativeRegistrationLink,
} = require("./nativeRegistrationLinkService");

const createDownloadTokenTableSql = `
  CREATE TABLE IF NOT EXISTS "DownloadToken" (
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
    CONSTRAINT "DownloadToken_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DownloadToken_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE
  )
`;

const createIndexesSql = [
  'CREATE UNIQUE INDEX IF NOT EXISTS "DownloadToken_token_key" ON "DownloadToken"("token")',
  'CREATE INDEX IF NOT EXISTS "DownloadToken_saleId_idx" ON "DownloadToken"("saleId")',
  'CREATE INDEX IF NOT EXISTS "DownloadToken_customerEmail_idx" ON "DownloadToken"("customerEmail")',
  'CREATE INDEX IF NOT EXISTS "DownloadToken_createdAt_idx" ON "DownloadToken"("createdAt")',
  'CREATE INDEX IF NOT EXISTS "DownloadToken_expiresAt_idx" ON "DownloadToken"("expiresAt")',
];

const backfillSchemaSql = [
  'ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "rateLimitMin" INTEGER NOT NULL DEFAULT 60',
  'ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "rateLimitDay" INTEGER NOT NULL DEFAULT 10000',
  'ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "totalRequests" INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "failedRequests" INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "optOutMarketing" BOOLEAN NOT NULL DEFAULT false',
  'ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "optOutAnalytics" BOOLEAN NOT NULL DEFAULT false',
  'ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "consentDate" TIMESTAMP(3)',
  'ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "webhookUrl" TEXT',
  'ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "saleId" TEXT',
  'ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "isManualSale" BOOLEAN NOT NULL DEFAULT false',
  'ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "roundTrip" BOOLEAN NOT NULL DEFAULT false',
  'ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "outboundDate" TIMESTAMP(3)',
  'ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "returnDate" TIMESTAMP(3)',
  'ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "formLink" TEXT',
  'ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "jobId" TEXT',
  // Cancellation / Refund fields (20260407)
  'ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3)',
  'ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "refundType" TEXT',
  'ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "refundAmount" DOUBLE PRECISION',
  // Insurance indicator (20260619)
  'ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "hasInsurance" BOOLEAN NOT NULL DEFAULT false',
  // Optional sale-level registration expiration (20260801)
  'ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "expirationDate" TIMESTAMP(3)',
  'ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "welcomeSentAt" TIMESTAMP(3)',
  'ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "vesperaSentAt" TIMESTAMP(3)',
];

// ============================================================================
// Native Registration tables (idempotent — IF NOT EXISTS)
// ============================================================================
const createNativeRegistrationSql = `
  CREATE TABLE IF NOT EXISTS "NativeRegistration" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT,
    "saleId" TEXT,
    "isPhysicalTag" BOOLEAN NOT NULL DEFAULT false,
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
  )
`;

const createNativeBaggageItemSql = `
  CREATE TABLE IF NOT EXISTS "NativeBaggageItem" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "bagType" TEXT,
    "color" TEXT,
    "brand" TEXT,
    "identifierTag" TEXT,
    "sunNumber" TEXT,
    "imageData" TEXT,
    "imageData2" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NativeBaggageItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NativeBaggageItem_registrationId_fkey" FOREIGN KEY ("registrationId")
      REFERENCES "NativeRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )
`;

const nativeRegistrationIndexes = [
  'CREATE UNIQUE INDEX IF NOT EXISTS "NativeRegistration_cpvNumber_key" ON "NativeRegistration"("cpvNumber")',
  'CREATE INDEX IF NOT EXISTS "NativeRegistration_partnerId_createdAt_idx" ON "NativeRegistration"("partnerId", "createdAt")',
  'CREATE INDEX IF NOT EXISTS "NativeRegistration_passengerEmail_idx" ON "NativeRegistration"("passengerEmail")',
  'CREATE INDEX IF NOT EXISTS "NativeRegistration_passengerCpf_idx" ON "NativeRegistration"("passengerCpf")',
  'CREATE INDEX IF NOT EXISTS "NativeRegistration_status_createdAt_idx" ON "NativeRegistration"("status", "createdAt")',
  'CREATE INDEX IF NOT EXISTS "NativeRegistration_cpvNumber_idx" ON "NativeRegistration"("cpvNumber")',
  'CREATE INDEX IF NOT EXISTS "NativeRegistration_saleId_idx" ON "NativeRegistration"("saleId")',
  'CREATE INDEX IF NOT EXISTS "NativeRegistration_returnDate_idx" ON "NativeRegistration"("returnDate")',
  'CREATE INDEX IF NOT EXISTS "NativeBaggageItem_registrationId_idx" ON "NativeBaggageItem"("registrationId")',
];

// ============================================================================
// Dashboard Users table (autenticação interna)
// ============================================================================
const createDashboardUserSql = `
  CREATE TABLE IF NOT EXISTS "DashboardUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'atendente',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DashboardUser_pkey" PRIMARY KEY ("id")
  )
`;

const dashboardUserIndexes = [
  'CREATE UNIQUE INDEX IF NOT EXISTS "DashboardUser_email_key" ON "DashboardUser"("email")',
  'CREATE INDEX IF NOT EXISTS "DashboardUser_role_idx" ON "DashboardUser"("role")',
];

const initializeDatabase = async () => {
  if (!prisma || process.env.NODE_ENV === "test") {
    return;
  }

  await prisma.$executeRawUnsafe(createDownloadTokenTableSql);

  for (const statement of backfillSchemaSql) {
    // eslint-disable-next-line no-await-in-loop
    await prisma.$executeRawUnsafe(statement);
  }

  for (const statement of createIndexesSql) {
    // eslint-disable-next-line no-await-in-loop
    await prisma.$executeRawUnsafe(statement);
  }

  // Native Registration tables (idempotent)
  await prisma.$executeRawUnsafe(createNativeRegistrationSql);
  await prisma.$executeRawUnsafe(createNativeBaggageItemSql);

  // Backfill NativeRegistration columns added after initial creation
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "NativeRegistration" ADD COLUMN IF NOT EXISTS "returnReminderSentAt" TIMESTAMP(3)',
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "NativeRegistration" ADD COLUMN IF NOT EXISTS "hasInsurance" BOOLEAN NOT NULL DEFAULT false',
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "NativeRegistration" ADD COLUMN IF NOT EXISTS "isPhysicalTag" BOOLEAN NOT NULL DEFAULT false',
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "NativeBaggageItem" ADD COLUMN IF NOT EXISTS "sunNumber" TEXT',
  );

  for (const statement of nativeRegistrationIndexes) {
    // eslint-disable-next-line no-await-in-loop
    await prisma.$executeRawUnsafe(statement);
  }

  // Dashboard Users table (idempotent)
  await prisma.$executeRawUnsafe(createDashboardUserSql);
  for (const statement of dashboardUserIndexes) {
    // eslint-disable-next-line no-await-in-loop
    await prisma.$executeRawUnsafe(statement);
  }

  // Physical Tag Orders table (idempotent)
  await prisma.$executeRawUnsafe(`
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
    )
  `);
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "PhysicalTagOrder" ADD COLUMN IF NOT EXISTS "outboundDate" TIMESTAMP(3)',
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "PhysicalTagOrder" ADD COLUMN IF NOT EXISTS "customerPhone" TEXT',
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "PhysicalTagOrder" ADD COLUMN IF NOT EXISTS "receiptSentAt" TIMESTAMP(3)',
  );
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "PhysicalTagOrder_orderNumber_key" ON "PhysicalTagOrder"("orderNumber")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "PhysicalTagOrder_createdAt_idx" ON "PhysicalTagOrder"("createdAt")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "PhysicalTagOrder_outboundDate_receiptSentAt_idx" ON "PhysicalTagOrder"("outboundDate", "receiptSentAt")',
  );

  // Seed default admin if table is empty
  await migrateLegacyRegistrationLinks();
  await seedDefaultDashboardUsers();
  await seedDefaultPartners();
};

async function migrateLegacyRegistrationLinks() {
  const legacySales = await prisma.sale.findMany({
    where: {
      formLink: { startsWith: "https://form.jotform.com/" },
      saleId: { not: null },
    },
    select: { id: true, saleId: true },
  });

  if (!legacySales.length) return;

  await prisma.$transaction(
    legacySales.map((sale) =>
      prisma.sale.update({
        where: { id: sale.id },
        data: { formLink: buildNativeRegistrationLink(sale.saleId) },
      }),
    ),
  );
  console.log(
    `[Bootstrap] ${legacySales.length} legacy registration link(s) migrated to the native form`,
  );
}

/**
 * Cria usuários padrão se a tabela DashboardUser estiver vazia
 */
async function seedDefaultDashboardUsers() {
  try {
    const bcrypt = require("bcrypt");
    const count = await prisma.dashboardUser.count();
    if (count > 0) return; // Já tem usuários

    const adminPassword = process.env.DASHBOARD_ADMIN_PASSWORD || "admin123";
    const atendPassword = process.env.DASHBOARD_ATEND_PASSWORD || "atend123";
    const [adminHash, atendHash] = await Promise.all([
      bcrypt.hash(adminPassword, 12),
      bcrypt.hash(atendPassword, 12),
    ]);

    await prisma.dashboardUser.createMany({
      data: [
        {
          name: process.env.DASHBOARD_ADMIN_NAME || "Admin ExactBag",
          email: process.env.DASHBOARD_ADMIN_EMAIL || "admin@exactbag.com",
          passwordHash: adminHash,
          role: "gestor",
          isActive: true,
        },
        {
          name: process.env.DASHBOARD_ATEND_NAME || "Atendente ExactBag",
          email: process.env.DASHBOARD_ATEND_EMAIL || "atendente@exactbag.com",
          passwordHash: atendHash,
          role: "atendente",
          isActive: true,
        },
      ],
      skipDuplicates: true,
    });
    console.log(
      "[Bootstrap] 2 usuários padrão criados na tabela DashboardUser",
    );
  } catch (err) {
    console.warn("[Bootstrap] Erro ao seed DashboardUser:", err.message);
  }
}

module.exports = {
  initializeDatabase,
};

/**
 * Semeia parceiros padrão se a tabela Partner estiver vazia.
 * Roda em todos os ambientes (incluindo produção) — usa ON CONFLICT DO NOTHING.
 */
async function seedDefaultPartners() {
  try {
    const rows =
      await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "Partner"`;
    const count = Number(rows[0]?.count ?? 0);
    if (count > 0) return; // Já tem parceiros — não sobrescreve

    const partners = [
      {
        id: "PARTNER-001",
        partnerId: "AGENCIA_123",
        name: "Agência Travel Corp (Teste)",
        apiKey: "exactbag_test_key_123456789",
        email: "tech@agenciatravel.com",
        isActive: true,
        isSandbox: true,
      },
      {
        id: "PARTNER-002",
        partnerId: "AGENCIA_456",
        name: "Viagens Premium (Teste)",
        apiKey: "exactbag_test_key_987654321",
        email: "api@viagenspremium.com",
        isActive: true,
        isSandbox: true,
      },
      {
        id: "PARTNER-003",
        partnerId: "JUST_TRAVEL",
        name: "Just Travel",
        apiKey: "exactbag_just_travel_key_2026",
        email: "parceria@justtravel.com.br",
        isActive: true,
        isSandbox: false,
      },
    ];

    for (const p of partners) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.$executeRaw`
        INSERT INTO "Partner" ("id", "partnerId", "name", "apiKey", "email", "isActive", "isSandbox", "createdAt", "updatedAt")
        VALUES (${p.id}, ${p.partnerId}, ${p.name}, ${p.apiKey}, ${p.email}, ${p.isActive}, ${p.isSandbox}, NOW(), NOW())
        ON CONFLICT ("partnerId") DO NOTHING
      `;
    }
    console.log("[Bootstrap] Parceiros padrão semeados na tabela Partner");
  } catch (err) {
    console.warn("[Bootstrap] Erro ao seed Partners:", err.message);
  }
}
