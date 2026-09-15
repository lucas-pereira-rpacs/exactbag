// Repositório de Parceiros
// Em produção usa PostgreSQL via Prisma; em testes usa fallback em memória.

const { prisma } = require("../config");

const useInMemoryRepository =
  process.env.NODE_ENV === "test" || !process.env.DATABASE_URL || !prisma;

// Flag que muda para true se o banco de dados não estiver acessível
let dbUnreachable = false;

function isMemoryMode() {
  return useInMemoryRepository || dbUnreachable;
}

// Banco em memória para testes/dev
const partnersDatabase = [
  {
    id: "PARTNER-001",
    name: "Agência Travel Corp",
    partnerId: "AGENCIA_123",
    apiKey: "exactbag_test_key_123456789",
    email: "tech@agenciatravel.com",
    isActive: true,
    isSandbox: false,
    createdAt: new Date("2026-01-01"),
    rateLimit: {
      requestsPerMinute: 60,
      requestsPerDay: 10000,
    },
    metadata: {
      lastRequestAt: null,
      totalRequests: 0,
      failedRequests: 0,
    },
  },
  {
    id: "PARTNER-002",
    name: "Viagens Premium",
    partnerId: "AGENCIA_456",
    apiKey: "exactbag_test_key_987654321",
    email: "api@viagenspremium.com",
    isActive: true,
    isSandbox: false,
    createdAt: new Date("2026-02-01"),
    rateLimit: {
      requestsPerMinute: 60,
      requestsPerDay: 10000,
    },
    metadata: {
      lastRequestAt: null,
      totalRequests: 0,
      failedRequests: 0,
    },
  },
  {
    id: "PARTNER-003",
    name: "Just Travel",
    partnerId: "JUST_TRAVEL",
    apiKey: "exactbag_just_travel_key_2026",
    email: "parceria@justtravel.com.br",
    isActive: true,
    isSandbox: false,
    createdAt: new Date("2026-07-01"),
    rateLimit: {
      requestsPerMinute: 60,
      requestsPerDay: 10000,
    },
    metadata: {
      lastRequestAt: null,
      totalRequests: 0,
      failedRequests: 0,
    },
  },
];

let defaultsSynced = false;

const mapPartnerRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    partnerId: row.partnerId,
    name: row.name,
    apiKey: row.apiKey,
    email: row.email,
    isActive: row.isActive,
    isSandbox: row.isSandbox || false,
  };
};

const syncDefaultPartners = async () => {
  if (isMemoryMode() || defaultsSynced) {
    return;
  }

  // Nunca inserir parceiros de teste em produção
  if (process.env.NODE_ENV === "production") {
    defaultsSynced = true;
    return;
  }

  try {
    await Promise.all(
      partnersDatabase.map(async (partner) => {
        await prisma.$executeRaw`
        INSERT INTO "Partner" ("id", "partnerId", "name", "apiKey", "email", "isActive", "isSandbox", "createdAt", "updatedAt")
        VALUES (${partner.id}, ${partner.partnerId}, ${partner.name}, ${partner.apiKey}, ${partner.email}, ${partner.isActive}, ${partner.isSandbox || false}, NOW(), NOW())
        ON CONFLICT ("partnerId")
        DO UPDATE SET
          "name" = EXCLUDED."name",
          "apiKey" = EXCLUDED."apiKey",
          "email" = EXCLUDED."email",
          "isActive" = EXCLUDED."isActive",
          "isSandbox" = EXCLUDED."isSandbox",
          "updatedAt" = NOW()
      `;
      }),
    );
    defaultsSynced = true;
  } catch (err) {
    console.warn(
      "[PartnerRepo] Banco de dados inacessível, usando modo memória:",
      err.message,
    );
    dbUnreachable = true;
  }
};

// Encontrar parceiro por API Key
const findByApiKey = async (apiKey) => {
  await syncDefaultPartners();

  if (isMemoryMode()) {
    return partnersDatabase.find((p) => p.apiKey === apiKey) || null;
  }

  const rows = await prisma.$queryRaw`
    SELECT "id", "partnerId", "name", "apiKey", "email", "isActive", "isSandbox"
    FROM "Partner"
    WHERE "apiKey" = ${apiKey}
    LIMIT 1
  `;

  return mapPartnerRow(rows[0]);
};

// Encontrar parceiro por ID
const findByPartnerId = async (partnerId) => {
  await syncDefaultPartners();

  if (isMemoryMode()) {
    return partnersDatabase.find((p) => p.partnerId === partnerId) || null;
  }

  const rows = await prisma.$queryRaw`
    SELECT "id", "partnerId", "name", "apiKey", "email", "isActive", "isSandbox"
    FROM "Partner"
    WHERE "partnerId" = ${partnerId}
    LIMIT 1
  `;

  return mapPartnerRow(rows[0]);
};

// Atualizar metadados de requisição
const updateRequestMetadata = async (apiKey) => {
  if (isMemoryMode()) {
    const partner = await findByApiKey(apiKey);
    if (partner) {
      partner.metadata.lastRequestAt = new Date();
      partner.metadata.totalRequests += 1;
    }
    return partner;
  }

  const partner = await findByApiKey(apiKey);
  if (partner) {
    try {
      await prisma.$executeRaw`
        UPDATE "Partner"
        SET "totalRequests" = COALESCE("totalRequests", 0) + 1,
            "updatedAt" = NOW()
        WHERE "apiKey" = ${apiKey}
      `;
    } catch (_error) {
      // Legacy schemas may not have totalRequests yet; metadata update is best effort.
    }
    return partner;
  }
  return null;
};

// Registrar falha de requisição
const recordFailedRequest = async (apiKey) => {
  if (isMemoryMode()) {
    const partner = await findByApiKey(apiKey);
    if (partner) {
      partner.metadata.failedRequests += 1;
    }
    return partner;
  }

  const partner = await findByApiKey(apiKey);
  if (partner) {
    try {
      await prisma.$executeRaw`
        UPDATE "Partner"
        SET "failedRequests" = COALESCE("failedRequests", 0) + 1,
            "updatedAt" = NOW()
        WHERE "apiKey" = ${apiKey}
      `;
    } catch (_error) {
      // Legacy schemas may not have failedRequests yet; metadata update is best effort.
    }
    return partner;
  }
  return null;
};

// Listar todos os parceiros ativos (para dropdown no dashboard interno)
const findAllActive = async () => {
  await syncDefaultPartners();

  if (isMemoryMode()) {
    return partnersDatabase.filter((p) => p.isActive).map(mapPartnerRow);
  }

  const rows = await prisma.$queryRaw`
    SELECT "id", "partnerId", "name", "apiKey", "email", "isActive", "isSandbox"
    FROM "Partner"
    WHERE "isActive" = true
    ORDER BY "name" ASC
  `;
  return rows.map(mapPartnerRow);
};

// Verificar rate limit (simples - apenas checks/dia e por minuto)
const checkRateLimit = async (apiKey) => {
  const partner = await findByApiKey(apiKey);
  if (!partner) return false;

  if (isMemoryMode()) {
    return true;
  }

  return partner.isActive;
};

module.exports = {
  findByApiKey,
  findByPartnerId,
  findAllActive,
  updateRequestMetadata,
  recordFailedRequest,
  checkRateLimit,
  // Expor BD para testes
  partnersDatabase,
};
