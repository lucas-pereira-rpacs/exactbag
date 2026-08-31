const app = require('./app');
const agenda = require('./jobs/scheduler');
const { getJobCounts } = require('./jobs/agendaJobService');
const { initializeDatabase } = require('./services/databaseBootstrapService');
const { runProductionMigrations } = require('./services/productionMigrationService');
const { ensureBucket } = require('./services/minioClient');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';


// ========== VALIDAÇÃO DE ENV VARS OBRIGATÓRIAS ==========
if (process.env.NODE_ENV === 'production') {
  const required = [
    'DATABASE_URL',
    'EMAIL_API_KEY',
    'PUBLIC_FORM_LINK_SECRET',
    'WHATSAPP_META_ACCESS_TOKEN',
    'WHATSAPP_META_PHONE_NUMBER_ID',
    'DASHBOARD_JWT_SECRET'
  ];
  const missing = required.filter(v => !process.env[v] || process.env[v].startsWith('your_'));
  if (missing.length > 0) {
    console.error(`[FATAL] Variáveis de ambiente obrigatórias não configuradas: ${missing.join(', ')}`);
    process.exit(1);
  }
}

let server;

const startServer = async () => {
  // Production must not accept traffic until every tracked migration succeeds.
  await runProductionMigrations();

  try {
    await initializeDatabase();
  } catch (error) {
    console.warn('[ServerInit] Failed to bootstrap database schema:', error.message);
  }

  try {
    await ensureBucket();
  } catch (error) {
    console.warn('[ServerInit] Failed to initialize MinIO bucket:', error.message);
  }

  // Queued HTTP operations depend on Agenda, so the worker must be ready
  // before the server starts accepting traffic.
  await agenda.start();
  await agenda.initializeRecurringJobs();
  console.log('✅ Agenda scheduler started');

  server = app.listen(PORT, HOST, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║         ExactBag Partner Sales API - Production            ║
╚════════════════════════════════════════════════════════════╝

✅ Server running at http://localhost:${PORT}
📊 Environment: ${process.env.NODE_ENV || 'development'}
🔧 WhatsApp Provider: ${process.env.WHATSAPP_PROVIDER || 'meta'}
📧 Email Provider: resend
    `);

    

    // Registrar health check apenas em debug mode
    // Em produção, Railway monitora via health check endpoint próprio
    if (process.env.DEBUG_LOGS === 'true') {
      setInterval(async () => {
        try {
          const counts = await getJobCounts();
          console.log(`[${new Date().toISOString()}] ✓ Health check OK - Jobs: ${counts.total}`);
        } catch (error) {
          console.warn('[Agenda] Failed to read job counts:', error.message);
        }
      }, 60000); // A cada 1 minuto
    }
  });
};

startServer().catch((error) => {
  console.error('[ServerInit] Fatal error during startup:', error);
  process.exit(1);
});

// ========== GRACEFUL SHUTDOWN ==========
async function gracefulShutdown(signal) {
  console.log(`\n🛑 ${signal} received. Starting graceful shutdown...`);

  // Fechar servidor HTTP
  if (server) {
    server.close(() => console.log('✅ Server closed'));
  }

  if (agenda && typeof agenda.stop === 'function') {
    // Stop unlocks active jobs without deleting queued work. The next server
    // start can therefore pick up persisted jobs from PostgreSQL.
    await agenda.stop().catch((error) => {
      console.warn('[Agenda] Could not stop scheduler cleanly:', error.message);
    });
    if (agenda.databasePool) {
      await agenda.databasePool.end().catch((error) => {
        console.warn('[Agenda] Could not close dedicated database pool:', error.message);
      });
    }
    console.log('✅ Agenda scheduler stopped');
  }

  // Fechar browser singleton de PDF
  try {
    const { closeBrowser } = require('./modules/nativeRegistration/services/cpvPdfService');
    await closeBrowser();
    console.log('✅ Browser singleton closed');
  } catch (_) {}

  // Dar 30 segundos para cleanup
  setTimeout(() => {
    console.log('❌ Forced exit after 30 seconds');
    process.exit(1);
  }, 30000);
}

process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.once('SIGINT', () => gracefulShutdown('SIGINT'));

// ========== ERROR HANDLING ==========
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  // Em produção, loga mas não mata o processo para não derrubar todas as requisições
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

module.exports = server;
