const { PostgresBackend } = require("@agendajs/postgres-backend");
const { Agenda, constant } = require("agenda");
const { Pool } = require("pg");
const nowIntegrationHandler = require("./nowIntegrationHandler");

// Agenda owns a dedicated pool so its lifecycle cannot interfere with Prisma
// or any other PostgreSQL client in the application.
const agendaPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  idleTimeoutMillis: 30000,
});

const agenda = new Agenda({
  backend: new PostgresBackend({
    pool: agendaPool,
  }),
});

// PostgresBackend does not close externally supplied pools. The application
// closes this pool after agenda.stop() during graceful shutdown.
agenda.databasePool = agendaPool;

agenda.define("now-integration", nowIntegrationHandler, {
  backoff: constant({
    delay: 300000, // 5 minutes between each retry
    maxRetries: 3,
  }),
});

agenda.on("fail", (err, job) => {
  if (err?.isAxiosError) {
    console.log("Job failed:", job.attrs.name, {
      message: err.message,
      code: err.code,
      method: err.config?.method,
      url: `${err.config?.baseURL || ""}${err.config?.url || ""}`,
      status: err.response?.status,
      response: err.response?.data,
      jobData: job.attrs.data,
    });
    return;
  }

  console.log("Job failed:", job.attrs.name, err);
});

module.exports = agenda;
