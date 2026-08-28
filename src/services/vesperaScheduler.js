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

    this.job = schedule.scheduleJob('0 * * * *', () => this.run());

    console.log('[VesperaScheduler] Agendado para verificar lembretes de 48h a cada hora');
  }

  /**
   * Executa o ciclo: busca vendas com outboundDate = amanhã e envia notificações
   */
  async run() {
    if (this._isRunning) { console.log('[VesperaScheduler] Ciclo já em execução, pulando'); return; }
    this._isRunning = true;
    try {
      console.log('[VesperaScheduler] Iniciando ciclo de notificação de 48h...');

      // Calcula "amanhã" no fuso de Brasília (UTC-3)
      const now = new Date();
      const windowStart = new Date(now.getTime() + (47 * 60 * 60 * 1000));
      const windowEnd = new Date(now.getTime() + (49 * 60 * 60 * 1000));

      // "Amanhã" em Brasília
      const tomorrowStart = windowStart;
      const tomorrowEnd = windowEnd;

      // Busca todas as vendas processadas com voo na janela de 48h que ainda
      // não receberam a notificação de véspera.
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
        console.log('[VesperaScheduler] Nenhum voo na janela de 48h para notificar');
        return;
      }

      console.log(`[VesperaScheduler] ${sales.length} cliente(s) na janela de 48h`);

      let sent = 0;
      for (const sale of sales) {
        try {
          // Re-read immediately before sending so a cancellation committed after
          // the initial query cannot receive a stale registration reminder.
          const currentSale = await prisma.sale.findUnique({
            where: { id: sale.id },
            include: { partner: true }
          });

          if (!currentSale || currentSale.status !== 'processed' || currentSale.vesperaSentAt) {
            console.log(`[VesperaScheduler] Lembrete ignorado para ${sale.customerName}: venda cancelada ou já processada`);
            continue;
          }

          const saleToNotify = currentSale;

          // Pula parceiros em modo sandbox
          if (saleToNotify.partner?.isSandbox) {
            console.log(`[VesperaScheduler] SANDBOX: lembrete de 48h suprimido para ${saleToNotify.customerName} (partner ${saleToNotify.partnerId})`);
            continue;
          }

          const customerData = {
            name: saleToNotify.customerName,
            email: saleToNotify.customerEmail,
            phone: saleToNotify.customerPhone
          };

          const registrationLink = saleToNotify.formLink || `https://app.exactbag.com.br/f/${saleToNotify.slug || saleToNotify.id}`;

          await notificationService.sendPurchaseReminderNotification(customerData, saleToNotify, registrationLink);

          // Marca como enviado (deduplicação)
          await prisma.sale.update({
            where: { id: saleToNotify.id },
            data: { vesperaSentAt: new Date() }
          });

          sent++;
          console.log(`[VesperaScheduler] Lembrete de 48h enviado para ${sale.customerName} <${sale.customerEmail}>`);
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
