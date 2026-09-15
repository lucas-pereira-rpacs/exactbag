/**
 * Sale Cancellation Service — Lógica de cancelamento e estorno
 *
 * Regras:
 *  - Cancelamento ≥48h antes do outboundDate → estorno integral
 *  - Cancelamento <48h antes do outboundDate → estorno parcial (50%)
 *  - Status válidos para cancelar: "reserva_paga" ou "processed"
 *  - Ao cancelar: invalida formLink, marca status "cancelada"
 */

const { prisma } = require("../config");
const partnerCallbackService = require("./partnerCallbackService");

const HOURS_48_MS = 48 * 60 * 60 * 1000;

const saleCancellationService = {
  /**
   * Cancelar uma venda e calcular estorno
   * @param {string} saleId - saleId externo do parceiro
   * @param {string} partnerId - partnerId autenticado
   * @param {string} reason - motivo (opcional)
   * @returns {{ sale, refundType }}
   */
  async cancelSale(saleId, partnerId, reason) {
    return prisma.$transaction(async (tx) => {
      // 1. Buscar venda pelo saleId externo + partnerId
      const sale = await tx.sale.findFirst({
        where: { saleId, partnerId },
        include: { partner: true },
      });

      if (!sale) {
        throw Object.assign(new Error("Venda não encontrada"), {
          statusCode: 404,
        });
      }

      // 2. Validar status — só pode cancelar se não estiver já cancelada
      if (sale.status === "cancelada") {
        throw Object.assign(new Error("Venda já está cancelada"), {
          statusCode: 409,
        });
      }

      const cancellableStatuses = [
        "reserva",
        "reserva_paga",
        "processing",
        "processed",
      ];
      if (!cancellableStatuses.includes(sale.status)) {
        throw Object.assign(
          new Error(`Status "${sale.status}" não permite cancelamento`),
          { statusCode: 422 },
        );
      }

      // 3. Calcular tipo de estorno
      const refundType = this._calculateRefundType(sale);

      // 4. Atualizar venda: status cancelada, invalidar link
      const updatedSale = await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: "cancelada",
          formLink: null,
          cancelledAt: new Date(),
          refundType,
          updatedAt: new Date(),
        },
      });

      console.log(
        `[Cancellation] Venda ${saleId} cancelada — estorno ${refundType} (parceiro: ${partnerId})`,
      );

      // 5. Notificar parceiro via callback (async, não bloqueia)
      this._notifyPartner(updatedSale, reason).catch((err) =>
        console.error(
          "[Cancellation] Erro ao notificar parceiro:",
          err.message,
        ),
      );

      return {
        sale: {
          id: updatedSale.id,
          saleId: updatedSale.saleId,
          customerName: updatedSale.customerName,
          status: updatedSale.status,
          cancelledAt: updatedSale.cancelledAt,
        },
        refundType,
      };
    });
  },

  /**
   * Determinar tipo de estorno com base na regra de 48h
   * - ≥48h antes do voo → integral
   * - <48h antes do voo → parcial
   * - Sem data de voo → integral (benefício ao cliente)
   */
  _calculateRefundType(sale) {
    // Se status é "reserva" (não paga), sem estorno
    if (sale.status === "reserva") {
      return "nenhum";
    }

    // Se não tem data de voo, concede integral
    if (!sale.outboundDate) {
      return "integral";
    }

    const now = new Date();
    const flightDate = new Date(sale.outboundDate);
    const msUntilFlight = flightDate.getTime() - now.getTime();

    if (msUntilFlight >= HOURS_48_MS) {
      return "integral";
    }

    // < 48h → parcial
    return "parcial";
  },

  /**
   * Enviar callback de cancelamento ao parceiro
   */
  async _notifyPartner(sale, reason) {
    const partner = await prisma.partner.findUnique({
      where: { partnerId: sale.partnerId },
    });

    if (!partner || partner.isSandbox) return;

    const payload = {
      event: "sale.cancelled",
      saleId: sale.saleId,
      partnerId: sale.partnerId,
      customerName: sale.customerName,
      customerEmail: sale.customerEmail,
      cancelledAt: sale.cancelledAt.toISOString(),
      refundType: sale.refundType,
      reason: reason || null,
    };

    // Reutiliza a infra de callback existente
    if (partner.webhookUrl) {
      const crypto = require("crypto");
      payload.signature = crypto
        .createHmac("sha256", partner.apiKey)
        .update(JSON.stringify(payload))
        .digest("hex");

      const success = await partnerCallbackService._postWithTimeout(
        partner.webhookUrl,
        payload,
        5000,
      );
      if (success) {
        console.log(
          `[Cancellation] Callback de cancelamento enviado para ${partner.partnerId}`,
        );
        return;
      }
    }

    // Fallback: email
    await partnerCallbackService._sendEmailFallback(partner, {
      customerName: sale.customerName,
      customerEmail: sale.customerEmail,
      id: sale.id,
      saleId: sale.saleId,
      _cancelInfo: `CANCELAMENTO — Estorno ${sale.refundType}`,
    });
  },
};

module.exports = saleCancellationService;
