/**
 * Véspera Notification Scheduler
 * Roda diariamente e envia notificações para clientes cujo voo é no dia seguinte.
 * Deduplicação: marca vesperaSentAt na Sale para não reenviar.
 */

const { prisma } = require("../config");
const notificationService = require("./notificationService");
const emailGateway = require("../gateways/emailGateway");
const {
  buildNativeRegistrationLink,
} = require("./nativeRegistrationLinkService");

class VesperaScheduler {
  constructor() {
    this._isRunning = false;
  }

  /**
   * Executa o ciclo: busca vendas com outboundDate = amanhã e envia notificações
   */
  async run() {
    if (this._isRunning) {
      console.log("[VesperaScheduler] Ciclo já em execução, pulando");
      return;
    }
    this._isRunning = true;
    try {
      console.log(
        "[VesperaScheduler] Iniciando ciclo de notificação de 48h...",
      );

      // Calcula "amanhã" no fuso de Brasília (UTC-3)
      const now = new Date();
      const windowStart = now;
      // Send at the 48-hour threshold. Because the scheduler may run late,
      // the lower bound is now and the upper bound is exactly 48 hours ahead;
      // a late run still catches any unsent notification that is now due.
      const windowEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      // "Amanhã" em Brasília
      const tomorrowStart = windowStart;
      const tomorrowEnd = windowEnd;

      // O comprovante da TAG física é enviado na mesma janela de 48 horas.
      // receiptSentAt garante que cada pedido seja disparado uma única vez.
      const physicalTagOrders = await prisma.$queryRaw`
        SELECT id, "orderNumber", product, "customerName", "customerEmail",
               quantity, "hasInsurance", notes, "outboundDate"
        FROM "PhysicalTagOrder"
        WHERE "outboundDate" >= ${tomorrowStart}
          AND "outboundDate" <= ${tomorrowEnd}
          AND "receiptSentAt" IS NULL
        ORDER BY "outboundDate" ASC
      `;

      for (const order of physicalTagOrders) {
        try {
          const product =
            order.product === "exactbag-cover"
              ? "Tag Exact Bag Cover"
              : "Tag Exact Bag Essencial";
          const sentResult = await emailGateway.sendPhysicalTagReceiptEmail({
            name: order.customerName,
            email: order.customerEmail,
            product,
            quantity: order.quantity,
            orderNumber: Number(order.orderNumber),
            outboundDate: order.outboundDate
              ? new Date(order.outboundDate).toISOString().slice(0, 10)
              : "",
            hasInsurance: order.hasInsurance,
            notes: order.notes,
          });

          if (!sentResult) {
            throw new Error("Gateway de e-mail não confirmou o envio");
          }

          await prisma.$executeRaw`
            UPDATE "PhysicalTagOrder"
            SET "receiptSentAt" = NOW()
            WHERE id = ${order.id} AND "receiptSentAt" IS NULL
          `;
          console.log(
            `[VesperaScheduler] Comprovante da TAG física #${Number(order.orderNumber)} enviado para ${order.customerEmail}`,
          );
        } catch (err) {
          console.error(
            `[VesperaScheduler] Erro ao enviar comprovante da TAG física #${Number(order.orderNumber)}:`,
            err.message,
          );
        }
      }

      // Busca todas as vendas processadas com voo na janela de 48h que ainda
      // não receberam a notificação de véspera.
      const sales = await prisma.sale.findMany({
        where: {
          outboundDate: {
            gte: tomorrowStart,
            lte: tomorrowEnd,
          },
          vesperaSentAt: null,
          status: "processed",
        },
        include: { partner: true },
      });

      if (sales.length === 0) {
        console.log(
          "[VesperaScheduler] Nenhum voo na janela de 48h para notificar",
        );
        return;
      }

      console.log(
        `[VesperaScheduler] ${sales.length} cliente(s) na janela de 48h`,
      );

      let sent = 0;
      for (const sale of sales) {
        try {
          // Re-read immediately before sending so a cancellation committed after
          // the initial query cannot receive a stale registration reminder.
          const currentSale = await prisma.sale.findUnique({
            where: { id: sale.id },
            include: { partner: true },
          });

          if (
            !currentSale ||
            currentSale.status !== "processed" ||
            currentSale.vesperaSentAt
          ) {
            console.log(
              `[VesperaScheduler] Lembrete ignorado para ${sale.customerName}: venda cancelada ou já processada`,
            );
            continue;
          }

          const saleToNotify = currentSale;

          // Pula parceiros em modo sandbox
          if (saleToNotify.partner?.isSandbox) {
            console.log(
              `[VesperaScheduler] SANDBOX: lembrete de 48h suprimido para ${saleToNotify.customerName} (partner ${saleToNotify.partnerId})`,
            );
            continue;
          }

          const customerData = {
            name: saleToNotify.customerName,
            email: saleToNotify.customerEmail,
            phone: saleToNotify.customerPhone,
          };

          const registrationLink = buildNativeRegistrationLink(
            saleToNotify.saleId,
          );

          await notificationService.sendPurchaseReminderNotification(
            customerData,
            saleToNotify,
            registrationLink,
          );

          // Marca como enviado (deduplicação)
          await prisma.sale.update({
            where: { id: saleToNotify.id },
            data: { vesperaSentAt: new Date() },
          });

          sent++;
          console.log(
            `[VesperaScheduler] Lembrete de 48h enviado para ${sale.customerName} <${sale.customerEmail}>`,
          );
        } catch (err) {
          console.error(
            `[VesperaScheduler] Erro ao notificar ${sale.customerEmail}:`,
            err.message,
          );
        }
      }

      console.log(
        `[VesperaScheduler] Ciclo concluído: ${sent}/${sales.length} notificações enviadas`,
      );
    } catch (error) {
      console.error("[VesperaScheduler] Erro no ciclo:", error.message);
    } finally {
      this._isRunning = false;
    }
  }
}

module.exports = new VesperaScheduler();
