/**
 * Report Scheduler - Automated weekly and monthly sales reports
 * Runs scheduled jobs to generate and email reports to ExactBag managers
 */

const schedule = require('node-schedule');
const salesReportsService = require('./salesReportsService');

class ReportScheduler {
  constructor() {
    this.weeklyJob = null;
    this.monthlyJob = null;
    this.isInitialized = false;
    this._isRunning = false;
  }

  /**
   * Initialize scheduler (call from server startup)
   */
  async initialize() {
    try {
      const config = await salesReportsService.getReportConfig();

      if (!config.enabled) {
        console.log('[ReportScheduler] Relatórios desabilitados na configuração');
        return;
      }

      if (!config.recipients || config.recipients.length === 0) {
        console.warn('[ReportScheduler] Nenhum destinatário configurado para relatórios');
        return;
      }

      // Schedule weekly report
      if (config.weeklyDay && config.weeklyTime) {
        this._scheduleWeeklyReport(config.weeklyDay, config.weeklyTime);
      }

      // Schedule monthly report
      if (config.monthlyDay && config.monthlyTime) {
        this._scheduleMonthlyReport(config.monthlyDay, config.monthlyTime);
      }

      this.isInitialized = true;
      console.log('[ReportScheduler] ✓ Agendador de relatórios inicializado');
    } catch (error) {
      console.error('[ReportScheduler] Erro ao inicializar agendador:', error);
    }
  }

  /**
   * Shutdown scheduler (graceful shutdown)
   */
  shutdown() {
    if (this.weeklyJob) {
      this.weeklyJob.cancel();
      console.log('[ReportScheduler] Job semanal cancelado');
    }
    if (this.monthlyJob) {
      this.monthlyJob.cancel();
      console.log('[ReportScheduler] Job mensal cancelado');
    }
  }

  // ===== PRIVATE HELPERS =====

  /**
   * Schedule weekly report
   * @param {string} dayOfWeek - 'monday', 'tuesday', etc.
   * @param {string} time - 'HH:MM' format
   */
  _scheduleWeeklyReport(dayOfWeek, time) {
    try {
      const dayMap = {
        'sunday': 0,
        'monday': 1,
        'tuesday': 2,
        'wednesday': 3,
        'thursday': 4,
        'friday': 5,
        'saturday': 6
      };

      const [hour, minute] = time.split(':').map(Number);
      const day = dayMap[dayOfWeek.toLowerCase()] || 1; // Padrão: segunda-feira

      // Agendar: toda semana no dia especificado no horário especificado
      const rule = new schedule.RecurrenceRule();
      rule.dayOfWeek = day;
      rule.hour = hour;
      rule.minute = minute;

      this.weeklyJob = schedule.scheduleJob(rule, async () => {
        if (this._isRunning) { console.log('[ReportScheduler] Relatório já em execução, pulando ciclo semanal'); return; }
        this._isRunning = true;
        console.log(`[ReportScheduler] Iniciando job de relatório semanal em ${new Date().toLocaleString('pt-BR')}`);
        const start = Date.now();
        try {
          const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Report generation timeout (5min)')), 5 * 60 * 1000)
          );
          await Promise.race([salesReportsService.generateAndSendReport('weekly'), timeout]);
          console.log(`[ReportScheduler] Relatório semanal concluído em ${((Date.now() - start) / 1000).toFixed(1)}s`);
        } catch (error) {
          console.error('[ReportScheduler] Job de relatório semanal falhou:', error.message);
        } finally {
          this._isRunning = false;
        }
      });

      console.log(`[ReportScheduler] ✓ Relatório semanal agendado para ${dayOfWeek} às ${time}`);
    } catch (error) {
      console.error('[ReportScheduler] Erro ao agendar relatório semanal:', error);
    }
  }

  /**
   * Schedule monthly report
   * @param {string|number} dayOfMonth - '1' to '28'
   * @param {string} time - 'HH:MM' format
   */
  _scheduleMonthlyReport(dayOfMonth, time) {
    try {
      const [hour, minute] = time.split(':').map(Number);
      const day = parseInt(dayOfMonth, 10) || 1;

      // Agendar: todo mês no dia especificado no horário especificado
      const rule = new schedule.RecurrenceRule();
      rule.date = day;
      rule.hour = hour;
      rule.minute = minute;

      this.monthlyJob = schedule.scheduleJob(rule, async () => {
        if (this._isRunning) { console.log('[ReportScheduler] Relatório já em execução, pulando ciclo mensal'); return; }
        this._isRunning = true;
        console.log(`[ReportScheduler] Iniciando job de relatório mensal em ${new Date().toLocaleString('pt-BR')}`);
        const start = Date.now();
        try {
          const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Report generation timeout (5min)')), 5 * 60 * 1000)
          );
          await Promise.race([salesReportsService.generateAndSendReport('monthly'), timeout]);
          console.log(`[ReportScheduler] Relatório mensal concluído em ${((Date.now() - start) / 1000).toFixed(1)}s`);
        } catch (error) {
          console.error('[ReportScheduler] Job de relatório mensal falhou:', error.message);
        } finally {
          this._isRunning = false;
        }
      });

      console.log(`[ReportScheduler] ✓ Relatório mensal agendado para dia ${day} às ${time}`);
    } catch (error) {
      console.error('[ReportScheduler] Erro ao agendar relatório mensal:', error);
    }
  }
}

module.exports = new ReportScheduler();
