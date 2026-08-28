const dotenv = require('dotenv');

dotenv.config();

// Validate critical env vars on startup (skip in test)
if (process.env.NODE_ENV !== 'test') {
  const missing = ['DATABASE_URL'].filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`[config] FATAL: Missing required env var(s): ${missing.join(', ')}`);
    process.exit(1);
  }
}

let prisma = null;

if (process.env.DATABASE_URL && process.env.NODE_ENV !== 'test') {
    try {
        // Prisma 7 generates CommonJS TypeScript sources outside node_modules.
        const { PrismaClient } = require('../generated/prisma/client.ts');
        const { PrismaPg } = require('@prisma/adapter-pg');
        const globalForPrisma = global;

        // Limita pool de conexões PG para reduzir RAM (~10MB por conexão)
        const dbUrl = process.env.DATABASE_URL;
        const connLimit = dbUrl && !dbUrl.includes('connection_limit')
          ? (dbUrl.includes('?') ? dbUrl + '&connection_limit=3' : dbUrl + '?connection_limit=3')
          : dbUrl;

        const adapter = new PrismaPg({
          connectionString: connLimit,
          max: 3
        });

        prisma = globalForPrisma.__exactBagPrisma || new PrismaClient({ adapter });

        if (process.env.NODE_ENV !== 'production') {
            globalForPrisma.__exactBagPrisma = prisma;
        }
    } catch (error) {
        console.warn(`[config] Prisma client unavailable, falling back to non-persistent mode: ${error.message}`);
        prisma = null;
    }
}

// Telefone de suporte centralizado (formato exibição + raw para wa.me links)
const SUPPORT_PHONE = process.env.SUPPORT_PHONE || '+55 12 99758-3157';
const SUPPORT_PHONE_RAW = SUPPORT_PHONE.replace(/[\s\-\+\(\)]/g, '');

// Object storage configuration. Support both the application-facing names and
// the private/root names used by the local MinIO compose setup.
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || process.env.MINIO_PRIVATE_ENDPOINT || '';
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || '';
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || '';

const config = {
    port: process.env.PORT || 3000,
    db: {
        uri: process.env.DATABASE_URL || '',
    },
    notifications: {
        emailService: process.env.EMAIL_SERVICE || 'defaultEmailService',
        whatsappService: process.env.WHATSAPP_SERVICE || 'defaultWhatsAppService',
    },
    supportPhone: SUPPORT_PHONE,
    supportPhoneRaw: SUPPORT_PHONE_RAW,
    minio: {
        endpoint: MINIO_ENDPOINT,
        accessKey: MINIO_ACCESS_KEY,
        secretKey: MINIO_SECRET_KEY,
        port: process.env.MINIO_PORT || process.env.MINIO_PRIVATE_PORT || '',
        useSSL: process.env.MINIO_USE_SSL === 'true',
        bucket: process.env.MINIO_BUCKET || 'exactbag',
        region: process.env.MINIO_REGION || 'us-east-1',
    },
    prisma,
};

module.exports = config;
