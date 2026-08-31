/**
 * Return Flight Reminder Scheduler
 * Roda diariamente e envia lembretes para passageiros cujo voo de volta é no dia seguinte.
 * Deduplicação: marca returnReminderSentAt na NativeRegistration para não reenviar.
 */

const { prisma } = require('../config');
const nativeNotificationService = require('./nativeNotificationService');

class ReturnFlightScheduler {
  constructor() {
    this._isRunning = false;
  }

  /**
   * Executa o ciclo: busca registros com returnDate = amanhã e envia lembretes
   */
  async run() {
    if (this._isRunning) { console.log('[ReturnFlightScheduler] Ciclo já em execução, pulando'); return; }
    this._isRunning = true;
    try {
      console.log('[ReturnFlightScheduler] Iniciando ciclo de lembrete de volta...');

      // Calcula "amanhã" no fuso de Brasília (UTC-3)
      const now = new Date();
      const brasiliaOffset = -3 * 60 * 60 * 1000;
      const brasiliaTime = new Date(now.getTime() + brasiliaOffset);

      const tomorrow = new Date(brasiliaTime);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStart = new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), 0, 0, 0));
      const tomorrowEnd = new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), 23, 59, 59, 999));

      // Busca registros nativos com voo de volta amanhã que NÃO receberam lembrete ainda
      const registrations = await prisma.nativeRegistration.findMany({
        where: {
          returnDate: {
            gte: tomorrowStart,
            lte: tomorrowEnd
          },
          returnReminderSentAt: null,
          status: { in: ['cpv_generated', 'sent', 'completed'] }
        }
      });

      if (registrations.length === 0) {
        console.log('[ReturnFlightScheduler] Nenhum voo de volta amanhã para notificar');
        return;
      }

      console.log(`[ReturnFlightScheduler] ${registrations.length} passageiro(s) com volta amanhã`);

      let sent = 0;
      for (const reg of registrations) {
        try {
          // Gera link de registro para a volta (novo registro, mesmo passageiro)
          const registrationLink = `https://app.exactbag.com.br/registrodebagagem?email=${encodeURIComponent(reg.passengerEmail)}&name=${encodeURIComponent(reg.passengerName)}`;

          // Envia e-mail
          try {
            await nativeNotificationService.sendReturnReminderByEmail(reg, registrationLink);
          } catch (err) {
            console.error(`[ReturnFlightScheduler] Erro e-mail para ${reg.passengerEmail}:`, err.message);
          }

          // Envia WhatsApp
          try {
            await nativeNotificationService.sendReturnReminderByWhatsApp(reg, registrationLink);
          } catch (err) {
            console.error(`[ReturnFlightScheduler] Erro WhatsApp para ${reg.passengerPhone}:`, err.message);
          }

          // Marca como enviado (deduplicação)
          await prisma.nativeRegistration.update({
            where: { id: reg.id },
            data: { returnReminderSentAt: new Date() }
          });

          sent++;
          console.log(`[ReturnFlightScheduler] ✓ Lembrete de volta enviado para ${reg.passengerName} <${reg.passengerEmail}>`);
        } catch (err) {
          console.error(`[ReturnFlightScheduler] Erro ao notificar ${reg.passengerEmail}:`, err.message);
        }
      }

      console.log(`[ReturnFlightScheduler] Ciclo concluído: ${sent}/${registrations.length} notificações enviadas`);
    } catch (error) {
      console.error('[ReturnFlightScheduler] Erro no ciclo:', error.message);
    } finally {
      this._isRunning = false;
    }
  }

}

module.exports = new ReturnFlightScheduler();
