const agenda = require("./agendaClient");
const { BUSINESS_JOB_NAMES } = require("./agendaJobService");

/** @param {import('agenda').Job} _job */
async function agendaJobCleanupHandler(_job) {
  const configuredHours = Number.parseInt(
    process.env.AGENDA_JOB_RETENTION_HOURS,
    10,
  );
  const retentionHours =
    Number.isInteger(configuredHours) && configuredHours > 0
      ? configuredHours
      : 30 * 24;

  const result = await agenda.databasePool.query(
    `DELETE FROM agenda_jobs
     WHERE name = ANY($1)
       AND next_run_at IS NULL
       AND COALESCE(last_finished_at, failed_at, updated_at) < NOW() - ($2 * INTERVAL '1 hour')`,
    [BUSINESS_JOB_NAMES, retentionHours],
  );

  if (result.rowCount > 0) {
    console.log(
      `[Agenda][cleanup] Removed ${result.rowCount} business jobs older than ${retentionHours}h`,
    );
  }
}

module.exports = agendaJobCleanupHandler;
