const salesReportsService = require("../services/salesReportsService");

const REPORT_TIMEOUT_MS = 5 * 60 * 1000;

const createScheduledReportHandler = (period) =>
  async function scheduledReportHandler(_job) {
    const startedAt = Date.now();
    console.log(`[Agenda][${period}-sales-report] Iniciando relatório`);

    let timeoutId;
    try {
      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Report generation timeout (5min)")),
          REPORT_TIMEOUT_MS,
        );
      });
      await Promise.race([
        salesReportsService.generateAndSendReport(period),
        timeout,
      ]);
      console.log(
        `[Agenda][${period}-sales-report] Concluído em ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  };

module.exports = {
  weeklySalesReportHandler: createScheduledReportHandler("weekly"),
  monthlySalesReportHandler: createScheduledReportHandler("monthly"),
};
