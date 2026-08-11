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
        const { PrismaClient } = require('@prisma/client');
        const globalForPrisma = global;

        // Limita pool de conexões PG para reduzir RAM (~10MB por conexão)
        const dbUrl = process.env.DATABASE_URL;
        const connLimit = dbUrl && !dbUrl.includes('connection_limit')
          ? (dbUrl.includes('?') ? dbUrl + '&connection_limit=3' : dbUrl + '?connection_limit=3')
          : dbUrl;

        prisma = globalForPrisma.__exactBagPrisma || new PrismaClient({
          datasources: { db: { url: connLimit } }
        });

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
    prisma,
};

module.exports = config;