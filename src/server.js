const app = require('./app');
const jobQueueService = require('./services/jobQueueService');
const partnerCallbackService = require('./services/partnerCallbackService');
const reportScheduler = require('./services/reportScheduler');
const vesperaScheduler = require('./services/vesperaScheduler');
const returnFlightScheduler = require('./services/returnFlightScheduler');
const jotformPollingService = require('./services/jotformPollingService');
const agenda = require('./jobs/scheduler');
const { initializeDatabase } = require('./services/databaseBootstrapService');
const { runProductionMigrations } = require('./services/productionMigrationService');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';


// ========== VALIDAÇÃO DE ENV VARS OBRIGATÓRIAS ==========
if (process.env.NODE_ENV === 'production') {
  const required = [
    'DATABASE_URL',
    'EMAIL_API_KEY',
    'JOTFORM_API_KEY',
    'JOTFORM_FORM_ID',
    'JOTFORM_WEBHOOK_SECRET',
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

// ========== JOB QUEUE HANDLERS ==========
// Registrar handler para callbacks de parceiros
jobQueueService.registerHandler('PARTNER_CALLBACK', async (data, job) => {
  // data contém os campos do callback; job contém metadata de execução da fila
  const result = await partnerCallbackService.executeCallback({
    ...data,
    attempt: Math.max(0, job.attempt - 1),
    maxAttempts: job.attempts
  });
  
  if (!result.success && result.retry) {
    throw new Error('Retry scheduled for partner callback');
  }
  
  if (!result.success && !result.retry) {
    console.warn(`[JobQueue] Partner callback failed after max attempts: ${job.partnerId}`);
  }
});

let server;

const startServer = async () => {
  // Production must not accept traffic until every tracked migration succeeds.
  await runProductionMigrations();

  try {
    await initializeDatabase();
  } catch (error) {
    console.warn('[ServerInit] Failed to bootstrap database schema:', error.message);
  }

  server = app.listen(PORT, HOST, async () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║         ExactBag Partner Sales API - Production            ║
╚════════════════════════════════════════════════════════════╝

✅ Server running at http://localhost:${PORT}
📊 Environment: ${process.env.NODE_ENV || 'development'}
🔧 WhatsApp Provider: ${process.env.WHATSAPP_PROVIDER || 'meta'}
📧 Email Provider: resend
    `);

    

    // Initialize report scheduler for automated reports
    reportScheduler.initialize().catch(err => {
      console.warn('[ServerInit] Failed to initialize report scheduler:', err.message);
    });

    // Initialize véspera scheduler (daily notification for flights tomorrow)
    try {
      vesperaScheduler.initialize();
    } catch (err) {
      console.warn('[ServerInit] Failed to initialize véspera scheduler:', err.message);
    }

    // Initialize return flight reminder scheduler (daily notification for return flights tomorrow)
    try {
      returnFlightScheduler.initialize();
    } catch (err) {
      console.warn('[ServerInit] Failed to initialize return flight scheduler:', err.message);
    }

    // Initialize JotForm polling (fallback when webhook is not configured)
    try {
      jotformPollingService.start();
    } catch (err) {
      console.warn('[ServerInit] Failed to start JotForm polling:', err.message);
    }

    // Start Agenda worker for now-integration jobs
    try {
      await agenda.start();
      console.log('✅ Agenda scheduler started');
    } catch (err) {
      console.warn('[ServerInit] Failed to start Agenda scheduler:', err.message);
    }

    // Registrar health check apenas em debug mode
    // Em produção, Railway monitora via health check endpoint próprio
    if (process.env.DEBUG_LOGS === 'true') {
      setInterval(() => {
        console.log(`[${new Date().toISOString()}] ✓ Health check OK - Jobs: ${jobQueueService.getJobCounts().total}`);
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

  // Fechar worker de jobs
  if (jobQueueService && typeof jobQueueService.shutdown === 'function') {
    jobQueueService.shutdown();
    console.log('✅ Job queue service stopped');
  }

  // Desligar scheduler de relatórios
  if (reportScheduler && typeof reportScheduler.shutdown === 'function') {
    reportScheduler.shutdown();
    console.log('✅ Report scheduler stopped');
  }

  // Desligar véspera scheduler
  if (vesperaScheduler && typeof vesperaScheduler.shutdown === 'function') {
    vesperaScheduler.shutdown();
    console.log('✅ Véspera scheduler stopped');
  }

  // Desligar return flight scheduler
  if (returnFlightScheduler && typeof returnFlightScheduler.shutdown === 'function') {
    returnFlightScheduler.shutdown();
    console.log('✅ Return flight scheduler stopped');
  }

  // Parar polling JotForm
  if (jotformPollingService && typeof jotformPollingService.stop === 'function') {
    jotformPollingService.stop();
    console.log('✅ JotForm polling stopped');
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
