/**
 * Véspera Notification Scheduler
 * Roda diariamente e envia notificações para clientes cujo voo é no dia seguinte.
 * Deduplicação: marca vesperaSentAt na Sale para não reenviar.
 */

const schedule = require('node-schedule');
const { prisma } = require('../config');
const notificationService = require('./notificationService');

class VesperaScheduler {
  constructor() {
    this.job = null;
    this._isRunning = false;
  }

  /**
   * Inicializa o scheduler — roda todo dia às 09:00 (horário de Brasília, UTC-3 = 12:00 UTC)
   */
  initialize() {
    if (!prisma) {
      console.warn('[VesperaScheduler] Prisma não disponível, scheduler desabilitado');
      return;
    }

    const hour = Number(process.env.VESPERA_HOUR_UTC || 12); // 12 UTC = 09:00 BRT
    const minute = Number(process.env.VESPERA_MINUTE_UTC || 0);

    const rule = new schedule.RecurrenceRule();
    rule.hour = hour;
    rule.minute = minute;

    this.job = schedule.scheduleJob(rule, () => this.run());

    console.log(`[VesperaScheduler] ✓ Agendado para rodar diariamente às ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} UTC`);
  }

  /**
   * Executa o ciclo: busca vendas com outboundDate = amanhã e envia notificações
   */
  async run() {
    if (this._isRunning) { console.log('[VesperaScheduler] Ciclo já em execução, pulando'); return; }
    this._isRunning = true;
    try {
      console.log('[VesperaScheduler] Iniciando ciclo de notificação véspera...');

      // Calcula "amanhã" no fuso de Brasília (UTC-3)
      const now = new Date();
      const brasiliaOffset = -3 * 60 * 60 * 1000;
      const brasiliaTime = new Date(now.getTime() + brasiliaOffset);

      // "Amanhã" em Brasília
      const tomorrow = new Date(brasiliaTime);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStart = new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), 0, 0, 0));
      const tomorrowEnd = new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), 23, 59, 59, 999));

      // Busca vendas processadas com voo amanhã que ainda NÃO receberam notificação véspera
      const sales = await prisma.sale.findMany({
        where: {
          outboundDate: {
            gte: tomorrowStart,
            lte: tomorrowEnd
          },
          vesperaSentAt: null,
          status: 'processed'
        },
        include: { partner: true }
      });

      if (sales.length === 0) {
        console.log('[VesperaScheduler] Nenhum voo amanhã para notificar');
        return;
      }

      console.log(`[VesperaScheduler] ${sales.length} cliente(s) com voo amanhã`);

      let sent = 0;
      for (const sale of sales) {
        try {
          // Pula parceiros em modo sandbox
          if (sale.partner?.isSandbox) {
            console.log(`[VesperaScheduler] 🏖️ SANDBOX: Véspera suprimida para ${sale.customerName} (partner ${sale.partnerId})`);
            continue;
          }

          const customerData = {
            name: sale.customerName,
            email: sale.customerEmail,
            phone: sale.customerPhone
          };

          const registrationLink = sale.formLink || `https://app.exactbag.com.br/f/${sale.slug || sale.id}`;

          await notificationService.sendVesperaNotification(customerData, sale, registrationLink);

          // Marca como enviado (deduplicação)
          await prisma.sale.update({
            where: { id: sale.id },
            data: { vesperaSentAt: new Date() }
          });

          sent++;
          console.log(`[VesperaScheduler] ✓ Véspera enviada para ${sale.customerName} <${sale.customerEmail}>`);
        } catch (err) {
          console.error(`[VesperaScheduler] Erro ao notificar ${sale.customerEmail}:`, err.message);
        }
      }

      console.log(`[VesperaScheduler] Ciclo concluído: ${sent}/${sales.length} notificações enviadas`);
    } catch (error) {
      console.error('[VesperaScheduler] Erro no ciclo:', error.message);
    } finally {
      this._isRunning = false;
    }
  }

  shutdown() {
    if (this.job) {
      this.job.cancel();
      this.job = null;
      console.log('[VesperaScheduler] Scheduler parado');
    }
  }
}

module.exports = new VesperaScheduler();
