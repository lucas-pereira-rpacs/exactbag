const app = require("./app");
const agenda = require("./jobs/scheduler");
const { getJobCounts } = require("./jobs/agendaJobService");
const { initializeDatabase } = require("./services/databaseBootstrapService");
const {
  runProductionMigrations,
} = require("./services/productionMigrationService");
const { ensureBucket } = require("./services/minioClient");
const { execFileSync } = require("child_process");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

const getBuildVersion = () => {
  try {
    const version = execFileSync(
      "git",
      ["log", "-1", "--pretty=format:%h|%s"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    const separatorIndex = version.indexOf("|");

    if (separatorIndex >= 0) {
      return {
        hash: version.slice(0, separatorIndex),
        message: version.slice(separatorIndex + 1),
      };
    }
  } catch (_) {
    // Production deployments may not include the .git directory.
  }

  return {
    hash:
      process.env.COMMIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || "unknown",
    message:
      process.env.COMMIT_MESSAGE ||
      process.env.RAILWAY_GIT_COMMIT_MESSAGE ||
      "unknown",
  };
};

const buildVersion = getBuildVersion();

// ========== VALIDAÇÃO DE ENV VARS OBRIGATÓRIAS ==========
if (process.env.NODE_ENV === "production") {
  const required = [
    "DATABASE_URL",
    "EMAIL_API_KEY",
    "PUBLIC_FORM_LINK_SECRET",
    "WHATSAPP_META_ACCESS_TOKEN",
    "WHATSAPP_META_PHONE_NUMBER_ID",
    "DASHBOARD_JWT_SECRET",
  ];
  const missing = required.filter(
    (v) => !process.env[v] || process.env[v].startsWith("your_"),
  );
  if (missing.length > 0) {
    console.error(
      `[FATAL] Variáveis de ambiente obrigatórias não configuradas: ${missing.join(", ")}`,
    );
    process.exit(1);
  }
}

let server;
let shutdownPromise = null;
let healthCheckInterval = null;

const startServer = async () => {
  // Production must not accept traffic until every tracked migration succeeds.
  await runProductionMigrations();

  try {
    await initializeDatabase();
  } catch (error) {
    console.warn(
      "[ServerInit] Failed to bootstrap database schema:",
      error.message,
    );
  }

  try {
    await ensureBucket();
  } catch (error) {
    console.warn(
      "[ServerInit] Failed to initialize MinIO bucket:",
      error.message,
    );
  }

  // Queued HTTP operations depend on Agenda, so the worker must be ready
  // before the server starts accepting traffic.
  await agenda.start();
  await agenda.initializeRecurringJobs();
  console.log("✅ Agenda scheduler started");

  server = app.listen(PORT, HOST, () => {
    console.log(`
Version: ${buildVersion.hash} — ${buildVersion.message}
╔════════════════════════════════════════════════════════════╗
║         ExactBag Partner Sales API - Production            ║
╚════════════════════════════════════════════════════════════╝

✅ Server running at http://localhost:${PORT}
📊 Environment: ${process.env.NODE_ENV || "development"}
🔧 WhatsApp Provider: ${process.env.WHATSAPP_PROVIDER || "meta"}
📧 Email Provider: resend
    `);

    // Registrar health check apenas em debug mode
    // Em produção, Railway monitora via health check endpoint próprio
    if (process.env.DEBUG_LOGS === "true") {
      healthCheckInterval = setInterval(async () => {
        try {
          const counts = await getJobCounts();
          console.log(
            `[${new Date().toISOString()}] ✓ Health check OK - Jobs: ${counts.total}`,
          );
        } catch (error) {
          console.warn("[Agenda] Failed to read job counts:", error.message);
        }
      }, 60000); // A cada 1 minuto
    }
  });
};

startServer().catch((error) => {
  console.error("[ServerInit] Fatal error during startup:", error);
  process.exit(1);
});

// ========== GRACEFUL SHUTDOWN ==========
async function gracefulShutdown(signal) {
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = (async () => {
    console.log(`\n🛑 ${signal} received. Starting graceful shutdown...`);

    let forceExitTimer;
    try {
      // Keep a last-resort timeout for shutdowns that hang, but do not let the
      // timer keep an otherwise-clean process alive after graceful shutdown.
      forceExitTimer = setTimeout(() => {
        console.log("❌ Forced exit after 30 seconds");
        process.exit(1);
      }, 30000);
      forceExitTimer.unref?.();

      // Fechar servidor HTTP and wait for existing connections to finish.
      if (server) {
        await new Promise((resolve) => {
          server.close(() => {
            console.log("✅ Server closed");
            resolve();
          });
        });
      }

      if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
      }

      if (agenda && typeof agenda.stop === "function") {
        // Stop unlocks active jobs without deleting queued work. The next server
        // start can therefore pick up persisted jobs from PostgreSQL.
        await agenda.stop();
        if (agenda.databasePool) {
          await agenda.databasePool.end();
        }
        console.log("✅ Agenda scheduler stopped");
      }

      // Fechar browser singleton de PDF
      try {
        const { closeBrowser } = require("./services/cpvPdfService");
        await closeBrowser();
        console.log("✅ Browser singleton closed");
      } catch (_) {}

      clearTimeout(forceExitTimer);
      process.exitCode = 0;
      console.log("✅ Graceful shutdown completed");
    } catch (error) {
      console.error("[Shutdown] Graceful shutdown failed:", error.message);
      // Leave the force-exit timer active so a stuck handle cannot keep the
      // deployment alive indefinitely.
    }
  })();

  return shutdownPromise;
}

process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.once("SIGINT", () => gracefulShutdown("SIGINT"));

// ========== ERROR HANDLING ==========
process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
  // Em produção, loga mas não mata o processo para não derrubar todas as requisições
  if (process.env.NODE_ENV !== "production") {
    process.exit(1);
  }
});

module.exports = server;
