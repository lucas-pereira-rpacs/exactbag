const { PostgresBackend } = require("@agendajs/postgres-backend");
const { Agenda, constant } = require("agenda");
const { Pool } = require("pg");
const nowIntegrationHandler = require("./nowIntegrationHandler");
const outboundNotificationHandler = require("./outboundNotificationHandler");
const returnFlightReminderHandler = require("./returnFlightReminderHandler");
const {
  weeklySalesReportHandler,
  monthlySalesReportHandler,
} = require("./scheduledReportHandler");
const salesReportsService = require("../services/salesReportsService");

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

const recurringJobOptions = {
  backoff: constant({
    delay: 300000,
    maxRetries: 3,
  }),
  concurrency: 1,
  lockLimit: 1,
};

agenda.define("outbound-notifications", outboundNotificationHandler, recurringJobOptions);
agenda.define("return-flight-reminders", returnFlightReminderHandler, recurringJobOptions);
agenda.define("weekly-sales-report", weeklySalesReportHandler, recurringJobOptions);
agenda.define("monthly-sales-report", monthlySalesReportHandler, recurringJobOptions);

const clampInteger = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

const parseTime = (value, fallback = "12:00") => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || fallback));
  if (!match) return parseTime(fallback, "12:00");
  return {
    hour: clampInteger(match[1], 12, 0, 23),
    minute: clampInteger(match[2], 0, 0, 59),
  };
};

agenda.initializeRecurringJobs = async () => {
  const timezone = process.env.AGENDA_TIMEZONE || "UTC";
  const outboundInterval = process.env.OUTBOUND_NOTIFICATION_INTERVAL || "1 hour";
  const returnHour = clampInteger(process.env.RETURN_REMINDER_HOUR_UTC, 12, 0, 23);
  const returnMinute = clampInteger(process.env.RETURN_REMINDER_MINUTE_UTC, 0, 0, 59);

  await agenda.every(outboundInterval, "outbound-notifications", undefined, {
    timezone,
    skipImmediate: true,
  });
  await agenda.every(`${returnMinute} ${returnHour} * * *`, "return-flight-reminders", undefined, {
    timezone: "UTC",
    skipImmediate: true,
  });

  // Report schedules are configuration-driven. Remove the persisted recurring
  // definitions first so disabled or changed schedules take effect on restart.
  await agenda.cancel({ name: "weekly-sales-report" });
  await agenda.cancel({ name: "monthly-sales-report" });

  const reportConfig = await salesReportsService.getReportConfig();
  if (!reportConfig?.enabled || !reportConfig.recipients?.length) {
    console.log("[Agenda] Scheduled reports disabled or without recipients");
    return;
  }

  const dayMap = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  const reportTimezone = process.env.REPORT_TIMEZONE || "America/Sao_Paulo";

  if (reportConfig.weeklyDay && reportConfig.weeklyTime) {
    const { hour, minute } = parseTime(reportConfig.weeklyTime);
    const configuredDay = dayMap[String(reportConfig.weeklyDay).toLowerCase()];
    const day = configuredDay === undefined ? 1 : configuredDay;
    await agenda.every(`${minute} ${hour} * * ${day}`, "weekly-sales-report", undefined, {
      timezone: reportTimezone,
      skipImmediate: true,
    });
  }

  if (reportConfig.monthlyDay && reportConfig.monthlyTime) {
    const { hour, minute } = parseTime(reportConfig.monthlyTime);
    const day = clampInteger(reportConfig.monthlyDay, 1, 1, 28);
    await agenda.every(`${minute} ${hour} ${day} * *`, "monthly-sales-report", undefined, {
      timezone: reportTimezone,
      skipImmediate: true,
    });
  }
};

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
