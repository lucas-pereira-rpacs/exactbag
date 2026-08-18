const { PostgresBackend } = require("@agendajs/postgres-backend");
const { Agenda, constant } = require("agenda");
const nowIntegrationHandler = require("./nowIntegrationHandler");

const agenda = new Agenda({
  backend: new PostgresBackend({
    connectionString: process.env.DATABASE_URL,
  }),
});

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
